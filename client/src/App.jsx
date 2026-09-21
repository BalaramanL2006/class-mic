import React, { useState, useEffect } from 'react';
import { Mic, Wifi, Volume2, ShieldCheck } from 'lucide-react';
import HomePage from './pages/HomePage.jsx';
import PhoneMicPage from './pages/PhoneMicPage.jsx';
import LaptopReceiverPage from './pages/LaptopReceiverPage.jsx';

export default function App() {
  const [role, setRole] = useState(null); // 'phone' | 'receiver' | null (home)
  const [roomId, setRoomId] = useState('local-mic');

  // Check URL query parameters for direct links and sync with browser navigation
  useEffect(() => {
    function syncFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const roleParam = params.get('role');
      const roomParam = params.get('room');

      const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (roleParam === 'phone' || roleParam === 'receiver') {
        setRole(roleParam);
      } else if (isMobile) {
        setRole('phone');
      } else {
        setRole(null);
      }
      if (roomParam) {
        setRoomId(roomParam);
      }
    }

    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  function handleSelectRole(selectedRole) {
    setRole(selectedRole);
    // Update URL without reload for convenience
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('role', selectedRole);
    window.history.pushState({}, '', newUrl.toString());
  }

  function handleBackToHome() {
    setRole(null);
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.delete('role');
    window.history.pushState({}, '', newUrl.toString());
  }

  return (
    <div className="min-h-screen bg-[#03045E] text-[#CAF0F8] flex flex-col justify-between selection:bg-[#00B4D8] selection:text-[#03045E]">
      {/* Global Professional Website Header */}
      <nav className="w-full border-b border-[#0077B6]/50 bg-[#03045E]/90 backdrop-blur-md sticky top-0 z-50 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <button
          onClick={handleBackToHome}
          className="flex items-center gap-2.5 group cursor-pointer focus:outline-none"
        >
          <div className="w-8 h-8 rounded-lg bg-[#051647] border border-[#0077B6] group-hover:border-[#00B4D8] flex items-center justify-center text-[#00B4D8] transition-colors shadow-sm">
            <Mic className="w-4 h-4 text-[#00B4D8]" />
          </div>
          <div className="text-left">
            <span className="font-extrabold text-sm sm:text-base tracking-tight text-[#CAF0F8] group-hover:text-[#00B4D8] transition-colors flex items-center gap-1.5">
              CLASSMIC
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[#051647] border border-[#0077B6] text-[#90E0EF]">
                PRO
              </span>
            </span>
          </div>
        </button>

        {/* Status Pill & Mode Navigation */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#051647] border border-[#0077B6] text-xs font-mono text-[#00B4D8]">
            <Wifi className="w-3.5 h-3.5 text-[#00B4D8]" />
            <span>Local LAN Stream</span>
          </div>

          {role === 'phone' ? (
            <button
              onClick={() => handleSelectRole('receiver')}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#051647] hover:bg-[#0077B6]/40 border border-[#0077B6] text-[#90E0EF] hover:text-[#CAF0F8] transition cursor-pointer"
            >
              Switch to Receiver
            </button>
          ) : role === 'receiver' ? (
            <button
              onClick={() => handleSelectRole('phone')}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#051647] hover:bg-[#0077B6]/40 border border-[#0077B6] text-[#90E0EF] hover:text-[#CAF0F8] transition cursor-pointer"
            >
              Switch to Mic
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSelectRole('phone')}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#00B4D8] hover:bg-[#90E0EF] text-[#03045E] shadow-sm transition cursor-pointer"
              >
                Phone Mic
              </button>
              <button
                onClick={() => handleSelectRole('receiver')}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#051647] hover:bg-[#0077B6]/40 border border-[#0077B6] text-[#90E0EF] hover:text-[#CAF0F8] transition cursor-pointer"
              >
                Receiver
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content View */}
      <main className="flex-1 flex flex-col justify-center">
        {role === 'phone' ? (
          <PhoneMicPage roomId={roomId} onBack={handleBackToHome} />
        ) : role === 'receiver' ? (
          <LaptopReceiverPage
            roomId={roomId}
            onBack={handleBackToHome}
            onStop={handleBackToHome}
          />
        ) : (
          <HomePage onSelectRole={handleSelectRole} />
        )}
      </main>

      {/* Professional Website Footer */}
      <footer className="w-full border-t border-[#0077B6]/50 bg-[#03045E] py-4 px-4 sm:px-8 text-center text-xs text-[#90E0EF] font-mono">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#00B4D8]" />
            <span className="text-[#CAF0F8] font-semibold">WebRTC Opus Audio</span>
            <span>•</span>
            <span>Local Socket.IO LAN Signaling</span>
          </div>

          <div className="text-[11px] text-[#90E0EF]">
            100% Offline • Zero Internet Required • Private & Local
          </div>
        </div>
      </footer>
    </div>
  );
}
