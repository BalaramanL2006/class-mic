/**
 * ClassMic Offline WebRTC Signaling & Room Management
 *
 * Fully supports MULTIPLE simultaneous phones on local WiFi (offline LAN).
 * - Multi-phone concurrent speaking (mixed by Web Audio API on Laptop Receiver)
 * - Independent phone connections (Phone 1, Phone 2, ... Phone N)
 * - Direct WebRTC peer exchange (host candidates for 100% offline usage)
 * - Remote mute & disconnect controls from the receiver
 * - No internet, cloud, or external STUN/TURN dependencies required.
 */

export function setupSignaling(io) {
  // Map of roomId -> {
  //   receiverSockets: Set<string>,
  //   phoneSockets: Map<string, { socketId: string, phoneIndex: number, shortId: string, name: string, isSpeaking: boolean, joinedAt: number }>
  // }
  const rooms = new Map();

  function getOrCreateRoom(roomId) {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        receiverSockets: new Set(),
        phoneSockets: new Map()
      });
    }
    return rooms.get(roomId);
  }

  function broadcastRoomState(room, roomId) {
    const phonesList = Array.from(room.phoneSockets.values())
      .sort((a, b) => a.phoneIndex - b.phoneIndex)
      .map((p) => ({
        id: p.socketId,
        phoneIndex: p.phoneIndex,
        shortId: p.shortId,
        name: p.name,
        isSpeaking: Boolean(p.isSpeaking),
        joinedAt: p.joinedAt
      }));

    const activeCount = phonesList.filter((p) => p.isSpeaking).length;

    // Send full state to laptop receivers
    for (const receiverId of room.receiverSockets) {
      io.to(receiverId).emit('room-state', {
        roomId,
        count: room.phoneSockets.size,
        activeCount,
        phones: phonesList
      });
    }

    // Send summary to phone dashboards
    for (const [phoneId, phone] of room.phoneSockets.entries()) {
      io.to(phoneId).emit('room-status', {
        roomId,
        totalPhones: room.phoneSockets.size,
        activeCount,
        isYouSpeaking: Boolean(phone.isSpeaking)
      });
    }
  }

  io.on('connection', (socket) => {
    let currentRoomId = null;
    let currentRole = null;

    // Join room (defaults to 'local-mic')
    socket.on('join-room', ({ roomId = 'local-mic', role }) => {
      currentRoomId = roomId;
      currentRole = role;
      socket.join(roomId);

      const room = getOrCreateRoom(roomId);

      if (role === 'receiver') {
        room.receiverSockets.add(socket.id);
        console.log(`[ClassMic] Laptop Receiver joined (${socket.id}). Connected phones: ${room.phoneSockets.size}`);
        broadcastRoomState(room, roomId);
      } else if (role === 'phone') {
        // Assign the lowest available positive integer index (Phone 1, Phone 2, etc.)
        const usedIndices = new Set();
        for (const p of room.phoneSockets.values()) {
          usedIndices.add(p.phoneIndex);
        }
        let phoneIndex = 1;
        while (usedIndices.has(phoneIndex)) {
          phoneIndex++;
        }

        const shortId = socket.id.slice(-4).toUpperCase();
        const phoneName = `Phone ${phoneIndex}`;

        room.phoneSockets.set(socket.id, {
          socketId: socket.id,
          phoneIndex,
          shortId,
          name: phoneName,
          isSpeaking: false,
          joinedAt: Date.now()
        });

        console.log(`[ClassMic] ${phoneName} [#${shortId}] joined (${socket.id}). Total phones: ${room.phoneSockets.size}`);

        socket.emit('phone-assigned', {
          phoneIndex,
          shortId,
          name: phoneName,
          roomId
        });

        broadcastRoomState(room, roomId);
      }
    });

    // Phone toggles MIC state (ON / OFF)
    // Multiple phones are allowed to be ON simultaneously
    socket.on('mic:state-change', ({ roomId = 'local-mic', isSpeaking }) => {
      const targetRoomId = currentRoomId || roomId;
      const room = rooms.get(targetRoomId);
      if (!room) return;

      const phone = room.phoneSockets.get(socket.id);
      if (phone) {
        phone.isSpeaking = Boolean(isSpeaking);
        console.log(`[ClassMic] ${phone.name} MIC state changed -> ${phone.isSpeaking ? 'ON (Speaking)' : 'OFF (Muted)'}`);
        socket.emit('mic:acknowledged', { isSpeaking: phone.isSpeaking });
        broadcastRoomState(room, targetRoomId);
      }
    });

    // Receiver requests to remotely mute a specific phone
    socket.on('receiver:mute-phone', ({ roomId = 'local-mic', phoneId }) => {
      const targetRoomId = currentRoomId || roomId;
      const room = rooms.get(targetRoomId);
      if (!room || !phoneId) return;

      const phone = room.phoneSockets.get(phoneId);
      if (phone) {
        phone.isSpeaking = false;
        io.to(phoneId).emit('remote:muted');
        broadcastRoomState(room, targetRoomId);
      }
    });

    // Receiver requests to remotely disconnect a specific phone
    socket.on('receiver:kick-phone', ({ roomId = 'local-mic', phoneId }) => {
      const targetRoomId = currentRoomId || roomId;
      const room = rooms.get(targetRoomId);
      if (!room || !phoneId) return;

      io.to(phoneId).emit('remote:disconnected');
      const phoneSocket = io.sockets.sockets.get(phoneId);
      if (phoneSocket) {
        phoneSocket.disconnect(true);
      }
    });

    // WebRTC Offer (Phone -> Laptop Receiver)
    socket.on('webrtc:offer', ({ roomId = 'local-mic', sdp }) => {
      const targetRoomId = currentRoomId || roomId;
      const room = rooms.get(targetRoomId);
      if (!room) return;

      const phone = room.phoneSockets.get(socket.id);
      const phoneIndex = phone ? phone.phoneIndex : 1;
      const phoneName = phone ? phone.name : `Phone ${phoneIndex}`;
      const shortId = phone ? phone.shortId : socket.id.slice(-4).toUpperCase();

      for (const receiverId of room.receiverSockets) {
        io.to(receiverId).emit('webrtc:offer', {
          phoneId: socket.id,
          phoneIndex,
          phoneName,
          shortId,
          sdp
        });
      }
    });

    // WebRTC Answer (Laptop Receiver -> Specific Phone)
    socket.on('webrtc:answer', ({ targetId, sdp }) => {
      if (targetId) {
        io.to(targetId).emit('webrtc:answer', {
          sdp
        });
      }
    });

    // WebRTC ICE Candidate relay
    socket.on('webrtc:ice-candidate', ({ targetId, candidate }) => {
      const room = rooms.get(currentRoomId);
      if (!room || !candidate) return;

      if (currentRole === 'phone') {
        // Forward candidate to all connected receivers
        for (const receiverId of room.receiverSockets) {
          io.to(receiverId).emit('webrtc:ice-candidate', {
            phoneId: socket.id,
            candidate
          });
        }
      } else {
        // Receiver forwards to specific phone
        if (targetId) {
          io.to(targetId).emit('webrtc:ice-candidate', {
            candidate
          });
        }
      }
    });

    // Clean disconnection
    socket.on('disconnect', () => {
      if (!currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;

      if (currentRole === 'receiver') {
        room.receiverSockets.delete(socket.id);
        console.log(`[ClassMic] Receiver disconnected (${socket.id})`);
      } else if (currentRole === 'phone') {
        const phone = room.phoneSockets.get(socket.id);
        const name = phone ? phone.name : socket.id;

        // Notify receivers to tear down the WebRTC peer for this phone
        for (const receiverId of room.receiverSockets) {
          io.to(receiverId).emit('phone-left', {
            phoneId: socket.id
          });
        }

        room.phoneSockets.delete(socket.id);
        console.log(`[ClassMic] ${name} disconnected (${socket.id}). Remaining phones: ${room.phoneSockets.size}`);
        broadcastRoomState(room, currentRoomId);
      }

      if (room.receiverSockets.size === 0 && room.phoneSockets.size === 0) {
        rooms.delete(currentRoomId);
      }
    });
  });
}
