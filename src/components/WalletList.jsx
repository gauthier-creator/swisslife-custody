import { useState, useEffect } from 'react';
import { listWallets } from '../services/dfnsApi';
import { SUPPORTED_NETWORKS } from '../config/constants';
import {
  Badge, EmptyState, Card, SectionCard, PageHeader, StatusDot,
  Table, tdCls, tdMuted, trCls, FooterDisclosure,
  Skeleton, SkeletonRow, CopyButton,
} from './shared';
import { MarbleHero } from './ProductCards';

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
        duoIcon={{ name: 'wallets', tone: 'bronze' }}
        eyebrow="Chambre forte DFNS"
        title="Wallets"
        trailing={
          <>
            <div className="relative">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9B9B9B] pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un wallet…"
                className="h-10 pl-10 pr-4 w-[280px] text-[13.5px] bg-white border border-[rgba(10,10,10,0.1)] rounded-[10px] outline-none focus:border-[rgba(10,10,10,0.35)] focus:ring-4 focus:ring-[rgba(10,10,10,0.04)] placeholder:text-[#9B9B9B] tracking-[-0.006em] transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:inline-flex">
                <span className="kbd">⌘K</span>
              </span>
            </div>
            <StatusDot tone="success" label="DFNS sync" />
          </>
        }
      />

      {/* ── Marble hero (live KPIs) ───────────────────── */}
      {!loading && wallets.length > 0 && (
        <div className="animate-slide-up stagger-1">
          <MarbleHero
            marble="peach"
            seed={7}
            eyebrow="Chambre forte DFNS"
            title="Chaque wallet, signé par quorum MPC."
            description="Threshold 2-sur-3 · ségrégation stricte des clés · audit trail on-chain. Reporting MiCA Art. 60 généré en continu."
            primaryCta={{
              label: 'Provisionner un wallet',
              icon: (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              ),
            }}
            secondaryCta={{ label: 'Travel Rule · Art. 7b' }}
            stats={[
              {
                label: 'Wallets provisionnés',
                value: wallets.length,
                caption: `${activeCount} actifs`,
              },
              {
                label: 'Réseaux actifs',
                value: networkCount,
                caption: 'Multi-chain DFNS',
              },
              {
                label: 'Clients liés',
                value: clientCount,
                caption: 'Mandats',
              },
              {
                label: 'Signatures MPC',
                value: '2 / 3',
                caption: 'Threshold actif',
              },
            ]}
          />
        </div>
      )}

      {/* ── Content ───────────────────────────────────── */}
      {loading ? (
        <div className="space-y-8 animate-slide-up stagger-2">
          {Array.from({ length: 2 }).map((_, g) => (
            <Card key={g}>
              <div className="px-6 py-4 border-b border-[rgba(10,10,10,0.06)] flex items-center gap-3">
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
                    <span className="text-[11px] font-medium text-[#9B9B9B] tracking-[0.06em] uppercase tabular-nums">
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
