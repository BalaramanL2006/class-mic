import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Volume2, VolumeX, Copy, Check, Mic } from 'lucide-react';
import AudioVisualizer from '../components/AudioVisualizer.jsx';
import { getSocket, joinRoom, disconnectSocket } from '../services/socket.js';
import { setupReceiverAudioMixer } from '../webrtc/audio.js';
import { createReceiverPeer } from '../webrtc/peer.js';

export default function LaptopReceiverPage({ roomId = 'default', onBack }) {
  // Initialize from deployed origin if available
  const [phoneUrl, setPhoneUrl] = useState(() => {
    if (typeof window !== 'undefined' && window.location?.origin) {
      const origin = window.location.origin;
      if (origin.startsWith('https://') && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        return `${origin}/?role=phone&room=${encodeURIComponent(roomId)}`;
      }
    }
    return '';
  });
  const [isCopied, setIsCopied] = useState(false);

  // Phone connection count & list
  const [phoneCount, setPhoneCount] = useState(0);
  const [phonesList, setPhonesList] = useState([]);
  const [activeMicPhoneId, setActiveMicPhoneId] = useState(null);
  const [activePhoneName, setActivePhoneName] = useState('');

  // Audio output controls
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [waveformData, setWaveformData] = useState([]);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const socketRef = useRef(null);
  const peersRef = useRef(new Map()); // phoneId -> RTCPeerConnection wrapper
  const earlyCandidatesRef = useRef(new Map()); // phoneId -> RTCIceCandidate[]
  const audioMixerRef = useRef(null);
  const audioElementRef = useRef(null);

  // Fetch deployed public HTTPS application URL from server
  useEffect(() => {
    let isMounted = true;

    fetch(`/api/network-info?room=${encodeURIComponent(roomId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data && data.phoneUrl) {
          setPhoneUrl(data.phoneUrl);
        }
      })
      .catch((err) => {
        console.warn('Network info fetch error:', err);
      });

    // Also fallback to browser origin if public HTTPS
    if (typeof window !== 'undefined' && window.location?.origin) {
      const origin = window.location.origin;
      if (origin.startsWith('https://') && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        setPhoneUrl(`${origin}/?role=phone&room=${encodeURIComponent(roomId)}`);
      }
    }

    return () => {
      isMounted = false;
    };
  }, [roomId]);

  // Setup Socket.IO receiver signaling
  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    function handleConnect() {
      joinRoom(roomId, 'receiver');
    }

    function handleRoomState(state) {
      if (!state) return;
      const count = typeof state.count === 'number' ? state.count : 0;
      setPhoneCount(count);
      setPhonesList(state.phones || []);
      setActiveMicPhoneId(state.activeMicPhoneId || null);
      setActivePhoneName(state.activePhoneName || '');

      if (audioMixerRef.current) {
        audioMixerRef.current.setActivePhone(state.activeMicPhoneId);
      }

      if (!state.activeMicPhoneId) {
        setWaveformData([]);
      }
    }

    function handlePhoneLeft({ phoneId }) {
      if (phoneId && peersRef.current.has(phoneId)) {
        try {
          peersRef.current.get(phoneId).close();
        } catch (_) {}
        peersRef.current.delete(phoneId);
      }
      if (earlyCandidatesRef.current.has(phoneId)) {
        earlyCandidatesRef.current.delete(phoneId);
      }
      if (audioMixerRef.current && phoneId) {
        audioMixerRef.current.removeStream(phoneId);
      }
    }

    async function handleOffer({ phoneId, sdp }) {
      if (!phoneId) return;

      if (peersRef.current.has(phoneId)) {
        try {
          peersRef.current.get(phoneId).close();
        } catch (_) {}
        peersRef.current.delete(phoneId);
      }

      if (!audioMixerRef.current) {
        audioMixerRef.current = setupReceiverAudioMixer((bars) => {
          setWaveformData(bars);
        });
        audioMixerRef.current.setVolume(volume);
        audioMixerRef.current.setMute(isMuted);
      }

      const peer = createReceiverPeer({
        onTrack: (remoteStream) => {
          if (audioElementRef.current) {
            audioElementRef.current.srcObject = remoteStream;
            audioElementRef.current.play().catch((err) => {
              console.warn('Autoplay prevented:', err);
              setAudioBlocked(true);
            });
          }

          if (audioMixerRef.current) {
            audioMixerRef.current.addStream(phoneId, remoteStream);
            audioMixerRef.current.setVolume(volume);
            audioMixerRef.current.setMute(isMuted);
            audioMixerRef.current.setActivePhone(activeMicPhoneId);
          }
        },
        onIceCandidate: (candidate) => {
          socket.emit('webrtc:ice-candidate', {
            targetId: phoneId,
            candidate
          });
        },
        onStateChange: (state) => {
          console.log(`[ClassMic Receiver] Peer ${phoneId} state:`, state);
        }
      });

      peersRef.current.set(phoneId, peer);

      // Drain any early ICE candidates that arrived before peer was ready
      if (earlyCandidatesRef.current.has(phoneId)) {
        const queued = earlyCandidatesRef.current.get(phoneId) || [];
        earlyCandidatesRef.current.delete(phoneId);
        for (const candidate of queued) {
          peer.addIceCandidate(candidate).catch(() => {});
        }
      }

      try {
        const answer = await peer.handleOffer(sdp);
        socket.emit('webrtc:answer', {
          targetId: phoneId,
          sdp: answer
        });
      } catch (err) {
        console.error('Error handling WebRTC offer:', err);
      }
    }

    async function handleIceCandidate({ phoneId, candidate }) {
      if (!phoneId || !candidate) return;

      if (peersRef.current.has(phoneId)) {
        try {
          await peersRef.current.get(phoneId).addIceCandidate(candidate);
        } catch (err) {
          console.warn('Error adding ICE candidate:', err);
        }
      } else {
        // Queue candidate until offer handler sets up the peer
        if (!earlyCandidatesRef.current.has(phoneId)) {
          earlyCandidatesRef.current.set(phoneId, []);
        }
        earlyCandidatesRef.current.get(phoneId).push(candidate);
      }
    }

    if (socket.connected) {
      handleConnect();
    } else {
      socket.on('connect', handleConnect);
    }

    socket.on('room-state', handleRoomState);
    socket.on('phone-left', handlePhoneLeft);
    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:ice-candidate', handleIceCandidate);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('room-state', handleRoomState);
      socket.off('phone-left', handlePhoneLeft);
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:ice-candidate', handleIceCandidate);
    };
  }, [roomId, volume, isMuted]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanupAudioAndPeers();
      disconnectSocket();
    };
  }, [roomId]);

  function cleanupAudioAndPeers() {
    peersRef.current.forEach((peer) => {
      try {
        peer.close();
      } catch (_) {}
    });
    peersRef.current.clear();

    if (audioMixerRef.current) {
      audioMixerRef.current.cleanup();
      audioMixerRef.current = null;
    }
  }

  // Handle Back button
  function handleBack() {
    cleanupAudioAndPeers();
    disconnectSocket();
    if (onBack) {
      onBack();
    }
  }

  // Copy Link handler
  function handleCopyLink() {
    if (!phoneUrl) return;

    function markCopied() {
      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(phoneUrl)
        .then(markCopied)
        .catch(() => {
          fallbackCopy(phoneUrl, markCopied);
        });
    } else {
      fallbackCopy(phoneUrl, markCopied);
    }
  }

  function fallbackCopy(text, cb) {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'absolute';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      cb();
    } catch (_) {}
  }

  // Unblock autoplay audio
  function handleUnblockAudio() {
    if (audioMixerRef.current) {
      audioMixerRef.current.resume();
    }
    if (audioElementRef.current) {
      audioElementRef.current.play().catch(() => {});
    }
    setAudioBlocked(false);
  }

  // Volume & Mute handlers
  function handleVolumeChange(e) {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioMixerRef.current) {
      audioMixerRef.current.setVolume(val);
    }
  }

  function handleToggleMute() {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (audioMixerRef.current) {
      audioMixerRef.current.setMute(newMuted);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between max-w-xl mx-auto px-5 py-7 select-none">
      {/* Hidden WebRTC audio element */}
      <audio ref={audioElementRef} autoPlay playsInline className="hidden" />

      {/* Top Bar */}
      <div className="w-full flex items-center justify-between pb-4">
        <button
          id="btn-back"
          onClick={handleBack}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-sm font-semibold transition cursor-pointer shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400 font-semibold">Receiver Ready</span>
        </div>
      </div>

      {/* Autoplay blocked banner */}
      {audioBlocked && (
        <div
          id="audio-blocked-alert"
          onClick={handleUnblockAudio}
          className="my-3 p-3.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-2xl text-center text-sm font-semibold cursor-pointer hover:bg-amber-500/20 transition flex items-center justify-center gap-2"
        >
          <Volume2 className="w-4 h-4" />
          <span>Click here to enable laptop speaker playback</span>
        </div>
      )}

      {/* Header */}
      <div className="text-center my-4 space-y-1.5">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-1 shadow-inner shadow-emerald-950/30">
          <Mic className="w-7 h-7" />
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-wider text-white">
          CLASSMIC
        </h1>

        <p className="text-base sm:text-lg font-semibold text-slate-300 tracking-wide">
          Wireless Microphone Receiver
        </p>
      </div>

      {/* Main Content Sections */}
      <div className="space-y-5 my-3">
        {/* Section: Connect Your Phone */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4 text-center">
          <h2 className="text-xl font-bold text-white tracking-wide">
            Connect Your Phone
          </h2>

          <p className="text-sm text-slate-300 font-medium">
            Open this link on your phone:
          </p>

          {/* Actual Phone URL Box */}
          <div
            id="phone-connection-box"
            onClick={handleCopyLink}
            className="group relative flex items-center justify-between gap-3 p-3.5 px-4 rounded-xl bg-slate-950 border border-slate-700/80 hover:border-emerald-500/60 transition cursor-pointer"
          >
            <span
              id="phone-url-text"
              className="font-mono text-xs sm:text-sm text-emerald-400 font-semibold tracking-tight truncate select-all text-left"
            >
              {phoneUrl || 'Loading public URL...'}
            </span>

            <button
              type="button"
              id="btn-copy-icon"
              onClick={(e) => {
                e.stopPropagation();
                handleCopyLink();
              }}
              className="p-2 rounded-lg bg-slate-900 text-slate-400 group-hover:text-emerald-400 group-hover:bg-slate-800 transition shrink-0"
              title="Copy link"
            >
              {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          {/* Copy Link Button */}
          <button
            id="btn-copy-link"
            onClick={handleCopyLink}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold text-sm shadow-md shadow-emerald-950/30 transition cursor-pointer flex items-center justify-center gap-2"
          >
            {isCopied ? (
              <>
                <Check className="w-4 h-4" />
                <span>✓ Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>📋 Copy Link</span>
              </>
            )}
          </button>

          <p className="text-xs text-slate-400 pt-0.5">
            Open this link on any phone.
          </p>
        </div>

        {/* Section: Connected Phones */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white tracking-wide">
              Connected Phones: <span id="connected-phones-count" className="text-emerald-400 font-mono">{phoneCount} / 20</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-xs font-mono text-slate-400">
              Max 20
            </span>
          </div>

          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {phonesList.length === 0 ? (
              <div className="py-4 text-center text-slate-500 text-xs font-mono">
                No phones connected yet. Open the link on up to 20 phones.
              </div>
            ) : (
              phonesList.map((phone) => (
                <div
                  key={phone.id}
                  id={`phone-item-${phone.phoneIndex}`}
                  className={`flex items-center justify-between p-2.5 px-3.5 rounded-xl border transition-all ${
                    phone.isSpeaking
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                      : 'bg-slate-950 border-slate-800/80 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 font-semibold text-sm">
                    <span>{phone.name}</span>
                    <span className="text-sm leading-none" title="Connected">🟢</span>
                  </div>

                  {phone.isSpeaking ? (
                    <span className="text-xs font-mono font-bold text-rose-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                      SPEAKING
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-slate-400 font-medium">
                      Ready
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Section: Active Microphone */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3 text-center">
          <h2 className="text-base font-bold text-white tracking-wide">
            Active Microphone
          </h2>

          <div className="py-1">
            {activeMicPhoneId ? (
              <div
                id="active-microphone-status"
                className="inline-flex flex-col items-center gap-1.5 p-3 px-6 rounded-xl bg-rose-500/10 border border-rose-500/30 shadow-lg shadow-rose-950/20"
              >
                <div className="flex items-center gap-2 text-white font-extrabold text-lg">
                  <Mic className="w-5 h-5 text-rose-400" />
                  <span>{activePhoneName || 'Phone'}</span>
                </div>
                <span className="text-xs font-mono uppercase tracking-widest font-bold text-rose-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  SPEAKING
                </span>
              </div>
            ) : (
              <div
                id="idle-microphone-status"
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-950 border border-slate-800 text-slate-400 text-xs font-mono"
              >
                <Mic className="w-3.5 h-3.5 text-slate-500" />
                <span>No active microphone</span>
              </div>
            )}
          </div>

          {/* Audio Level Visualizer */}
          <div className="space-y-1.5 pt-1">
            <div className="text-xs font-mono text-slate-400">Audio Level</div>
            <div className="max-w-md mx-auto h-10 flex items-center justify-center">
              <AudioVisualizer
                waveformData={waveformData}
                isLive={Boolean(activeMicPhoneId)}
                id="receiver-visualizer"
              />
            </div>
          </div>

          {/* Speaker Volume Slider & Mute */}
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-4 text-xs font-mono">
            <div className="flex items-center gap-2 text-slate-400">
              <button
                id="btn-toggle-mute"
                onClick={handleToggleMute}
                className={`p-1.5 rounded-lg border transition cursor-pointer ${
                  isMuted
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <span>Speaker Output: {isMuted ? 'Muted' : `${Math.round(volume * 100)}%`}</span>
            </div>

            <input
              id="slider-volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-28 sm:w-44 accent-emerald-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-4 text-center text-xs font-mono text-slate-600 border-t border-slate-900">
        PHONE → INTERNET → LAPTOP → SPEAKER
      </div>
    </div>
  );
}
