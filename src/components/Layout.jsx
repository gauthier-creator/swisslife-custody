import { useAuth } from '../context/AuthContext';
import { Avatar, Logo } from './shared';

/* ─────────────────────────────────────────────────────────
   Layout — Editorial private banking shell
   Warm paper bg · hairline nav · underline active tab
   ───────────────────────────────────────────────────────── */

export default function Layout({ children, section, onNavigate }) {
  const { signOut, profile, isAdmin } = useAuth();

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
      <header className="sticky top-0 z-30 bg-[rgba(251,250,247,0.8)] backdrop-blur-xl border-b border-[rgba(10,10,10,0.06)]">
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
            <div className="hidden md:flex items-center gap-3 pl-1 pr-4 h-10 rounded-full border border-[rgba(10,10,10,0.08)] bg-white">
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
              className="w-10 h-10 flex items-center justify-center rounded-full border border-[rgba(10,10,10,0.08)] bg-white text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-[#FBFAF7] transition-colors"
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

      {/* ── Content ─────────────────────────────────────── */}
      <main className="max-w-[1240px] mx-auto px-8 pt-12 pb-20 animate-fade">
        {children}
      </main>
    </div>
  );
}
