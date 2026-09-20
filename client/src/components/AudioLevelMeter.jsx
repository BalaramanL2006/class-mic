import React from 'react';

export default function AudioLevelMeter({ level = 0, isMicOn = false, id = 'audio-level-meter' }) {
  // Level is 0 - 100
  const activeLevel = isMicOn ? Math.min(100, Math.max(0, level)) : 0;

  // Segment count for clean optical display
  const totalSegments = 16;
  const activeSegments = Math.round((activeLevel / 100) * totalSegments);

  return (
    <div id={id} className="w-full max-w-xs mx-auto space-y-2">
      <div className="flex items-center justify-between text-xs font-mono text-slate-400">
        <span>AUDIO LEVEL</span>
        <span>{isMicOn ? `${activeLevel}%` : 'OFF'}</span>
      </div>

      {/* Segmented meter */}
      <div className="flex items-center gap-1 h-3 p-1 bg-slate-900 rounded-lg border border-slate-800">
        {Array.from({ length: totalSegments }).map((_, index) => {
          const isActive = index < activeSegments;
          let segmentColor = 'bg-emerald-500';
          if (index > 12) {
            segmentColor = 'bg-rose-500';
          } else if (index > 9) {
            segmentColor = 'bg-amber-400';
          }

          return (
            <div
              key={index}
              className={`h-full flex-1 rounded-xs transition-all duration-75 ${
                isActive ? segmentColor : 'bg-slate-800/60'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
