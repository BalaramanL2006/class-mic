import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  if (!socket) {
    // Connect to current host
    socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    socket.on('connect', () => {
      console.log('[ClassMic] Socket connected:', socket.id);
    });

    socket.on('connect_error', (err) => {
      console.warn('[ClassMic] Socket connection error:', err.message);
    });
  }
  return socket;
}

export function joinRoom(roomId, role) {
  const s = getSocket();
  if (s.connected) {
    s.emit('join-room', { roomId, role });
  } else {
    s.once('connect', () => {
      s.emit('join-room', { roomId, role });
    });
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
