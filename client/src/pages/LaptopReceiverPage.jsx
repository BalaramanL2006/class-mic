import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Copy,
  Check,
  ArrowLeft,
  Wifi,
  Shield,
  Radio,
  Sliders,
  Speaker,
  Users,
  UserX,
  Activity
} from 'lucide-react';
import { getSocket, joinRoom, disconnectSocket } from '../services/socket.js';
import { setupReceiverAudioMixer } from '../webrtc/audio.js';
import { createReceiverPeer } from '../webrtc/peer.js';

export default function LaptopReceiverPage({ roomId = 'local-mic', onBack, onStop }) {
  const [phoneUrl, setPhoneUrl] = useState('');
  const [lanIp, setLanIp] = useState('192.168.10.76');
  const [port, setPort] = useState(window.location.port || '3000');
  const [protocol, setProtocol] = useState(window.location.protocol.replace(':', '') || 'https');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [phonesList, setPhonesList] = useState([]);
  const [phoneCount, setPhoneCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);

  // Master Volume & Audio
  const [masterVolume, setMasterVolume] = useState(1.0);
  const [isMasterMuted, setIsMasterMuted] = useState(false);
  const [waveformData, setWaveformData] = useState(new Array(16).fill(0));
  const [phoneLevels, setPhoneLevels] = useState({});
  const [phoneVolumes, setPhoneVolumes] = useState({}); // phoneId -> volume (0.0 - 1.5)
  const [phoneMutes, setPhoneMutes] = useState({}); // phoneId -> boolean
  const [audioBlocked, setAudioBlocked] = useState(false);

  const socketRef = useRef(null);
  const peersRef = useRef(new Map()); // phoneId -> peer object
  const earlyCandidatesRef = useRef(new Map()); // phoneId -> candidate[]
  const audioMixerRef = useRef(null);
  const audioElementRef = useRef(null);

  // Fetch LAN IP from server or fallback to current hostname
  useEffect(() => {
    let isMounted = true;

    async function fetchNetworkInfo() {
      try {
        const res = await fetch('/api/network-info');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data) {
            const detectedIp = data.lanIp || window.location.hostname;
            const detectedPort = data.port ? String(data.port) : window.location.port || '3000';
            const detectedProto = data.protocol
              ? data.protocol.replace(':', '')
              : window.location.protocol.replace(':', '') || 'http';

            setLanIp(detectedIp);
            setPort(detectedPort);
            setProtocol(detectedProto);

            if (data.sharedUrl || data.phoneUrl) {
              setPhoneUrl(data.sharedUrl || data.phoneUrl);
            } else {
              const portSuffix = detectedPort && detectedPort !== '80' && detectedPort !== '443' ? `:${detectedPort}` : '';
              const generatedUrl = `${detectedProto}://${detectedIp}${portSuffix}`;
              setPhoneUrl(generatedUrl);
            }
            return;
          }
        }
      } catch (err) {
        console.warn('Network info fetch error:', err);
      }

      // Fallback
      if (isMounted) {
        const host = window.location.hostname || '192.168.10.76';
        const p = window.location.port && window.location.port !== '80' && window.location.port !== '443'
          ? `:${window.location.port}`
          : ':3000';
        const proto = window.location.protocol || 'http:';
        const url = `${proto}//${host}${p}`;
        setPhoneUrl(url);
      }
    }

    fetchNetworkInfo();

    return () => {
      isMounted = false;
    };
  }, [roomId]);

  // Generate QR code whenever phoneUrl changes
  useEffect(() => {
    if (!phoneUrl) return;
    QRCode.toDataURL(phoneUrl, {
      width: 220,
      margin: 1.5,
      color: {
        dark: '#020617',
        light: '#ffffff'
      }
    })
      .then((url) => {
        setQrCodeDataUrl(url);
      })
      .catch((err) => {
        console.warn('QR code generation error:', err);
      });
  }, [phoneUrl]);

  // Initialize Web Audio Mixer
  useEffect(() => {
    if (!audioMixerRef.current) {
      audioMixerRef.current = setupReceiverAudioMixer({
        onWaveformData: (bars) => {
          setWaveformData(bars);
        },
        onPhoneLevels: (levels) => {
          setPhoneLevels(levels);
        }
      });
      audioMixerRef.current.setMasterVolume(masterVolume);
      audioMixerRef.current.setMasterMute(isMasterMuted);
    }

    return () => {
      if (audioMixerRef.current) {
        audioMixerRef.current.cleanup();
        audioMixerRef.current = null;
      }
    };
  }, []);

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
      setActiveCount(typeof state.activeCount === 'number' ? state.activeCount : 0);

      // Initialize volume state for new phones if not present
      if (state.phones) {
        setPhoneVolumes((prev) => {
          const next = { ...prev };
          state.phones.forEach((p) => {
            if (next[p.id] === undefined) {
              next[p.id] = 1.0;
            }
          });
          return next;
        });
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

      // Clean up previous peer if existing for this phone
      if (peersRef.current.has(phoneId)) {
        try {
          peersRef.current.get(phoneId).close();
        } catch (_) {}
        peersRef.current.delete(phoneId);
      }

      // Ensure audio mixer is initialized and resumed
      if (audioMixerRef.current) {
        audioMixerRef.current.resume().catch(() => {});
      }

      const peer = createReceiverPeer({
        onTrack: (remoteStream) => {
          console.log(`[ClassMic Receiver] Audio stream received for phone: ${phoneId}`);

          // Primary audio path: Route into Web Audio API multi-channel mixer
          if (audioMixerRef.current) {
            const currentVol = phoneVolumes[phoneId] !== undefined ? phoneVolumes[phoneId] : 1.0;
            audioMixerRef.current.addStream(phoneId, remoteStream, currentVol);
            audioMixerRef.current.setMasterVolume(masterVolume);
            audioMixerRef.current.setMasterMute(isMasterMuted);
          }

          // Also attach to hidden audio element to guarantee OS audio output activation
          if (audioElementRef.current) {
            audioElementRef.current.srcObject = remoteStream;
            audioElementRef.current.play().catch((err) => {
              console.warn('Autoplay prevented by browser:', err);
              setAudioBlocked(true);
            });
          }
        },
        onIceCandidate: (candidate) => {
          socket.emit('webrtc:ice-candidate', {
            targetId: phoneId,
            candidate
          });
        },
        onStateChange: (state) => {
          console.log(`[ClassMic Receiver] Phone ${phoneId} state:`, state);
        }
      });

      peersRef.current.set(phoneId, peer);

      // Drain any queued ICE candidates for this phone
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
        // Queue candidate until offer arrives
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

      // Close all peers
      peersRef.current.forEach((peer) => {
        try { peer.close(); } catch (_) {}
      });
      peersRef.current.clear();
      earlyCandidatesRef.current.clear();
      disconnectSocket();
    };
  }, [roomId, masterVolume, isMasterMuted]);

  // Handle Master Volume Slider
  function handleMasterVolumeChange(e) {
    const val = parseFloat(e.target.value);
    setMasterVolume(val);
    if (audioMixerRef.current) {
      audioMixerRef.current.setMasterVolume(val);
    }
  }

  // Handle Master Mute Toggle
  function handleToggleMasterMute() {
    const nextMute = !isMasterMuted;
    setIsMasterMuted(nextMute);
    if (audioMixerRef.current) {
      audioMixerRef.current.setMasterMute(nextMute);
    }
  }

  // Handle Individual Phone Volume Slider
  function handlePhoneVolumeChange(phoneId, val) {
    setPhoneVolumes((prev) => ({ ...prev, [phoneId]: val }));
    if (audioMixerRef.current) {
      audioMixerRef.current.setPhoneVolume(phoneId, val);
    }
  }

  // Handle Individual Phone Mute Toggle
  function handleTogglePhoneMute(phoneId) {
    const currentMute = Boolean(phoneMutes[phoneId]);
    const nextMute = !currentMute;
    setPhoneMutes((prev) => ({ ...prev, [phoneId]: nextMute }));
    if (audioMixerRef.current) {
      audioMixerRef.current.setPhoneMute(phoneId, nextMute);
    }
  }

  // Remotely mute a phone
  function handleRemoteMutePhone(phoneId) {
    if (socketRef.current) {
      socketRef.current.emit('receiver:mute-phone', {
        roomId,
        phoneId
      });
    }
  }

  // Remotely disconnect/kick a phone
  function handleRemoteKickPhone(phoneId) {
    if (socketRef.current) {
      socketRef.current.emit('receiver:kick-phone', {
        roomId,
        phoneId
      });
    }
    if (audioMixerRef.current) {
      audioMixerRef.current.removeStream(phoneId);
    }
    if (peersRef.current.has(phoneId)) {
      try { peersRef.current.get(phoneId).close(); } catch (_) {}
      peersRef.current.delete(phoneId);
    }
  }

  // Copy URL to clipboard
  function handleCopyLink() {
    if (!phoneUrl) return;
    navigator.clipboard
      .writeText(phoneUrl)
      .then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2500);
      })
      .catch(() => {
        setIsCopied(false);
      });
  }

  // Resume blocked audio context
  function handleUnblockAudio() {
    if (audioMixerRef.current) {
      audioMixerRef.current.resume().then(() => {
        setAudioBlocked(false);
      });
    }
    if (audioElementRef.current) {
      audioElementRef.current.play().then(() => {
        setAudioBlocked(false);
      }).catch(() => {});
    }
  }

  // Stop receiver and exit
  function handleStop() {
    if (audioMixerRef.current) {
      audioMixerRef.current.cleanup();
      audioMixerRef.current = null;
    }
    peersRef.current.forEach((p) => {
      try { p.close(); } catch (_) {}
    });
    peersRef.current.clear();
    disconnectSocket();
    if (onStop) {
      onStop();
    } else if (onBack) {
      onBack();
    }
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 select-none text-[#CAF0F8]">
      {/* Hidden audio element for OS stream binding */}
      <audio ref={audioElementRef} autoPlay playsInline style={{ display: 'none' }} />

      {/* Top Header Bar - Professional Console Style */}
      <header className="p-4 sm:p-5 rounded-2xl bg-[#051647] border border-[#0077B6] shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            id="btn-receiver-back"
            onClick={handleStop}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#03045E] border border-[#0077B6] text-[#90E0EF] hover:text-[#CAF0F8] hover:border-[#00B4D8] text-xs font-semibold transition cursor-pointer shadow-sm active:scale-95"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Exit Dashboard</span>
          </button>

          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-wide text-[#CAF0F8] flex items-center gap-2">
              <span>CLASSMIC Receiver</span>
              <span className="text-xs font-mono font-bold text-[#00B4D8] bg-[#03045E] border border-[#0077B6] px-2 py-0.5 rounded-md flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00B4D8] animate-pulse" />
                <span>Online</span>
              </span>
            </h1>
            <p className="text-xs text-[#90E0EF]">
              Offline Local WiFi Audio Receiver & Multi-Mic Mixer
            </p>
          </div>
        </div>

        {/* Room & Status Badges */}
        <div className="flex items-center gap-2.5">
          <div className="px-3.5 py-2 rounded-xl bg-[#03045E] border border-[#0077B6] text-xs font-mono flex items-center gap-2">
            <Wifi className="w-3.5 h-3.5 text-[#00B4D8]" />
            <span className="text-[#90E0EF]">Room:</span>
            <strong className="text-[#CAF0F8]">{roomId}</strong>
          </div>

          <button
            id="btn-stop-receiver"
            onClick={handleStop}
            className="px-4 py-2 rounded-xl bg-[#03045E] hover:bg-[#0077B6]/30 border border-[#0077B6] hover:border-[#00B4D8] text-[#90E0EF] hover:text-[#CAF0F8] text-xs font-bold transition cursor-pointer"
          >
            Stop Receiver
          </button>
        </div>
      </header>

      {/* Browser Autoplay Blocked Alert */}
      {audioBlocked && (
        <div
          id="audio-unblock-banner"
          className="p-4 rounded-2xl bg-[#051647] border border-[#0077B6] text-[#CAF0F8] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <VolumeX className="w-5 h-5 text-[#00B4D8] shrink-0" />
            <span>Browser paused audio playback. Click unblock to enable speakers.</span>
          </div>
          <button
            id="btn-unblock-audio"
            onClick={handleUnblockAudio}
            className="px-4 py-2 rounded-xl bg-[#00B4D8] hover:bg-[#90E0EF] text-[#03045E] font-extrabold text-xs shadow-md transition cursor-pointer shrink-0"
          >
            Unblock Audio
          </button>
        </div>
      )}

      {/* Hardware Connection Routing Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#051647] border border-[#0077B6] text-xs font-mono text-[#CAF0F8] flex flex-col md:flex-row items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#03045E] text-[#00B4D8] border border-[#0077B6] shrink-0">
            <Speaker className="w-4 h-4 text-[#00B4D8]" />
          </div>
          <div>
            <div className="font-bold text-[#CAF0F8] text-sm">
              Audio Routing: Laptop Audio Output
            </div>
            <div className="text-[#90E0EF] text-[11px] mt-0.5">
              Connect external speakers using <strong>3.5mm AUX Cable</strong>, <strong>USB Audio</strong>, or <strong>Bluetooth</strong>.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] text-[#00B4D8] bg-[#03045E] border border-[#0077B6] px-3.5 py-1.5 rounded-xl shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00B4D8] animate-pulse" />
          <span>Offline LAN Ready • Direct WebRTC</span>
        </div>
      </div>

      {/* Main Grid: QR Code / Connection Info (Left) + Master Controls (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: QR Code & URL Card (5 Cols) */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-[#051647] border border-[#0077B6] shadow-xl space-y-4 text-center flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#CAF0F8] tracking-wide uppercase">
              Connect Mobile Microphones
            </h2>
            <p className="text-xs text-[#90E0EF] mt-1">
              Connect phone to this local WiFi and open the URL:
            </p>
          </div>

          {/* QR Code Container */}
          <div className="inline-block p-3 rounded-2xl bg-white shadow-2xl mx-auto border-4 border-[#0077B6] my-2">
            {qrCodeDataUrl ? (
              <img
                id="receiver-qr-code"
                src={qrCodeDataUrl}
                alt="Scan to open mobile microphone"
                className="w-44 h-44 object-contain block mx-auto"
              />
            ) : (
              <div className="w-44 h-44 flex items-center justify-center bg-slate-100 text-slate-500 text-xs font-mono">
                Generating QR...
              </div>
            )}
          </div>

          {/* Scannable / Clickable URL Box */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#03045E] border border-[#0077B6] text-left">
            <span className="text-[11px] font-mono text-[#00B4D8] font-semibold truncate flex-1 px-1 select-all">
              {phoneUrl}
            </span>

            <button
              type="button"
              id="btn-copy-url"
              onClick={handleCopyLink}
              className="p-2 rounded-lg bg-[#051647] hover:bg-[#0077B6]/40 text-[#90E0EF] hover:text-[#CAF0F8] transition shrink-0 cursor-pointer"
              title="Copy URL to clipboard"
            >
              {isCopied ? <Check className="w-4 h-4 text-[#00B4D8]" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <button
            id="btn-copy-link-primary"
            onClick={handleCopyLink}
            className="w-full py-2.5 rounded-xl bg-[#00B4D8] hover:bg-[#90E0EF] text-[#03045E] font-bold text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 active:scale-98"
          >
            {isCopied ? (
              <>
                <Check className="w-4 h-4 text-[#03045E]" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-[#03045E]" />
                <span>Copy Phone URL</span>
              </>
            )}
          </button>

          <div className="text-[11px] text-[#90E0EF] pt-1">
            Multiple phones can join simultaneously. Each phone gets its own independent stream & volume slider.
          </div>
        </div>

        {/* Right Column: Master Volume & Waveform Output (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between p-6 rounded-2xl bg-[#051647] border border-[#0077B6] shadow-xl space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#00B4D8]" />
                <h2 className="text-sm font-bold text-[#CAF0F8] tracking-wide uppercase">
                  Master Volume
                </h2>
              </div>

              <span
                id="active-mics-pill"
                className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full border ${
                  activeCount > 0
                    ? 'bg-[#051647] border-[#00B4D8] text-[#00B4D8] animate-pulse'
                    : 'bg-[#03045E] border-[#0077B6] text-[#90E0EF]'
                }`}
              >
                {activeCount > 0 ? `🔴 ${activeCount} Mic Live` : 'Mic Idle'}
              </span>
            </div>

            {/* Master Volume Slider & Mute */}
            <div className="p-4 rounded-xl bg-[#03045E] border border-[#0077B6] space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#90E0EF]">Master Volume</span>
                <span className="text-[#00B4D8] font-bold">
                  {isMasterMuted ? 'Muted (0%)' : `${Math.round(masterVolume * 100)}%`}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  id="btn-master-mute"
                  onClick={handleToggleMasterMute}
                  className={`p-2.5 rounded-xl border transition cursor-pointer ${
                    isMasterMuted
                      ? 'bg-[#051647] border-[#0077B6] text-[#90E0EF]'
                      : 'bg-[#051647] border-[#0077B6] text-[#00B4D8] hover:text-[#CAF0F8]'
                  }`}
                  title={isMasterMuted ? 'Unmute master' : 'Mute master'}
                >
                  {isMasterMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>

                <input
                  id="slider-master-volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMasterMuted ? 0 : masterVolume}
                  onChange={handleMasterVolumeChange}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Master Waveform Visualizer */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs font-mono text-[#90E0EF]">
              <span className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-[#00B4D8]" />
                <span className="text-[#CAF0F8]">Live Audio Output Spectrum</span>
              </span>
              <span className={activeCount > 0 ? 'text-[#00B4D8] font-bold' : 'text-[#90E0EF]'}>
                {activeCount > 0 ? 'Streaming' : 'Waiting for speech'}
              </span>
            </div>

            {/* Waveform Bars Container using Palette */}
            <div
              id="waveform-bars-container"
              className="flex items-end justify-between gap-1.5 h-24 p-2.5 rounded-xl bg-[#03045E] border border-[#0077B6]"
            >
              {waveformData.map((height, i) => {
                let barColor = '#0077B6';
                if (activeCount > 0) {
                  if (height > 65) {
                    barColor = '#CAF0F8';
                  } else if (height > 30) {
                    barColor = '#90E0EF';
                  } else {
                    barColor = '#00B4D8';
                  }
                }

                return (
                  <div
                    key={i}
                    className="flex-1 rounded-sm transition-all duration-75"
                    style={{
                      height: `${Math.max(8, height)}%`,
                      backgroundColor: barColor,
                      opacity: activeCount > 0 ? 0.95 : 0.25
                    }}
                  />
                );
              })}
            </div>
          </div>

          <div className="text-[11px] font-mono text-[#90E0EF] text-right">
            Connected Phones: <strong className="text-[#CAF0F8]">{phoneCount}</strong>
          </div>
        </div>
      </div>

      {/* Connected Mobile Phones List & Multi-Phone Controls */}
      <div className="p-6 rounded-2xl bg-[#051647] border border-[#0077B6] shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#0077B6]">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#00B4D8]" />
            <h2 className="text-sm font-bold text-[#CAF0F8] tracking-wide uppercase">
              Connected Mobile Microphones ({phonesList.length})
            </h2>
          </div>

          <span className="text-xs font-mono text-[#90E0EF]">
            Independent Peer Connections
          </span>
        </div>

        {phonesList.length === 0 ? (
          <div
            id="no-phones-connected"
            className="py-12 text-center text-[#90E0EF] text-xs font-mono border border-dashed border-[#0077B6] rounded-xl"
          >
            No mobile microphones connected yet.
            <br />
            Scan the QR code or open the link from any phone on the same WiFi router.
          </div>
        ) : (
          <div className="space-y-3">
            {phonesList.map((phone) => {
              const currentVol = phoneVolumes[phone.id] !== undefined ? phoneVolumes[phone.id] : 1.0;
              const isMuted = Boolean(phoneMutes[phone.id]);
              const currentLevel = phoneLevels[phone.id] || 0;

              return (
                <div
                  key={phone.id}
                  id={`phone-channel-${phone.id}`}
                  className={`p-4 rounded-xl border transition-all ${
                    phone.isSpeaking
                      ? 'bg-[#03045E] border-[#00B4D8] shadow-[0_0_15px_rgba(0,180,216,0.25)]'
                      : 'bg-[#03045E] border-[#0077B6]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Device Identity & Status */}
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2.5 rounded-xl border shrink-0 ${
                          phone.isSpeaking
                            ? 'bg-[#051647] border-[#00B4D8] text-[#00B4D8] animate-pulse'
                            : 'bg-[#051647] border-[#0077B6] text-[#90E0EF]'
                        }`}
                      >
                        <Mic className="w-5 h-5" />
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[#CAF0F8] font-bold text-sm">{phone.name}</span>
                          {phone.shortId && (
                            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[#051647] border border-[#0077B6] text-[#90E0EF]">
                              #{phone.shortId}
                            </span>
                          )}
                          <span className="w-2 h-2 rounded-full bg-[#00B4D8]" title="Connected" />
                        </div>

                        {/* Mic state pill */}
                        <div className="mt-1 flex items-center gap-2">
                          {phone.isSpeaking ? (
                            <span className="text-[11px] font-mono font-bold text-[#00B4D8] flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-[#00B4D8] animate-ping" />
                              LIVE (TRANSMITTING)
                            </span>
                          ) : (
                            <span className="text-[11px] font-mono text-[#90E0EF]">
                              Standby (Mic Off)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Audio Activity Meter for this specific phone */}
                    <div className="flex-1 max-w-xs space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#90E0EF]">
                        <span>Phone Activity</span>
                        <span className={phone.isSpeaking ? 'text-[#00B4D8] font-bold' : 'text-[#90E0EF]'}>
                          {phone.isSpeaking ? `${currentLevel}%` : '0%'}
                        </span>
                      </div>

                      <div className="w-full h-2.5 bg-[#051647] rounded-full overflow-hidden p-0.5 border border-[#0077B6]">
                        <div
                          className="h-full rounded-full transition-all duration-75"
                          style={{
                            width: `${phone.isSpeaking ? currentLevel : 0}%`,
                            backgroundColor:
                              currentLevel > 65 ? '#CAF0F8' : currentLevel > 30 ? '#90E0EF' : '#00B4D8'
                          }}
                        />
                      </div>
                    </div>

                    {/* Individual Volume Control & Remote Actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      {/* Volume Slider */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          id={`btn-mute-phone-${phone.id}`}
                          onClick={() => handleTogglePhoneMute(phone.id)}
                          className={`p-1.5 rounded-lg border text-xs cursor-pointer transition ${
                            isMuted
                              ? 'bg-[#051647] border-[#0077B6] text-[#90E0EF]'
                              : 'bg-[#051647] border-[#0077B6] text-[#00B4D8] hover:text-[#CAF0F8]'
                          }`}
                          title={isMuted ? 'Unmute this phone' : 'Mute this phone'}
                        >
                          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </button>

                        <div className="w-20">
                          <input
                            type="range"
                            min="0"
                            max="1.5"
                            step="0.05"
                            value={isMuted ? 0 : currentVol}
                            onChange={(e) => handlePhoneVolumeChange(phone.id, parseFloat(e.target.value))}
                            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
                            title={`Volume: ${Math.round(currentVol * 100)}%`}
                          />
                        </div>
                      </div>

                      {/* Remote Mute Button */}
                      {phone.isSpeaking && (
                        <button
                          id={`btn-remote-mute-${phone.id}`}
                          onClick={() => handleRemoteMutePhone(phone.id)}
                          className="px-2.5 py-1 rounded-lg bg-[#051647] hover:bg-[#0077B6]/40 border border-[#0077B6] text-[#90E0EF] hover:text-[#CAF0F8] text-xs font-semibold transition cursor-pointer"
                          title="Remotely turn off phone mic"
                        >
                          Mute Mic
                        </button>
                      )}

                      {/* Disconnect Button */}
                      <button
                        id={`btn-kick-phone-${phone.id}`}
                        onClick={() => handleRemoteKickPhone(phone.id)}
                        className="p-1.5 rounded-lg bg-[#051647] hover:bg-[#0077B6]/40 border border-[#0077B6] text-[#90E0EF] hover:text-[#CAF0F8] transition cursor-pointer"
                        title="Disconnect this phone"
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
