import { useAuth } from '../context/AuthContext';

export default function Layout({ children, section, onNavigate }) {
  const { clearConfig } = useAuth();

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
            {[
              { id: 'clients', label: 'Clients' },
              { id: 'wallets', label: 'Wallets' },
              { id: 'policies', label: 'Policies' },
            ].map(tab => (
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

          {/* Right */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#059669]" />
              <span className="text-[12px] text-[#059669] font-medium">Connected</span>
            </div>
            <button
              onClick={clearConfig}
              className="text-[12px] text-[#A8A29E] hover:text-[#DC2626] transition-colors"
            >
              Disconnect
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
