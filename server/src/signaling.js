/**
 * ClassMic WebRTC Signaling & Room Management
 * Supports up to 20+ simultaneous phones and 1 laptop receiver per room.
 * Enforces single active microphone rule: only ONE phone can speak at a time.
 */

export function setupSignaling(io) {
  // roomId -> {
  //   receiverSockets: Set<string>,
  //   phoneSockets: Map<string, { socketId: string, phoneIndex: number, joinedAt: number }>,
  //   activeMicPhoneId: string | null,
  //   counter: number
  // }
  const rooms = new Map();

  function getOrCreateRoom(roomId) {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        receiverSockets: new Set(),
        phoneSockets: new Map(),
        activeMicPhoneId: null,
        counter: 0
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
        name: `Phone ${p.phoneIndex}`,
        isSpeaking: p.socketId === room.activeMicPhoneId
      }));

    const activePhone = room.activeMicPhoneId ? room.phoneSockets.get(room.activeMicPhoneId) : null;
    const activePhoneName = activePhone ? `Phone ${activePhone.phoneIndex}` : null;

    // Send to all receiver sockets
    for (const receiverId of room.receiverSockets) {
      io.to(receiverId).emit('room-state', {
        count: room.phoneSockets.size,
        phones: phonesList,
        activeMicPhoneId: room.activeMicPhoneId,
        activePhoneName
      });
    }

    // Send to all phone sockets
    for (const phoneId of room.phoneSockets.keys()) {
      io.to(phoneId).emit('room-mic-status', {
        activeMicPhoneId: room.activeMicPhoneId,
        activePhoneName,
        isYouSpeaking: phoneId === room.activeMicPhoneId,
        isOtherSpeaking: Boolean(room.activeMicPhoneId && room.activeMicPhoneId !== phoneId)
      });
    }
  }

  io.on('connection', (socket) => {
    let currentRoomId = null;
    let currentRole = null;

    socket.on('join-room', ({ roomId = 'default', role }) => {
      currentRoomId = roomId;
      currentRole = role;
      socket.join(roomId);

      const room = getOrCreateRoom(roomId);

      if (role === 'receiver') {
        room.receiverSockets.add(socket.id);
        console.log(`[ClassMic] Laptop Receiver joined (${socket.id}). Connected phones: ${room.phoneSockets.size}`);
        broadcastRoomState(room, roomId);
      } else if (role === 'phone') {
        // Assign the lowest available positive index for clean ordering (Phone 1, Phone 2, etc.)
        const usedIndices = new Set();
        for (const p of room.phoneSockets.values()) {
          usedIndices.add(p.phoneIndex);
        }
        let phoneIndex = 1;
        while (usedIndices.has(phoneIndex)) {
          phoneIndex++;
        }

        room.phoneSockets.set(socket.id, {
          socketId: socket.id,
          phoneIndex,
          joinedAt: Date.now()
        });

        console.log(`[ClassMic] Phone ${phoneIndex} joined (${socket.id}). Total phones: ${room.phoneSockets.size}`);

        // Notify this phone of its index
        socket.emit('phone-assigned', {
          phoneIndex,
          name: `Phone ${phoneIndex}`
        });

        broadcastRoomState(room, roomId);
      }
    });

    // Request to turn MIC ON (Enforce single active microphone)
    socket.on('mic:request-on', ({ roomId = 'default' } = {}) => {
      const room = rooms.get(currentRoomId || roomId);
      if (!room) return;

      if (room.activeMicPhoneId && room.activeMicPhoneId !== socket.id) {
        // Another phone is already active!
        const active = room.phoneSockets.get(room.activeMicPhoneId);
        const activeName = active ? `Phone ${active.phoneIndex}` : 'Another phone';
        socket.emit('mic:denied', {
          reason: 'Another microphone is currently active.',
          activePhoneName: activeName
        });
        return;
      }

      // Grant mic to this phone
      room.activeMicPhoneId = socket.id;
      const phoneData = room.phoneSockets.get(socket.id);
      const phoneName = phoneData ? `Phone ${phoneData.phoneIndex}` : 'Phone';
      console.log(`[ClassMic] Mic granted to ${phoneName} (${socket.id})`);

      socket.emit('mic:granted');
      broadcastRoomState(room, currentRoomId || roomId);
    });

    // Request to turn MIC OFF
    socket.on('mic:request-off', ({ roomId = 'default' } = {}) => {
      const room = rooms.get(currentRoomId || roomId);
      if (!room) return;

      if (room.activeMicPhoneId === socket.id) {
        console.log(`[ClassMic] Mic released by (${socket.id})`);
        room.activeMicPhoneId = null;
      }

      socket.emit('mic:stopped');
      broadcastRoomState(room, currentRoomId || roomId);
    });

    // WebRTC Offer (Phone -> Laptop Receiver)
    socket.on('webrtc:offer', ({ roomId = 'default', sdp }) => {
      const room = rooms.get(currentRoomId || roomId);
      if (!room) return;

      const phoneData = room.phoneSockets.get(socket.id);
      const phoneIndex = phoneData ? phoneData.phoneIndex : 1;

      for (const receiverId of room.receiverSockets) {
        io.to(receiverId).emit('webrtc:offer', {
          phoneId: socket.id,
          phoneIndex,
          phoneName: `Phone ${phoneIndex}`,
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

    // WebRTC ICE Candidates
    socket.on('webrtc:ice-candidate', ({ targetId, candidate }) => {
      const room = rooms.get(currentRoomId);
      if (!room || !candidate) return;

      if (currentRole === 'phone') {
        for (const receiverId of room.receiverSockets) {
          io.to(receiverId).emit('webrtc:ice-candidate', {
            phoneId: socket.id,
            candidate
          });
        }
      } else {
        if (targetId) {
          io.to(targetId).emit('webrtc:ice-candidate', {
            candidate
          });
        }
      }
    });

    // Disconnect cleanup
    socket.on('disconnect', () => {
      if (!currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (!room) return;

      if (currentRole === 'receiver') {
        room.receiverSockets.delete(socket.id);
        console.log(`[ClassMic] Receiver disconnected (${socket.id})`);
      } else if (currentRole === 'phone') {
        const wasSpeaking = room.activeMicPhoneId === socket.id;
        if (wasSpeaking) {
          room.activeMicPhoneId = null;
        }

        // Notify receivers to close WebRTC peer for this phone
        for (const receiverId of room.receiverSockets) {
          io.to(receiverId).emit('phone-left', {
            phoneId: socket.id
          });
        }

        room.phoneSockets.delete(socket.id);
        console.log(`[ClassMic] Phone disconnected (${socket.id}). Remaining: ${room.phoneSockets.size}`);
        broadcastRoomState(room, currentRoomId);
      }

      if (room.receiverSockets.size === 0 && room.phoneSockets.size === 0) {
        rooms.delete(currentRoomId);
      }
    });
  });
}
