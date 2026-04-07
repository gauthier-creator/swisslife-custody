import { useState, useEffect, useCallback } from 'react';
import { fetchClients } from '../services/salesforceApi';
import { mockClients } from '../data/mockClients';
import { supabase } from '../lib/supabase';
import { fmtEUR, Badge, EmptyState, Spinner } from './shared';

export default function ClientList({ onSelectClient }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [isDemo, setIsDemo] = useState(null); // null = not yet known

  // Load config first, then clients
  useEffect(() => {
    supabase.from('custody_api_config').select('sf_instance_url').limit(1).single().then(({ data }) => {
      const demo = !data || data.sf_instance_url === 'mock';
      setIsDemo(demo);
    }).catch(() => setIsDemo(true));
  }, []);

  const loadClients = useCallback(async (q = '', demo = true) => {
    setLoading(true);
    setError(null);
    try {
      if (demo) {
        const filtered = q
          ? mockClients.filter(c => c.name.toLowerCase().includes(q.toLowerCase()))
          : mockClients;
        setClients(filtered);
      } else {
        const data = await fetchClients(q);
        setClients(data);
      }
    } catch (err) {
      setError(err.message);
      setClients(mockClients);
    }
    setLoading(false);
  }, []);

  // Load clients once isDemo is known
  useEffect(() => {
    if (isDemo !== null) loadClients('', isDemo);
  }, [isDemo, loadClients]);

  const handleSearch = (e) => {
    setSearch(e.target.value);
    clearTimeout(window._searchTimeout);
    window._searchTimeout = setTimeout(() => loadClients(e.target.value, isDemo), 300);
  };

  return (
    <div className="page-slide-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[22px] font-semibold text-[#0F0F10] tracking-tight">Clients</h2>
          <p className="text-[13px] text-[#787881] mt-0.5">
            {clients.length} client{clients.length > 1 ? 's' : ''} {isDemo ? '(demo)' : 'Salesforce'}
          </p>
        </div>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A8A29E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={handleSearch}
            placeholder="Rechercher un client..."
            className="pl-10 pr-4 py-2 text-[13px] bg-white border border-[rgba(0,0,29,0.1)] rounded-xl w-72 outline-none focus:border-[rgba(0,0,29,0.25)] transition-colors"
          />
        </div>
      </div>

      {error && (
        <div className="bg-[#FFFBEB] border border-[rgba(217,119,6,0.1)] rounded-xl px-4 py-3 mb-4 text-[13px] text-[#D97706]">
          {error} — Donnees de demonstration affichees
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner /></div>
      ) : clients.length === 0 ? (
        <EmptyState
          title="Aucun client trouve"
          description="Modifiez votre recherche ou verifiez la connexion Salesforce"
        />
      ) : (
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-[rgba(0,0,29,0.06)] bg-[rgba(0,0,23,0.02)]">
                <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Client</th>
                <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Type</th>
                <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Localisation</th>
                <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium text-right">AUM</th>
                <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Industrie</th>
                <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="stagger-rows">
              {clients.map(client => (
                <tr
                  key={client.id}
                  onClick={() => onSelectClient(client)}
                  className="border-b border-[rgba(0,0,29,0.04)] hover:bg-[rgba(0,0,23,0.02)] cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <p className="text-[13px] font-medium text-[#0F0F10]">{client.name}</p>
                    {client.phone && <p className="text-[11px] text-[#A8A29E] mt-0.5">{client.phone}</p>}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant={client.type === 'Institutional' ? 'info' : client.type === 'UHNWI' ? 'success' : 'default'}>
                      {client.type || '—'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-[#787881]">
                    {[client.city, client.country].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right text-[13px] font-medium text-[#0F0F10] tabular-nums">
                    {client.aum ? fmtEUR(client.aum) : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-[#787881]">{client.industry || '—'}</td>
                  <td className="px-5 py-3.5">
                    <svg className="w-4 h-4 text-[#A8A29E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
