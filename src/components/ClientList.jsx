import { useState, useEffect, useCallback } from 'react';
import { fetchClients } from '../services/salesforceApi';
import { fmtEUR, EmptyState, Spinner } from './shared';

/* ─────────────────────────────────────────────────────────
   Client directory — editorial index
   Names set in Fraunces · hairlines · whisper-in reveal
   ───────────────────────────────────────────────────────── */

const typeLabel = (t) => {
  if (t === 'Customer - Direct') return 'Personne physique';
  if (t === 'Other') return 'Institutionnel';
  if (t === 'Institutional') return 'Institutionnel';
  return t || 'Client';
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
      {/* ── Editorial header ─────────────────────────────── */}
      <header className="mb-12">
        <p className="eyebrow mb-4">Index · {clients.length.toString().padStart(2, '0')}</p>
        <h1 className="font-display-tight text-[72px] leading-[0.92] text-[#0B0B0C]">
          Clients
        </h1>
        <p className="mt-5 text-[15px] text-[#6B6B70] max-w-xl leading-relaxed">
          Les personnes et institutions que vous accompagnez dans la conservation
          de leurs actifs numériques.
        </p>
      </header>

      {/* ── Search — bottom rule only ────────────────────── */}
      <div className="flex items-center justify-between border-b border-[rgba(11,11,12,0.08)] pb-4 mb-2">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <svg className="w-4 h-4 text-[#A8A8AD]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.25}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={handleSearch}
            placeholder="Rechercher par nom"
            className="flex-1 bg-transparent border-0 outline-none text-[15px] text-[#0B0B0C] placeholder:text-[#A8A8AD] placeholder:font-light py-1"
          />
        </div>
        <span className="eyebrow">
          {loading ? '···' : `${clients.length} résultats`}
        </span>
      </div>

      {error && (
        <div className="mt-6 py-4 px-5 border-l-2 border-[#7A2424] bg-[rgba(122,36,36,0.04)]">
          <p className="text-[13px] text-[#7A2424]">{error}</p>
        </div>
      )}

      {/* ── Listing ──────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-32"><Spinner /></div>
      ) : clients.length === 0 ? (
        <EmptyState
          title="Aucun client"
          description="Affinez votre recherche ou vérifiez la connexion Salesforce."
        />
      ) : (
        <ul className="stagger">
          {clients.map((client, idx) => (
            <li
              key={client.id}
              onClick={() => onSelectClient(client)}
              className="group cursor-pointer border-b border-[rgba(11,11,12,0.08)] py-7 transition-colors hover:bg-[rgba(11,11,12,0.015)]"
            >
              <div className="flex items-baseline gap-6">
                {/* Index number */}
                <span className="eyebrow text-[#A8A8AD] tabular w-8 flex-shrink-0">
                  {String(idx + 1).padStart(2, '0')}
                </span>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-[28px] leading-[1.1] text-[#0B0B0C] truncate">
                    {client.name}
                  </h3>
                  <div className="mt-2 flex items-center gap-4 text-[12px] text-[#6B6B70]">
                    <span>{typeLabel(client.type)}</span>
                    {(client.city || client.country) && (
                      <>
                        <span className="text-[#CFCFD1]">·</span>
                        <span>{[client.city, client.country].filter(Boolean).join(', ')}</span>
                      </>
                    )}
                    {client.industry && (
                      <>
                        <span className="text-[#CFCFD1]">·</span>
                        <span>{client.industry}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* AUM */}
                <div className="text-right flex-shrink-0">
                  {client.aum ? (
                    <>
                      <p className="font-display text-[22px] text-[#0B0B0C] tabular leading-none">
                        {fmtEUR(client.aum)}
                      </p>
                      <p className="eyebrow mt-2">Actifs sous gestion</p>
                    </>
                  ) : (
                    <p className="eyebrow text-[#A8A8AD]">Non renseigné</p>
                  )}
                </div>

                {/* Chevron */}
                <svg
                  className="w-4 h-4 text-[#CFCFD1] group-hover:text-[#0B0B0C] transition-colors flex-shrink-0"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.25}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
