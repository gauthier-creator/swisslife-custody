import { useAuth } from '../context/AuthContext';

/* ─────────────────────────────────────────────────────────
   Layout — the persistent editorial frame
   Typographic masthead · hairline navigation · paper ground
   ───────────────────────────────────────────────────────── */

export default function Layout({ children, section, onNavigate }) {
  const { signOut, profile, isAdmin } = useAuth();

  const tabs = [
    { id: 'clients', label: 'Clients' },
    { id: 'wallets', label: 'Portefeuilles' },
    { id: 'compliance', label: 'Conformité' },
    { id: 'policies', label: 'Politiques' },
  ];
  if (isAdmin) tabs.push({ id: 'config', label: 'Configuration' });

  const initials = (profile?.full_name || profile?.email || '·').slice(0, 2).toUpperCase();
  const roleLabel = profile?.role === 'admin' ? 'Administrateur' : 'Banquier privé';

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#0B0B0C]">
      {/* ── Masthead ─────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-[rgba(250,250,247,0.82)] border-b border-[rgba(11,11,12,0.08)]"
              style={{ backdropFilter: 'blur(12px) saturate(1.2)', WebkitBackdropFilter: 'blur(12px) saturate(1.2)' }}>
        <div className="max-w-[1240px] mx-auto px-10 h-16 flex items-center justify-between">
          {/* Wordmark */}
          <button
            onClick={() => onNavigate('clients')}
            className="flex items-baseline gap-3 group"
            aria-label="Accueil"
          >
            <span className="font-display text-[22px] text-[#0B0B0C] leading-none tracking-[-0.03em]">
              SwissLife
            </span>
            <span className="eyebrow text-[#8A6F3D]">Conservation</span>
          </button>

          {/* Navigation — ghost tabs with ink underline */}
          <nav className="flex items-center gap-8">
            {tabs.map(tab => {
              const active = section === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onNavigate(tab.id)}
                  className="relative py-5 text-[13px] tracking-tight transition-colors"
                  style={{ color: active ? '#0B0B0C' : '#6B6B70' }}
                >
                  {tab.label}
                  {active && (
                    <span className="absolute left-0 right-0 -bottom-px h-px bg-[#0B0B0C]" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Identity */}
          <div className="flex items-center gap-5">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[12px] text-[#0B0B0C] tracking-tight leading-tight">
                {profile?.full_name || profile?.email}
              </span>
              <span className="eyebrow mt-0.5">{roleLabel}</span>
            </div>
            <div className="w-9 h-9 border border-[rgba(11,11,12,0.16)] flex items-center justify-center"
                 style={{ borderRadius: '2px' }}>
              <span className="text-[10px] font-medium tracking-[0.12em] text-[#0B0B0C]">
                {initials}
              </span>
            </div>
            <button
              onClick={signOut}
              className="eyebrow text-[#6B6B70] hover:text-[#0B0B0C] transition-colors"
              aria-label="Déconnexion"
            >
              Sortir
            </button>
          </div>
        </div>
      </header>

      {/* ── Content ──────────────────────────────────────── */}
      <main className="max-w-[1240px] mx-auto px-10 py-14 page-enter">
        {children}
      </main>

      {/* ── Colophon ─────────────────────────────────────── */}
      <footer className="max-w-[1240px] mx-auto px-10 py-10 mt-10 border-t border-[rgba(11,11,12,0.08)]">
        <div className="flex items-center justify-between">
          <p className="eyebrow">SwissLife Banque Privée · Paris</p>
          <p className="eyebrow text-[#A8A8AD]">AMF · ACPR · MiCA Art. 60</p>
        </div>
      </footer>
    </div>
  );
}
