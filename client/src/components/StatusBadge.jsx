import React from 'react';

export default function StatusBadge({ status, label, id = 'status-badge' }) {
  // Determine dot color based on status
  let dotColor = 'bg-slate-500';
  let pulse = false;

  if (status === 'connected' || status === 'active' || status === 'ready') {
    dotColor = 'bg-emerald-400';
    pulse = true;
  } else if (status === 'waiting' || status === 'connecting') {
    dotColor = 'bg-amber-400';
    pulse = true;
  } else if (status === 'error' || status === 'disconnected') {
    dotColor = 'bg-rose-500';
  }

  return (
    <div id={id} className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-sm font-medium text-slate-200 shadow-sm">
      <span className="relative flex h-2.5 w-2.5">
        {pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75`}></span>
        )}
        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dotColor}`}></span>
      </span>
      <span>{label}</span>
    </div>
  );
}
