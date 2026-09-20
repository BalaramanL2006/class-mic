import React, { useState, useEffect } from 'react';
import HomePage from './pages/HomePage.jsx';
import PhoneMicPage from './pages/PhoneMicPage.jsx';
import LaptopReceiverPage from './pages/LaptopReceiverPage.jsx';

export default function App() {
  const [role, setRole] = useState(null); // 'phone' | 'receiver' | null (home)
  const [roomId, setRoomId] = useState('default');

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
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center">
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
  );
}
