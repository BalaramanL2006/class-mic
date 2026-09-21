import 'dotenv/config';
import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import os from 'os';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { setupSignaling } from './signaling.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const HOST = '0.0.0.0';

// Search for optional mkcert certificates (local development only)
function findSslCredentials() {
  // In Cloud Run / production deployment, the cloud platform provides HTTPS/TLS termination at the edge.
  // The internal container runs on HTTP. Do not require or look for SSL certificate files.
  if (process.env.NODE_ENV === 'production' || process.env.K_SERVICE) {
    return null;
  }

  // Optional local environment variables
  const keyEnv = process.env.SSL_KEY_FILE || process.env.SSL_KEY_PATH;
  const certEnv = process.env.SSL_CRT_FILE || process.env.SSL_CERT_FILE || process.env.SSL_CERT_PATH;
  if (keyEnv && certEnv) {
    try {
      if (fs.existsSync(keyEnv) && fs.existsSync(certEnv)) {
        return {
          key: fs.readFileSync(keyEnv),
          cert: fs.readFileSync(certEnv),
          keyPath: keyEnv,
          certPath: certEnv
        };
      }
    } catch (_) {
      // Gracefully fall back if paths are invalid or inaccessible
    }
  }

  // Optional local development directories
  const searchDirs = [
    path.join(rootDir, 'certs'),
    rootDir,
    process.cwd(),
    path.join(process.cwd(), 'certs')
  ];

  const standardPairs = [
    { key: 'key.pem', cert: 'cert.pem' },
    { key: 'localhost+2-key.pem', cert: 'localhost+2.pem' }
  ];

  for (const dir of searchDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const pair of standardPairs) {
        const kp = path.join(dir, pair.key);
        const cp = path.join(dir, pair.cert);
        if (fs.existsSync(kp) && fs.existsSync(cp)) {
          return {
            key: fs.readFileSync(kp),
            cert: fs.readFileSync(cp),
            keyPath: kp,
            certPath: cp
          };
        }
      }
    } catch (_) {}
  }

  return null;
}

const sslCreds = findSslCredentials();
const isServerHttps = Boolean(sslCreds);

let server;
if (isServerHttps) {
  server = https.createServer({ key: sslCreds.key, cert: sslCreds.cert }, app);
  console.log(`[ClassMic] Local HTTPS active with certificate:\n  Key:  ${sslCreds.keyPath}\n  Cert: ${sslCreds.certPath}`);
} else {
  server = http.createServer(app);
  if (process.env.NODE_ENV === 'production' || process.env.K_SERVICE) {
    console.log('[ClassMic] Production mode: Cloud platform provides HTTPS/TLS termination at edge.');
  } else {
    console.log('[ClassMic] HTTP mode: Listening on 0.0.0.0 without SSL certificates (optional local HTTPS via mkcert).');
  }
}

// Detect all local LAN IPv4 addresses on this PC
function getLocalLanIps() {
  const ips = [];
  const interfaces = os.networkInterfaces();
  for (const [name, ifaceList] of Object.entries(interfaces)) {
    for (const iface of ifaceList || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, ip: iface.address });
      }
    }
  }
  return ips;
}

// Primary LAN IP (dynamically discovered, or via LAN_IP/HOST_IP env)
function getPrimaryLanIp() {
  if (process.env.LAN_IP) return process.env.LAN_IP;
  if (process.env.HOST_IP) return process.env.HOST_IP;
  if (process.env.LOCAL_IP) return process.env.LOCAL_IP;

  const ips = getLocalLanIps();
  // Prefer common WiFi / LAN subnets: 192.168.x.x, 10.x.x.x, 172.16-31.x.x
  const wifiOrLan = ips.find(
    (i) =>
      i.ip.startsWith('192.168.') ||
      i.ip.startsWith('10.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(i.ip)
  );
  return wifiOrLan ? wifiOrLan.ip : '192.168.10.76';
}

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

// Resolve public origin of the application
function getPublicOrigin(req) {
  const lanIp = getPrimaryLanIp();

  // If local SSL certificates are active, the Node server is listening on HTTPS
  // Otherwise, if behind reverse proxy forwarding HTTPS, check headers
  let isHttps = isServerHttps;
  if (!isHttps && req) {
    isHttps = Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https');
  }

  const proto = isHttps ? 'https' : 'http';

  if (req) {
    const forwardedHost = req.headers['x-forwarded-host'];
    let host = forwardedHost || req.get('host') || '';

    // If accessed from localhost or 127.0.0.1 on the PC, rewrite host to the machine's LAN IP
    // so phones scanning the QR code or visiting the URL reach the PC over WiFi
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      const portSuffix = host.includes(':')
        ? `:${host.split(':')[1]}`
        : PORT !== 80 && PORT !== 443
        ? `:${PORT}`
        : '';
      return `${proto}://${lanIp}${portSuffix}`;
    }

    // If accessed directly via numeric LAN IP (e.g. 192.168.10.76:3000)
    if (/^\d+\.\d+\.\d+\.\d+/.test(host)) {
      return `${proto}://${host}`;
    }

    // If accessed via custom domain or named host
    if (host && !host.includes('run.app')) {
      return `${proto}://${host}`;
    }
  }

  // Cloud Run / AI Studio preview environment fallback
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }

  if (req) {
    const forwardedHost = req.headers['x-forwarded-host'];
    let host = forwardedHost || req.get('host') || '';
    if (host) {
      return `${proto}://${host}`;
    }
  }

  return `${proto}://${lanIp}:${PORT}`;
}

// API route for network info and phone connection URL
app.get('/api/network-info', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const lanIp = getPrimaryLanIp();
  const allLanIps = getLocalLanIps();
  const publicOrigin = getPublicOrigin(req);
  const roomId = req.query.room || 'local-mic';
  const sharedUrl = publicOrigin;
  const isHttps = publicOrigin.startsWith('https://');
  const protocol = isHttps ? 'https' : 'http';

  res.json({
    publicOrigin,
    phoneUrl: sharedUrl,
    sharedUrl,
    roomId,
    lanIp,
    port: PORT,
    isHttps,
    protocol,
    allLanIps
  });
});

// Setup Vite middleware in dev or static serving in production
async function startServer() {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.K_SERVICE) ||
    Boolean(process.env.APP_URL && fs.existsSync(path.join(rootDir, 'dist/index.html')));

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        port: PORT,
        host: HOST,
        allowedHosts: true
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

  // Handle server errors gracefully (e.g. port already in use)
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ [ClassMic Error]: Port ${PORT} is already in use by another application.`);
      console.error(`To resolve this on Windows:`);
      console.error(`  1. Run: netstat -ano | findstr :${PORT}`);
      console.error(`  2. Stop the conflicting PID: taskkill /F /PID <PID>`);
      console.error(`  Or set a different port: PORT=3001 npm run dev\n`);
    } else {
      console.error(`[ClassMic Error]:`, err);
    }
  });

  // Bind to 0.0.0.0 so phones on the same WiFi/LAN can connect
  server.listen(PORT, HOST, () => {
    const lanIp = getPrimaryLanIp();
    const publicOrigin = getPublicOrigin();
    const proto = isServerHttps ? 'https' : 'http';

    console.log('\n========================================');
    console.log(`ClassMic Server Started (${isServerHttps ? 'HTTPS Mode (mkcert)' : 'HTTP Mode'})`);
    console.log(`Bound to: ${HOST}:${PORT} (Listening for all WiFi/LAN devices)`);
    console.log(`Local Access:   ${proto}://localhost:${PORT}`);
    console.log(`WiFi/Phone URL: ${publicOrigin}/?role=phone&room=local-mic`);
    console.log(`Receiver URL:   ${publicOrigin}/?role=receiver&room=local-mic`);
    console.log(`Primary LAN IP: ${lanIp}`);
    console.log('========================================\n');
  });
}

startServer();
