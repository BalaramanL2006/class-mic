import React from 'react';

export default function AudioLevelMeter({ level = 0, isMicOn = false, id = 'audio-level-meter' }) {
  // Level is 0 - 100
  const activeLevel = isMicOn ? Math.min(100, Math.max(0, level)) : 0;

  // Waveform equalizer bars count
  const barCount = 18;

  // Generate dynamic bar heights based on the real audio level and center-weighted distribution
  const bars = Array.from({ length: barCount }).map((_, index) => {
    if (!isMicOn) {
      return { height: 12, isActive: false, color: 'bg-[#0077B6]/30' };
    }

    // Weight bars so middle bars surge higher than edges like a real voice waveform
    const centerFactor = 1 - Math.abs((index - (barCount - 1) / 2) / ((barCount - 1) / 2)) * 0.45;
    const dynamicVariation = Math.sin((index + 1) * 1.5 + (activeLevel / 10)) * 12;
    const computedHeight = Math.max(14, Math.min(100, (activeLevel * centerFactor) + dynamicVariation));

    const isActive = activeLevel > 2;

    // Color gradient across bars using oceanic palette: #0077B6 -> #00B4D8 -> #90E0EF / #CAF0F8
    let colorClass = 'bg-[#0077B6]';
    if (index >= 4 && index <= 13) {
      colorClass = computedHeight > 65 
        ? 'bg-[#CAF0F8] shadow-[0_0_8px_rgba(202,240,248,0.5)]' 
        : 'bg-[#00B4D8]';
    } else {
      colorClass = computedHeight > 40 ? 'bg-[#00B4D8]' : 'bg-[#0077B6]';
    }

    return {
      height: computedHeight,
      isActive,
      color: colorClass
    };
  });

  return (
    <div id={id} className="w-full max-w-xs mx-auto space-y-2 select-none">
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-[#90E0EF] tracking-wider uppercase">Audio Level</span>
        <span className={isMicOn ? 'text-[#00B4D8] font-bold' : 'text-[#90E0EF]'}>
          {isMicOn ? `${Math.round(activeLevel)}%` : 'OFF'}
        </span>
      </div>

      {/* Waveform Equalizer Container */}
      <div className="flex items-center justify-between gap-1 h-12 px-3 py-2 bg-[#051647] rounded-xl border border-[#0077B6]">
        {bars.map((bar, index) => (
          <div
            key={index}
            className={`w-1.5 rounded-full transition-all duration-75 ease-out ${
              isMicOn && bar.isActive ? bar.color : 'bg-[#0077B6]/30'
            }`}
            style={{
              height: isMicOn ? `${bar.height}%` : '12%'
            }}
          />
        ))}
      </div>
    </div>
  );
}
