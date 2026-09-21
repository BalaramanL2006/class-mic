# CLASSMIC

> **Modern Offline Wireless Microphone & Multi-Mic Audio Mixer for Classrooms, Auditoriums, and Presentations**

```
 ┌──────────────────────────┐          Local Wi-Fi / Hotspot         ┌──────────────────────────┐         AUX / Bluetooth / USB
 │  Smartphone (Transmitter)│ ─────────────── WebRTC ──────────────▶ │ Laptop (Receiver / Mixer)│ ──────────────────────────────▶ External Speakers / PA
 │    • Chrome / Safari     │       (Ultra-Low Latency Opus)         │    • Web Audio Mixer     │
 │    • Real-time Mic Level │                                        │    • Master / Per-Mic Vol│
 └──────────────────────────┘                                        └──────────────────────────┘
```

---

## 📌 Overview

**CLASSMIC** transforms smartphones into high-performance, real-time wireless microphones that stream directly to a laptop receiver over a local Wi-Fi router or laptop mobile hotspot. The laptop routes and mixes the incoming audio in real time to external classroom speakers, PA systems, soundbars, or Bluetooth speakers.

- **100% Offline LAN Operation**: Operates directly over local Wi-Fi. No internet access, external cloud servers, or user accounts required.
- **Multi-Microphone Support**: Multiple speakers or students can connect their phones at the same time. The laptop receiver console provides individual volume sliders, mute toggles, and live voice activity meters for each connected phone.
- **Ultra-Low Latency Audio**: Uses WebRTC Opus audio packetization optimized for speech (10ms ptime) with Web Audio API hardware routing.
- **Instant Pairing**: Displays a high-resolution QR code and one-click LAN URL on the laptop receiver console for instant phone connection.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** v18.0.0 or higher
- Laptop and mobile phone(s) connected to the same Wi-Fi network (or laptop hotspot)

### 2. Installation
Clone the repository and install dependencies:
```bash
npm install
```

### 3. Start Development Server
```bash
npm run dev
```
The server will bind to `0.0.0.0:3000` and display your local network IP (e.g., `http://192.168.1.15:3000`).

---

## 🏫 Classroom & Presentation Setup

### Mode A: Standard Local Wi-Fi Router (Recommended)

1. **Start CLASSMIC on your Laptop**:
   ```bash
   npm run dev
   ```
2. **Open the Receiver Console**:
   - In your laptop browser, navigate to `http://localhost:3000`.
   - Click **[ Open Receiver Console ]** (or go to `http://localhost:3000/?role=receiver`).
3. **Connect to Speakers**:
   - Connect your laptop to your room's speakers using a **3.5mm AUX cable**, **USB Audio interface**, or **Bluetooth**.
4. **Connect Mobile Microphones**:
   - Open your smartphone camera and scan the pairing QR code displayed on the laptop screen.
   - *Alternatively*, type the displayed URL into your phone's browser (e.g., `http://192.168.1.15:3000/?role=phone`).
5. **Grant Microphone Access & Speak**:
   - Tap **Allow** when prompted for microphone permission.
   - Tap the large circular **MIC OFF** button to toggle to **MIC ON / TRANSMITTING LIVE**.
   - Speak into your phone — audio plays through the laptop speakers with real-time level monitoring.

---

### Mode B: Laptop Mobile Hotspot (Zero Router / Field Use)

If a Wi-Fi router is unavailable or if your school network blocks device-to-device communication (client isolation):

1. **Enable Mobile Hotspot on Laptop**:
   - **Windows**: Settings → Network & Internet → Mobile Hotspot → Toggle **ON**.
   - **macOS**: System Settings → General → Sharing → Internet Sharing.
2. **Connect Phones to Laptop Hotspot**:
   - On the smartphones, connect to the laptop's Wi-Fi hotspot SSID.
3. **Launch Receiver**:
   - Start the server (`npm run dev`) and open the Receiver Console on the laptop.
   - CLASSMIC automatically detects the hotspot network interface (e.g., `192.168.137.1`) and updates the pairing QR code.
4. **Scan & Transmit**:
   - Connect phone(s) via the QR code and begin speaking.

---

## 🔒 Mobile Browser Microphone & HTTPS Setup

Modern mobile browsers (such as Google Chrome on Android) require a **Secure Context** (HTTPS or localhost) to access the microphone via `navigator.mediaDevices.getUserMedia()`. 

CLASSMIC includes a built-in automated certificate generator using `mkcert`:

### Generating Local Trusted Certificates

1. **Install `mkcert`** (one-time setup on your laptop):
   - **Windows (PowerShell)**:
     ```powershell
     winget install FiloSottile.mkcert
     # or: choco install mkcert
     ```
   - **macOS**:
     ```bash
     brew install mkcert
     ```
   - **Linux**:
     ```bash
     sudo apt install libnss3-tools && brew install mkcert
     ```

2. **Generate Certificates for Your LAN IPs**:
   ```bash
   npm run cert
   ```
   This command detects all local network interfaces and creates trusted certificates in `./certs/`.

3. **Install Root CA on Android Phone (for Chrome)**:
   - Run `npm run cert` to display your `rootCA.pem` path.
   - Transfer `rootCA.pem` to your Android device (via USB, email, or Google Drive).
   - On Android: **Settings** → **Security** → **More security settings** → **Encryption & credentials** → **Install a certificate** → **CA certificate**.
   - Select `rootCA.pem` and confirm. Chrome on Android will now trust your local HTTPS connection and allow full microphone streaming.

> **Note for iOS (Safari)**: Safari on iOS allows microphone access over local IP addresses without requiring custom root certificates.

---

## 🎛️ Receiver Console & Multi-Mic Mixer Features

The laptop receiver dashboard acts as a central audio control station:

- **Independent Audio Channels**: Each connected mobile phone is automatically registered with a distinct name (e.g., `Phone 1`, `Phone 2`) and short identifier.
- **Individual Channel Volume**: Adjust each microphone's gain from `0%` to `150%` to balance vocal levels between different speakers.
- **Individual & Master Mute**: Mute individual speakers or mute the entire master output with a single click.
- **Remote Mute & Disconnect**: Laptop operator can remotely mute or disconnect any phone directly from the console.
- **Real-Time Spectrum Analyzer**: Visualizes incoming audio frequencies and output amplitude to monitor audio clarity.
- **Autoplay Unblock Guard**: Built-in detection for browser autoplay policies with a one-click audio resume button.

---

## 📂 Project Structure

```
classmic/
├── client/                      # Frontend Application (React 19 + Tailwind CSS)
│   └── src/
│       ├── components/          # Reusable UI & Audio Components
│       │   ├── AudioLevelMeter.jsx   # Real-time microphone input volume meter
│       │   ├── AudioVisualizer.jsx   # Multi-bar live audio output spectrum
│       │   └── StatusBadge.jsx       # Connection status indicators
│       ├── pages/               # Primary Route Views
│       │   ├── HomePage.jsx          # Mode selector & routing introduction
│       │   ├── PhoneMicPage.jsx      # Mobile transmitter interface & controls
│       │   └── LaptopReceiverPage.jsx# Multi-channel receiver console & mixer
│       ├── services/            # Client Networking
│       │   └── socket.js             # Socket.IO client setup & event dispatching
│       ├── webrtc/              # Low-Latency WebRTC & Web Audio Engines
│       │   ├── audio.js              # Multi-channel Web Audio mixer & analyzers
│       │   └── peer.js               # RTCPeerConnection lifecycle & SDP tuning
│       ├── App.jsx              # App root, role routing & global navbar
│       ├── main.jsx             # React entry point
│       └── styles.css           # Global Tailwind CSS directives & theme styles
├── server/                      # Backend Service (Node.js + Express + Socket.IO)
│   └── src/
│       ├── server.js            # Express server, HTTPS/HTTP setup & LAN IP discovery
│       └── signaling.js         # WebRTC room management & multi-phone signaling
├── scripts/
│   └── generate-cert.js         # Automated mkcert SSL certificate generator
├── certs/                       # Generated local SSL certificates (optional)
├── public/                      # Static assets & icons
├── index.html                   # HTML entry point with metadata
├── vite.config.js               # Vite bundler configuration
├── package.json                 # Project dependencies and npm scripts
└── metadata.json                # Application metadata and runtime permissions
```

---

## 🔬 Technical Implementation

### WebRTC Low-Latency Voice Optimization
- **Offline ICE Gathering**: Configured with `iceServers: []` to eliminate delays associated with external STUN servers when offline. WebRTC gathers LAN host candidates immediately.
- **Opus SDP Packetization**: Modifies SDP parameters to set `ptime=10` (10ms audio packets), `stereo=0` (mono speech), and `maxaveragebitrate=64000` for crisp vocal transmission with minimal network latency.
- **MediaStream Constraints**: Disables software echo cancellation and aggressive noise suppression algorithms to bypass software DSP processing lag when outputting to PA speakers.

### Web Audio API Multi-Phone Mixer
- The receiver maintains a dedicated `AudioContext` and dynamically connects each phone's `MediaStream` to an individual `GainNode` and `AnalyserNode`.
- All channels merge into a central master `GainNode` feeding the destination speaker output while calculating real-time FFT spectrum data.

---

## 🔧 Troubleshooting & Tips

### 1. Windows Defender Firewall
When running Node.js for the first time, Windows may display a firewall prompt:
- Check **"Private networks, such as my home or work network"** and click **"Allow access"**.
- If connection times out from mobile devices, ensure port `3000` is permitted:
  ```powershell
  netsh advfirewall firewall add rule name="CLASSMIC Port 3000" dir=in action=allow protocol=TCP localport=3000
  ```

### 2. Client / AP Isolation on School Wi-Fi
School and corporate Wi-Fi networks often prevent wireless devices from talking directly to one another.
- **Symptom**: Phone connects to the URL, but audio does not stream or WebRTC fails to connect.
- **Fix**: Turn on **Mobile Hotspot** on the laptop and connect all phones to the hotspot Wi-Fi.

### 3. Port Conflict (Port 3000 in Use)
If another application is using port 3000:
- **Windows**:
  ```cmd
  netstat -ano | findstr :3000
  taskkill /F /PID <PID>
  ```
- Or run CLASSMIC on a custom port:
  ```bash
  PORT=3005 npm run dev
  ```

### 4. Browser Audio Autoplay Policy
Modern browsers prevent web pages from playing audio without user interaction.
- If the receiver shows connected phones speaking but no sound comes from the laptop speakers, click the **"Unblock Audio"** banner displayed at the top of the Receiver Console.

---

## 📜 Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Express server and Vite development server on port 3000 |
| `npm run build` | Compiles production assets into the `/dist` directory |
| `npm run start` | Runs the production server using compiled static assets |
| `npm run cert` | Generates local HTTPS SSL certificates for detected LAN IPs via `mkcert` |
| `npm run lint` | Runs project linting and syntax validation |
| `npm run clean` | Removes compiled build artifacts |

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
