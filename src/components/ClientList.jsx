import { useState, useEffect, useCallback } from 'react';
import { fetchClients } from '../services/salesforceApi';
import { fmtEUR, Badge, Card, EmptyState, Spinner } from './shared';

/* ─────────────────────────────────────────────────────────
   ClientList — compact fintech table
   ───────────────────────────────────────────────────────── */

const typeLabel = (t) => {
  if (t === 'Customer - Direct') return 'UHNWI';
  if (t === 'Other' || t === 'Institutional') return 'Institutionnel';
  return t || '—';
};
const typeVariant = (t) => {
  if (t === 'Customer - Direct') return 'success';
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

  return (
    <div>
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold text-[#09090B] tracking-tight">Clients</h1>
          <p className="text-[13px] text-[#71717A] mt-0.5">
            {loading ? 'Chargement…' : `${clients.length} client${clients.length > 1 ? 's' : ''} Salesforce`}
          </p>
        </div>
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A1A1AA] pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={handleSearch}
            placeholder="Rechercher un client…"
            className="h-8 pl-8 pr-3 w-72 text-[13px] bg-white border border-[rgba(9,9,11,0.1)] rounded-md outline-none focus:border-[rgba(9,9,11,0.3)] focus:ring-2 focus:ring-[rgba(9,9,11,0.06)] placeholder:text-[#A1A1AA] transition-colors"
          />
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────── */}
      {error && (
        <div className="mb-4 px-4 py-2.5 bg-[#FEF2F2] border border-[rgba(239,68,68,0.2)] rounded-md">
          <p className="text-[13px] text-[#B91C1C]">{error}</p>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner /></div>
      ) : clients.length === 0 ? (
        <Card>
          <EmptyState
            title="Aucun client"
            description="Modifiez votre recherche ou vérifiez la connexion Salesforce."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[rgba(9,9,11,0.08)] bg-[#FAFAFA]">
                <th className="text-left px-4 h-9 text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">Client</th>
                <th className="text-left px-4 h-9 text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">Type</th>
                <th className="text-left px-4 h-9 text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">Localisation</th>
                <th className="text-right px-4 h-9 text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">AUM</th>
                <th className="text-left px-4 h-9 text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">Industrie</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {clients.map(client => (
                <tr
                  key={client.id}
                  onClick={() => onSelectClient(client)}
                  className="border-b border-[rgba(9,9,11,0.06)] last:border-0 hover:bg-[#FAFAFA] cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-[#09090B]">{client.name}</div>
                    {client.phone && (
                      <div className="text-[12px] text-[#71717A] mt-0.5">{client.phone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={typeVariant(client.type)}>{typeLabel(client.type)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-[#71717A]">
                    {[client.city, client.country].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-[#09090B] tabular-nums">
                    {client.aum ? fmtEUR(client.aum) : '—'}
                  </td>
                  <td className="px-4 py-3 text-[#71717A]">{client.industry || '—'}</td>
                  <td className="px-4 py-3">
                    <svg className="w-3.5 h-3.5 text-[#A1A1AA]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
