import React from 'react';
import { Mic, Volume2 } from 'lucide-react';

export default function HomePage({ onSelectRole }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] px-4 py-8 text-center max-w-md mx-auto select-none">
      {/* Brand Header */}
      <div className="mb-10 space-y-3">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-2 shadow-lg shadow-emerald-950/40">
          <Mic className="w-10 h-10" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
          CLASSMIC
        </h1>
        <p className="text-slate-400 text-base sm:text-lg font-medium">
          Your phone. Your wireless microphone.
        </p>
      </div>

      {/* Two Large Mode Buttons */}
      <div className="w-full space-y-4">
        <button
          id="btn-phone-mic"
          onClick={() => onSelectRole('phone')}
          className="w-full group flex items-center justify-between p-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold text-lg shadow-lg shadow-emerald-950/40 transition-all cursor-pointer border border-emerald-400/30"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-emerald-700/70 group-hover:bg-emerald-600 transition-colors">
              <Mic className="w-6 h-6" />
            </div>
            <div className="text-left">
              <div className="text-base tracking-wide font-extrabold">Phone Mic</div>
              <div className="text-xs font-normal text-emerald-100/80">Use this device as microphone</div>
            </div>
          </div>
          <span className="text-xl text-emerald-200 group-hover:translate-x-1 transition-transform">→</span>
        </button>

        <button
          id="btn-laptop-receiver"
          onClick={() => onSelectRole('receiver')}
          className="w-full group flex items-center justify-between p-5 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white font-bold text-lg shadow-md transition-all cursor-pointer border border-slate-800 hover:border-slate-700"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 rounded-xl bg-slate-800 group-hover:bg-slate-700 transition-colors text-emerald-400">
              <Volume2 className="w-6 h-6" />
            </div>
            <div className="text-left">
              <div className="text-base tracking-wide font-extrabold">Laptop Receiver</div>
              <div className="text-xs font-normal text-slate-400">Play audio on this laptop & speakers</div>
            </div>
          </div>
          <span className="text-xl text-slate-400 group-hover:translate-x-1 transition-transform">→</span>
        </button>
      </div>

      {/* Subtle Flow Footnote */}
      <div className="mt-14 pt-6 border-t border-slate-900 text-xs text-slate-500 font-mono">
        PHONE → INTERNET → LAPTOP → SPEAKER
      </div>
    </div>
  );
}
