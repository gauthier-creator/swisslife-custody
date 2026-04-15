import { useState, useEffect } from 'react';
import { listPolicies, createPolicy } from '../services/dfnsApi';
import {
  Badge, Modal, Spinner, EmptyState, inputCls, selectCls, labelCls,
  PageHeader, Metric, MetricRow, Card, Button, FooterDisclosure, StatusDot,
} from './shared';

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
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        }
        title="Policies"
        trailing={
          <>
            <StatusDot tone="bronze" label="Quatre yeux · Actif" />
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Nouvelle politique
            </Button>
          </>
        }
      />

      {/* ── Metrics ───────────────────────────────────── */}
      {!loading && (
        <div className="animate-slide-up stagger-2">
          <MetricRow>
            <Metric label="Politiques actives" value={activeCount} caption="Appliquées en temps réel" />
            <Metric label="En attente" value={pendingCount} caption="Approbation admin requise" />
            <Metric label="Couverture" value={policies.length} caption="Règles définies" />
            <Metric label="Signataires" value="2/3" caption="Quorum MPC threshold" />
          </MetricRow>
        </div>
      )}

      {/* ── List ──────────────────────────────────────── */}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-slide-up stagger-3">
          {policies.map((pol, i) => (
            <PolicyCard key={pol.id} pol={pol} index={i} />
          ))}
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
          <div className="flex justify-end gap-2 pt-5 border-t border-[rgba(10,10,10,0.06)]">
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
              <p className="text-[12.5px] text-[#6B6B6B] mt-1 line-clamp-2 tracking-[-0.003em]">{pol.description}</p>
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
        <div className="flex items-center gap-2 text-[12px] text-[#6B6B6B] tracking-[-0.003em]">
          <span className="w-3 h-px bg-[rgba(10,10,10,0.2)]" />
          <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#9B9B9B]">Activité</span>
          <span className="text-[#0A0A0A] font-medium">{activityLabel(pol.activityKind)}</span>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[#6B6B6B] tracking-[-0.003em]">
          <span className="w-3 h-px bg-[rgba(10,10,10,0.2)]" />
          <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#9B9B9B]">Règle</span>
          <span className="text-[#0A0A0A] font-medium">{ruleLabel(pol.rule?.kind)}</span>
        </div>
        {pol.dateCreated && (
          <div className="flex items-center gap-2 text-[12px] text-[#9B9B9B] tracking-[-0.003em]">
            <span className="w-3 h-px bg-[rgba(10,10,10,0.2)]" />
            <span className="text-[10.5px] font-medium uppercase tracking-[0.06em]">Créée le</span>
            <span className="tabular-nums">{new Date(pol.dateCreated).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          </div>
        )}
      </div>
    </Card>
  );
}
