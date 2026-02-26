import { useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (glowRef.current) {
        glowRef.current.style.transform = `translate(${e.clientX - 300}px, ${e.clientY - 300}px)`;
      }
    }
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="flex min-h-screen bg-[#020202] grain-overlay relative">
      {/* Ambient cursor glow */}
      <div ref={glowRef} className="ambient-glow" />

      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 relative z-[1]">
        <Header />
        <main className="flex-1 p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
