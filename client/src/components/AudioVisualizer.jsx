import React from 'react';

export default function AudioVisualizer({
  waveform = [],
  isPlaying = false,
  isMuted = false,
  id = 'audio-visualizer'
}) {
  // Ensure we have 12 to 16 bars
  const barCount = 16;
  const bars = Array.from({ length: barCount }).map((_, i) => {
    if (!isPlaying || isMuted) return 6; // minimum resting bar height
    const val = waveform[i] || 0;
    return Math.max(8, Math.min(100, val));
  });

  return (
    <div id={id} className="w-full flex flex-col items-center justify-center p-6 bg-slate-900/60 rounded-2xl border border-slate-800/80">
      <div className="flex items-end justify-center gap-1.5 h-20 w-full max-w-sm">
        {bars.map((heightPercent, idx) => {
          // Color gradations based on intensity
          let barBg = 'bg-emerald-500/30';
          if (isPlaying && !isMuted && heightPercent > 15) {
            barBg = heightPercent > 70 
              ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.5)]' 
              : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]';
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

      <div className="mt-3 text-xs font-mono tracking-widest text-slate-400 select-none">
        {isPlaying && !isMuted ? '▂▅▇▆▃▅▇▃ LIVE AUDIO' : isMuted ? 'AUDIO MUTED' : 'WAITING FOR VOICE'}
      </div>
    </div>
  );
}
