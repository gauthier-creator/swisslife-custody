import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Avatar, Kbd, IconButton, DuoIcon } from './shared';
import CommandPalette from './CommandPalette';

/* ─────────────────────────────────────────────────────────
   Layout — Ramify-inspired product shell
   Left sidebar (white) · main content (pure white)
   Cream active-pill nav · top-right utility icons
   ───────────────────────────────────────────────────────── */

/* ── Icons (heroicons outline 24) ──────────────────────── */
const IconClients = (props) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.7}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
  </svg>
);
const IconWallets = (props) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.7}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9v3m13.5 3h.008v.008H16.5V15z" />
  </svg>
);
const IconCompliance = (props) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.7}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
  </svg>
);
const IconPolicies = (props) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.7}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);
const IconConfig = (props) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.7}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const IconSearch = (props) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
  </svg>
);
const IconBell = (props) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.7}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
  </svg>
);
const IconChat = (props) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.7}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
  </svg>
);
const IconLogout = (props) => (
  <svg {...props} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.7}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
  </svg>
);

const NAV_ITEMS = [
  { id: 'clients',    label: 'Clients',       Icon: IconClients,    shortcut: '1' },
  { id: 'wallets',    label: 'Wallets',       Icon: IconWallets,    shortcut: '2' },
  { id: 'compliance', label: 'Compliance',    Icon: IconCompliance, shortcut: '3' },
  { id: 'policies',   label: 'Policies',      Icon: IconPolicies,   shortcut: '4' },
];

/* ── NavButton — refined sidebar item with active bronze ruler ── */
function NavButton({ item, active, onClick }) {
  const { Icon, label, shortcut, id } = item;
  return (
    <button
      onClick={onClick}
      className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13.5px] font-medium tracking-[-0.006em] transition-all duration-200 ${
        active
          ? 'bg-[#F5EEE0] text-[#0A0A0A]'
          : 'text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-[#FAFAF8]'
      }`}
    >
      {/* Bronze active ruler (absolute, centered vertically) */}
      <span
        aria-hidden="true"
        className={`absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] rounded-full transition-all duration-300 ${
          active
            ? 'h-4 bg-gradient-to-b from-[#D4A574] via-[#9A7A51] to-[#7C5E3C] opacity-100'
            : 'h-0 bg-[#C8924B] opacity-0 group-hover:h-3 group-hover:opacity-40'
        }`}
      />
      <Icon className="w-[18px] h-[18px] flex-shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {id === 'compliance' && (
        <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-[5px] bg-[#FBF6EC] text-[#7C5E3C] border border-[rgba(124,94,60,0.2)]">
          <span className="relative flex w-[5px] h-[5px]">
            <span className="absolute inset-0 rounded-full bg-[#C8924B] opacity-60 animate-ping" />
            <span className="relative inline-flex w-[5px] h-[5px] rounded-full bg-[#C8924B]" />
          </span>
          Live
        </span>
      )}
      {shortcut && id !== 'compliance' && (
        <span
          className={`text-[10px] font-mono tabular-nums transition-opacity ${
            active ? 'text-[#7C5E3C] opacity-70' : 'text-[#BFBFBF] opacity-0 group-hover:opacity-100'
          }`}
        >
          {shortcut}
        </span>
      )}
    </button>
  );
}

export default function Layout({ children, section, onNavigate }) {
  const { signOut, profile, isAdmin } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K / Ctrl+K — open palette  ·  G + 1..5 — jump between sections
  useEffect(() => {
    let gPressed = false;
    let gTimer = null;
    const sectionByShortcut = { '1': 'clients', '2': 'wallets', '3': 'compliance', '4': 'policies', '5': 'config' };

    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen(o => !o);
        return;
      }
      // Skip number shortcuts while typing in inputs
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'g' || e.key === 'G') {
        gPressed = true;
        clearTimeout(gTimer);
        gTimer = setTimeout(() => { gPressed = false; }, 900);
        return;
      }
      if (gPressed && sectionByShortcut[e.key]) {
        const target = sectionByShortcut[e.key];
        if (target === 'config' && !isAdmin) return;
        e.preventDefault();
        onNavigate(target);
        gPressed = false;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(gTimer); };
  }, [isAdmin, onNavigate]);

  const navItems = [...NAV_ITEMS];
  const adminItems = isAdmin ? [{ id: 'config', label: 'Configuration', Icon: IconConfig, shortcut: '5' }] : [];

  const displayName = profile?.full_name || profile?.email || '?';
  const roleLabel = profile?.role === 'admin' ? 'Admin · SwissLife' : 'Banquier privé';

  return (
    <div className="min-h-screen bg-white text-[#0A0A0A] flex">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="w-[260px] flex-shrink-0 border-r border-[rgba(10,10,10,0.08)] bg-white flex flex-col h-screen sticky top-0">
        {/* Brand */}
        <div className="px-6 h-[72px] flex items-center gap-3 border-b border-[rgba(10,10,10,0.04)]">
          <button
            onClick={() => onNavigate('clients')}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
            aria-label="Accueil"
          >
            <span className="w-8 h-8 rounded-[9px] bg-[#0A0A0A] text-white flex items-center justify-center shadow-[0_1px_0_rgba(255,255,255,0.14)_inset,0_1px_2px_rgba(10,10,10,0.2),0_4px_10px_-4px_rgba(10,10,10,0.3)]">
              <span className="font-display text-[14px] leading-none" style={{ letterSpacing: '-0.04em' }}>Sℓ</span>
            </span>
            <span className="font-display text-[19px] text-[#0A0A0A] leading-none" style={{ letterSpacing: '-0.02em' }}>
              swisslife
            </span>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-4 py-5">
          {/* Section label · Produit */}
          <p className="px-3 mb-2.5 text-[9.5px] font-medium uppercase tracking-[0.16em] text-[#7C5E3C] flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-[#C8924B]" />
            Produit
          </p>
          <div className="space-y-0.5">
            {navItems.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={section === item.id}
                onClick={() => onNavigate(item.id)}
              />
            ))}
          </div>

          {adminItems.length > 0 && (
            <>
              {/* Hairline separator */}
              <div className="mx-3 my-5 h-px bg-gradient-to-r from-transparent via-[rgba(124,94,60,0.18)] to-transparent" />
              <p className="px-3 mb-2.5 text-[9.5px] font-medium uppercase tracking-[0.16em] text-[#7C5E3C] flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-[#C8924B]" />
                Administration
              </p>
              <div className="space-y-0.5">
                {adminItems.map((item) => (
                  <NavButton
                    key={item.id}
                    item={item}
                    active={section === item.id}
                    onClick={() => onNavigate(item.id)}
                  />
                ))}
              </div>
            </>
          )}
        </nav>

        {/* Command palette trigger */}
        <div className="px-4 pb-3">
          <button
            onClick={() => setPaletteOpen(true)}
            className="w-full inline-flex items-center gap-2.5 h-10 px-3 rounded-[10px] border border-[rgba(10,10,10,0.08)] bg-white text-[#6B6B6B] hover:text-[#0A0A0A] hover:border-[rgba(10,10,10,0.18)] transition-colors"
          >
            <IconSearch className="w-[15px] h-[15px]" />
            <span className="flex-1 text-left text-[12.5px] font-medium tracking-[-0.006em]">Rechercher</span>
            <span className="flex items-center gap-0.5"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
          </button>
        </div>

        {/* Account pill */}
        <div className="px-4 pb-5 pt-2 border-t border-[rgba(10,10,10,0.04)]">
          <div className="flex items-center gap-3 px-2 py-2 rounded-[10px] hover:bg-[#FAFAF8] transition-colors">
            <Avatar name={displayName} size={34} />
            <div className="flex-1 min-w-0 leading-tight">
              <p className="text-[12.5px] font-semibold text-[#0A0A0A] tracking-[-0.006em] truncate">
                {displayName}
              </p>
              <p className="text-[10.5px] text-[#9B9B9B] font-medium uppercase tracking-[0.06em] mt-0.5">
                {roleLabel}
              </p>
            </div>
            <button
              onClick={signOut}
              className="w-8 h-8 flex items-center justify-center rounded-[8px] text-[#9B9B9B] hover:text-[#0A0A0A] hover:bg-white transition-colors"
              aria-label="Déconnexion"
              title="Déconnexion"
            >
              <IconLogout className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={onNavigate}
        isAdmin={isAdmin}
      />

      {/* ── Main ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Utility bar (top-right icon card buttons) */}
        <header className="h-[72px] flex items-center justify-end gap-2.5 px-10 border-b border-[rgba(10,10,10,0.04)]">
          <IconButton ariaLabel="Support" size="md">
            <IconChat className="w-[17px] h-[17px]" />
          </IconButton>
          <IconButton ariaLabel="Notifications" size="md">
            <span className="relative">
              <IconBell className="w-[17px] h-[17px]" />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#C8924B] border border-white" />
            </span>
          </IconButton>
        </header>

        <main className="flex-1 px-10 py-10 animate-fade">
          <div className="max-w-[1240px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
