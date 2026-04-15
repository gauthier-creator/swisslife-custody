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
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────── */}
      <PageHeader
        duoIcon={{ name: 'clients', tone: 'bronze' }}
        eyebrow="Registre privé"
        title="Clients"
        trailing={
          <>
            <div className="relative">
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
                className="h-10 pl-10 pr-4 w-[300px] text-[13px] bg-white border border-[rgba(10,10,10,0.1)] rounded-[10px] outline-none focus:border-[rgba(124,94,60,0.4)] focus:ring-4 focus:ring-[rgba(124,94,60,0.1)] placeholder:text-[#9B9B9B] tracking-[-0.006em] transition-[border-color,box-shadow] duration-200"
              />
            </div>
            <div className="flex items-center gap-3">
              <StatusDot tone="success" label="Salesforce sync" />
              <span className="h-4 w-px bg-[rgba(10,10,10,0.1)]" />
              <Timestamp label="Registre" />
            </div>
          </>
        }
      />

      {/* ── Marble hero (live KPIs) — Ramify signature ─── */}
      {!loading && clients.length > 0 && (
        <div className="animate-slide-up stagger-1">
          <MarbleHero
            marble="peach"
            seed={5}
            eyebrow="Cockpit du banquier privé"
            title="Vos clients, vos mandats, en un seul coup d'œil."
            description="Le registre Salesforce est synchronisé en temps réel avec la chambre forte DFNS. Chaque mouvement est horodaté et signé par quorum MPC."
            primaryCta={{
              label: 'Nouveau mandat',
              icon: (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              ),
            }}
            secondaryCta={{ label: 'Guide AMF · Onboarding' }}
            meta={['Salesforce sync', 'ACPR registre', 'Tracfin ready']}
          />
        </div>
      )}

      {/* ── Metric row — Mercury-style strip ─────────────── */}
      {!loading && clients.length > 0 && (
        <div className="animate-slide-up stagger-2">
          <MetricRow>
            <Metric
              label="Actifs sous gestion"
              value={<CountUpNumber value={totalAum} format={fmtCompactEUR} />}
              delta="+2.4%"
              caption="12 mois"
              progress={Math.min(100, (totalAum / 100_000_000) * 100)}
            />
            <Metric
              label="Clients actifs"
              value={<CountUpNumber value={clients.length} />}
              caption="Registre Salesforce"
              progress={Math.min(100, clients.length * 8)}
            />
            <Metric
              label="UHNWI"
              value={<CountUpNumber value={uhnwiCount} />}
              caption={clients.length ? `${Math.round((uhnwiCount / clients.length) * 100)}% du livre` : '—'}
              progress={clients.length ? (uhnwiCount / clients.length) * 100 : 0}
            />
            <Metric
              label="Ticket moyen"
              value={<CountUpNumber value={avgAum} format={fmtCompactEUR} />}
              caption="Par mandat"
              progress={Math.min(100, (avgAum / 20_000_000) * 100)}
            />
          </MetricRow>
        </div>
      )}

      {/* ── Mandats — marble portfolio tiles (Ramify style) ─ */}
      {!loading && clients.length > 0 && (
        <div className="animate-slide-up stagger-3">
          <MandatCarousel
            eyebrow="Mandats de conservation"
            title="Les portefeuilles SwissLife Custody."
            trailing={
              <span className="hidden md:inline-flex items-center gap-1.5 h-9 px-3 mr-2 rounded-full bg-[#FBFAF7] border border-[rgba(10,10,10,0.08)] text-[11px] font-medium text-[#6B6B6B] tracking-[-0.003em]">
                <span className="w-1 h-1 rounded-full bg-[#C8924B]" />
                4 tiers
              </span>
            }
          >
            <MandatCard
              label="Essential"
              marble="pearl"
              seed={2}
              assetClasses={['Bitcoin', 'Ethereum', 'Stablecoins']}
              disabled={['Private Assets', 'Staking']}
            />
            <MandatCard
              label="Privilège"
              marble="ivory"
              seed={5}
              assetClasses={['BTC', 'ETH', 'SOL', 'Stablecoins', 'Staking']}
              disabled={['Private Assets']}
            />
            <MandatCard
              label="Flagship"
              marble="peach"
              seed={8}
              assetClasses={['BTC', 'ETH', 'Multi-chain', 'Staking', 'Private Assets']}
            />
            <MandatCard
              label="Institutionnel"
              marble="bronze"
              seed={11}
              assetClasses={['BTC', 'ETH', 'Multi-chain', 'OTC', 'Tracfin Reporting']}
            />
          </MandatCarousel>
        </div>
      )}

      {/* ── Editorial hairline break ────────────────────── */}
      {!loading && clients.length > 0 && (
        <FleuronRule className="max-w-md mx-auto opacity-90" />
      )}

      {/* ── Product carousel — editorial product tiles ── */}
      {!loading && clients.length > 0 && (
        <div className="animate-slide-up stagger-3">
          <ProductCarousel
            eyebrow="Explorez les services"
            title="Les rails institutionnels SwissLife Custody."
          >
            <ProductCard
              category="Conservation"
              categoryIcon={
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              }
              title="Chambre forte DFNS, signée par quorum MPC."
              description="Clés privées réparties en 3 shards · signature 2/3 · audit on-chain horodaté. Aucune clé en clair, jamais."
              scene={<SceneVault />}
              onClick={() => window.alert('Conservation — détails bientôt')}
            />
            <ProductCard
              category="Gouvernance"
              categoryIcon={
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              }
              title="Politiques quatre-yeux & audit ACPR."
              description="Chaque mouvement déclenche une règle d'approbation versionnée et horodatée dans le journal d'audit réglementaire."
              scene={<SceneArch />}
            />
            <ProductCard
              category="Surveillance"
              categoryIcon={
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
                </svg>
              }
              title="Chainalysis KYT & screening temps réel."
              description="Pré-filtrage AML à la milliseconde · sanctions OFAC/UE · PPE · Travel Rule Art. 7b — tout flux suspect est bloqué."
              scene={<SceneWaves />}
            />
            <ProductCard
              category="Reporting"
              categoryIcon={
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              title="Mandats signés & reporting ACPR automatisé."
              description="Génération des déclarations Tracfin, extraits pour commissaires aux comptes, sceau numérique Sℓ horodaté."
              scene={<SceneDocument />}
            />
            <ProductCard
              category="Multi-chain"
              categoryIcon={
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              }
              title="Ethereum, Bitcoin, Solana — une seule interface."
              description="Bitcoin natif, tous les EVM, Solana, Cosmos · provisionnement de wallet en un clic · reconciliation temps réel."
              scene={<SceneKeys />}
            />
          </ProductCarousel>
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
                  <Avatar name={client.name} size={44} verified={client.type === 'Customer - Direct'} />
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

      {/* ── Editorial signature footer ─────────────────── */}
      <footer className="pt-10 mt-4 border-t border-[rgba(10,10,10,0.06)] space-y-4">
        <SignatureMark name="G. Alexandrian" role="Banquier privé" location="Paris" />
        <div className="flex items-center justify-between text-[10.5px] text-[#9B9B9B] tracking-[0.06em] uppercase font-medium">
          <span>SwissLife Banque Privée · 7 rue Boudreau, 75009 Paris</span>
          <span>AMF · ACPR · Tracfin · MiCA Art. 60</span>
        </div>
      </footer>
    </div>
  );
}
