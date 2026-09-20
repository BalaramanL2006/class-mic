import React, { useState, useEffect, useRef } from 'react';
import { Mic, ArrowLeft, AlertCircle } from 'lucide-react';
import AudioLevelMeter from '../components/AudioLevelMeter.jsx';
import { getSocket, joinRoom, disconnectSocket } from '../services/socket.js';
import { getMicrophoneStream, createAudioMeter } from '../webrtc/audio.js';
import { createPhonePeer } from '../webrtc/peer.js';

export default function PhoneMicPage({ roomId = 'default', onBack }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [phoneName, setPhoneName] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeWarning, setActiveWarning] = useState('');

  const streamRef = useRef(null);
  const peerRef = useRef(null);
  const meterCleanupRef = useRef(null);
  const socketRef = useRef(null);

  // Setup Socket.IO connection and event listeners
  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    function handleConnect() {
      setIsConnected(true);
      joinRoom(roomId, 'phone');
    }

    function handleDisconnect() {
      setIsConnected(false);
      setIsMicOn(false);
    }

    function handlePhoneAssigned({ name }) {
      if (name) {
        setPhoneName(name);
      }
    }

    function handleMicGranted() {
      setActiveWarning('');
      setErrorMessage('');
      setIsMicOn(true);
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach((t) => {
          t.enabled = true;
        });
      }
      sendOffer();
    }

    function handleMicDenied({ reason }) {
      setIsMicOn(false);
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach((t) => {
          t.enabled = false;
        });
      }
      if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
      }
      setActiveWarning(reason || 'Another microphone is currently active.');
      setTimeout(() => {
        setActiveWarning('');
      }, 4000);
    }

    function handleMicStopped() {
      setIsMicOn(false);
      setAudioLevel(0);
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach((t) => {
          t.enabled = false;
        });
      }
      if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
      }
    }

    function handleRoomMicStatus({ isOtherSpeaking }) {
      if (!isOtherSpeaking) {
        setActiveWarning('');
      }
    }

    async function handleAnswer({ sdp }) {
      if (peerRef.current) {
        await peerRef.current.handleAnswer(sdp);
      }
    }

    async function handleIceCandidate({ candidate }) {
      if (peerRef.current) {
        await peerRef.current.addIceCandidate(candidate);
      }
    }

    if (socket.connected) {
      handleConnect();
    } else {
      socket.on('connect', handleConnect);
    }

    socket.on('disconnect', handleDisconnect);
    socket.on('phone-assigned', handlePhoneAssigned);
    socket.on('mic:granted', handleMicGranted);
    socket.on('mic:denied', handleMicDenied);
    socket.on('mic:stopped', handleMicStopped);
    socket.on('room-mic-status', handleRoomMicStatus);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice-candidate', handleIceCandidate);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('phone-assigned', handlePhoneAssigned);
      socket.off('mic:granted', handleMicGranted);
      socket.off('mic:denied', handleMicDenied);
      socket.off('mic:stopped', handleMicStopped);
      socket.off('room-mic-status', handleRoomMicStatus);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice-candidate', handleIceCandidate);
    };
  }, [roomId]);

  // Clean up WebRTC, audio, and socket on unmount
  useEffect(() => {
    return () => {
      cleanupAudioAndPeer();
      if (socketRef.current) {
        try {
          socketRef.current.emit('mic:request-off', { roomId });
        } catch (_) {}
      }
      disconnectSocket();
    };
  }, [roomId]);

  function cleanupAudioAndPeer() {
    if (meterCleanupRef.current) {
      meterCleanupRef.current();
      meterCleanupRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.enabled = false;
        track.stop();
      });
      streamRef.current = null;
    }
  }

  // Handle Back button
  function handleBack() {
    setIsMicOn(false);
    cleanupAudioAndPeer();
    if (socketRef.current) {
      try {
        socketRef.current.emit('mic:request-off', { roomId });
      } catch (_) {}
    }
    disconnectSocket();
    if (onBack) {
      onBack();
    }
  }

  // Acquire microphone stream & initialize peer
  async function ensureStreamAndPeer() {
    if (streamRef.current && peerRef.current) {
      return streamRef.current;
    }

    try {
      setErrorMessage('');
      const stream = await getMicrophoneStream();
      streamRef.current = stream;

      meterCleanupRef.current = createAudioMeter(stream, (level) => {
        setAudioLevel(level);
      });

      const peer = createPhonePeer({
        stream,
        onIceCandidate: (candidate) => {
          if (socketRef.current) {
            socketRef.current.emit('webrtc:ice-candidate', {
              candidate
            });
          }
        },
        onStateChange: (state) => {
          console.log('[ClassMic Phone] WebRTC peer state:', state);
        }
      });
      peerRef.current = peer;

      return stream;
    } catch (err) {
      console.error('[ClassMic Phone] Microphone access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Please allow microphone access.');
      } else {
        setErrorMessage('Could not access microphone.');
      }
      throw err;
    }
  }

  async function sendOffer() {
    if (!peerRef.current || !socketRef.current) return;
    try {
      const offer = await peerRef.current.createOffer();
      socketRef.current.emit('webrtc:offer', {
        roomId,
        sdp: offer
      });
    } catch (err) {
      console.error('[ClassMic Phone] Error sending offer:', err);
    }
  }

  // Toggle Microphone ON / OFF
  async function handleToggleMic() {
    setErrorMessage('');

    if (!isMicOn) {
      try {
        await ensureStreamAndPeer();
        if (socketRef.current) {
          socketRef.current.emit('mic:request-on', { roomId });
        }
      } catch (err) {
        setIsMicOn(false);
      }
    } else {
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
      if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
      }
      setIsMicOn(false);
      setAudioLevel(0);
      if (socketRef.current) {
        socketRef.current.emit('mic:request-off', { roomId });
      }
    }
  }

  return (
    <div className="flex flex-col justify-between min-h-[92vh] max-w-sm mx-auto px-5 py-6 select-none">
      {/* Top Header with Back Button */}
      <div className="w-full flex items-center justify-between">
        <button
          id="btn-back"
          onClick={handleBack}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-sm font-semibold transition cursor-pointer shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        {phoneName && (
          <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2.5 py-1 rounded-lg">
            {phoneName}
          </span>
        )}
      </div>

      {/* Centered Brand & Status */}
      <div className="text-center my-2 space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-1 shadow-inner">
          <Mic className="w-7 h-7" />
        </div>

        <h1 className="text-3xl font-extrabold tracking-wider text-white">
          CLASSMIC
        </h1>

        <p className="text-sm font-medium text-slate-400">
          Wireless Microphone
        </p>

        <div className="pt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
          <span className={isConnected ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
            {isConnected ? 'Connected' : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* Another Mic Active Warning */}
      {activeWarning && (
        <div
          id="active-mic-warning"
          className="my-2 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm font-medium flex items-center justify-center gap-2 text-center"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>{activeWarning}</span>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div
          id="phone-error-banner"
          className="my-2 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-center gap-2 text-center"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Centered Large Mic Card */}
      <div className="my-auto flex flex-col items-center justify-center py-4">
        <button
          id="btn-toggle-mic"
          onClick={handleToggleMic}
          disabled={!isConnected}
          className={`relative flex flex-col items-center justify-center w-52 h-52 rounded-3xl transition-all duration-200 cursor-pointer shadow-2xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border-2 ${
            isMicOn
              ? 'bg-rose-500 text-white border-rose-300 shadow-rose-500/40 ring-8 ring-rose-500/20'
              : 'bg-slate-900 text-slate-200 border-slate-800 hover:border-slate-700 shadow-black/80'
          }`}
          aria-label={isMicOn ? 'Turn Microphone Off' : 'Turn Microphone On'}
        >
          {/* Subtle ping ring when active */}
          {isMicOn && (
            <div className="absolute inset-0 rounded-3xl animate-ping bg-rose-400 opacity-20 pointer-events-none" />
          )}

          <Mic className={`w-16 h-16 mb-3 transition-transform ${isMicOn ? 'scale-110' : 'scale-100'}`} />

          <span className="text-xl font-extrabold tracking-wider">
            {isMicOn ? '🔴 MIC ON' : '🎤 MIC OFF'}
          </span>

          {isMicOn && (
            <span className="text-[11px] font-mono tracking-widest uppercase font-bold mt-1.5 text-rose-100 animate-pulse">
              SPEAKING...
            </span>
          )}
        </button>
      </div>

      {/* Audio Level Meter */}
      <div className="w-full space-y-4 pt-2">
        <div className="space-y-1">
          <div className="text-center text-xs font-mono text-slate-400">
            Audio Level
          </div>
          <AudioLevelMeter level={audioLevel} isMicOn={isMicOn} id="phone-level-meter" />
        </div>

        {/* Minimal Bottom Status Details */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-900 text-xs font-mono">
          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60 text-center">
            <div className="text-slate-500 text-[10px] uppercase">Connection</div>
            <div className="text-emerald-400 font-bold mt-0.5 flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Connected
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60 text-center">
            <div className="text-slate-500 text-[10px] uppercase">Microphone</div>
            <div className={`font-bold mt-0.5 flex items-center justify-center gap-1.5 ${isMicOn ? 'text-emerald-400' : 'text-slate-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isMicOn ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              {isMicOn ? 'Active' : 'Idle'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
