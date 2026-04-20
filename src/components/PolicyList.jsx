import { useState, useEffect } from 'react';
import { listPolicies, createPolicy } from '../services/dfnsApi';
import {
  Badge, Modal, Spinner, EmptyState, inputCls, selectCls, labelCls,
  PageHeader, Metric, MetricRow, Card, Button, FooterDisclosure, StatusDot,
} from './shared';
import { MarbleHero } from './ProductCards';
import { IconPolicies } from './icons';

/* ─────────────────────────────────────────────────────────
   PolicyList — Governance rules · DFNS approval policies
   Editorial header · refined policy cards · shield motif
   ───────────────────────────────────────────────────────── */

const activityLabel = (k) => {
  if (k === 'Wallets:Sign') return 'Signature de wallet';
  if (k === 'Wallets:IncomingTransaction') return 'Transaction entrante';
  if (k === 'Wallets:TransferAsset') return "Transfert d'actif";
  return k;
};

const ruleLabel = (k) => {
  if (k === 'AlwaysRequireApproval') return 'Approbation systématique';
  if (k === 'RequestApproval') return 'Approbation conditionnelle';
  return k || '—';
};

export default function PolicyList() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', activityKind: 'Wallets:Sign', rule: 'AlwaysRequireApproval' });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listPolicies();
      setPolicies(data);
    } catch { setPolicies([]); }
    setLoading(false);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createPolicy({
        name: form.name,
        description: form.description,
        activityKind: form.activityKind,
        rule: { kind: form.rule, configuration: {} },
      });
      await load();
      setShowCreate(false);
      setForm({ name: '', description: '', activityKind: 'Wallets:Sign', rule: 'AlwaysRequireApproval' });
    } catch (err) { alert(err.message); }
    setCreating(false);
  };

  const activeCount = policies.filter(p => p.status === 'Active').length;
  const pendingCount = policies.filter(p => p.status === 'Pending').length;

  return (
    <div className="space-y-10">
      {/* ── Header ─────────────────────────────────────── */}
      <PageHeader
        icon={<IconPolicies size={18} />}
        title="Policies"
        trailing={
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nouvelle politique
          </Button>
        }
      />

      {/* State filter chips — governance UIs show status pills, not KPI cards */}
      {!loading && policies.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button className="inline-flex items-center gap-2 h-8 px-3 rounded-[6px] bg-[#1E1E1E] text-white text-[12.5px] font-semibold">
            Toutes
            <span className="tabular-nums text-[#C8BEA4]">{policies.length}</span>
          </button>
          <button className="inline-flex items-center gap-2 h-8 px-3 rounded-[6px] bg-white border border-[#E7E7E7] text-[#5D5D5D] hover:text-[#1E1E1E] hover:border-[#D1D5DB] text-[12.5px] font-semibold transition-colors">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0F9868]" />
            Actives
            <span className="tabular-nums text-[#8A8278]">{activeCount}</span>
          </button>
          {pendingCount > 0 && (
            <button className="inline-flex items-center gap-2 h-8 px-3 rounded-[6px] bg-white border border-[#E7E7E7] text-[#5D5D5D] hover:text-[#1E1E1E] hover:border-[#D1D5DB] text-[12.5px] font-semibold transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-[#CA8A04]" />
              En attente
              <span className="tabular-nums text-[#8A8278]">{pendingCount}</span>
            </button>
          )}
          <span className="ml-auto text-[11.5px] text-[#8A8278]">
            Quorum MPC 2 / 3 · Quatre-yeux actif
          </span>
        </div>
      )}

      {/* ── List ── 2-col asymmetric: policies grid 8/12 + activity sidebar 4/12 */}
      {loading ? (
        <div className="flex items-center justify-center py-24"><Spinner size="w-6 h-6" /></div>
      ) : policies.length === 0 ? (
        <Card>
          <EmptyState
            illustration="shield"
            title="Aucune politique"
            description="Configurez des politiques d'approbation pour encadrer les opérations et appliquer le principe des quatre yeux."
            action={<Button variant="primary" onClick={() => setShowCreate(true)}>Créer la première politique</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4 animate-slide-up stagger-3 content-start">
            {policies.map((pol, i) => (
              <PolicyCard key={pol.id} pol={pol} index={i} />
            ))}
          </div>

          {/* Sidebar — Quatre-yeux governance at a glance.
              items-start sur le grid parent : la sidebar ne s'étire plus
              au-delà de sa hauteur naturelle quand la grille policies est
              courte (1-2 policies). */}
          <aside className="lg:col-span-4 space-y-4">
            <div className="bg-white border border-[#E7E7E7] rounded-[10px] p-5">
              <p className="text-[11px] font-semibold text-[#8A8278] uppercase tracking-[0.1em] mb-3">
                Règle quatre-yeux
              </p>
              <p className="text-[13px] text-[#5D5D5D] leading-[1.55] mb-4">
                Chaque opération sensible (transfert, whitelisting, rotation de clé)
                requiert <span className="text-[#0F0F10] font-semibold">deux approbateurs distincts</span>.
                Conforme ACPR LCB-FT article 14.
              </p>
              <div className="space-y-2.5 pt-3 border-t border-[#E7E7E7]">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] text-[#5D5D5D]">Approbateurs enregistrés</span>
                  <span className="text-[12.5px] text-[#0F0F10] font-semibold tabular-nums">3</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] text-[#5D5D5D]">Délai moyen d'approbation</span>
                  <span className="text-[12.5px] text-[#0F0F10] font-semibold tabular-nums">4 min</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] text-[#5D5D5D]">Taux d'approbation 30j</span>
                  <span className="text-[12.5px] text-[#0F9868] font-semibold tabular-nums">98%</span>
                </div>
              </div>
            </div>

            {/* Policy distribution — stacked bar + legend. Shows active vs
                pending vs inactive policies — immediate governance health. */}
            <div className="bg-white border border-[#E7E7E7] rounded-[10px] p-5">
              <p className="text-[11px] font-semibold text-[#8A8278] uppercase tracking-[0.1em] mb-3">
                Répartition des politiques
              </p>
              {(() => {
                const inactiveCount = policies.length - activeCount - pendingCount;
                const total = Math.max(1, policies.length);
                const segs = [
                  { k: 'Actives',    n: activeCount,    color: '#0F9868' },
                  { k: 'En attente', n: pendingCount,   color: '#CA8A04' },
                  { k: 'Inactives',  n: inactiveCount,  color: '#D1D5DB' },
                ];
                return (
                  <>
                    <div className="flex h-2 rounded-[3px] overflow-hidden bg-[#F3F2EE]">
                      {segs.map(s => (
                        <div
                          key={s.k}
                          className="h-full transition-all"
                          style={{ width: `${(s.n / total) * 100}%`, background: s.color, minWidth: s.n > 0 ? '4px' : 0 }}
                          title={`${s.k}: ${s.n}`}
                        />
                      ))}
                    </div>
                    <ul className="mt-3 space-y-2">
                      {segs.map(s => (
                        <li key={s.k} className="flex items-center justify-between text-[12.5px]">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-[2px]" style={{ background: s.color }} />
                            <span className="text-[#1E1E1E]">{s.k}</span>
                          </span>
                          <span className="text-[#0F0F10] font-semibold tabular-nums">{s.n}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                );
              })()}
            </div>

            <div className="bg-white border border-[#E7E7E7] rounded-[10px] p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-semibold text-[#8A8278] uppercase tracking-[0.1em]">
                  Conformité
                </p>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-[#0F9868] font-semibold">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Conforme
                </span>
              </div>
              <ul className="space-y-2 text-[12.5px]">
                <li className="flex items-center gap-2 text-[#5D5D5D]">
                  <span className="w-1 h-1 rounded-full bg-[#0F9868]" />
                  ACPR · LCB-FT Art. 14
                </li>
                <li className="flex items-center gap-2 text-[#5D5D5D]">
                  <span className="w-1 h-1 rounded-full bg-[#0F9868]" />
                  MiCA Art. 66 · gouvernance
                </li>
                <li className="flex items-center gap-2 text-[#5D5D5D]">
                  <span className="w-1 h-1 rounded-full bg-[#0F9868]" />
                  Tracfin · journal d'audit
                </li>
                <li className="flex items-center gap-2 text-[#5D5D5D]">
                  <span className="w-1 h-1 rounded-full bg-[#0F9868]" />
                  DFNS · quorum MPC 2 / 3
                </li>
              </ul>
            </div>
          </aside>
        </div>
      )}

      {/* ── Create Policy Modal ───────────────────────── */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Nouvelle politique"
        subtitle="Définissez une règle d'approbation appliquée à un type d'opération wallet. Les changements sont horodatés dans le journal d'audit."
      >
        <div className="space-y-5">
          <div>
            <label className={labelCls}>Nom</label>
            <input className={inputCls} placeholder="Ex. Transferts > 10 000 €" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <input className={inputCls} placeholder="Contexte, seuils, exceptions…" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Type d'activité</label>
              <select className={selectCls} value={form.activityKind} onChange={e => setForm(p => ({ ...p, activityKind: e.target.value }))}>
                <option value="Wallets:Sign">Signature de wallet</option>
                <option value="Wallets:IncomingTransaction">Transaction entrante</option>
                <option value="Wallets:TransferAsset">Transfert d'actif</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Règle</label>
              <select className={selectCls} value={form.rule} onChange={e => setForm(p => ({ ...p, rule: e.target.value }))}>
                <option value="AlwaysRequireApproval">Toujours approuver</option>
                <option value="RequestApproval">Conditionnel</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-5 border-t border-[#E7E7E7]">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Annuler</Button>
            <Button variant="primary" onClick={handleCreate} disabled={creating || !form.name}>
              {creating && <Spinner />}
              {creating ? 'Création…' : 'Créer la politique'}
            </Button>
          </div>
        </div>
      </Modal>

      <FooterDisclosure right="DFNS Governance · Quatre yeux · Journal d'audit" />
    </div>
  );
}

/* ─── Refined policy card ─── */
function PolicyCard({ pol, index }) {
  const active = pol.status === 'Active';
  return (
    <Card
      className="p-6 relative overflow-hidden hover:border-[rgba(10,10,10,0.14)] transition-all accent-ruler-left animate-slide-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Bronze ruler accent via utility */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-4 min-w-0">
          {/* Shield mark */}
          <div className="flex-shrink-0 w-10 h-10 rounded-[10px] bg-white border border-[rgba(10,10,10,0.1)] flex items-center justify-center shadow-crisp">
            <svg className="w-[18px] h-[18px] text-[#0A0A0A]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-medium text-[#0A0A0A] tracking-[-0.015em] truncate">{pol.name}</h3>
            {pol.description && (
              <p className="text-[12.5px] text-[#5D5D5D] mt-1 line-clamp-2 tracking-[-0.003em]">{pol.description}</p>
            )}
          </div>
        </div>
        <Badge
          variant={active ? 'success' : pol.status === 'Pending' ? 'warning' : 'default'}
          dot
        >
          {active ? 'Active' : pol.status === 'Pending' ? 'En attente' : pol.status || '—'}
        </Badge>
      </div>

      {/* Meta rows */}
      <div className="pl-[54px] space-y-1.5">
        <div className="flex items-center gap-2 text-[12px] text-[#5D5D5D] tracking-[-0.003em]">
          <span className="w-3 h-px bg-[rgba(10,10,10,0.2)]" />
          <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#8A8278]">Activité</span>
          <span className="text-[#0A0A0A] font-medium">{activityLabel(pol.activityKind)}</span>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[#5D5D5D] tracking-[-0.003em]">
          <span className="w-3 h-px bg-[rgba(10,10,10,0.2)]" />
          <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#8A8278]">Règle</span>
          <span className="text-[#0A0A0A] font-medium">{ruleLabel(pol.rule?.kind)}</span>
        </div>
        {pol.dateCreated && (
          <div className="flex items-center gap-2 text-[12px] text-[#8A8278] tracking-[-0.003em]">
            <span className="w-3 h-px bg-[rgba(10,10,10,0.2)]" />
            <span className="text-[10.5px] font-medium uppercase tracking-[0.06em]">Créée le</span>
            <span className="tabular-nums">{new Date(pol.dateCreated).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
