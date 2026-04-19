import { useState, useEffect } from 'react';
import { listWallets } from '../services/dfnsApi';
import { SUPPORTED_NETWORKS } from '../config/constants';
import {
  Badge, EmptyState, Card, SectionCard, PageHeader, StatusDot,
  Metric, MetricRow, Table, tdCls, tdMuted, trCls, FooterDisclosure,
  Skeleton, SkeletonRow, CopyButton, useCountUp,
} from './shared';
import { MarbleHero } from './ProductCards';
import { IconWallets } from './icons';

function CountUpNumber({ value, format = (v) => v }) {
  const display = useCountUp(value);
  return <>{format(display)}</>;
}

/* ─────────────────────────────────────────────────────────
   WalletList — Editorial DFNS custody registry
   Grouped by network · tabular numerals · hairline tables
   ───────────────────────────────────────────────────────── */

const truncAddr = (a, n = 8) => a ? `${a.slice(0, n)}…${a.slice(-n)}` : '—';

export default function WalletList() {
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listWallets();
      setWallets(data);
    } catch { setWallets([]); }
    setLoading(false);
  };

  const net = (id) => SUPPORTED_NETWORKS.find(n => n.id === id) || { icon: '?', color: '#9B9B9B', name: id };

  const filtered = search
    ? wallets.filter(w =>
        (w.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (w.address || '').toLowerCase().includes(search.toLowerCase()) ||
        (w.externalId || '').includes(search)
      )
    : wallets;

  const byNetwork = {};
  filtered.forEach(w => {
    const key = w.network || 'Unknown';
    if (!byNetwork[key]) byNetwork[key] = [];
    byNetwork[key].push(w);
  });

  const activeCount = wallets.filter(w => w.status === 'Active').length;
  const networkCount = Object.keys(byNetwork).length;
  const clientCount = new Set(wallets.map(w => w.externalId).filter(Boolean)).size;

  return (
    <div className="space-y-10">
      {/* ── Header ─────────────────────────────────────── */}
      <PageHeader
        icon={<IconWallets size={18} />}
        title="Wallets"
        trailing={
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-[#8A8278] pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un wallet…"
              aria-label="Rechercher un wallet"
              className="h-9 pl-9 pr-3 w-[260px] text-[13px] bg-white border border-[#E7E7E7] rounded-[6px] outline-none focus-visible:border-[#7C5E3C] focus-visible:ring-[3px] focus-visible:ring-[rgba(124,94,60,0.12)] placeholder:text-[#8A8278] transition-[border-color,box-shadow] duration-150"
            />
          </div>
        }
      />

      {/* Network chips — Ramify filter pattern. Unique to WalletList: crypto
         networks are the natural grouping, not arbitrary KPIs. */}
      {!loading && wallets.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            className="inline-flex items-center gap-2 h-8 px-3 rounded-[6px] bg-[#1E1E1E] text-white text-[12.5px] font-semibold"
          >
            Tous
            <span className="tabular-nums text-[#C8BEA4]">{wallets.length}</span>
          </button>
          {Object.entries(byNetwork).map(([networkId, nws]) => {
            const n = net(networkId);
            return (
              <button
                key={networkId}
                className="inline-flex items-center gap-2 h-8 px-3 rounded-[6px] bg-white border border-[#E7E7E7] text-[#5D5D5D] hover:text-[#1E1E1E] hover:border-[#D1D5DB] text-[12.5px] font-semibold transition-colors"
              >
                <span className="w-3.5 h-3.5 rounded-[3px] flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: n.color }}>{n.icon}</span>
                {n.name}
                <span className="tabular-nums text-[#8A8278]">{nws.length}</span>
              </button>
            );
          })}
          <span className="ml-auto text-[11.5px] text-[#8A8278] tabular-nums">
            Threshold MPC 2 / 3 · {clientCount} client{clientCount > 1 ? 's' : ''} lié{clientCount > 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* ── Content ───────────────────────────────────── */}
      {loading ? (
        <div className="space-y-8 animate-slide-up stagger-2">
          {Array.from({ length: 2 }).map((_, g) => (
            <Card key={g}>
              <div className="px-6 py-4 border-b border-[#E7E7E7] flex items-center gap-3">
                <Skeleton className="h-7 w-7 rounded-[8px]" />
                <Skeleton className="h-[14px]" style={{ width: 140 }} />
                <Skeleton className="h-[11px]" style={{ width: 60 }} />
              </div>
              <table className="w-full">
                <tbody>
                  {Array.from({ length: 3 }).map((_, r) => (
                    <SkeletonRow key={r} cols={5} className="row-stagger" />
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            illustration="wallet"
            title={search ? "Aucun wallet trouvé" : "Aucun wallet"}
            description={search
              ? "Affinez votre recherche ou vérifiez la synchronisation DFNS."
              : "Les wallets DFNS apparaîtront ici dès leur provisionnement."}
          />
        </Card>
      ) : (
        <div className="space-y-8 animate-slide-up stagger-3">
          {Object.entries(byNetwork).map(([networkId, nws]) => {
            const n = net(networkId);
            return (
              <SectionCard
                key={networkId}
                noBodyPadding
                title={
                  <span className="flex items-center gap-3">
                    <span
                      className="w-7 h-7 rounded-[8px] flex items-center justify-center text-white text-[11px] font-bold tracking-tight"
                      style={{ backgroundColor: n.color, boxShadow: '0 1px 2px rgba(10,10,10,0.1)' }}
                    >
                      {n.icon}
                    </span>
                    <span>{n.name}</span>
                    <span className="text-[11px] font-medium text-[#8A8278] tracking-[0.06em] uppercase tabular-nums">
                      {nws.length} wallet{nws.length > 1 ? 's' : ''}
                    </span>
                  </span>
                }
                action={<Badge variant="default">Threshold 2/3 MPC</Badge>}
              >
                <Table headers={['Nom', 'Adresse', 'Client', 'Statut', { label: 'Créé le', right: true }]}>
                  {nws.map((w, i) => (
                    <tr key={w.id} className={`${trCls} row-stagger`} style={{ '--i': i }}>
                      <td className={tdCls + ' font-medium'}>
                        <div className="flex items-center gap-3">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: w.status === 'Active' ? '#16A34A' : '#CA8A04' }} />
                          {w.name || '—'}
                        </div>
                      </td>
                      <td className={tdMuted + ' font-mono text-[12px]'}>
                        <span className="inline-flex items-center gap-1 group/addr">
                          <span>{truncAddr(w.address, 10)}</span>
                          {w.address && (
                            <span className="opacity-0 group-hover/addr:opacity-100 transition-opacity">
                              <CopyButton value={w.address} label="" />
                            </span>
                          )}
                        </span>
                      </td>
                      <td className={tdMuted + ' font-mono text-[11px] tracking-[0.02em]'}>{w.externalId || '—'}</td>
                      <td className="px-6 py-4">
                        <Badge variant={w.status === 'Active' ? 'success' : 'warning'} dot>
                          {w.status}
                        </Badge>
                      </td>
                      <td className={tdMuted + ' text-right tabular-nums'}>
                        {w.dateCreated
                          ? new Date(w.dateCreated).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </Table>
              </SectionCard>
            );
          })}
        </div>
      )}

      <FooterDisclosure right="DFNS · Chainalysis KYT · Travel Rule Art. 7b" />
    </div>
  );
}
