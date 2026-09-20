/**
 * Web Audio API utilities for ClassMic
 * Handles microphone capture, volume gain, mute control, and frequency/level analysis.
 */

// Request real microphone audio stream with browser enhancements
export async function getMicrophoneStream() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Microphone access is not supported by your browser.');
  }

  const constraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
      channelCount: 1
    },
    video: false
  };

  return await navigator.mediaDevices.getUserMedia(constraints);
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
    analyser.smoothingTimeConstant = 0.6;

    source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateMeter = () => {
      if (!isRunning) return;

      analyser.getByteFrequencyData(dataArray);

      // Compute average volume level
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      // Normalize to 0-100 scale
      const normalized = Math.min(100, Math.round((average / 128) * 100));

      onLevel(normalized);

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

// Setup receiver Web Audio chain: Stream -> GainNode -> Destination (Speakers) & AnalyserNode
export function setupReceiverAudioPipeline(stream, onWaveformData) {
  const mixer = setupReceiverAudioMixer(onWaveformData);
  if (stream) {
    mixer.addStream('default', stream);
  }
  return {
    ...mixer,
    cleanup: () => mixer.cleanup()
  };
}

// Multi-phone audio mixer: Multiple phone MediaStreams -> Master GainNode -> Destination & Analyser
export function setupReceiverAudioMixer(onWaveformData) {
  let audioContext = null;
  let masterGain = null;
  let analyser = null;
  let animationId = null;
  let isRunning = true;
  const sourceNodes = new Map(); // phoneId -> { source: MediaStreamAudioSourceNode, gain: GainNode }
  let currentActivePhoneId = null;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  audioContext = new AudioCtx();

  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 64;
  analyser.smoothingTimeConstant = 0.5;

  masterGain = audioContext.createGain();
  masterGain.gain.value = 1.0;

  // Pipe master gain to speakers and analyser
  masterGain.connect(audioContext.destination);
  masterGain.connect(analyser);

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  const tickVisualizer = () => {
    if (!isRunning) return;

    analyser.getByteFrequencyData(dataArray);
    if (onWaveformData) {
      const bars = Array.from(dataArray.slice(0, 16)).map((val) => Math.round((val / 255) * 100));
      onWaveformData(bars);
    }

    animationId = requestAnimationFrame(tickVisualizer);
  };

  tickVisualizer();

  return {
    addStream: (phoneId, stream) => {
      try {
        if (!audioContext || audioContext.state === 'closed') return;
        if (sourceNodes.has(phoneId)) {
          const old = sourceNodes.get(phoneId);
          try { old.source.disconnect(); } catch (_) {}
          try { old.gain.disconnect(); } catch (_) {}
        }
        const source = audioContext.createMediaStreamSource(stream);
        const gain = audioContext.createGain();
        // If active phone is set and matches, or if no active phone is set yet
        const isAllowed = !currentActivePhoneId || currentActivePhoneId === phoneId;
        gain.gain.setValueAtTime(isAllowed ? 1.0 : 0.0, audioContext.currentTime);

        source.connect(gain);
        gain.connect(masterGain);
        sourceNodes.set(phoneId, { source, gain });
      } catch (err) {
        console.warn('[ClassMic Mixer] Failed to add stream:', err);
      }
    },
    setActivePhone: (activePhoneId) => {
      currentActivePhoneId = activePhoneId || null;
      if (!audioContext) return;
      sourceNodes.forEach((node, pId) => {
        if (!currentActivePhoneId) {
          node.gain.gain.setValueAtTime(0, audioContext.currentTime);
        } else if (pId === currentActivePhoneId) {
          node.gain.gain.setValueAtTime(1.0, audioContext.currentTime);
        } else {
          node.gain.gain.setValueAtTime(0, audioContext.currentTime);
        }
      });
    },
    removeStream: (phoneId) => {
      if (sourceNodes.has(phoneId)) {
        const node = sourceNodes.get(phoneId);
        try { node.source.disconnect(); } catch (_) {}
        try { node.gain.disconnect(); } catch (_) {}
        sourceNodes.delete(phoneId);
      }
    },
    setVolume: (val) => {
      if (masterGain && audioContext) {
        masterGain.gain.setValueAtTime(val, audioContext.currentTime);
      }
    },
    setMute: (isMuted) => {
      if (masterGain && audioContext) {
        masterGain.gain.setValueAtTime(isMuted ? 0 : 1, audioContext.currentTime);
      }
    },
    resume: async () => {
      if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
      }
    },
    cleanup: () => {
      isRunning = false;
      if (animationId) cancelAnimationFrame(animationId);
      sourceNodes.forEach((node) => {
        try { node.source.disconnect(); } catch (_) {}
        try { node.gain.disconnect(); } catch (_) {}
      });
      sourceNodes.clear();
      if (masterGain) {
        try { masterGain.disconnect(); } catch (_) {}
      }
      if (audioContext && audioContext.state !== 'closed') {
        try { audioContext.close(); } catch (_) {}
      }
    }
  };
}
