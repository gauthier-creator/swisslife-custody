import { useAuth } from '../context/AuthContext';

/* ─────────────────────────────────────────────────────────
   Layout — Linear-style top nav
   Sticky masthead, pill tabs, compact user menu
   ───────────────────────────────────────────────────────── */

export default function Layout({ children, section, onNavigate }) {
  const { signOut, profile, isAdmin } = useAuth();

  const tabs = [
    { id: 'clients', label: 'Clients' },
    { id: 'wallets', label: 'Wallets' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'policies', label: 'Policies' },
  ];
  if (isAdmin) tabs.push({ id: 'config', label: 'Configuration' });

  const initials = (profile?.full_name || profile?.email || '?').slice(0, 2).toUpperCase();
  const roleLabel = profile?.role === 'admin' ? 'Admin' : 'Banquier';

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#09090B]">
      {/* ── Top nav ─────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-[rgba(9,9,11,0.08)]">
        <div className="max-w-[1280px] mx-auto px-6 h-12 flex items-center justify-between gap-6">
          {/* Logo */}
          <button
            onClick={() => onNavigate('clients')}
            className="flex items-center gap-2.5 flex-shrink-0"
          >
            <div className="w-6 h-6 bg-[#09090B] rounded-md flex items-center justify-center">
              <span className="text-white text-[10px] font-bold tracking-tight">SL</span>
            </div>
            <span className="text-[13px] font-semibold text-[#09090B] tracking-tight">
              SwissLife Custody
            </span>
            <span className="hidden md:inline text-[11px] text-[#A1A1AA] font-medium ml-1">
              Banque Privée
            </span>
          </button>

          {/* Tabs */}
          <nav className="flex items-center gap-0.5 flex-1 justify-center">
            {tabs.map(tab => {
              const active = section === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onNavigate(tab.id)}
                  className={`h-7 px-3 text-[13px] font-medium rounded-md transition-colors ${
                    active
                      ? 'text-[#09090B] bg-[#F4F4F5]'
                      : 'text-[#71717A] hover:text-[#09090B] hover:bg-[#F4F4F5]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Identity */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#18181B] flex items-center justify-center">
                <span className="text-white text-[10px] font-semibold">{initials}</span>
              </div>
              <div className="leading-tight">
                <p className="text-[12px] font-medium text-[#09090B]">
                  {profile?.full_name || profile?.email}
                </p>
                <p className="text-[10px] text-[#71717A]">{roleLabel}</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="text-[12px] text-[#71717A] hover:text-[#09090B] transition-colors"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────── */}
      <main className="max-w-[1280px] mx-auto px-6 py-8 animate-fade">
        {children}
      </main>
    </div>
  );
}
