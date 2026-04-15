import { useState, useEffect, useCallback } from 'react';
import { fetchClients } from '../services/salesforceApi';
import { fmtEUR, Badge, Card, EmptyState, Spinner, Avatar, KPITile, Sparkline, Delta } from './shared';

/* ─────────────────────────────────────────────────────────
   ClientList — Revolut-inspired portfolio cockpit
   Hero KPI strip · stylized client list with colorful avatars
   ───────────────────────────────────────────────────────── */

const typeLabel = (t) => {
  if (t === 'Customer - Direct') return 'UHNWI';
  if (t === 'Other' || t === 'Institutional') return 'Institutionnel';
  return t || '—';
};
const typeVariant = (t) => {
  if (t === 'Customer - Direct') return 'gold';
  if (t === 'Other' || t === 'Institutional') return 'info';
  return 'default';
};

export default function ClientList({ onSelectClient }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);

  const loadClients = useCallback(async (q = '') => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchClients(q);
      setClients(data);
    } catch (err) {
      setError(err.message);
      setClients([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadClients(''); }, [loadClients]);

  const handleSearch = (e) => {
    setSearch(e.target.value);
    clearTimeout(window._searchTimeout);
    window._searchTimeout = setTimeout(() => loadClients(e.target.value), 280);
  };

  // ── Aggregated KPIs from client portfolio ──────────
  const totalAum = clients.reduce((sum, c) => sum + (Number(c.aum) || 0), 0);
  const uhnwiCount = clients.filter(c => c.type === 'Customer - Direct').length;
  const institutionalCount = clients.filter(c => c.type === 'Other' || c.type === 'Institutional').length;

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <p className="text-[13px] font-medium text-[#75808A]">Portefeuille clients</p>
          <h1 className="text-[32px] font-semibold text-[#191C1F] tracking-[-0.6px] leading-[1.1] mt-1">
            Clients
          </h1>
          <p className="text-[14px] text-[#75808A] mt-1">
            {loading ? 'Chargement…' : `${clients.length} client${clients.length > 1 ? 's' : ''} Salesforce · synchronisé à l'instant`}
          </p>
        </div>
        <div className="relative">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#75808A] pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={handleSearch}
            placeholder="Rechercher un client…"
            className="h-11 pl-11 pr-4 w-80 text-[14px] bg-white border border-[rgba(25,28,31,0.06)] rounded-full outline-none focus:border-[#0666EB] focus:ring-4 focus:ring-[rgba(6,102,235,0.1)] placeholder:text-[#A5ADB6] shadow-[0_0_20px_-10px_rgba(0,0,0,0.12)] transition-all"
          />
        </div>
      </div>

      {/* ── KPI hero strip ──────────────────────────────── */}
      {!loading && clients.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPITile
            label="AUM total"
            value={fmtEUR(totalAum)}
            delta={<Delta value="2.4%" positive tone="#00BE90" prefix="+" />}
            tone="blue"
            visual={<Sparkline tone="blue" width={180} height={40} />}
          />
          <KPITile
            label="Clients"
            value={clients.length}
            delta={<span className="text-[12px] font-medium text-[#75808A]">Ce mois</span>}
            tone="pink"
            visual={<Sparkline tone="pink" points={[0.3, 0.4, 0.35, 0.5, 0.55, 0.7, 0.65, 0.8, 0.9]} width={180} height={40} />}
          />
          <KPITile
            label="UHNWI"
            value={uhnwiCount}
            delta={<Badge variant="gold" size="sm" dot>Premium</Badge>}
            visual={
              <div className="flex items-center gap-1">
                {[0,1,2,3].map(i => (
                  <div key={i} className="w-1.5 h-8 rounded-full" style={{ background: i < Math.min(uhnwiCount, 4) ? '#EC7E00' : '#FDEFDB' }} />
                ))}
              </div>
            }
          />
          <KPITile
            label="Institutionnels"
            value={institutionalCount}
            delta={<Badge variant="info" size="sm" dot>B2B</Badge>}
            visual={
              <div className="flex items-center gap-1">
                {[0,1,2,3].map(i => (
                  <div key={i} className="w-1.5 h-8 rounded-full" style={{ background: i < Math.min(institutionalCount, 4) ? '#0666EB' : '#E6F0FD' }} />
                ))}
              </div>
            }
          />
        </div>
      )}

      {/* ── Error ───────────────────────────────────────── */}
      {error && (
        <div className="px-5 py-4 bg-[#FDECEE] border border-[rgba(236,76,90,0.2)] rounded-2xl">
          <p className="text-[13px] text-[#C93545] font-medium">{error}</p>
        </div>
      )}

      {/* ── Clients list ────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner size="w-6 h-6" /></div>
      ) : clients.length === 0 ? (
        <Card className="py-4">
          <EmptyState
            title="Aucun client"
            description="Modifiez votre recherche ou vérifiez la connexion Salesforce."
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="px-5 py-4 flex items-center justify-between border-b border-[rgba(25,28,31,0.06)]">
            <h2 className="text-[15px] font-semibold text-[#191C1F] tracking-[-0.15px]">Tous les clients</h2>
            <p className="text-[13px] text-[#75808A] font-medium">{clients.length} résultat{clients.length > 1 ? 's' : ''}</p>
          </div>
          <ul>
            {clients.map((client, i) => (
              <li
                key={client.id}
                onClick={() => onSelectClient(client)}
                className={`flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[#F7F8FA] transition-colors ${i < clients.length - 1 ? 'border-b border-[rgba(25,28,31,0.06)]' : ''}`}
              >
                <Avatar name={client.name} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[15px] font-semibold text-[#191C1F] tracking-[-0.15px] truncate">
                      {client.name}
                    </p>
                    <Badge variant={typeVariant(client.type)} size="sm" dot>{typeLabel(client.type)}</Badge>
                  </div>
                  <p className="text-[13px] text-[#75808A] mt-0.5 truncate">
                    {[client.city, client.country].filter(Boolean).join(' · ') || '—'}
                    {client.industry && <span className="text-[#A5ADB6]"> · {client.industry}</span>}
                  </p>
                </div>
                <div className="hidden sm:block text-right flex-shrink-0 w-32">
                  <p className="text-[11px] font-medium text-[#75808A] uppercase tracking-wider">AUM</p>
                  <p className="text-[16px] font-semibold text-[#191C1F] tabular-nums tracking-[-0.2px] mt-0.5">
                    {client.aum ? fmtEUR(client.aum) : '—'}
                  </p>
                </div>
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#F7F8FA] flex items-center justify-center text-[#75808A]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
