import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Avatar, Logo, Kbd } from './shared';
import CommandPalette from './CommandPalette';

/* ─────────────────────────────────────────────────────────
   Layout — Editorial private banking shell
   Warm paper bg · hairline nav · underline active tab
   ───────────────────────────────────────────────────────── */

export default function Layout({ children, section, onNavigate }) {
  const { signOut, profile, isAdmin } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // ⌘K / Ctrl+K — open palette
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Scroll-driven header crispness
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const tabs = [
    { id: 'clients',    label: 'Clients' },
    { id: 'wallets',    label: 'Wallets' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'policies',   label: 'Policies' },
  ];
  if (isAdmin) tabs.push({ id: 'config', label: 'Configuration' });

  const displayName = profile?.full_name || profile?.email || '?';
  const roleLabel = profile?.role === 'admin' ? 'Admin' : 'Banquier';

  return (
    <div className="min-h-screen bg-paper text-[#0A0A0A]">
      {/* ── Top nav ─────────────────────────────────────── */}
      <header
        className={`sticky top-0 z-30 backdrop-blur-xl border-b transition-[background,border-color,box-shadow] duration-[240ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
          scrolled
            ? 'bg-[rgba(251,250,247,0.92)] border-[rgba(10,10,10,0.1)] shadow-[0_1px_0_rgba(10,10,10,0.02),0_12px_28px_-20px_rgba(10,10,10,0.12)]'
            : 'bg-[rgba(251,250,247,0.78)] border-[rgba(10,10,10,0.06)]'
        }`}
      >
        <div className="max-w-[1240px] mx-auto px-8 h-[68px] flex items-center justify-between gap-8">
          {/* Logo */}
          <button
            onClick={() => onNavigate('clients')}
            className="flex-shrink-0 opacity-100 hover:opacity-80 transition-opacity"
          >
            <Logo size="md" />
          </button>

          {/* Tabs — underline active state */}
          <nav className="flex items-center gap-0.5 h-full">
            {tabs.map(tab => {
              const active = section === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onNavigate(tab.id)}
                  className={`relative h-full px-4 text-[13.5px] font-medium transition-colors tracking-[-0.01em] ${
                    active ? 'text-[#0A0A0A]' : 'text-[#6B6B6B] hover:text-[#0A0A0A]'
                  }`}
                >
                  {tab.label}
                  {active && (
                    <span className="absolute left-4 right-4 -bottom-px h-[2px] bg-[#0A0A0A] rounded-t-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Identity */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* ⌘K search trigger */}
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden md:inline-flex items-center gap-2.5 h-10 pl-3 pr-2 rounded-full border border-[rgba(10,10,10,0.08)] bg-white text-[#6B6B6B] hover:text-[#0A0A0A] hover:border-[rgba(10,10,10,0.18)] hover:shadow-[0_1px_2px_rgba(10,10,10,0.04)] transition-[color,border-color,box-shadow] duration-200 group focus-visible:ring-[3px] focus-visible:ring-[rgba(124,94,60,0.22)] outline-none"
              aria-label="Rechercher"
            >
              <svg className="w-[14px] h-[14px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8.8" cy="8.8" r="5.4" />
                <path d="M13 13 l4 4" />
              </svg>
              <span className="text-[12.5px] font-medium tracking-[-0.006em] group-hover:text-[#0A0A0A]">Rechercher</span>
              <span className="flex items-center gap-0.5"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
            </button>

            <div className="hidden lg:flex items-center gap-3 pl-1 pr-4 h-10 rounded-full border border-[rgba(10,10,10,0.08)] bg-white">
              <Avatar name={displayName} size={30} />
              <div className="leading-tight">
                <p className="text-[12.5px] font-medium text-[#0A0A0A] tracking-[-0.01em]">
                  {displayName}
                </p>
                <p className="text-[10.5px] text-[#6B6B6B] tracking-[0.01em]">{roleLabel}</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="w-10 h-10 flex items-center justify-center rounded-full border border-[rgba(10,10,10,0.08)] bg-white text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-[#FBFAF7] transition-colors focus-visible:ring-[3px] focus-visible:ring-[rgba(124,94,60,0.22)] outline-none active:scale-[0.96]"
              aria-label="Déconnexion"
              title="Déconnexion"
            >
              <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={onNavigate}
        isAdmin={isAdmin}
      />

      {/* ── Content ─────────────────────────────────────── */}
      <main className="max-w-[1240px] mx-auto px-8 pt-12 pb-20 animate-fade">
        {children}
      </main>
    </div>
  );
}
