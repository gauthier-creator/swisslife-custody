import { useAuth } from '../context/AuthContext';
import { Avatar } from './shared';

/* ─────────────────────────────────────────────────────────
   Layout — Revolut-inspired top nav
   Rounded pills · soft elevation · colorful accents
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
    <div className="min-h-screen bg-[#F7F8FA] text-[#191C1F]">
      {/* ── Top nav ─────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-[rgba(247,248,250,0.85)] backdrop-blur-xl border-b border-[rgba(25,28,31,0.06)]">
        <div className="max-w-[1320px] mx-auto px-8 h-16 flex items-center justify-between gap-6">
          {/* Logo */}
          <button
            onClick={() => onNavigate('clients')}
            className="flex items-center gap-3 flex-shrink-0 group"
          >
            <div className="w-9 h-9 bg-[#191C1F] rounded-xl flex items-center justify-center shadow-[0_4px_16px_-4px_rgba(25,28,31,0.4)] group-hover:scale-105 transition-transform">
              <span className="text-white text-[13px] font-bold tracking-tight">SL</span>
            </div>
            <div className="flex flex-col items-start leading-none">
              <span className="text-[15px] font-semibold text-[#191C1F] tracking-[-0.2px]">
                SwissLife Custody
              </span>
              <span className="text-[11px] text-[#75808A] font-medium mt-0.5">
                Banque Privée · Paris
              </span>
            </div>
          </button>

          {/* Tabs */}
          <nav className="flex items-center gap-1 bg-white rounded-full p-1 border border-[rgba(25,28,31,0.06)] shadow-[0_0_20px_-10px_rgba(0,0,0,0.1)]">
            {tabs.map(tab => {
              const active = section === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onNavigate(tab.id)}
                  className={`h-9 px-4 text-[13px] font-semibold rounded-full transition-all tracking-[-0.1px] ${
                    active
                      ? 'bg-[#191C1F] text-white shadow-[0_2px_8px_-2px_rgba(25,28,31,0.3)]'
                      : 'text-[#75808A] hover:text-[#191C1F] hover:bg-[#F7F8FA]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Identity */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-3 bg-white rounded-full pl-1.5 pr-4 py-1.5 border border-[rgba(25,28,31,0.06)] shadow-[0_0_20px_-10px_rgba(0,0,0,0.1)]">
              <Avatar name={displayName} size={32} />
              <div className="leading-tight">
                <p className="text-[13px] font-semibold text-[#191C1F] tracking-[-0.1px]">
                  {displayName}
                </p>
                <p className="text-[11px] text-[#75808A]">{roleLabel}</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-[rgba(25,28,31,0.06)] text-[#75808A] hover:text-[#EC4C5A] hover:border-[rgba(236,76,90,0.2)] transition-colors shadow-[0_0_20px_-10px_rgba(0,0,0,0.1)]"
              aria-label="Déconnexion"
              title="Déconnexion"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────── */}
      <main className="max-w-[1320px] mx-auto px-8 py-10 animate-fade">
        {children}
      </main>
    </div>
  );
}
