import { useState, useEffect, useCallback } from 'react';
import { fetchClients } from '../services/salesforceApi';
import {
  fmtEUR, fmtCompactEUR, Badge, Card, EmptyState, Avatar,
  Metric, MetricRow, Delta, SkeletonCircle, Skeleton, useCountUp,
} from './shared';
import { HeroDial, Ornament } from './brand';

// Thin wrapper to animate a numeric metric value on mount
function CountUpNumber({ value, format = (v) => v }) {
  const display = useCountUp(value);
  return <>{format(display)}</>;
}

/* ─────────────────────────────────────────────────────────
   ClientList — Editorial private banking cockpit
   Big display title · Mercury metric row · monochrome list
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

  // ── Aggregates ──────────────────────────────────────
  const totalAum = clients.reduce((sum, c) => sum + (Number(c.aum) || 0), 0);
  const uhnwiCount = clients.filter(c => c.type === 'Customer - Direct').length;
  const institutionalCount = clients.filter(c => c.type === 'Other' || c.type === 'Institutional').length;
  const avgAum = clients.length ? totalAum / clients.length : 0;

  return (
    <div className="space-y-10">
      {/* ── Editorial header ───────────────────────────── */}
      <div className="relative">
        {/* Decorative watch-dial backdrop — pure identity */}
        <HeroDial
          size={340}
          strokeOpacity={0.09}
          className="absolute -right-12 -top-20 pointer-events-none select-none hero-drift hidden md:block"
        />
        <header className="relative flex items-end justify-between gap-8 flex-wrap animate-slide-up">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <span className="w-6 h-px bg-[#7C5E3C]" />
              <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-[#7C5E3C]">
                Portefeuille · Conservation d'actifs
              </p>
            </div>
            <h1 className="display-lg text-[#0A0A0A] mt-3">
              Clients <span className="font-display italic text-[#7C5E3C]">sous mandat</span>
            </h1>
            <p className="text-[15px] text-[#4A4A4A] mt-4 leading-relaxed max-w-xl tracking-[-0.006em]">
              {loading
                ? 'Synchronisation du registre Salesforce…'
                : <>Registre de <span className="text-[#0A0A0A] font-medium">{clients.length} client{clients.length > 1 ? 's' : ''}</span> sous mandat de conservation. Synchronisé à l'instant avec Salesforce Cloud.</>}
            </p>
          </div>

          {/* Search */}
          <div className="relative flex-shrink-0 animate-slide-up stagger-1">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9B9B9B] pointer-events-none"
              fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={handleSearch}
              placeholder="Rechercher un client…"
              className="h-11 pl-10 pr-4 w-[320px] text-[14px] bg-white border border-[rgba(10,10,10,0.1)] rounded-full outline-none focus:border-[rgba(10,10,10,0.35)] focus:ring-4 focus:ring-[rgba(10,10,10,0.04)] placeholder:text-[#9B9B9B] tracking-[-0.006em] transition-all"
            />
          </div>
        </header>
      </div>

      {/* ── Ornamental break ───────────────────────────── */}
      {!loading && clients.length > 0 && (
        <Ornament className="max-w-[620px] mx-auto animate-fade" />
      )}

      {/* ── Metric row — Mercury style ─────────────────── */}
      {!loading && clients.length > 0 && (
        <div className="animate-slide-up stagger-2">
          <MetricRow>
            <Metric
              label="Actifs sous gestion"
              value={<CountUpNumber value={totalAum} format={fmtCompactEUR} />}
              delta={<Delta value="2.4%" positive prefix="+" />}
              caption="12 derniers mois"
            />
            <Metric
              label="Clients actifs"
              value={<CountUpNumber value={clients.length} />}
              caption="Registre Salesforce"
            />
            <Metric
              label="UHNWI"
              value={<CountUpNumber value={uhnwiCount} />}
              caption="Ultra High Net Worth"
            />
            <Metric
              label="AUM moyen"
              value={<CountUpNumber value={avgAum} format={fmtCompactEUR} />}
              caption="Par mandat"
            />
          </MetricRow>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────── */}
      {error && (
        <div className="px-5 py-4 bg-white border border-[rgba(220,38,38,0.2)] rounded-[14px]">
          <p className="text-[13px] text-[#991B1B] font-medium tracking-[-0.003em]">{error}</p>
        </div>
      )}

      {/* ── Clients list ───────────────────────────────── */}
      {loading ? (
        <Card className="animate-slide-up stagger-2">
          <div className="px-6 py-4 flex items-center justify-between border-b border-[rgba(10,10,10,0.06)]">
            <Skeleton className="h-[14px]" style={{ width: 180 }} />
            <Skeleton className="h-[12px]" style={{ width: 90 }} />
          </div>
          <ul>
            {Array.from({ length: 6 }).map((_, i) => (
              <li
                key={i}
                className="flex items-center gap-5 px-6 py-5 border-b border-[rgba(10,10,10,0.06)] last:border-0 row-stagger"
                style={{ '--i': i }}
              >
                <SkeletonCircle size={44} />
                <div className="flex-1 min-w-0 space-y-2">
                  <Skeleton className="h-[14px]" style={{ width: `${55 + ((i * 11) % 25)}%` }} />
                  <Skeleton className="h-[11px]" style={{ width: `${32 + ((i * 7) % 20)}%` }} />
                </div>
                <div className="hidden md:flex flex-col items-end gap-2 w-40">
                  <Skeleton className="h-[14px]" style={{ width: 110 }} />
                  <Skeleton className="h-[10px]" style={{ width: 70 }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : clients.length === 0 ? (
        <Card className="py-4">
          <EmptyState
            title="Aucun client"
            description="Modifiez votre recherche ou vérifiez la connexion à Salesforce Cloud."
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            }
          />
        </Card>
      ) : (
        <div className="animate-slide-up stagger-3">
          <Card>
            <div className="px-6 py-4 flex items-center justify-between border-b border-[rgba(10,10,10,0.06)]">
              <div>
                <h2 className="text-[15px] font-medium text-[#0A0A0A] tracking-[-0.015em]">Registre des clients</h2>
                <p className="text-[12.5px] text-[#6B6B6B] mt-0.5 tracking-[-0.003em]">
                  Triés par nom · {clients.length} résultat{clients.length > 1 ? 's' : ''}
                </p>
              </div>
              <div className="hidden md:flex items-center gap-2 text-[11px] font-medium text-[#6B6B6B] uppercase tracking-[0.04em]">
                <div className="w-40 text-right">Actifs</div>
                <div className="w-8"></div>
              </div>
            </div>
            <ul>
              {clients.map((client, i) => (
                <li
                  key={client.id}
                  onClick={() => onSelectClient(client)}
                  style={{ '--i': i }}
                  className={`row-stagger flex items-center gap-5 px-6 py-5 cursor-pointer hover:bg-[#FBFAF7] transition-colors group ${i < clients.length - 1 ? 'border-b border-[rgba(10,10,10,0.06)]' : ''}`}
                >
                  <Avatar name={client.name} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <p className="text-[15px] font-medium text-[#0A0A0A] tracking-[-0.015em] truncate">
                        {client.name}
                      </p>
                      <Badge variant={typeVariant(client.type)} size="sm" dot>{typeLabel(client.type)}</Badge>
                    </div>
                    <p className="text-[13px] text-[#6B6B6B] mt-1 truncate tracking-[-0.003em]">
                      {[client.city, client.country].filter(Boolean).join(' · ') || '—'}
                      {client.industry && <span className="text-[#9B9B9B]"> · {client.industry}</span>}
                    </p>
                  </div>
                  <div className="hidden md:block text-right flex-shrink-0 w-40">
                    <p className="text-[15px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.02em]">
                      {client.aum ? fmtEUR(client.aum) : '—'}
                    </p>
                    <p className="text-[11px] font-medium text-[#9B9B9B] mt-0.5 tracking-[0.02em] uppercase">
                      {client.accountNumber ? `№ ${client.accountNumber}` : 'AUM'}
                    </p>
                  </div>
                  <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[#9B9B9B] group-hover:text-[#0A0A0A] group-hover:bg-[#F5F3EE] transition-all">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* ── Footer note ────────────────────────────────── */}
      <footer className="pt-8 border-t border-[rgba(10,10,10,0.06)] flex items-center justify-between text-[11px] text-[#9B9B9B] tracking-[0.02em] uppercase font-medium">
        <span>SwissLife Banque Privée · Paris</span>
        <span>AMF · ACPR · Tracfin · MiCA Art. 60</span>
      </footer>
    </div>
  );
}
