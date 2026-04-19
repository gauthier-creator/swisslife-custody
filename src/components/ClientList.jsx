import { useState, useEffect, useCallback } from 'react';
import { fetchClients } from '../services/salesforceApi';
import {
  fmtEUR, fmtCompactEUR, Badge, Card, EmptyState, Avatar,
  SkeletonCircle, Skeleton, useCountUp,
  PageHeader, StatusDot, Timestamp, SignatureMark, FleuronRule,
  Metric, MetricRow,
} from './shared';
import {
  ProductCard, ProductCarousel,
  SceneVault, SceneArch, SceneWaves, SceneDocument, SceneKeys,
  MandatCard, MandatCarousel, MarbleHero,
} from './ProductCards';
import { IconClients } from './icons';

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

export default function ClientList({ onSelectClient, onNavigate }) {
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
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────── */}
      <PageHeader
        icon={<IconClients size={18} />}
        title="Clients"
        trailing={
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-[#8A8278] pointer-events-none"
              fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={handleSearch}
              placeholder="Rechercher un client…"
              aria-label="Rechercher un client"
              className="h-9 pl-9 pr-3 w-[260px] text-[13px] bg-white border border-[#E7E7E7] rounded-[6px] outline-none focus-visible:border-[#7C5E3C] focus-visible:ring-[3px] focus-visible:ring-[rgba(124,94,60,0.12)] placeholder:text-[#8A8278] transition-[border-color,box-shadow] duration-150"
            />
          </div>
        }
      />

      {/* ── Aggregate strip — 3 concise KPIs, hairline-separated (banker context) */}
      {!loading && clients.length > 0 && (
        <div className="grid grid-cols-3 divide-x divide-[#E7E7E7] bg-white border border-[#E7E7E7] rounded-[10px] px-2">
          <div className="px-6 py-4">
            <p className="text-[11px] font-medium text-[#8A8278]">Actifs sous gestion</p>
            <p className="mt-1 text-[22px] font-semibold text-[#0F0F10] tabular-nums leading-[1.1]" style={{ letterSpacing: '-0.02em' }}>
              <CountUpNumber value={totalAum} format={fmtCompactEUR} />
            </p>
          </div>
          <div className="px-6 py-4">
            <p className="text-[11px] font-medium text-[#8A8278]">Clients actifs</p>
            <p className="mt-1 text-[22px] font-semibold text-[#0F0F10] tabular-nums leading-[1.1]" style={{ letterSpacing: '-0.02em' }}>
              <CountUpNumber value={clients.length} />
            </p>
          </div>
          <div className="px-6 py-4">
            <p className="text-[11px] font-medium text-[#8A8278]">UHNWI · Institutionnel</p>
            <p className="mt-1 text-[22px] font-semibold text-[#0F0F10] tabular-nums leading-[1.1]" style={{ letterSpacing: '-0.02em' }}>
              {uhnwiCount} · {institutionalCount}
            </p>
          </div>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────── */}
      {error && (
        <div className="px-5 py-4 bg-white border border-[rgba(220,38,38,0.2)] rounded-[8px]">
          <p className="text-[13px] text-[#991B1B] font-medium tracking-[-0.003em]">{error}</p>
        </div>
      )}

      {/* ── Clients list ───────────────────────────────── */}
      {loading ? (
        <Card className="animate-slide-up stagger-2">
          <div className="px-6 py-4 flex items-center justify-between border-b border-[#E7E7E7]">
            <Skeleton className="h-[14px]" style={{ width: 180 }} />
            <Skeleton className="h-[12px]" style={{ width: 90 }} />
          </div>
          <ul>
            {Array.from({ length: 6 }).map((_, i) => (
              <li
                key={i}
                className="flex items-center gap-5 px-6 py-5 border-b border-[#E7E7E7] last:border-0 row-stagger"
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
            <div className="px-6 py-4 flex items-center justify-between border-b border-[#E7E7E7]">
              <div>
                <h2 className="text-[15px] font-medium text-[#0A0A0A] tracking-[-0.015em]">Registre des clients</h2>
                <p className="text-[12.5px] text-[#5D5D5D] mt-0.5 tracking-[-0.003em]">
                  Triés par nom · {clients.length} résultat{clients.length > 1 ? 's' : ''}
                </p>
              </div>
              <div className="hidden md:flex items-center gap-2 text-[11px] font-medium text-[#5D5D5D] uppercase tracking-[0.04em]">
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
                  className={`row-stagger flex items-center gap-5 px-6 py-5 cursor-pointer hover:bg-white transition-colors group ${i < clients.length - 1 ? 'border-b border-[#E7E7E7]' : ''}`}
                >
                  <Avatar name={client.name} size={44} verified={client.type === 'Customer - Direct'} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <p className="text-[15px] font-medium text-[#0A0A0A] tracking-[-0.015em] truncate">
                        {client.name}
                      </p>
                      <Badge variant={typeVariant(client.type)} size="sm" dot>{typeLabel(client.type)}</Badge>
                    </div>
                    <p className="text-[13px] text-[#5D5D5D] mt-1 truncate tracking-[-0.003em]">
                      {[client.city, client.country].filter(Boolean).join(' · ') || '—'}
                      {client.industry && <span className="text-[#8A8278]"> · {client.industry}</span>}
                    </p>
                  </div>
                  <div className="hidden md:block text-right flex-shrink-0 w-40">
                    <p className="text-[15px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.02em]">
                      {client.aum ? fmtEUR(client.aum) : '—'}
                    </p>
                    <p className="text-[11px] font-medium text-[#8A8278] mt-0.5 tracking-[0.02em] uppercase">
                      {client.accountNumber ? `№ ${client.accountNumber}` : 'AUM'}
                    </p>
                  </div>
                  <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[#8A8278] group-hover:text-[#0A0A0A] group-hover:bg-[#F5F3EE] transition-all">
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

      {/* ── Editorial signature footer ─────────────────── */}
      <footer className="pt-10 mt-4 border-t border-[#E7E7E7] space-y-4">
        <SignatureMark name="G. Alexandrian" role="Banquier privé" location="Paris" />
        <div className="flex items-center justify-between text-[10.5px] text-[#8A8278] tracking-[0.06em] uppercase font-medium">
          <span>SwissLife Banque Privée · 7 rue Boudreau, 75009 Paris</span>
          <span>AMF · ACPR · Tracfin · MiCA Art. 60</span>
        </div>
      </footer>
    </div>
  );
}
