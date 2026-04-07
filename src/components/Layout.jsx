import { useAuth } from '../context/AuthContext';

const roleBadge = {
  admin: { label: 'Admin', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  banquier: { label: 'Banquier', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
};

export default function Layout({ children, section, onNavigate }) {
  const { signOut, profile, isAdmin } = useAuth();

  const tabs = [
    { id: 'clients', label: 'Clients' },
    { id: 'wallets', label: 'Wallets' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'policies', label: 'Policies' },
  ];

  // Admin-only tab
  if (isAdmin) {
    tabs.push({ id: 'config', label: 'Configuration' });
  }

  const badge = roleBadge[profile?.role] || roleBadge.banquier;

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-[rgba(0,0,29,0.06)]">
        <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#0F0F10] rounded-lg flex items-center justify-center">
              <span className="text-white text-[11px] font-bold">SL</span>
            </div>
            <div>
              <span className="text-[14px] font-semibold text-[#0F0F10]">SwissLife Custody</span>
              <span className="text-[11px] text-[#A8A29E] ml-2">Banque Privee</span>
            </div>
          </div>

          {/* Nav tabs */}
          <div className="flex items-center gap-1 bg-[rgba(0,0,23,0.03)] rounded-lg p-0.5">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => onNavigate(tab.id)}
                className={`px-4 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                  section === tab.id
                    ? 'bg-white text-[#0F0F10] shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
                    : 'text-[#787881] hover:text-[#0F0F10]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right — user info */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#0F0F10] flex items-center justify-center">
                <span className="text-white text-[10px] font-bold">
                  {(profile?.full_name || profile?.email || '?').slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="hidden sm:block">
                <p className="text-[12px] font-medium text-[#0F0F10] leading-tight">
                  {profile?.full_name || profile?.email}
                </p>
                <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>
            </div>
            <button
              onClick={signOut}
              className="text-[12px] text-[#A8A29E] hover:text-[#DC2626] transition-colors"
            >
              Deconnexion
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[1200px] mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
