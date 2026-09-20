/**
 * WebRTC RTCPeerConnection implementation for ClassMic
 * Handles Offer, Answer, ICE Candidates, audio stream transmission, and connection state.
 */

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 4
};

/**
 * Creates Phone PeerConnection (Transmitter)
 */
export function createPhonePeer({ stream, onIceCandidate, onStateChange }) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const pendingCandidates = [];

  // Add microphone audio tracks
  if (stream) {
    stream.getAudioTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });
  }

  pc.onicecandidate = (event) => {
    if (event.candidate && onIceCandidate) {
      onIceCandidate(event.candidate);
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('[ClassMic Phone] Connection state:', pc.connectionState);
    if (onStateChange) onStateChange(pc.connectionState);
  };

  pc.oniceconnectionstatechange = () => {
    console.log('[ClassMic Phone] ICE connection state:', pc.iceConnectionState);
    if (onStateChange) onStateChange(pc.iceConnectionState);
  };

  async function createOffer() {
    const offer = await pc.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false
    });
    await pc.setLocalDescription(offer);
    return offer;
  }

  async function flushPendingCandidates() {
    while (pendingCandidates.length > 0) {
      const cand = pendingCandidates.shift();
      try {
        await pc.addIceCandidate(cand);
      } catch (err) {
        console.warn('[ClassMic Phone] Error flushing queued candidate:', err);
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
 */
export function createReceiverPeer({ onTrack, onIceCandidate, onStateChange }) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const pendingCandidates = [];

  pc.ontrack = (event) => {
    console.log('[ClassMic Receiver] Audio track received:', event.track);
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
    console.log('[ClassMic Receiver] Connection state:', pc.connectionState);
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
        console.warn('[ClassMic Receiver] Error flushing queued candidate:', err);
      }
    }
  }

  async function handleOffer(sdp) {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await flushPendingCandidates();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
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
