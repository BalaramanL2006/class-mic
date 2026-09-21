import os from 'os';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const certsDir = path.join(rootDir, 'certs');

// Detect all local LAN IPv4 addresses
function getLanIps() {
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

const detectedIps = getLanIps();
const customIp = process.argv[2] || process.env.LAN_IP || '192.168.10.76';

const ipList = new Set(['localhost', '127.0.0.1', '192.168.10.76']);
if (customIp) {
  ipList.add(customIp);
}
detectedIps.forEach((item) => ipList.add(item.ip));

const domains = Array.from(ipList);

console.log('\n======================================================');
console.log('ClassMic HTTPS Certificate Generator (mkcert)');
console.log('======================================================\n');
console.log('Detected LAN Network Interfaces:');
detectedIps.forEach((item) => {
  console.log(`  • [${item.name}]: ${item.ip}`);
});
console.log('\nDomains & IPs to include in certificate:');
console.log(`  ${domains.join(' ')}\n`);

if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir, { recursive: true });
}

const keyPath = path.join(certsDir, 'key.pem');
const certPath = path.join(certsDir, 'cert.pem');

let mkcertInstalled = false;
try {
  execSync('mkcert -version', { stdio: 'pipe' });
  mkcertInstalled = true;
} catch (_) {
  mkcertInstalled = false;
}

if (mkcertInstalled) {
  console.log('✅ Found mkcert installed on your system.');
  try {
    console.log('1. Ensuring local CA is installed (mkcert -install)...');
    execSync('mkcert -install', { stdio: 'inherit' });

    console.log(`\n2. Generating certificate files in ./certs ...`);
    const cmd = `mkcert -key-file "${keyPath}" -cert-file "${certPath}" ${domains.join(' ')}`;
    console.log(`   Running: ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });

    console.log('\n✅ Certificates generated successfully:');
    console.log(`   Cert: ${certPath}`);
    console.log(`   Key:  ${keyPath}`);

    let caRootPath = '';
    try {
      caRootPath = execSync('mkcert -CAROOT', { encoding: 'utf-8' }).trim();
    } catch (_) {}

    if (caRootPath) {
      console.log('\n======================================================');
      console.log('📱 ANDROID PHONE ROOT CA INSTALLATION:');
      console.log('======================================================');
      console.log(`Your mkcert root CA directory is:`);
      console.log(`   ${caRootPath}`);
      console.log(`Root CA file:`);
      console.log(`   ${path.join(caRootPath, 'rootCA.pem')}`);
      console.log('\nSteps for Android:');
      console.log('1. Copy "rootCA.pem" to your phone (via USB, Google Drive, or email).');
      console.log('2. On Android: Open Settings -> Security -> More security settings');
      console.log('   -> Encryption & credentials -> Install a certificate -> CA certificate.');
      console.log('3. Tap "Install anyway" and select "rootCA.pem".');
      console.log('4. Now Chrome on Android will trust your local HTTPS URL with microphone access!');
      console.log('======================================================\n');
    }
  } catch (err) {
    console.error('❌ Error executing mkcert:', err.message);
  }
} else {
  console.log('⚠️  mkcert is not installed or not in your system PATH.');
  console.log('\nTo install mkcert on Windows (Run in PowerShell / CMD):');
  console.log('   winget install FiloSottile.mkcert');
  console.log('   # or: choco install mkcert');
  console.log('   # or: scoop install mkcert');
  console.log('\nThen run:');
  console.log('   mkcert -install');
  console.log(`   mkcert -key-file "${keyPath}" -cert-file "${certPath}" ${domains.join(' ')}`);
  console.log('\nOnce created, start the server:');
  console.log('   npm run dev');
  console.log('======================================================\n');
}
