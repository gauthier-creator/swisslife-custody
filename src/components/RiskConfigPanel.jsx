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
   Risk vocabulary — Demo Bank bronze palette
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

// ─── deriveRiskDefaults ────────────────────────────────────
// Calcule une configuration de risque suggérée depuis le profil Salesforce.
// Le RCSI reste maître — il ajuste avant de valider. Cette dérivation est
// un POINT DE DÉPART informé, pas une décision finale.
//
// Facteurs pris en compte :
//   1. AUM (SFDC AnnualRevenue) → dimensionne les seuils proportionnellement
//   2. Pays (BillingCountry) → juridictions FATF blacklist → critique
//   3. Industrie → secteurs à risque LCB-FT élevé (jeu, cash, crypto)
//   4. Ancienneté du mandat → client récent = posture initiale prudente
//   5. Type de compte → Institutional = plafonds plus hauts
//
// Référence : FATF Recommendation 10 (Customer Due Diligence · Risk-Based Approach)
// et AMLD5 Art. 13 pour la proportionnalité des mesures.
const HIGH_RISK_INDUSTRIES = [
  'gambling', 'gaming', 'casino', 'lottery',
  'crypto', 'cryptocurrency', 'blockchain', 'mining',
  'cash', 'money service', 'money transmitter',
  'arms', 'defense', 'munitions',
  'precious metals', 'diamond',
];
// Juridictions FATF black/grey-list + sanctions UE (non exhaustif, à maintenir)
const HIGH_RISK_COUNTRIES = ['RU', 'IR', 'KP', 'BY', 'MM', 'SY', 'VE', 'AF', 'YE', 'SD', 'ZW'];
// Pays UE/EEE — posture standard sans tour de vis supplémentaire
const LOW_RISK_COUNTRIES = ['FR', 'DE', 'LU', 'BE', 'NL', 'IT', 'ES', 'PT', 'AT', 'IE', 'SE', 'DK', 'FI', 'NO', 'CH'];

function roundToThousand(n) { return Math.max(0, Math.round(n / 1000) * 1000); }

function deriveRiskDefaults(client = {}) {
  const aum = Number(client.aum) || 0;
  const type = String(client.type || '').toLowerCase();
  // Pays d'incorporation (custom field) prioritaire sur BillingCountry,
  // car l'org SFDC peut avoir une state/country picklist restreinte qui
  // empêche certains pays (Russie, Iran…). Le custom field est libre.
  const countryRaw = client.Custody_Incorporation_Country__c || client.country || '';
  const country = String(countryRaw).toUpperCase().slice(0, 2);
  const industry = String(client.industry || '').toLowerCase();
  const createdAt = client.createdDate ? new Date(client.createdDate) : new Date();
  const ageMonths = Math.max(0, (Date.now() - createdAt.getTime()) / (30 * 86_400_000));

  // ── 1. Risk level inference ────────────────────────────
  let riskLevel;
  let reasons = [];
  if (HIGH_RISK_COUNTRIES.includes(country)) {
    riskLevel = 'critical';
    reasons.push(`Juridiction ${country} sur la liste FATF à haut risque`);
  } else if (HIGH_RISK_INDUSTRIES.some(i => industry.includes(i))) {
    riskLevel = 'high';
    reasons.push(`Industrie "${client.industry}" à risque LCB-FT élevé`);
  } else if (ageMonths < 3) {
    riskLevel = 'high';
    reasons.push(`Client récent (< 3 mois) — posture initiale prudente`);
  } else if (aum > 10_000_000 && LOW_RISK_COUNTRIES.includes(country || 'FR')) {
    riskLevel = 'low';
    reasons.push(`UHNWI en juridiction UE — dossier documenté`);
  } else {
    riskLevel = 'standard';
    reasons.push(`Profil standard`);
  }

  // ── 2. Thresholds — proportional to AUM, avec planchers / plafonds ───
  // Rule of thumb custody banking :
  //   · single_transfer  ~ 2% AUM (min 10k€, max 500k€)
  //   · daily_volume     ~ 5% AUM (min 50k€, max 2M€)
  //   · approval_above   ~ 1% AUM (min 5k€, max 250k€)
  let singleLimit    = Math.max(10_000,  Math.min(500_000,   aum * 0.02));
  let dailyLimit     = Math.max(50_000,  Math.min(2_000_000, aum * 0.05));
  let approvalAbove  = Math.max(5_000,   Math.min(250_000,   aum * 0.01));

  // Tighten factor selon le niveau de risque
  const tighten = { low: 1.5, standard: 1, high: 0.5, critical: 0.2 }[riskLevel] || 1;
  singleLimit    *= tighten;
  dailyLimit     *= tighten;
  approvalAbove  *= tighten;

  // Institutional → seuils plus hauts (ticket moyen plus gros, historique audité)
  if (type.includes('institutional')) {
    singleLimit   *= 1.5;
    dailyLimit    *= 1.5;
  }

  // ── 3. Networks autorisés ──────────────────────────────
  // Plus le risque est élevé, moins de réseaux autorisés (on-chain audit plus simple)
  const allowedNetworks =
    riskLevel === 'critical' ? ['Ethereum']
    : riskLevel === 'high'   ? ['Ethereum', 'Bitcoin']
    : riskLevel === 'low'    ? ['Ethereum', 'EthereumSepolia', 'Bitcoin', 'BitcoinTestnet3', 'Polygon', 'ArbitrumOne', 'Base', 'Solana']
                              : ['Ethereum', 'EthereumSepolia', 'Bitcoin', 'Polygon'];

  // ── 4. Revue périodique — cadence selon risque ─────────
  // High/critical = semestriel, standard/low = annuel (AMLD5 Art. 13)
  const nextReviewDays = (riskLevel === 'high' || riskLevel === 'critical') ? 180 : 365;

  return {
    risk_level: riskLevel,
    max_single_transfer: roundToThousand(singleLimit),
    max_daily_volume:    roundToThousand(dailyLimit),
    requires_approval_above: roundToThousand(approvalAbove),
    // Whitelist stricte par défaut pour tout profil risk-sensitive
    whitelist_only: riskLevel === 'critical' || riskLevel === 'high',
    allowed_networks: allowedNetworks,
    // PEP = déclaratif uniquement, jamais inférable. Toujours false par défaut.
    pep_status: false,
    // FATCA : 'exempt' si UE clairement, 'pending' sinon (RCSI à confirmer)
    fatca_status: country === 'US' ? 'pending' : LOW_RISK_COUNTRIES.includes(country) ? 'exempt' : 'pending',
    last_review_date: new Date().toISOString().split('T')[0],
    next_review_date: new Date(Date.now() + nextReviewDays * 86_400_000).toISOString().split('T')[0],
    _derivation: { reasons, country, industry, aum, ageMonths: Math.round(ageMonths), tighten },
  };
}

/* Sub-primitive: vertical field row with bronze eyebrow ----- */
function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[#8A8278] uppercase tracking-[0.1em]">
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
  const [errorMsg, setErrorMsg] = useState(null);

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

  // "Configurer" → dérive une proposition depuis le profil client et ouvre
  // le formulaire en mode édition. Le RCSI ajuste puis valide — rien n'est
  // sauvegardé tant qu'il n'a pas cliqué Enregistrer. Contrairement à l'ancien
  // flow qui écrivait silencieusement un DEFAULT_CONFIG hardcodé identique
  // pour tous les clients.
  const handleCreate = () => {
    const derived = deriveRiskDefaults(client);
    setDraft(derived);
    setErrorMsg(null);
    setEditing(true);
    // `config` reste null → le rendu "Enregistrer" gère le cas INSERT
  };

  const regenerateFromProfile = () => {
    setDraft(prev => ({
      ...deriveRiskDefaults(client),
      // On préserve les décisions manuelles (PEP, FATCA, notes) si l'utilisateur
      // les a déjà renseignées dans la session en cours.
      pep_status: prev?.pep_status ?? false,
      fatca_status: prev?.fatca_status || 'pending',
    }));
    setErrorMsg(null);
  };

  const startEdit = () => {
    // La colonne DB canonique est `requires_approval_above` — on accepte
    // l'alias `approval_threshold` pour rétrocompat (ancien code UI).
    setDraft({
      risk_level: config.risk_level || 'standard',
      max_single_transfer: config.max_single_transfer || 0,
      max_daily_volume: config.max_daily_volume || 0,
      requires_approval_above: config.requires_approval_above ?? config.approval_threshold ?? 0,
      whitelist_only: config.whitelist_only || false,
      allowed_networks: config.allowed_networks || [],
      pep_status: config.pep_status || false,
      fatca_status: config.fatca_status || 'pending',
      last_review_date: config.last_review_date || '',
      next_review_date: config.next_review_date || '',
    });
    setErrorMsg(null);
    setEditing(true);
  };

  const handleSave = async () => {
    setErrorMsg(null);
    setSaving(true);
    try {
      // Strip internal-only fields before sending to server
      // eslint-disable-next-line no-unused-vars
      const { _derivation, ...payload } = draft || {};
      const data = await saveRiskConfig(client.id, payload);
      setConfig(data);
      setEditing(false);
      setDraft(null);
    } catch (err) {
      console.error('saveRiskConfig error:', err);
      setErrorMsg(err.message || 'Erreur lors de la sauvegarde');
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

  /* ── No config AND not creating ────────────────────────── */
  if (!config && !editing) {
    return (
      <SectionCard title="Configuration de risque" caption="Paramètres AMLD5 · Tracfin">
        <EmptyState
          illustration="shield"
          title="Aucune configuration"
          description="Proposez un profil de risque dérivé des informations Salesforce (AUM, juridiction, industrie, ancienneté) puis ajustez avant validation."
          action={
            isAdmin && (
              <Button variant="primary" size="md" onClick={handleCreate}>
                Proposer une configuration
              </Button>
            )
          }
        />
      </SectionCard>
    );
  }

  // Quand `editing` est actif mais `config` est null (première création),
  // on lit tout depuis `draft`. Sinon on préfère draft en édition, config sinon.
  const source = editing ? draft : config;
  const risk = riskInfo(source.risk_level);
  const fatca = fatcaInfo(source.fatca_status);
  const currentNetworks = source.allowed_networks || [];
  const currentPep = source.pep_status;
  const currentWhitelistOnly = source.whitelist_only;

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
        {/* ── Derivation banner ── Explique d'où viennent les valeurs
            proposées quand on démarre depuis le profil client. Disparaît
            dès que l'utilisateur a enregistré (donc config != null). */}
        {editing && draft?._derivation && (
          <div className="px-4 py-3 bg-[#F5EEE0] border border-[#E7E7E7] rounded-[8px]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2.5 min-w-0">
                <svg className="w-3.5 h-3.5 text-[#7C5E3C] mt-[2px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-[#7C5E3C] tracking-[-0.003em] mb-1">
                    Proposition dérivée du profil Salesforce
                  </p>
                  <p className="text-[12px] text-[#5D5D5D] leading-[1.5] tracking-[-0.003em]">
                    {draft._derivation.reasons.join(' · ')}
                    {draft._derivation.aum > 0 && ` · AUM ${fmtEUR(draft._derivation.aum)}`}
                    {draft._derivation.country && ` · ${draft._derivation.country}`}
                    {` · Approche risque proportionnée (AMLD5 Art. 13 · FATF R.10)`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={regenerateFromProfile}
                className="flex-shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11.5px] font-medium text-[#7C5E3C] border border-[rgba(124,94,60,0.28)] bg-white hover:bg-[#FDFBF6] transition-colors tracking-[-0.003em]"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Régénérer
              </button>
            </div>
          </div>
        )}

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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-[#E7E7E7]">
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
                value={draft.requires_approval_above}
                onChange={e => setDraft(d => ({ ...d, requires_approval_above: Number(e.target.value) }))}
                className={inputCls}
              />
            ) : (
              <p className="text-[14px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.01em]">
                {fmtEUR(config.requires_approval_above ?? config.approval_threshold)}
              </p>
            )}
          </Field>
        </div>

        {/* Controls block */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#E7E7E7]">
          <Field label="Whitelist uniquement">
            {editing ? (
              <div className="flex items-center gap-3">
                <Toggle
                  on={currentWhitelistOnly}
                  onChange={(v) => setDraft(d => ({ ...d, whitelist_only: v }))}
                />
                <span className="text-[12px] text-[#5D5D5D] tracking-[-0.003em]">
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
                <span className="text-[12px] text-[#5D5D5D] tracking-[-0.003em]">
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
        <div className="pt-2 border-t border-[#E7E7E7]">
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
                          ? 'bg-[#FBF6EC] text-[#7C5E3C] border-[#E7E7E7]'
                          : 'bg-white text-[#8A8278] border-[rgba(10,10,10,0.1)] hover:border-[#E7E7E7] hover:text-[#5D5D5D]'
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
                        className="inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[11.5px] font-medium bg-[#FBF6EC] text-[#7C5E3C] border border-[#E7E7E7] tracking-[-0.003em]"
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: n.color }} />
                        {n.name}
                      </span>
                    );
                  })
                ) : (
                  <span className="text-[12px] text-[#8A8278]">Aucun réseau configuré</span>
                )}
              </div>
            )}
          </Field>
        </div>

        {/* FATCA */}
        <div className="pt-2 border-t border-[#E7E7E7]">
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
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[#E7E7E7]">
          <Field label="Dernière revue">
            {editing ? (
              <input
                type="date"
                value={draft.last_review_date || ''}
                onChange={e => setDraft(d => ({ ...d, last_review_date: e.target.value }))}
                className={inputCls}
              />
            ) : (
              <p className="text-[13px] text-[#1E1E1E] tabular-nums tracking-[-0.003em]">
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
              <p className="text-[13px] text-[#1E1E1E] tabular-nums tracking-[-0.003em]">
                {fmtDate(config.next_review_date)}
              </p>
            )}
          </Field>
        </div>

        {/* Error banner — inline au lieu du alert() natif */}
        {errorMsg && (
          <div className="mt-4 px-4 py-3 bg-[#FEF2F2] border border-[rgba(220,38,38,0.22)] rounded-[8px]">
            <p className="text-[12.5px] text-[#991B1B] tracking-[-0.003em]">{errorMsg}</p>
          </div>
        )}

        {/* Edit actions */}
        {editing && (
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#E7E7E7]">
            <Button
              variant="ghost"
              size="md"
              onClick={() => { setEditing(false); setDraft(null); setErrorMsg(null); }}
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
