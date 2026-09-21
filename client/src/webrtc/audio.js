/**
 * Web Audio API Engine for ClassMic (Offline LAN)
 *
 * Handles:
 * - Low-latency microphone capture optimized for real-time speech
 * - Multi-phone Web Audio mixer (mixing multiple concurrent incoming phone streams)
 * - Individual phone volume controls and per-phone audio activity meters
 * - Master output gain and waveform visualization for laptop speakers / AUX output
 */

// Request low-latency mono microphone stream for speech transmission
export async function getMicrophoneStream() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Microphone access is not supported by your browser.');
  }

  // Optimized for live speech over wireless LAN to external speakers
  const constraints = {
    audio: {
      channelCount: 1, // Mono audio for speech efficiency and bandwidth
      sampleRate: 48000,
      sampleSize: 16,
      echoCancellation: false, // Low-latency raw transmission for PA / external speaker output
      noiseSuppression: false, // Prevents software DSP delay
      autoGainControl: true,  // Automatically balances vocal dynamics
      latency: 0.005          // Request minimal hardware buffering
    },
    video: false
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  // Set browser content hint to prioritize speech encoding
  stream.getAudioTracks().forEach((track) => {
    if ('contentHint' in track) {
      track.contentHint = 'speech';
    }
  });

  return stream;
}

// Create an audio level meter from a MediaStream (0 to 100 range)
export function createAudioMeter(stream, onLevel) {
  let audioContext = null;
  let source = null;
  let analyser = null;
  let animationId = null;
  let isRunning = true;

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtx();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;

    source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateMeter = () => {
      if (!isRunning) return;

      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      const normalized = Math.min(100, Math.round((average / 128) * 100));

      if (onLevel) onLevel(normalized);

      animationId = requestAnimationFrame(updateMeter);
    };

    updateMeter();
  } catch (err) {
    console.error('[ClassMic] Audio meter init error:', err);
  }

  return function cleanup() {
    isRunning = false;
    if (animationId) cancelAnimationFrame(animationId);
    if (source) {
      try { source.disconnect(); } catch (_) {}
    }
    if (audioContext && audioContext.state !== 'closed') {
      try { audioContext.close(); } catch (_) {}
    }
  };
}

/**
 * Multi-Phone Web Audio Mixer
 *
 * Routes:
 * [Phone 1 Stream] -> [Phone 1 Gain] -> [Phone 1 Analyser] ┐
 * [Phone 2 Stream] -> [Phone 2 Gain] -> [Phone 2 Analyser] ┼─> [Master Gain] ─> [Master Analyser]
 * [Phone N Stream] -> [Phone N Gain] -> [Phone N Analyser] ┘         │
 *                                                                    └─> [Laptop Audio Destination / AUX / Speakers]
 */
export function setupReceiverAudioMixer({ onWaveformData, onPhoneLevels }) {
  let audioContext = null;
  let masterGain = null;
  let masterAnalyser = null;
  let animationId = null;
  let isRunning = true;

  // phoneId -> { source: MediaStreamAudioSourceNode, gain: GainNode, analyser: AnalyserNode, volume: number, isMuted: boolean }
  const phoneChannels = new Map();

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  audioContext = new AudioCtx({ latencyHint: 'interactive' });

  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }

  // Master Gain & Analyser
  masterGain = audioContext.createGain();
  masterGain.gain.value = 1.0;

  masterAnalyser = audioContext.createAnalyser();
  masterAnalyser.fftSize = 64;
  masterAnalyser.smoothingTimeConstant = 0.4;

  // Master output connects directly to audioContext.destination (Speakers / AUX / Headphones)
  masterGain.connect(audioContext.destination);
  masterGain.connect(masterAnalyser);

  const masterDataArray = new Uint8Array(masterAnalyser.frequencyBinCount);
  const phoneDataArray = new Uint8Array(32);

  const tickVisualizer = () => {
    if (!isRunning) return;

    // 1. Master waveform
    if (onWaveformData && masterAnalyser) {
      masterAnalyser.getByteFrequencyData(masterDataArray);
      const bars = Array.from(masterDataArray.slice(0, 16)).map((val) =>
        Math.round((val / 255) * 100)
      );
      onWaveformData(bars);
    }

    // 2. Per-phone audio activity levels
    if (onPhoneLevels && phoneChannels.size > 0) {
      const levels = {};
      phoneChannels.forEach((channel, pId) => {
        if (channel.isMuted) {
          levels[pId] = 0;
          return;
        }
        channel.analyser.getByteFrequencyData(phoneDataArray);
        let sum = 0;
        for (let i = 0; i < phoneDataArray.length; i++) {
          sum += phoneDataArray[i];
        }
        const avg = sum / phoneDataArray.length;
        levels[pId] = Math.min(100, Math.round((avg / 128) * 100));
      });
      onPhoneLevels(levels);
    }

    animationId = requestAnimationFrame(tickVisualizer);
  };

  tickVisualizer();

  return {
    // Add incoming phone stream to the live mixer
    addStream: (phoneId, stream, initialVolume = 1.0) => {
      try {
        if (!audioContext || audioContext.state === 'closed') return;

        // Clean up previous instance if exists
        if (phoneChannels.has(phoneId)) {
          const old = phoneChannels.get(phoneId);
          try { old.source.disconnect(); } catch (_) {}
          try { old.gain.disconnect(); } catch (_) {}
          try { old.analyser.disconnect(); } catch (_) {}
        }

        const source = audioContext.createMediaStreamSource(stream);
        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(initialVolume, audioContext.currentTime);

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.3;

        // Route: source -> gain -> analyser -> masterGain
        source.connect(gain);
        gain.connect(analyser);
        gain.connect(masterGain);

        phoneChannels.set(phoneId, {
          source,
          gain,
          analyser,
          volume: initialVolume,
          isMuted: false
        });

        console.log(`[ClassMic Mixer] Added audio channel for phone: ${phoneId}`);
      } catch (err) {
        console.warn('[ClassMic Mixer] Error adding phone stream:', err);
      }
    },

    // Adjust individual phone volume (0.0 to 1.5)
    setPhoneVolume: (phoneId, volume) => {
      const channel = phoneChannels.get(phoneId);
      if (channel && audioContext) {
        channel.volume = volume;
        if (!channel.isMuted) {
          channel.gain.gain.setValueAtTime(volume, audioContext.currentTime);
        }
      }
    },

    // Toggle mute on a single phone
    setPhoneMute: (phoneId, isMuted) => {
      const channel = phoneChannels.get(phoneId);
      if (channel && audioContext) {
        channel.isMuted = isMuted;
        channel.gain.gain.setValueAtTime(isMuted ? 0 : channel.volume, audioContext.currentTime);
      }
    },

    // Remove phone stream when phone leaves
    removeStream: (phoneId) => {
      if (phoneChannels.has(phoneId)) {
        const channel = phoneChannels.get(phoneId);
        try { channel.source.disconnect(); } catch (_) {}
        try { channel.gain.disconnect(); } catch (_) {}
        try { channel.analyser.disconnect(); } catch (_) {}
        phoneChannels.delete(phoneId);
        console.log(`[ClassMic Mixer] Removed audio channel for phone: ${phoneId}`);
      }
    },

    // Set master volume for laptop speakers / AUX (0.0 to 1.0)
    setMasterVolume: (val) => {
      if (masterGain && audioContext) {
        masterGain.gain.setValueAtTime(val, audioContext.currentTime);
      }
    },

    // Toggle master mute
    setMasterMute: (isMuted) => {
      if (masterGain && audioContext) {
        masterGain.gain.setValueAtTime(isMuted ? 0 : 1.0, audioContext.currentTime);
      }
    },

    // Resume suspended AudioContext (handles browser user gesture requirements)
    resume: async () => {
      if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
      }
    },

    // Full cleanup
    cleanup: () => {
      isRunning = false;
      if (animationId) cancelAnimationFrame(animationId);
      phoneChannels.forEach((channel) => {
        try { channel.source.disconnect(); } catch (_) {}
        try { channel.gain.disconnect(); } catch (_) {}
        try { channel.analyser.disconnect(); } catch (_) {}
      });
      phoneChannels.clear();
      if (masterGain) {
        try { masterGain.disconnect(); } catch (_) {}
      }
      if (audioContext && audioContext.state !== 'closed') {
        try { audioContext.close(); } catch (_) {}
      }
    }
  };
}
