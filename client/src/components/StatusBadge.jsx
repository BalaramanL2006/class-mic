import React from 'react';

export default function StatusBadge({ status, label, id = 'status-badge' }) {
  // Determine dot color based on status
  let dotColor = 'bg-[#90E0EF]';
  let pulse = false;

  if (status === 'connected' || status === 'active' || status === 'ready') {
    dotColor = 'bg-[#00B4D8]';
    pulse = true;
  } else if (status === 'waiting' || status === 'connecting') {
    dotColor = 'bg-[#90E0EF]';
    pulse = true;
  } else if (status === 'error' || status === 'disconnected') {
    dotColor = 'bg-[#0077B6]';
  }

  return (
    <div
      id={id}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#051647] border border-[#0077B6] text-xs font-medium text-[#CAF0F8] shadow-sm"
    >
      <span className="relative flex h-2 w-2">
        {pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75`}></span>
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`}></span>
      </span>
      <span className="text-xs">{label}</span>
    </div>
  );
}
