import { useState, useEffect, useCallback } from 'react';
import { fetchClients } from '../services/salesforceApi';
import {
  fmtEUR, fmtCompactEUR, Badge, Card, EmptyState, Avatar,
  SkeletonCircle, Skeleton, useCountUp,
  PageHeader, StatusDot, Timestamp, SignatureMark, FleuronRule,
  Metric, MetricRow,
  SubSection, LinkList, LinkListItem,
} from './shared';
import { BrandGlyph } from './BrandGlyphs';
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

      {/* ── Ramify Accueil pattern — 2-column grid, different sizes:
           LEFT wide (8/12) = counter module (the "nombre de clients" block)
           RIGHT narrow (4/12) = "Accompagnement compliance" officer card
       */}
      {!loading && clients.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* LEFT — Activité du livre.
              Structure densifiée pour équilibrer avec la card Cellule RCSI
              (qui a un hero gradient + CTA) et éviter le vide en bas :
              ① bandeau 4 KPI · ② répartition du livre (stacked bar + légende)
              → un banquier voit son livre en un coup d'œil. */}
          <div className="lg:col-span-8 bg-white border border-[#E7E7E7] rounded-[10px] p-6 flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[16px] font-semibold text-[#0F0F10]" style={{ letterSpacing: '-0.012em' }}>
                Activité du livre
              </h2>
              <StatusDot tone="success" label="Salesforce sync" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
              {[
                { k: 'Actifs sous gestion', v: <CountUpNumber value={totalAum} format={fmtCompactEUR} />, c: 'Mandats actifs', p: Math.min(100, (totalAum / 100_000_000) * 100), delta: '+2.4%' },
                { k: 'Clients',             v: <CountUpNumber value={clients.length} />,                 c: `${clients.length > 1 ? 'actifs' : 'actif'} · Salesforce`, p: Math.min(100, clients.length * 8) },
                { k: 'UHNWI',               v: <CountUpNumber value={uhnwiCount} />,                     c: clients.length ? `${Math.round((uhnwiCount / clients.length) * 100)}% du livre` : '—', p: clients.length ? (uhnwiCount / clients.length) * 100 : 0 },
                { k: 'Ticket moyen',        v: <CountUpNumber value={avgAum} format={fmtCompactEUR} />,  c: 'Par mandat', p: Math.min(100, (avgAum / 20_000_000) * 100) },
              ].map(({ k, v, c, p, delta }) => (
                <div key={k}>
                  <p className="text-[11px] font-medium text-[#8A8278]">{k}</p>
                  <p className="mt-1.5 text-[22px] font-semibold text-[#0F0F10] tabular-nums leading-[1.1]" style={{ letterSpacing: '-0.02em' }}>
                    {v}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {delta && <span className="text-[11.5px] font-semibold text-[#0F9868] tabular-nums">{delta}</span>}
                    <span className="text-[11.5px] text-[#8A8278]">{c}</span>
                  </div>
                  <div className="progress-bronze mt-2 w-full" style={{ '--value': `${Math.max(6, Math.min(100, p))}%` }} />
                </div>
              ))}
            </div>

            {/* ② Répartition du livre — stacked bar + legend.
                AUM réparti par segment de clientèle. Aide le banquier à voir
                où est la concentration (trop d'UHNWI ? corporate stagne ?). */}
            {(() => {
              const uhnwiAum = clients.filter(c => c.type === 'Customer - Direct').reduce((s, c) => s + (Number(c.aum) || 0), 0);
              const corpAum  = clients.filter(c => c.type === 'Other' || c.type === 'Institutional').reduce((s, c) => s + (Number(c.aum) || 0), 0);
              const hnwiAum  = Math.max(0, totalAum - uhnwiAum - corpAum);
              const tot = totalAum || 1;
              // Palette alignée avec les ProductCards cream/parchment :
              // bronze profond → champagne gold → taupe chaleureux.
              // Abandon du charcoal #1E1E1E qui faisait dissonance avec le
              // reste du livre (trop dur visuellement).
              const segs = [
                { k: 'UHNWI',     aum: uhnwiAum, color: '#8A6A3E' }, // bronze profond, refined
                { k: 'HNWI',      aum: hnwiAum,  color: '#D4B58A' }, // champagne gold, lumineux
                { k: 'Corporate', aum: corpAum,  color: '#7A7163' }, // warm graphite / taupe
              ];
              return (
                <div className="mt-6 pt-5 border-t border-[#E7E7E7]">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-semibold text-[#8A8278] uppercase tracking-[0.08em]">
                      Répartition du livre par segment
                    </p>
                    <p className="text-[11.5px] text-[#8A8278] tabular-nums">
                      {fmtCompactEUR(totalAum)} au total
                    </p>
                  </div>
                  <div className="flex h-2 rounded-[3px] overflow-hidden bg-[#F3F2EE]">
                    {segs.map((s, i) => (
                      <div
                        key={s.k}
                        className="h-full transition-all duration-700"
                        style={{
                          width: `${Math.max(2, (s.aum / tot) * 100)}%`,
                          background: s.color,
                          transitionDelay: `${i * 80}ms`,
                        }}
                        title={`${s.k}: ${fmtCompactEUR(s.aum)} (${Math.round((s.aum / tot) * 100)}%)`}
                      />
                    ))}
                  </div>
                  <ul className="mt-3 grid grid-cols-3 gap-4">
                    {segs.map((s) => {
                      const count =
                        s.k === 'UHNWI' ? uhnwiCount
                        : s.k === 'Corporate' ? institutionalCount
                        : Math.max(0, clients.length - uhnwiCount - institutionalCount);
                      return (
                        <li key={s.k} className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: s.color }} />
                            <span className="text-[12px] font-semibold text-[#0F0F10] truncate">{s.k}</span>
                            <span className="text-[11px] text-[#8A8278] tabular-nums">· {count}</span>
                          </div>
                          <div className="mt-1 flex items-baseline gap-2">
                            <span className="text-[15px] font-semibold text-[#0F0F10] tabular-nums">
                              {fmtCompactEUR(s.aum)}
                            </span>
                            <span className="text-[11px] text-[#8A8278] tabular-nums">
                              {Math.round((s.aum / tot) * 100)}%
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })()}
          </div>

          {/* RIGHT — Accompagnement compliance (Ramify pattern: officer photo + CTA) */}
          <aside className="lg:col-span-4 bg-white border border-[#E7E7E7] rounded-[10px] p-6 flex flex-col">
            <p className="text-[11px] font-semibold text-[#8A8278] uppercase tracking-[0.1em] mb-3">
              Accompagnement compliance
            </p>
            <div className="flex-1 relative rounded-[8px] overflow-hidden bg-gradient-to-br from-[#F4F2ED] to-[#E8E4DA] min-h-[180px] flex items-end p-5">
              {/* Subtle marble veining for identity */}
              <svg viewBox="0 0 300 200" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                <path d="M -10 60 Q 100 40, 200 80 T 320 60" stroke="rgba(124,94,60,0.06)" strokeWidth="1" fill="none" />
                <path d="M -10 140 Q 80 115, 220 150 T 320 120" stroke="rgba(124,94,60,0.04)" strokeWidth="1" fill="none" />
              </svg>
              <div className="relative">
                <h3 className="text-[18px] font-semibold text-[#0F0F10] leading-[1.2]" style={{ letterSpacing: '-0.014em' }}>
                  Cellule RCSI
                </h3>
                <p className="text-[12.5px] text-[#5D5D5D] mt-1">
                  Support compliance 24 / 7 · Tracfin · ACPR
                </p>
              </div>
            </div>
            <button
              type="button"
              className="cta-secondary w-full mt-4"
              onClick={() => onNavigate?.('compliance')}
            >
              Contacter le RCSI
            </button>
          </aside>
        </div>
      )}

      {/* ── Services Custody — the identity block ──────────
         Ramify-inspired ProductCards showing SwissLife's 5 custody rails.
         Every card is clickable and jumps to the relevant module, so it's
         also a shortcut-oriented nav for the banker.
       */}
      {!loading && clients.length > 0 && (
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
            cta="Ouvrir wallets"
            onClick={() => onNavigate?.('wallets')}
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
            cta="Voir policies"
            onClick={() => onNavigate?.('policies')}
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
            cta="Accéder"
            onClick={() => onNavigate?.('compliance')}
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
            cta="Générer"
            onClick={() => onNavigate?.('compliance')}
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
            cta="Provisionner"
            onClick={() => onNavigate?.('wallets')}
          />
        </ProductCarousel>
      )}

      {/* ── Section title for the client register ──────── */}
      {!loading && clients.length > 0 && (
        <div className="flex items-end justify-between gap-6 pt-2">
          <div>
            <h2 className="text-[18px] font-semibold text-[#0F0F10]" style={{ letterSpacing: '-0.014em' }}>
              Registre clients
            </h2>
            <p className="text-[12.5px] text-[#8A8278] mt-0.5 tabular-nums">
              {clients.length} actif{clients.length > 1 ? 's' : ''} · {uhnwiCount} UHNWI · {institutionalCount} institutionnel{institutionalCount > 1 ? 's' : ''}
            </p>
          </div>
          <Timestamp label="Mis à jour" />
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

      {/* ── Ramify-style sous-section: Ressources & compliance ────
         Inline list without card wrapper — section title + LinkList.
         Mixes internal shortcuts (compliance cockpit, audit export) and
         external resources (ACPR / MiCA guides). Each row is a LinkListItem
         with a bespoke BrandGlyph icon on the left, title + subtitle middle,
         hover chevron right. */}
      {!loading && clients.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-2 pt-6">
          <SubSection
            title="Ressources compliance"
            subtitle="Documentation opérationnelle mise à jour en continu"
          >
            <LinkList>
              <LinkListItem
                icon={<BrandGlyph name="scroll" size={16} />}
                title="Guide ACPR · Custody d'actifs numériques"
                subtitle="Questionnaire LCB-FT · obligations CASP"
                onClick={() => window.open('https://acpr.banque-france.fr', '_blank', 'noopener')}
                tone="cream"
              />
              <LinkListItem
                icon={<BrandGlyph name="hex" size={16} />}
                title="Checklist MiCA Art. 60 & 75"
                subtitle="Ségrégation des actifs · politique de conservation"
                onClick={() => onNavigate?.('policies')}
                tone="cream"
              />
              <LinkListItem
                icon={<BrandGlyph name="eye" size={16} />}
                title="Rapport Tracfin mensuel"
                subtitle="Déclarations SAR / STR déposées"
                onClick={() => onNavigate?.('compliance')}
                tone="peach"
              />
            </LinkList>
          </SubSection>

          <SubSection
            title="Accompagnement"
            subtitle="Chat direct avec les équipes opérationnelles"
          >
            <LinkList>
              <LinkListItem
                icon={<BrandGlyph name="infinity" size={16} />}
                title="Cellule RCSI"
                subtitle="Support conformité 24 / 7 via messagerie interne"
                onClick={() => onNavigate?.('compliance')}
                tone="blue"
              />
              <LinkListItem
                icon={<BrandGlyph name="key" size={16} />}
                title="Support DFNS · Clés MPC"
                subtitle="Rotation · cérémonie de clé · audit crypto"
                onClick={() => onNavigate?.('wallets')}
                tone="cream"
              />
              <LinkListItem
                icon={<BrandGlyph name="crest" size={16} />}
                title="Juridique SwissLife"
                subtitle="Contrats-cadres · mandats · clauses MiCA"
                href="mailto:juridique@swisslife-banque-privee.fr"
                tone="cream"
              />
            </LinkList>
          </SubSection>
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
