import React from 'react';
import { Mic, Volume2, Wifi, Speaker } from 'lucide-react';

export default function HomePage({ onSelectRole }) {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 select-none flex flex-col items-center justify-center min-h-[85vh]">
      {/* Brand Header */}
      <div className="text-center max-w-2xl mx-auto mb-10 space-y-3">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-[#051647] border border-[#0077B6] text-[#00B4D8] mb-1 shadow-xl shadow-[#00B4D8]/10">
          <Mic className="w-10 h-10 text-[#00B4D8]" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#CAF0F8]">
          CLASSMIC
        </h1>
        <p className="text-[#90E0EF] text-base sm:text-lg font-medium">
          Modern Wireless Microphone & Audio Dashboard
        </p>
        <div className="pt-1 flex items-center justify-center">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#051647] border border-[#0077B6] text-xs font-mono text-[#00B4D8]">
            <Wifi className="w-3.5 h-3.5 text-[#00B4D8]" />
            <span>Offline Local WiFi • Direct WebRTC Audio</span>
          </div>
        </div>
      </div>

      {/* Two Mode Cards - Professional 2-Column Grid Layout */}
      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mb-8">
        {/* Phone Mic Mode Card */}
        <div className="flex flex-col justify-between p-6 rounded-2xl bg-[#051647] border border-[#0077B6] hover:border-[#00B4D8] transition-all duration-200 shadow-xl group">
          <div className="space-y-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-[#00B4D8]/20 border border-[#00B4D8]/40 flex items-center justify-center text-[#00B4D8]">
              <Mic className="w-6 h-6 text-[#00B4D8]" />
            </div>
            <div className="text-left">
              <div className="text-lg tracking-wide font-extrabold text-[#CAF0F8]">Phone Microphone</div>
              <div className="text-xs font-normal text-[#90E0EF] mt-1 leading-relaxed">
                Use this mobile phone as a wireless mic
              </div>
            </div>
          </div>

          <button
            id="btn-phone-mic"
            onClick={() => onSelectRole('phone')}
            className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl bg-[#00B4D8] hover:bg-[#90E0EF] active:scale-[0.98] text-[#03045E] font-bold text-sm shadow-lg shadow-[#00B4D8]/25 transition-all cursor-pointer border border-[#CAF0F8]/30"
          >
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-[#03045E]" />
              <span>Launch Phone Mic</span>
            </div>
            <span className="text-lg text-[#03045E] group-hover:translate-x-1 transition-transform">→</span>
          </button>
        </div>

        {/* Laptop Receiver Mode Card */}
        <div className="flex flex-col justify-between p-6 rounded-2xl bg-[#051647] border border-[#0077B6] hover:border-[#00B4D8] transition-all duration-200 shadow-xl group">
          <div className="space-y-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-[#0077B6]/30 border border-[#0077B6]/60 flex items-center justify-center text-[#90E0EF]">
              <Volume2 className="w-6 h-6 text-[#90E0EF]" />
            </div>
            <div className="text-left">
              <div className="text-lg tracking-wide font-extrabold text-[#CAF0F8]">Laptop Receiver</div>
              <div className="text-xs font-normal text-[#90E0EF] mt-1 leading-relaxed">
                Receive audio & play to speakers via AUX / Bluetooth
              </div>
            </div>
          </div>

          <button
            id="btn-laptop-receiver"
            onClick={() => onSelectRole('receiver')}
            className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl bg-[#03045E] hover:bg-[#0077B6]/40 active:scale-[0.98] text-[#CAF0F8] font-bold text-sm shadow-md transition-all cursor-pointer border border-[#0077B6] hover:border-[#00B4D8]"
          >
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-[#00B4D8]" />
              <span>Open Receiver Console</span>
            </div>
            <span className="text-lg text-[#90E0EF] group-hover:translate-x-1 transition-transform">→</span>
          </button>
        </div>
      </div>

      {/* Hardware Connection Routing Layout */}
      <div className="w-full max-w-3xl p-4 sm:p-5 rounded-2xl bg-[#051647] border border-[#0077B6] text-xs text-[#90E0EF] font-mono text-center space-y-2.5 shadow-md">
        <div className="flex items-center justify-center gap-2 text-[#CAF0F8] font-semibold">
          <Speaker className="w-4 h-4 text-[#00B4D8]" />
          <span>Local Audio Hardware Routing:</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 text-[11px] font-bold tracking-tight text-[#00B4D8]">
          <span className="px-2 py-1 rounded-md bg-[#03045E] border border-[#0077B6] text-[#CAF0F8]">Phone Mic</span>
          <span className="text-[#00B4D8]">→</span>
          <span className="px-2 py-1 rounded-md bg-[#03045E] border border-[#0077B6] text-[#CAF0F8]">Local WiFi Router</span>
          <span className="text-[#00B4D8]">→</span>
          <span className="px-2 py-1 rounded-md bg-[#03045E] border border-[#0077B6] text-[#CAF0F8]">Laptop</span>
          <span className="text-[#00B4D8]">→</span>
          <span className="px-2 py-1 rounded-md bg-[#03045E] border border-[#0077B6] text-[#CAF0F8]">AUX / Bluetooth</span>
          <span className="text-[#00B4D8]">→</span>
          <span className="px-2 py-1 rounded-md bg-[#00B4D8]/20 border border-[#00B4D8]/50 text-[#00B4D8]">Speakers</span>
        </div>
      </div>
    </div>
  );
}
