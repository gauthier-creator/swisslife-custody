import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { listWallets } from '../services/dfnsApi';
import { SUPPORTED_NETWORKS } from '../config/constants';
import { Badge, Spinner, EmptyState } from './shared';

const truncAddr = (a, n = 8) => a ? `${a.slice(0, n)}...${a.slice(-n)}` : '—';

export default function WalletList() {
  const { dfnsConfig } = useAuth();
  const isDemo = dfnsConfig.token === 'mock' || dfnsConfig.token === 'demo';
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      if (isDemo) {
        setWallets(DEMO_ALL_WALLETS);
      } else {
        const data = await listWallets();
        setWallets(data);
      }
    } catch { setWallets(DEMO_ALL_WALLETS); }
    setLoading(false);
  };

  const net = (id) => SUPPORTED_NETWORKS.find(n => n.id === id) || { icon: '?', color: '#999', name: id };

  const filtered = search
    ? wallets.filter(w => (w.name || '').toLowerCase().includes(search.toLowerCase()) || (w.address || '').toLowerCase().includes(search.toLowerCase()) || (w.externalId || '').includes(search))
    : wallets;

  const byNetwork = {};
  filtered.forEach(w => {
    const key = w.network || 'Unknown';
    if (!byNetwork[key]) byNetwork[key] = [];
    byNetwork[key].push(w);
  });

  return (
    <div className="page-slide-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[22px] font-semibold text-[#0F0F10] tracking-tight">Wallets</h2>
          <p className="text-[13px] text-[#787881] mt-0.5">{wallets.length} wallet{wallets.length > 1 ? 's' : ''} — Vue globale Dfns</p>
        </div>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8A29E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." className="pl-10 pr-4 py-2 text-[13px] bg-white border border-[rgba(0,0,29,0.1)] rounded-xl w-64 outline-none focus:border-[rgba(0,0,29,0.25)] transition-colors" />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total wallets', value: wallets.length },
          { label: 'Reseaux actifs', value: Object.keys(byNetwork).length },
          { label: 'Wallets actifs', value: wallets.filter(w => w.status === 'Active').length },
          { label: 'Clients lies', value: new Set(wallets.map(w => w.externalId).filter(Boolean)).size },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-5 text-center">
            <p className="text-[12px] text-[#A8A29E] font-medium mb-1">{s.label}</p>
            <p className="text-[22px] font-bold text-[#0F0F10] tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <EmptyState title="Aucun wallet" description="Les wallets Dfns apparaitront ici" />
      ) : (
        <div className="space-y-6">
          {Object.entries(byNetwork).map(([networkId, nws]) => {
            const n = net(networkId);
            return (
              <div key={networkId}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: n.color }}>{n.icon}</div>
                  <h3 className="text-[14px] font-semibold text-[#0F0F10]">{n.name}</h3>
                  <span className="text-[12px] text-[#A8A29E]">({nws.length})</span>
                </div>
                <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[rgba(0,0,29,0.06)] bg-[rgba(0,0,23,0.02)]">
                        <th className="px-5 py-2.5 text-[12px] text-[#A8A29E] font-medium text-left">Nom</th>
                        <th className="px-5 py-2.5 text-[12px] text-[#A8A29E] font-medium text-left">Adresse</th>
                        <th className="px-5 py-2.5 text-[12px] text-[#A8A29E] font-medium text-left">Client ID</th>
                        <th className="px-5 py-2.5 text-[12px] text-[#A8A29E] font-medium text-left">Statut</th>
                        <th className="px-5 py-2.5 text-[12px] text-[#A8A29E] font-medium text-left">Cree le</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nws.map(w => (
                        <tr key={w.id} className="border-b border-[rgba(0,0,29,0.04)] hover:bg-[rgba(0,0,23,0.015)] transition-colors">
                          <td className="px-5 py-3 text-[13px] font-medium text-[#0F0F10]">{w.name || '—'}</td>
                          <td className="px-5 py-3 font-mono text-[12px] text-[#787881]">{truncAddr(w.address, 10)}</td>
                          <td className="px-5 py-3 font-mono text-[11px] text-[#A8A29E]">{w.externalId || '—'}</td>
                          <td className="px-5 py-3"><Badge variant={w.status === 'Active' ? 'success' : 'warning'}>{w.status}</Badge></td>
                          <td className="px-5 py-3 text-[12px] text-[#787881]">{w.dateCreated ? new Date(w.dateCreated).toLocaleDateString('fr-FR') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const DEMO_ALL_WALLETS = [
  { id: 'wa-001', network: 'EthereumSepolia', name: 'Dupont-Moreau ETH', address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD38', status: 'Active', externalId: '001SF001', dateCreated: '2024-11-15T10:30:00Z' },
  { id: 'wa-002', network: 'Bitcoin', name: 'Dupont-Moreau BTC', address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', status: 'Active', externalId: '001SF001', dateCreated: '2024-11-20T14:00:00Z' },
  { id: 'wa-003', network: 'Polygon', name: 'Helvetia Polygon', address: '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199', status: 'Active', externalId: '001SF002', dateCreated: '2024-12-01T09:00:00Z' },
  { id: 'wa-004', network: 'EthereumSepolia', name: 'Helvetia Treasury', address: '0xdD2FD4581271e230360230F9337D5c0430Bf44C0', status: 'Active', externalId: '001SF002', dateCreated: '2024-10-05T11:15:00Z' },
  { id: 'wa-005', network: 'Solana', name: 'Dr. Martens SOL', address: '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV', status: 'Active', externalId: '001SF004', dateCreated: '2025-01-10T16:00:00Z' },
  { id: 'wa-006', network: 'Cardano', name: 'Nordic ADA Custody', address: 'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer', status: 'Active', externalId: '001SF005', dateCreated: '2025-02-01T08:30:00Z' },
  { id: 'wa-007', network: 'ArbitrumOne', name: 'Al-Rashid Arbitrum', address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', status: 'Active', externalId: '001SF007', dateCreated: '2025-01-22T13:45:00Z' },
  { id: 'wa-008', network: 'Base', name: 'Bergmann Base', address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', status: 'Active', externalId: '001SF008', dateCreated: '2025-03-01T10:00:00Z' },
];
