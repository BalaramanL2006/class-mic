/**
 * WebRTC RTCPeerConnection implementation for ClassMic (Offline LAN)
 *
 * Designed for pure local Wi-Fi transmission without internet:
 * - Direct host-to-host ICE candidates (iceServers: [])
 * - Low-latency 10ms Opus audio packetization
 * - Independent peer connections per mobile device
 */

// Offline LAN Configuration:
// For an offline WiFi router with no internet, empty iceServers guarantees
// immediate gathering of local LAN host candidates without hanging on unreachable STUN servers.
export const RTC_CONFIG = {
  iceServers: [],
  iceCandidatePoolSize: 2
};

/**
 * Optimizes SDP for real-time low-latency speech transmission
 * Packetizes Opus audio every 10ms (ptime=10) instead of default 20ms,
 * forces mono transmission, and optimizes bitrate for voice.
 */
export function optimizeOpusSdp(sdp) {
  if (!sdp) return sdp;

  let modified = sdp;

  // Find opus payload type number
  const opusMatch = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i);
  if (opusMatch && opusMatch[1]) {
    const pt = opusMatch[1];
    const fmtpRegex = new RegExp(`a=fmtp:${pt}\\s+([^\r\n]+)`, 'i');

    const lowLatencyParams = 'minptime=10;ptime=10;stereo=0;sprop-stereo=0;useinbandfec=0;cbr=1;maxaveragebitrate=64000';

    if (fmtpRegex.test(modified)) {
      modified = modified.replace(fmtpRegex, `a=fmtp:${pt} ${lowLatencyParams};$1`);
    } else {
      modified = modified.replace(
        new RegExp(`(a=rtpmap:${pt}\\s+opus\/48000[^\r\n]*)`, 'i'),
        `$1\r\na=fmtp:${pt} ${lowLatencyParams}`
      );
    }
  }

  return modified;
}

/**
 * Creates Phone PeerConnection (Transmitter)
 */
export function createPhonePeer({ stream, onIceCandidate, onStateChange }) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const pendingCandidates = [];

  // Add microphone audio tracks and configure content hint for speech
  if (stream) {
    stream.getAudioTracks().forEach((track) => {
      if ('contentHint' in track) {
        track.contentHint = 'speech';
      }
      pc.addTrack(track, stream);
    });
  }

  pc.onicecandidate = (event) => {
    if (event.candidate && onIceCandidate) {
      onIceCandidate(event.candidate);
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('[ClassMic Phone] WebRTC state:', pc.connectionState);
    if (onStateChange) onStateChange(pc.connectionState);
  };

  pc.oniceconnectionstatechange = () => {
    console.log('[ClassMic Phone] ICE state:', pc.iceConnectionState);
    if (onStateChange) onStateChange(pc.iceConnectionState);
  };

  async function createOffer() {
    const offer = await pc.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
      voiceActivityDetection: false
    });

    const optimizedSdp = optimizeOpusSdp(offer.sdp);
    const optimizedOffer = { type: offer.type, sdp: optimizedSdp };

    await pc.setLocalDescription(optimizedOffer);
    return optimizedOffer;
  }

  async function flushPendingCandidates() {
    while (pendingCandidates.length > 0) {
      const cand = pendingCandidates.shift();
      try {
        await pc.addIceCandidate(cand);
      } catch (err) {
        console.warn('[ClassMic Phone] Error flushing candidate:', err);
      }
    }
  }

  async function handleAnswer(sdp) {
    if (!pc.currentRemoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await flushPendingCandidates();
    }
  }

  async function addIceCandidate(candidate) {
    try {
      if (candidate) {
        const iceCandidate = new RTCIceCandidate(candidate);
        if (!pc.remoteDescription || !pc.remoteDescription.type) {
          pendingCandidates.push(iceCandidate);
          return;
        }
        await pc.addIceCandidate(iceCandidate);
      }
    } catch (err) {
      console.warn('[ClassMic Phone] Error adding ICE candidate:', err);
    }
  }

  function close() {
    pendingCandidates.length = 0;
    try {
      pc.close();
    } catch (_) {}
  }

  return {
    pc,
    createOffer,
    handleAnswer,
    addIceCandidate,
    close
  };
}

/**
 * Creates Laptop PeerConnection (Receiver)
 * Dedicated peer per connected mobile phone
 */
export function createReceiverPeer({ onTrack, onIceCandidate, onStateChange }) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const pendingCandidates = [];

  pc.ontrack = (event) => {
    console.log('[ClassMic Receiver] Incoming audio track:', event.track);
    if (event.streams && event.streams[0]) {
      onTrack(event.streams[0]);
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate && onIceCandidate) {
      onIceCandidate(event.candidate);
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('[ClassMic Receiver] Peer connection state:', pc.connectionState);
    if (onStateChange) onStateChange(pc.connectionState);
  };

  pc.oniceconnectionstatechange = () => {
    console.log('[ClassMic Receiver] ICE connection state:', pc.iceConnectionState);
    if (onStateChange) onStateChange(pc.iceConnectionState);
  };

  async function flushPendingCandidates() {
    while (pendingCandidates.length > 0) {
      const cand = pendingCandidates.shift();
      try {
        await pc.addIceCandidate(cand);
      } catch (err) {
        console.warn('[ClassMic Receiver] Error flushing candidate:', err);
      }
    }
  }

  async function handleOffer(sdp) {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await flushPendingCandidates();
    const answer = await pc.createAnswer();
    const optimizedSdp = optimizeOpusSdp(answer.sdp);
    const optimizedAnswer = { type: answer.type, sdp: optimizedSdp };
    await pc.setLocalDescription(optimizedAnswer);
    return optimizedAnswer;
  }

  async function addIceCandidate(candidate) {
    try {
      if (candidate) {
        const iceCandidate = new RTCIceCandidate(candidate);
        if (!pc.remoteDescription || !pc.remoteDescription.type) {
          pendingCandidates.push(iceCandidate);
          return;
        }
        await pc.addIceCandidate(iceCandidate);
      }
    } catch (err) {
      console.warn('[ClassMic Receiver] Error adding ICE candidate:', err);
    }
  }

  function close() {
    pendingCandidates.length = 0;
    try {
      pc.close();
    } catch (_) {}
  }

  return {
    pc,
    handleOffer,
    addIceCandidate,
    close
  };
}
