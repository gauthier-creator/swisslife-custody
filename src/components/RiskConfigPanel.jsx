import { useState, useEffect } from 'react';
import { fetchRiskConfig, saveRiskConfig } from '../services/complianceApi';
import {
  Badge, Spinner, Button, SectionCard, EmptyState,
  inputCls, selectCls, labelCls, fmtEUR,
} from './shared';
import { useAuth } from '../context/AuthContext';
import { SUPPORTED_NETWORKS } from '../config/constants';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

/* ─────────────────────────────────────────────────────────
   Risk vocabulary — SwissLife bronze palette
   (no purple, no indigo). Each level has a Badge variant
   so the display stays on-brand with the rest of the app.
   ───────────────────────────────────────────────────────── */
const RISK_LEVELS = [
  { id: 'low',      label: 'Faible',   variant: 'success', dotColor: '#16A34A' },
  { id: 'standard', label: 'Standard', variant: 'gold',    dotColor: '#C8924B' },
  { id: 'high',     label: 'Élevé',    variant: 'warning', dotColor: '#CA8A04' },
  { id: 'critical', label: 'Critique', variant: 'error',   dotColor: '#DC2626' },
];

const FATCA_STATUSES = [
  { id: 'pending',       label: 'En attente',   variant: 'warning' },
  { id: 'compliant',     label: 'Conforme',     variant: 'success' },
  { id: 'non_compliant', label: 'Non conforme', variant: 'error'   },
  { id: 'exempt',        label: 'Exemptée',     variant: 'info'    },
];

const DEFAULT_CONFIG = {
  risk_level: 'standard',
  max_single_transfer: 50000,
  max_daily_volume: 200000,
  approval_threshold: 25000,
  whitelist_only: false,
  allowed_networks: ['Ethereum', 'EthereumSepolia', 'Bitcoin'],
  pep_status: false,
  fatca_status: 'pending',
  last_review_date: new Date().toISOString().split('T')[0],
  next_review_date: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
};

/* Sub-primitive: vertical field row with bronze eyebrow ----- */
function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[#7C5E3C] uppercase tracking-[0.1em]">
        <span className="w-1 h-1 rounded-full bg-[#C8924B]" />
        {label}
      </p>
      {children}
    </div>
  );
}

/* Sub-primitive: bronze toggle switch ---------------------- */
function Toggle({ on, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      className={`relative inline-flex items-center w-[38px] h-[22px] rounded-full transition-colors duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(124,94,60,0.22)] ${
        on ? 'bg-[#7C5E3C]' : 'bg-[rgba(10,10,10,0.12)]'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(10,10,10,0.2)] transition-transform duration-200 ${
          on ? 'translate-x-[18px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  );
}

export default function RiskConfigPanel({ client }) {
  const { isAdmin } = useAuth();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);

  useEffect(() => { load(); }, [client.id]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchRiskConfig(client.id);
      setConfig(data);
    } catch (err) {
      console.error('fetchRiskConfig error:', err);
      setConfig(null);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const data = await saveRiskConfig(client.id, DEFAULT_CONFIG);
      setConfig(data);
    } catch (err) {
      console.error('saveRiskConfig error:', err);
      alert('Erreur : ' + err.message);
    }
    setSaving(false);
  };

  const startEdit = () => {
    setDraft({
      risk_level: config.risk_level || 'standard',
      max_single_transfer: config.max_single_transfer || 0,
      max_daily_volume: config.max_daily_volume || 0,
      approval_threshold: config.approval_threshold || 0,
      whitelist_only: config.whitelist_only || false,
      allowed_networks: config.allowed_networks || [],
      pep_status: config.pep_status || false,
      fatca_status: config.fatca_status || 'pending',
      last_review_date: config.last_review_date || '',
      next_review_date: config.next_review_date || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await saveRiskConfig(client.id, draft);
      setConfig(data);
      setEditing(false);
      setDraft(null);
    } catch (err) {
      console.error('saveRiskConfig error:', err);
      alert('Erreur : ' + err.message);
    }
    setSaving(false);
  };

  const toggleNetwork = (netId) => {
    setDraft(d => ({
      ...d,
      allowed_networks: d.allowed_networks.includes(netId)
        ? d.allowed_networks.filter(n => n !== netId)
        : [...d.allowed_networks, netId],
    }));
  };

  const riskInfo = (level) => RISK_LEVELS.find(r => r.id === level) || RISK_LEVELS[1];
  const fatcaInfo = (status) => FATCA_STATUSES.find(f => f.id === status) || FATCA_STATUSES[0];
  const netInfo = (id) => SUPPORTED_NETWORKS.find(n => n.id === id) || { icon: '?', color: '#9B9B9B', name: id };

  /* ── Loading state ─────────────────────────────────────── */
  if (loading) {
    return (
      <SectionCard title="Configuration de risque" caption="Paramètres AMLD5 · Tracfin">
        <div className="flex justify-center py-10">
          <Spinner size="w-5 h-5" />
        </div>
      </SectionCard>
    );
  }

  /* ── No config yet ────────────────────────────────────── */
  if (!config) {
    return (
      <SectionCard title="Configuration de risque" caption="Paramètres AMLD5 · Tracfin">
        <EmptyState
          illustration="shield"
          title="Aucune configuration"
          description="Définissez les paramètres de risque pour ce client selon les seuils AMLD5 et la politique interne SwissLife."
          action={
            isAdmin && (
              <Button variant="primary" size="md" onClick={handleCreate} disabled={saving}>
                {saving ? 'Création…' : 'Configurer'}
              </Button>
            )
          }
        />
      </SectionCard>
    );
  }

  const risk = riskInfo(editing ? draft.risk_level : config.risk_level);
  const fatca = fatcaInfo(editing ? draft.fatca_status : config.fatca_status);
  const currentNetworks = editing ? draft.allowed_networks : (config.allowed_networks || []);
  const currentPep = editing ? draft.pep_status : config.pep_status;
  const currentWhitelistOnly = editing ? draft.whitelist_only : config.whitelist_only;

  return (
    <SectionCard
      title="Configuration de risque"
      caption="Paramètres AMLD5 · Tracfin"
      action={
        isAdmin && !editing && (
          <Button variant="ghost" size="sm" onClick={startEdit}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z" />
            </svg>
            Modifier
          </Button>
        )
      }
    >
      <div className="space-y-5">
        {/* Risk level */}
        <Field label="Niveau de risque">
          {editing ? (
            <select
              value={draft.risk_level}
              onChange={e => setDraft(d => ({ ...d, risk_level: e.target.value }))}
              className={selectCls}
            >
              {RISK_LEVELS.map(r => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          ) : (
            <Badge variant={risk.variant} dot>{risk.label}</Badge>
          )}
        </Field>

        {/* Limits block — grouped, hairline separators */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-[rgba(10,10,10,0.06)]">
          <Field label="Transfert max. unique">
            {editing ? (
              <input
                type="number"
                value={draft.max_single_transfer}
                onChange={e => setDraft(d => ({ ...d, max_single_transfer: Number(e.target.value) }))}
                className={inputCls}
              />
            ) : (
              <p className="text-[14px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.01em]">
                {fmtEUR(config.max_single_transfer)}
              </p>
            )}
          </Field>
          <Field label="Volume max. journalier">
            {editing ? (
              <input
                type="number"
                value={draft.max_daily_volume}
                onChange={e => setDraft(d => ({ ...d, max_daily_volume: Number(e.target.value) }))}
                className={inputCls}
              />
            ) : (
              <p className="text-[14px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.01em]">
                {fmtEUR(config.max_daily_volume)}
              </p>
            )}
          </Field>
          <Field label="Seuil d'approbation">
            {editing ? (
              <input
                type="number"
                value={draft.approval_threshold}
                onChange={e => setDraft(d => ({ ...d, approval_threshold: Number(e.target.value) }))}
                className={inputCls}
              />
            ) : (
              <p className="text-[14px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.01em]">
                {fmtEUR(config.approval_threshold)}
              </p>
            )}
          </Field>
        </div>

        {/* Controls block */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[rgba(10,10,10,0.06)]">
          <Field label="Whitelist uniquement">
            {editing ? (
              <div className="flex items-center gap-3">
                <Toggle
                  on={currentWhitelistOnly}
                  onChange={(v) => setDraft(d => ({ ...d, whitelist_only: v }))}
                />
                <span className="text-[12px] text-[#6B6B6B] tracking-[-0.003em]">
                  {currentWhitelistOnly ? 'Transferts restreints' : 'Libre'}
                </span>
              </div>
            ) : (
              <Badge variant={currentWhitelistOnly ? 'gold' : 'default'} dot>
                {currentWhitelistOnly ? 'Activée' : 'Désactivée'}
              </Badge>
            )}
          </Field>

          <Field label="Personne politiquement exposée (PEP)">
            {editing ? (
              <div className="flex items-center gap-3">
                <Toggle
                  on={currentPep}
                  onChange={(v) => setDraft(d => ({ ...d, pep_status: v }))}
                />
                <span className="text-[12px] text-[#6B6B6B] tracking-[-0.003em]">
                  {currentPep ? 'Diligence renforcée' : 'Standard'}
                </span>
              </div>
            ) : (
              <Badge variant={currentPep ? 'error' : 'success'} dot>
                {currentPep ? 'Oui' : 'Non'}
              </Badge>
            )}
          </Field>
        </div>

        {/* Networks */}
        <div className="pt-2 border-t border-[rgba(10,10,10,0.06)]">
          <Field label="Réseaux autorisés">
            {editing ? (
              <div className="flex flex-wrap gap-1.5">
                {SUPPORTED_NETWORKS.map(n => {
                  const active = draft.allowed_networks.includes(n.id);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => toggleNetwork(n.id)}
                      className={`inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[11.5px] font-medium border tracking-[-0.003em] transition-all ${
                        active
                          ? 'bg-[#FBF6EC] text-[#7C5E3C] border-[rgba(124,94,60,0.28)]'
                          : 'bg-white text-[#9B9B9B] border-[rgba(10,10,10,0.1)] hover:border-[rgba(124,94,60,0.22)] hover:text-[#6B6B6B]'
                      }`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: active ? n.color : '#D4D4D4' }}
                      />
                      {n.name}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {currentNetworks.length > 0 ? (
                  currentNetworks.map(nId => {
                    const n = netInfo(nId);
                    return (
                      <span
                        key={nId}
                        className="inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[11.5px] font-medium bg-[#FBF6EC] text-[#7C5E3C] border border-[rgba(124,94,60,0.22)] tracking-[-0.003em]"
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: n.color }} />
                        {n.name}
                      </span>
                    );
                  })
                ) : (
                  <span className="text-[12px] text-[#9B9B9B]">Aucun réseau configuré</span>
                )}
              </div>
            )}
          </Field>
        </div>

        {/* FATCA */}
        <div className="pt-2 border-t border-[rgba(10,10,10,0.06)]">
          <Field label="Statut FATCA">
            {editing ? (
              <select
                value={draft.fatca_status}
                onChange={e => setDraft(d => ({ ...d, fatca_status: e.target.value }))}
                className={selectCls}
              >
                {FATCA_STATUSES.map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            ) : (
              <Badge variant={fatca.variant} dot>{fatca.label}</Badge>
            )}
          </Field>
        </div>

        {/* Review dates */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[rgba(10,10,10,0.06)]">
          <Field label="Dernière revue">
            {editing ? (
              <input
                type="date"
                value={draft.last_review_date || ''}
                onChange={e => setDraft(d => ({ ...d, last_review_date: e.target.value }))}
                className={inputCls}
              />
            ) : (
              <p className="text-[13px] text-[#4A4A4A] tabular-nums tracking-[-0.003em]">
                {fmtDate(config.last_review_date)}
              </p>
            )}
          </Field>
          <Field label="Prochaine revue">
            {editing ? (
              <input
                type="date"
                value={draft.next_review_date || ''}
                onChange={e => setDraft(d => ({ ...d, next_review_date: e.target.value }))}
                className={inputCls}
              />
            ) : (
              <p className="text-[13px] text-[#4A4A4A] tabular-nums tracking-[-0.003em]">
                {fmtDate(config.next_review_date)}
              </p>
            )}
          </Field>
        </div>

        {/* Edit actions */}
        {editing && (
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-[rgba(10,10,10,0.08)]">
            <Button
              variant="ghost"
              size="md"
              onClick={() => { setEditing(false); setDraft(null); }}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Sauvegarde…' : 'Enregistrer'}
            </Button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
