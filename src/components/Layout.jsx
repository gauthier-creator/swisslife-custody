import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Avatar, Kbd } from './shared';
import CommandPalette from './CommandPalette';
import {
  IconClients, IconWallets, IconCompliance, IconPolicies, IconConfig,
  IconSearch, IconBell, IconChat, IconLogout, IconChevron,
} from './icons';

/* ─────────────────────────────────────────────────────────
   Layout — Ramify-inspired product shell
   Sidebar icons from our bespoke icons.jsx library
   (generated with Google Stitch, post-edited for consistency).
   ───────────────────────────────────────────────────────── */

const NAV_ITEMS = [
  { id: 'clients',    label: 'Clients',       Icon: IconClients,    shortcut: '1' },
  { id: 'wallets',    label: 'Wallets',       Icon: IconWallets,    shortcut: '2' },
  { id: 'compliance', label: 'Compliance',    Icon: IconCompliance, shortcut: '3' },
  { id: 'policies',   label: 'Policies',      Icon: IconPolicies,   shortcut: '4' },
];

/* ── NavButton — Ramify sidebar row: peach pill when active, no ruler ── */
function NavButton({ item, active, onClick, collapsed }) {
  const { Icon, label, shortcut, id } = item;
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`group relative w-full flex items-center gap-3 rounded-[4px] text-[14px] font-medium transition-colors duration-150 ${
        collapsed ? 'justify-center h-10 px-0' : 'px-2 py-2'
      } ${
        active
          ? 'bg-[#F5E5CE] text-[#1E1E1E]'
          : 'text-[#5D5D5D] hover:text-[#1E1E1E] hover:bg-[rgba(245,229,206,0.35)]'
      }`}
    >
      <Icon size={18} className="flex-shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 text-left truncate">{label}</span>
          {id === 'compliance' && (
            <span className="inline-flex items-center text-[9px] font-semibold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-[3px] bg-[#F5E5CE] text-[#7C5E3C]">
              Live
            </span>
          )}
          {shortcut && id !== 'compliance' && (
            <span
              className={`text-[10px] font-mono tabular-nums transition-opacity ${
                active ? 'text-[#7C5E3C] opacity-60' : 'text-[#BFBFBF] opacity-0 group-hover:opacity-100'
              }`}
            >
              {shortcut}
            </span>
          )}
        </>
      )}
      {/* Compliance "live" dot indicator in collapsed mode */}
      {collapsed && id === 'compliance' && (
        <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#C8924B] shadow-[0_0_0_2px_#FFFFFF]" />
      )}
    </button>
  );
}

export default function Layout({ children, section, onNavigate }) {
  const { signOut, profile, isAdmin } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Sidebar collapse state — persisted in localStorage
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('sl-sidebar-collapsed') === '1';
  });
  useEffect(() => {
    try {
      window.localStorage.setItem('sl-sidebar-collapsed', collapsed ? '1' : '0');
    } catch {}
  }, [collapsed]);
  const toggleSidebar = () => setCollapsed(c => !c);

  // ⌘K / Ctrl+K — open palette  ·  G + 1..5 — jump between sections  ·  ⌘\ — toggle sidebar
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
      if (mod && e.key === '\\') {
        e.preventDefault();
        setCollapsed(c => !c);
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
  const roleLabel = profile?.role === 'admin' ? 'Admin · Demo Bank' : 'Banquier privé';

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#1E1E1E] flex">
      {/* Skip link — hidden by default, visible on keyboard focus */}
      <a
        href="#sl-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-3 focus:py-2 focus:bg-[#1E1E1E] focus:text-white focus:rounded-[6px] focus:text-[13px] focus:font-semibold"
      >
        Aller au contenu principal
      </a>
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside
        aria-label="Navigation principale"
        className={`flex-shrink-0 border-r border-[#E7E7E7] bg-white flex flex-col h-screen sticky top-0 transition-[width] duration-[280ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
          collapsed ? 'w-[72px]' : 'w-[256px]'
        }`}
      >
        {/* Brand — minimal, Ramify-style */}
        <div className={`h-[64px] flex items-center ${collapsed ? 'justify-center' : 'px-5'}`}>
          <button
            onClick={() => onNavigate('clients')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            aria-label="Accueil"
          >
            <span className="w-7 h-7 rounded-[6px] bg-[#1E1E1E] text-white flex items-center justify-center">
              <span className="font-display text-[13px] leading-none" style={{ letterSpacing: '-0.04em' }}>Sℓ</span>
            </span>
            {!collapsed && (
              <span className="font-display text-[19px] text-[#1E1E1E] leading-none" style={{ letterSpacing: '-0.01em' }}>
                Demo Bank
              </span>
            )}
          </button>
        </div>

        {/* Nav — Ramify pattern: grouped sections w/ hairline separator, no eyebrows */}
        <nav className={`flex-1 overflow-y-auto overflow-x-hidden ${collapsed ? 'px-2' : 'px-3'} pt-2`}>
          <div className="space-y-0.5">
            {navItems.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                active={section === item.id}
                collapsed={collapsed}
                onClick={() => onNavigate(item.id)}
              />
            ))}
          </div>

          {adminItems.length > 0 && (
            <>
              <div className="my-4 h-px bg-[#E7E7E7]" />
              <div className="space-y-0.5">
                {adminItems.map((item) => (
                  <NavButton
                    key={item.id}
                    item={item}
                    active={section === item.id}
                    collapsed={collapsed}
                    onClick={() => onNavigate(item.id)}
                  />
                ))}
              </div>
            </>
          )}
        </nav>

        {/* Command palette trigger — subtle, inline */}
        <div className={`pb-2 ${collapsed ? 'px-2' : 'px-3'}`}>
          <button
            onClick={() => setPaletteOpen(true)}
            title={collapsed ? 'Rechercher  ⌘K' : undefined}
            className={`w-full inline-flex items-center rounded-[4px] text-[#8A8278] hover:text-[#1E1E1E] hover:bg-[rgba(245,229,206,0.35)] transition-colors ${
              collapsed ? 'justify-center h-10' : 'gap-2.5 h-9 px-2'
            }`}
          >
            <IconSearch className="w-[15px] h-[15px]" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left text-[13px] font-medium">Rechercher</span>
                <span className="flex items-center gap-0.5"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
              </>
            )}
          </button>
        </div>

        {/* Account — Ramify footer: avatar + name + MEMBRE label + chevrons */}
        <div className={`pb-4 pt-2 border-t border-[#E7E7E7] ${collapsed ? 'px-2' : 'px-3'}`}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div title={displayName}>
                <Avatar name={displayName} size={32} />
              </div>
              <button
                onClick={signOut}
                className="w-9 h-9 flex items-center justify-center rounded-[4px] text-[#8A8278] hover:text-[#1E1E1E] hover:bg-[rgba(245,229,206,0.35)] transition-colors"
                aria-label="Déconnexion"
                title="Déconnexion"
              >
                <IconLogout className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-[4px] hover:bg-[rgba(245,229,206,0.35)] transition-colors">
              <Avatar name={displayName} size={32} />
              <div className="flex-1 min-w-0 leading-tight">
                <p className="text-[13px] font-semibold text-[#1E1E1E] truncate">
                  {displayName}
                </p>
                <p className="text-[10px] text-[#8A8278] font-semibold uppercase tracking-[0.08em] mt-0.5">
                  {roleLabel.replace('·', '·')}
                </p>
              </div>
              <button
                onClick={signOut}
                className="w-7 h-7 flex items-center justify-center rounded-[4px] text-[#8A8278] hover:text-[#1E1E1E] hover:bg-white transition-colors"
                aria-label="Déconnexion"
                title="Déconnexion"
              >
                <IconLogout className="w-[14px] h-[14px]" />
              </button>
            </div>
          )}
        </div>

        {/* Collapse toggle — floats on the right border edge */}
        <button
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Déployer le menu' : 'Réduire le menu'}
          title={collapsed ? 'Déployer (⌘\\)' : 'Réduire (⌘\\)'}
          className="absolute top-[44px] -right-3 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-white border border-[#E7E7E7] text-[#8A8278] hover:text-[#1E1E1E] hover:border-[#D1D5DB] transition-colors"
        >
          <IconChevron className={`w-3 h-3 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={onNavigate}
        isAdmin={isAdmin}
      />

      {/* ── Main ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col bg-[#FAFAFA]">
        {/* Utility bar — Ramify: minimal, flush-right */}
        <header className="h-[64px] flex items-center justify-end gap-1 px-10 lg:px-12">
          <button
            className="w-9 h-9 flex items-center justify-center rounded-[4px] text-[#5D5D5D] hover:text-[#1E1E1E] hover:bg-[rgba(245,229,206,0.35)] transition-colors"
            aria-label="Support"
          >
            <IconChat className="w-[17px] h-[17px]" />
          </button>
          <button
            className="w-9 h-9 flex items-center justify-center rounded-[4px] text-[#5D5D5D] hover:text-[#1E1E1E] hover:bg-[rgba(245,229,206,0.35)] transition-colors relative"
            aria-label="Notifications"
          >
            <IconBell className="w-[17px] h-[17px]" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#C8924B] ring-2 ring-white" />
          </button>
        </header>

        <main id="sl-main" role="main" className="flex-1 px-10 lg:px-12 pt-2 pb-12 animate-fade">
          <div className="max-w-[1240px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
