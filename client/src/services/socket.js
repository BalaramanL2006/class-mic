import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  if (!socket) {
    // Connect dynamically to the current host (works with any LAN IP, e.g. 192.168.10.76:3000)
    socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 3000,
      timeout: 10000
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

export function reconnectSocket() {
  if (socket) {
    if (!socket.connected) {
      socket.connect();
    }
  } else {
    getSocket();
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
