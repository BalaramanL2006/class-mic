# ClassMic

> Turn your phone into a real-time wireless microphone for physical classrooms and presentations.

```
PHONE (Microphone)  ──(Wi-Fi / WebRTC)──▶  LAPTOP (Receiver)  ──▶  SPEAKER
```

---

## What is ClassMic?

ClassMic is a simple, real-time wireless microphone web application built with **WebRTC**, **Socket.IO**, and **Node.js**.

- **Phone = Microphone**: Captures real audio through `navigator.mediaDevices.getUserMedia()`.
- **Laptop = Receiver**: Receives real-time peer-to-peer audio stream and plays through laptop speakers or external Bluetooth speaker.
- **Local Network**: Operates directly over local Wi-Fi without requiring external cloud databases or accounts.

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm run dev
```
The server starts on port `3000` and displays your laptop's local network IP address (e.g. `http://192.168.1.15:3000`).

---

## Local Wi-Fi Testing (Classroom Setup)

Follow these exact steps to test ClassMic in a classroom:

1. **Start the Node.js server on your laptop**:
   ```bash
   npm run dev
   ```
2. **Connect laptop and phone to the same Wi-Fi network**.
3. **Open the laptop receiver page**:
   - Open your browser on the laptop: `http://localhost:3000`
   - Click **[ LAPTOP RECEIVER ]**.
4. **Find the laptop's local IP address**:
   - The laptop receiver page displays your local network address (e.g. `http://192.168.1.15:3000`) along with a pairing QR code.
5. **Open the phone microphone page**:
   - Scan the QR code with your phone camera, OR
   - Open mobile browser (Chrome/Safari) and type: `http://<laptop-ip>:3000/?role=phone`
6. **Allow microphone permission**:
   - Tap **Allow** when your browser requests microphone access.
7. **Turn MIC ON**:
   - Tap the large circular **🎤 MIC OFF** button.
   - It turns emerald green and displays **🎤 MIC ON / SPEAKING...**.
8. **Speak into the phone microphone**:
   - Watch the audio level meter react on the phone.
9. **Verify that the laptop receives the audio**:
   - The laptop screen will show `🟢 Phone Connected`.
   - The audio visualizer (`▂▅▇▆▃▅▇▃`) will dance to your voice.
10. **Connect laptop to speaker**:
    - Connect your laptop to external classroom speakers or a Bluetooth speaker.
    - Adjust volume or mute anytime from the laptop receiver page.

---

## Testing via Laptop Wi-Fi Hotspot (No Router Needed)

If a Wi-Fi router is not available:

1. **Enable Mobile Hotspot on Laptop**:
   - **Windows**: Settings → Network & Internet → Mobile Hotspot → Turn On.
   - **macOS**: System Settings → General → Sharing → Internet Sharing.
2. **Connect Phone**:
   - On your phone, connect to your laptop's hotspot Wi-Fi.
3. **Open ClassMic**:
   - On the laptop, run `npm run dev` and click **[ LAPTOP RECEIVER ]**.
   - On the phone, scan the QR code or enter the hotspot gateway IP (e.g. `http://192.168.137.1:3000`).
4. **Speak**:
   - Audio streams peer-to-peer over the direct hotspot connection with ultra-low latency.

---

## Project Structure

```
client/
    src/
        components/
            AudioLevelMeter.jsx
            AudioVisualizer.jsx
            StatusBadge.jsx
        pages/
            HomePage.jsx
            PhoneMicPage.jsx
            LaptopReceiverPage.jsx
        services/
            socket.js
        webrtc/
            peer.js
            audio.js
        App.jsx
        main.jsx
        styles.css

server/
    src/
        server.js
        signaling.js
```

---

## Multiple Phones Support (Classrooms & Multiple Speakers)

ClassMic supports multiple phones connected to the same laptop receiver simultaneously:

1. **Laptop starts ClassMic**:
   - Start the server on your laptop with `npm run dev`.
   - Click **[ LAPTOP RECEIVER ]**. The page displays:
     ```
     ClassMic Local Network

     Server:
     🟢 Running

     Phone URL:
     http://<REAL-LAN-IP>:3000/?role=phone&room=default

     Connected Phones:
     0
     ```
2. **Connect Multiple Phones**:
   - **Phone 1**: Connect to the laptop's Wi-Fi or hotspot. Open the Phone URL or scan the QR code. Connected Phones updates to `1`.
   - **Phone 2**: Connect to the same Wi-Fi/hotspot. Open the Phone URL or scan the QR code. Connected Phones updates to `2`.
   - **Phone 3**: Connect to the same Wi-Fi/hotspot. Open the Phone URL or scan the QR code. Connected Phones updates to `3`.
3. **Independent WebRTC Connections**:
   - Each phone has its own isolated peer connection to the laptop receiver.
   - Any phone can tap **Mic On** to speak through the laptop speakers.
   - An audio mixer merges and normalizes incoming audio streams with real-time waveform visualization.

---

## Windows Setup & Windows Firewall Configuration

The server binds to `0.0.0.0` (all network interfaces) so it can receive connections from phones connected over Wi-Fi or Windows Mobile Hotspot:

1. **Windows Firewall Prompt**:
   - When you start Node.js for the first time, Windows Defender Firewall may display an alert: *"Windows Defender Firewall has blocked some features of this app"*.
   - **Check "Private networks, such as my home or work network"** and click **"Allow access"**.
   - If blocked or missed:
     1. Open **Windows Security** → **Firewall & network protection**.
     2. Click **Allow an app through firewall**.
     3. Find **Node.js: Server-side JavaScript** (or add `node.exe`).
     4. Ensure the **Private** checkbox is checked and save.

2. **Windows Mobile Hotspot (Recommended for Classrooms without Wi-Fi)**:
   - Go to Windows **Settings** → **Network & internet** → **Mobile hotspot** → Toggle **On**.
   - Connect your phone to this hotspot network.
   - ClassMic automatically detects the Windows Hotspot adapter (`192.168.137.x`) and prioritizes it for your pairing QR code and URL.

---

## Troubleshooting

### 1. Windows Firewall
- When starting Node.js for the first time, Windows Defender Firewall displays a prompt: **"Allow Node.js to communicate on Private networks"**. Make sure **Private networks** is checked and click **Allow access**.
- If phones get connection timed out or refused, verify the firewall rule:
  1. Open **Windows Security** → **Firewall & network protection** → **Allow an app through firewall**.
  2. Click **Change settings**, find **Node.js: Server-side JavaScript**, and ensure **Private** is checked.
  3. Alternatively, open PowerShell as Administrator and run:
     ```powershell
     netsh advfirewall firewall add rule name="ClassMic Port 3000" dir=in action=allow protocol=TCP localport=3000
     ```

### 2. Same Wi-Fi Network & Router "Client Isolation"
- **Same Network**: Verify that Phone 1, Phone 2, and the Laptop are connected to the exact same Wi-Fi SSID.
- **Client / AP Isolation**: School, university, or public Wi-Fi networks often enable "Client Isolation" or "Guest Mode" which blocks phones from talking to other devices on the same network.
  - **Solution**: If your school Wi-Fi has Client Isolation, turn on **Windows Mobile Hotspot** on your laptop and connect all phones directly to your laptop's hotspot.

### 3. Windows Mobile Hotspot (Recommended)
- Go to Windows **Settings** → **Network & internet** → **Mobile hotspot** → Toggle **On**.
- Connect all phones to the laptop's hotspot network.
- Windows Mobile Hotspot assigns the laptop an address (typically `192.168.137.1`).
- ClassMic automatically detects the hotspot adapter and updates the **Laptop Network IP** and **Phone URL**.
- Click **[ Refresh Network ]** on the Laptop Receiver screen if you enabled Hotspot after starting ClassMic.

### 4. How to Check `ipconfig` on Windows
If you want to manually verify your laptop's network IP:
1. Press `Win + R`, type `cmd`, and press Enter.
2. Type:
   ```cmd
   ipconfig
   ```
3. Look for the active network adapter:
   - **Wi-Fi**: Look for `Wireless LAN adapter Wi-Fi` → `IPv4 Address . . . : 192.168.x.x`
   - **Hotspot**: Look for `Wireless LAN adapter Local Area Connection*` → `IPv4 Address . . . : 192.168.137.1`
4. Confirm that this IPv4 address matches the **Laptop Network IP** shown on the ClassMic screen.

### 5. Other Common Checks
- **Microphone blocked on phone**: Tap the lock/site settings icon in Safari/Chrome on your phone and set Microphone to **Allow**.
- **Laptop audio silent**: Click the "Enable Audio" unlock button if the browser restricts autoplay. Ensure volume slider is turned up and mute is disabled.
- **Refresh Network**: If you switched Wi-Fi networks or turned on Hotspot after launching the app, click the **[ Refresh Network ]** button on the Laptop Receiver page to immediately refresh the detected IP.

