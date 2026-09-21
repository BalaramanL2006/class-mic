import React from 'react';

export default function AudioVisualizer({
  waveform = [],
  isPlaying = false,
  isMuted = false,
  id = 'audio-visualizer'
}) {
  // Ensure we have 16 bars
  const barCount = 16;
  const bars = Array.from({ length: barCount }).map((_, i) => {
    if (!isPlaying || isMuted) return 8; // minimum resting bar height
    const val = waveform[i] || 0;
    return Math.max(8, Math.min(100, val));
  });

  return (
    <div id={id} className="w-full flex flex-col items-center justify-center p-5 bg-[#051647] rounded-2xl border border-[#0077B6] shadow-md">
      <div className="flex items-end justify-center gap-1.5 h-20 w-full max-w-sm">
        {bars.map((heightPercent, idx) => {
          // Color gradations based on intensity using #0077B6, #00B4D8, #90E0EF, #CAF0F8
          let barBg = 'bg-[#0077B6]/30';
          if (isPlaying && !isMuted) {
            if (heightPercent > 70) {
              barBg = 'bg-[#CAF0F8] shadow-[0_0_10px_rgba(202,240,248,0.5)]';
            } else if (heightPercent > 35) {
              barBg = 'bg-[#90E0EF] shadow-[0_0_8px_rgba(144,224,239,0.4)]';
            } else {
              barBg = 'bg-[#00B4D8]';
            }
          }

          return (
            <div
              key={idx}
              className={`w-3.5 rounded-full transition-all duration-75 ease-out ${barBg}`}
              style={{ height: `${heightPercent}%` }}
            />
          );
        })}
      </div>

      <div className="mt-3 text-xs font-mono tracking-widest text-[#90E0EF] select-none">
        {isPlaying && !isMuted ? '▂▅▇▆▃▅▇ LIVE AUDIO OUTPUT' : isMuted ? 'AUDIO MUTED' : 'WAITING FOR VOICE'}
      </div>
    </div>
  );
}
