import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  ArrowLeft,
  Wifi,
  WifiOff,
  RotateCw,
  ShieldCheck,
  AlertCircle,
  Radio,
  Signal
} from 'lucide-react';
import AudioLevelMeter from '../components/AudioLevelMeter.jsx';
import { getSocket, joinRoom, reconnectSocket, disconnectSocket } from '../services/socket.js';
import { getMicrophoneStream, createAudioMeter } from '../webrtc/audio.js';
import { createPhonePeer } from '../webrtc/peer.js';

export default function PhoneMicPage({ roomId = 'local-mic', onBack }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [phoneName, setPhoneName] = useState('Phone');
  const [shortId, setShortId] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [permissionState, setPermissionState] = useState('prompt'); // 'granted' | 'denied' | 'prompt'
  const [peerState, setPeerState] = useState('idle'); // 'idle' | 'connecting' | 'connected' | 'disconnected'
  const [latencyText, setLatencyText] = useState('< 5 ms');

  const streamRef = useRef(null);
  const peerRef = useRef(null);
  const meterCleanupRef = useRef(null);
  const socketRef = useRef(null);
  const isMicOnRef = useRef(isMicOn);
  isMicOnRef.current = isMicOn;

  // Check microphone permission query if supported
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'microphone' })
        .then((res) => {
          setPermissionState(res.state);
          res.onchange = () => {
            setPermissionState(res.state);
          };
        })
        .catch(() => {});
    }
  }, []);

  // Socket connection & signaling setup
  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    function handleConnect() {
      setIsConnected(true);
      setIsReconnecting(false);
      setErrorMessage('');
      joinRoom(roomId, 'phone');

      // If user had mic ON before unexpected disconnection, resume peer
      if (isMicOnRef.current && streamRef.current) {
        startWebRtcTransmission();
      }
    }

    function handleDisconnect() {
      setIsConnected(false);
      setPeerState('disconnected');
    }

    function handlePhoneAssigned(data) {
      if (data) {
        if (data.name) setPhoneName(data.name);
        if (data.shortId) setShortId(data.shortId);
      }
    }

    async function handleAnswer({ sdp }) {
      if (peerRef.current) {
        try {
          await peerRef.current.handleAnswer(sdp);
          setPeerState('connected');
        } catch (err) {
          console.warn('[ClassMic Phone] Error applying WebRTC answer:', err);
        }
      }
    }

    async function handleIceCandidate({ candidate }) {
      if (peerRef.current) {
        try {
          await peerRef.current.addIceCandidate(candidate);
        } catch (err) {
          console.warn('[ClassMic Phone] Error applying ICE candidate:', err);
        }
      }
    }

    function handleRemoteMuted() {
      // Receiver remotely muted this microphone
      stopMicrophoneTransmission();
    }

    function handleRemoteDisconnected() {
      stopMicrophoneTransmission();
      setIsConnected(false);
      setErrorMessage('You were disconnected by the laptop receiver.');
    }

    if (socket.connected) {
      handleConnect();
    } else {
      socket.on('connect', handleConnect);
    }

    socket.on('disconnect', handleDisconnect);
    socket.on('phone-assigned', handlePhoneAssigned);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice-candidate', handleIceCandidate);
    socket.on('remote:muted', handleRemoteMuted);
    socket.on('remote:disconnected', handleRemoteDisconnected);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('phone-assigned', handlePhoneAssigned);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice-candidate', handleIceCandidate);
      socket.off('remote:muted', handleRemoteMuted);
      socket.off('remote:disconnected', handleRemoteDisconnected);
    };
  }, [roomId]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopMicrophoneTransmission();
      disconnectSocket();
    };
  }, [roomId]);

  // Start WebRTC audio transmission to laptop
  async function startWebRtcTransmission() {
    try {
      setErrorMessage('');
      setPeerState('connecting');

      // 1. Acquire low-latency microphone stream
      const stream = await getMicrophoneStream();
      streamRef.current = stream;
      setPermissionState('granted');

      // 2. Start volume level meter
      if (meterCleanupRef.current) {
        meterCleanupRef.current();
      }
      meterCleanupRef.current = createAudioMeter(stream, (level) => {
        setAudioLevel(level);
      });

      // 3. Create WebRTC PeerConnection for local LAN (iceServers: [])
      if (peerRef.current) {
        peerRef.current.close();
      }

      const peer = createPhonePeer({
        stream,
        onIceCandidate: (candidate) => {
          if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('webrtc:ice-candidate', { candidate });
          }
        },
        onStateChange: (state) => {
          setPeerState(state);
        }
      });

      peerRef.current = peer;

      // 4. Create and send offer over local Socket.IO
      const offer = await peer.createOffer();
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('webrtc:offer', {
          roomId,
          sdp: offer
        });
        socketRef.current.emit('mic:state-change', {
          roomId,
          isSpeaking: true
        });
      }

      setIsMicOn(true);
    } catch (err) {
      console.error('[ClassMic Phone] Error starting mic:', err);
      setIsMicOn(false);
      setPeerState('idle');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionState('denied');
        setErrorMessage('Microphone access blocked. Please allow mic permissions in browser settings.');
      } else {
        setErrorMessage(err.message || 'Could not access microphone.');
      }
    }
  }

  // Stop microphone audio transmission
  function stopMicrophoneTransmission() {
    setIsMicOn(false);
    setAudioLevel(0);
    setPeerState('idle');

    // Notify receiver
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('mic:state-change', {
        roomId,
        isSpeaking: false
      });
    }

    // Stop audio tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.enabled = false;
        track.stop();
      });
      streamRef.current = null;
    }

    // Stop meter
    if (meterCleanupRef.current) {
      meterCleanupRef.current();
      meterCleanupRef.current = null;
    }

    // Close WebRTC peer
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
  }

  // Toggle MIC ON/OFF
  async function handleToggleMic() {
    if (isMicOn) {
      stopMicrophoneTransmission();
    } else {
      await startWebRtcTransmission();
    }
  }

  // Manual reconnect trigger
  function handleManualReconnect() {
    setIsReconnecting(true);
    reconnectSocket();
    setTimeout(() => {
      setIsReconnecting(false);
    }, 2000);
  }

  // Handle exit back to home
  function handleBack() {
    stopMicrophoneTransmission();
    disconnectSocket();
    if (onBack) onBack();
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 select-none flex flex-col justify-between min-h-[90vh] space-y-6 text-[#CAF0F8]">
      {/* Top Header Bar with Oceanic Glow */}
      <header className="relative w-full flex items-center justify-between py-3 px-3 sm:px-4 rounded-2xl bg-[#051647] border border-[#0077B6] shadow-md">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-[#0077B6]/20 via-transparent to-[#00B4D8]/20 blur-lg rounded-2xl pointer-events-none" />

        {/* Exit Button */}
        <button
          id="btn-phone-back"
          onClick={handleBack}
          className="relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#03045E] border border-[#0077B6] text-[#90E0EF] hover:text-[#CAF0F8] hover:border-[#00B4D8] text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Exit</span>
        </button>

        {/* Header Title & Device Pill */}
        <div className="relative z-10 flex items-center gap-2">
          <span className="text-base font-bold text-[#CAF0F8] tracking-wide flex items-center gap-1.5">
            <span className="text-base">🎤</span>
            <span>CLASSMIC</span>
          </span>
          {phoneName && (
            <span className="hidden sm:inline-flex text-[11px] font-mono px-2 py-0.5 rounded-md bg-[#03045E] border border-[#0077B6] text-[#90E0EF]">
              {phoneName}
            </span>
          )}
        </div>

        {/* Connection Status Right */}
        <div className="relative z-10 flex items-center gap-2">
          {isConnected ? (
            <div
              id="phone-header-status"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#03045E] border border-[#0077B6] text-xs"
            >
              <span className="w-2 h-2 rounded-full bg-[#00B4D8] animate-pulse" />
              <span className="text-[#CAF0F8] font-semibold text-[11px]">Connected</span>
            </div>
          ) : (
            <div
              id="phone-header-status"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#03045E] border border-[#0077B6] text-xs"
            >
              <span className="w-2 h-2 rounded-full bg-[#0077B6]" />
              <span className="text-[#90E0EF] font-semibold text-[11px]">Offline</span>
            </div>
          )}
        </div>
      </header>

      {/* Disconnection Banner with Reconnect Action */}
      {!isConnected && (
        <div
          id="phone-disconnected-banner"
          className="p-4 rounded-2xl bg-[#051647] border border-[#0077B6] text-[#CAF0F8] text-xs text-center space-y-2 shadow-lg"
        >
          <div className="flex items-center justify-center gap-1.5 font-bold text-[#CAF0F8]">
            <AlertCircle className="w-4 h-4 text-[#00B4D8] shrink-0" />
            <span>WiFi connection lost</span>
          </div>
          <p className="text-[11px] text-[#90E0EF]">
            Connect your phone to the same WiFi router as the laptop.
          </p>
          <button
            id="btn-reconnect-now"
            onClick={handleManualReconnect}
            disabled={isReconnecting}
            className="w-full max-w-xs mx-auto py-2 px-3 rounded-xl bg-[#00B4D8] hover:bg-[#90E0EF] text-[#03045E] font-bold text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-98"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isReconnecting ? 'animate-spin' : ''}`} />
            <span>{isReconnecting ? 'Connecting...' : 'Reconnect Now'}</span>
          </button>
        </div>
      )}

      {/* Warning / Error Message */}
      {errorMessage && (
        <div
          id="phone-error-banner"
          className="p-3 rounded-2xl bg-[#051647] border border-[#0077B6] text-[#90E0EF] text-xs flex items-center justify-center gap-2 text-center"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-[#00B4D8]" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Professional Stage Deck: Large Circular Mic & Audio Equalizer */}
      <section className="relative p-6 sm:p-8 rounded-3xl bg-[#051647] border border-[#0077B6] shadow-2xl flex flex-col items-center justify-center space-y-6 overflow-hidden">
        <div className="absolute -inset-2 bg-gradient-to-b from-[#0077B6]/10 via-transparent to-[#00B4D8]/10 pointer-events-none" />

        {/* Primary Circular Microphone Button */}
        <div className="relative z-10 py-2">
          <button
            id="btn-toggle-mic"
            onClick={handleToggleMic}
            disabled={!isConnected}
            className={`relative flex flex-col items-center justify-center w-52 h-52 sm:w-60 sm:h-60 rounded-full transition-all duration-300 cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
              isMicOn
                ? 'bg-[#00B4D8] text-[#03045E] border-4 border-[#CAF0F8] mic-glow-active'
                : 'bg-[#03045E] text-[#90E0EF] border-3 border-[#0077B6] hover:border-[#00B4D8]'
            }`}
            style={
              isMicOn
                ? { boxShadow: '0 0 35px rgba(0, 180, 216, 0.45)' }
                : undefined
            }
            aria-label={isMicOn ? 'Turn Microphone Off' : 'Turn Microphone On'}
          >
            {isMicOn ? (
              <Mic className="w-16 h-16 sm:w-20 sm:h-20 mb-1 text-[#03045E] transition-transform scale-105" />
            ) : (
              <MicOff className="w-16 h-16 sm:w-20 sm:h-20 mb-1 text-[#90E0EF] transition-transform" />
            )}

            <span
              className={`text-xl sm:text-2xl font-extrabold tracking-wider ${
                isMicOn ? 'text-[#03045E]' : 'text-[#90E0EF]'
              }`}
            >
              {isMicOn ? 'MIC ON' : 'MIC OFF'}
            </span>

            <span
              className={`text-[10px] font-mono tracking-widest uppercase font-semibold mt-1 px-2.5 py-0.5 rounded-full ${
                isMicOn
                  ? 'bg-[#03045E]/20 text-[#03045E]'
                  : 'text-[#90E0EF]'
              }`}
            >
              {isMicOn ? 'TRANSMITTING LIVE' : 'TAP TO SPEAK'}
            </span>
          </button>
        </div>

        {/* Audio Level Waveform / Equalizer */}
        <div className="relative z-10 w-full max-w-md pt-2">
          <AudioLevelMeter level={audioLevel} isMicOn={isMicOn} id="phone-level-meter" />
        </div>
      </section>

      {/* Diagnostic & Connection Cards - Responsive 2-Column Grid Layout */}
      <section className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Receiver Status Card */}
        <div
          id="receiver-status-card"
          className="flex flex-col justify-between p-4 rounded-2xl bg-[#051647] border border-[#0077B6] space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#03045E] border border-[#0077B6] text-[#00B4D8]">
                <Radio className="w-4 h-4 text-[#00B4D8]" />
              </div>
              <span className="text-xs font-semibold text-[#CAF0F8]">💻 Receiver</span>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-[#00B4D8]' : 'bg-[#0077B6]'
                }`}
              />
              <span className="text-[#CAF0F8] font-medium text-[11px]">
                {isConnected ? 'Connected' : 'Offline'}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-[#90E0EF] pt-1">
            {peerState === 'connected'
              ? 'Audio stream connected'
              : isConnected
              ? 'Receiver online on LAN'
              : 'Waiting for connection'}
          </div>
        </div>

        {/* Connection Card */}
        <div
          id="phone-connection-card"
          className="p-4 rounded-2xl bg-[#051647] border border-[#0077B6] space-y-2.5 text-xs"
        >
          <div className="flex items-center justify-between pb-2 border-b border-[#0077B6]/60">
            <span className="font-semibold text-[#CAF0F8]">Connection Status</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[#00B4D8]">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#00B4D8]' : 'bg-[#0077B6]'}`} />
              <span className="text-[#CAF0F8]">{isConnected ? 'Connected' : 'Disconnected'}</span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] pt-0.5">
            <div>
              <div className="text-[#90E0EF]">WiFi Network</div>
              <div className="text-[#CAF0F8] font-semibold mt-0.5 flex items-center gap-1">
                <Wifi className="w-3 h-3 text-[#00B4D8]" />
                <span>{isConnected ? 'Connected' : 'Not Connected'}</span>
              </div>
            </div>

            <div>
              <div className="text-[#90E0EF]">Device ID</div>
              <div className="text-[#CAF0F8] font-mono font-semibold mt-0.5 truncate">
                {phoneName} {shortId ? `#${shortId}` : ''}
              </div>
            </div>

            <div>
              <div className="text-[#90E0EF]">Room</div>
              <div className="text-[#CAF0F8] font-mono font-semibold mt-0.5">
                {roomId}
              </div>
            </div>

            <div>
              <div className="text-[#90E0EF]">Mic Permission</div>
              <div className="text-[#CAF0F8] font-semibold mt-0.5 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-[#00B4D8]" />
                <span className="capitalize">
                  {permissionState === 'granted' ? 'Allowed' : permissionState}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
