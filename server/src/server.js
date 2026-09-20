import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { setupSignaling } from './signaling.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

const app = express();
const server = http.createServer(app);
const PORT = 3000;

// Enable CORS for all incoming LAN requests
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Initialize Socket.IO with CORS enabled for WebRTC signaling across all LAN clients
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false
  },
  allowEIO3: true,
  transports: ['websocket', 'polling']
});

io.engine.on('connection_error', (err) => {
  console.warn('[ClassMic Socket Engine Error]:', err?.req?.url, err?.code, err?.message);
});

// Setup signaling handlers
setupSignaling(io);

// Resolve the public HTTPS origin of the deployed application
function getPublicOrigin(req) {
  // 1. Check deployment environment variable APP_URL (Cloud Run / AI Studio preview)
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }

  // 2. Derive from incoming request headers (proxies, load balancers)
  if (req) {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const forwardedHost = req.headers['x-forwarded-host'];
    const host = forwardedHost || req.get('host') || '';

    // Enforce HTTPS for public deployment
    const proto = forwardedProto || (req.secure ? 'https' : 'https');

    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      return `${proto}://${host}`;
    }
  }

  return '';
}

// API route for public phone connection info
app.get('/api/network-info', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const publicOrigin = getPublicOrigin(req);
  const roomId = req.query.room || 'default';
  const phoneUrl = publicOrigin ? `${publicOrigin}/?role=phone&room=${encodeURIComponent(roomId)}` : '';

  res.json({
    publicOrigin,
    phoneUrl
  });
});

// Setup Vite middleware in dev or static serving in production
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        port: PORT,
        host: '0.0.0.0'
      },
      appType: 'spa',
      root: rootDir
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(rootDir, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    const publicOrigin = getPublicOrigin();
    console.log('\n========================================');
    console.log('ClassMic Public Server Started');
    console.log(`Port: ${PORT}`);
    if (publicOrigin) {
      console.log(`Public Origin: ${publicOrigin}`);
      console.log(`Phone URL: ${publicOrigin}/?role=phone&room=default`);
      console.log(`Receiver URL: ${publicOrigin}/?role=receiver&room=default`);
    }
    console.log('========================================\n');
  });
}

startServer();
