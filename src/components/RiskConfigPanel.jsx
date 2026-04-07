import { useState, useEffect } from 'react';
import { fetchRiskConfig, saveRiskConfig } from '../services/complianceApi';
import { Badge, Spinner, inputCls, selectCls, labelCls, fmtEUR } from './shared';
import { useAuth } from '../context/AuthContext';
import { SUPPORTED_NETWORKS } from '../config/constants';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

const RISK_LEVELS = [
  { id: 'low',      label: 'Faible',    color: '#059669', bg: '#ECFDF5' },
  { id: 'standard', label: 'Standard',  color: '#6366F1', bg: '#EEF2FF' },
  { id: 'high',     label: 'Eleve',     color: '#D97706', bg: '#FFFBEB' },
  { id: 'critical', label: 'Critique',  color: '#DC2626', bg: '#FEF2F2' },
];

const FATCA_STATUSES = [
  { id: 'pending',       label: 'En attente',    variant: 'warning' },
  { id: 'compliant',     label: 'Conforme',      variant: 'success' },
  { id: 'non_compliant', label: 'Non conforme',  variant: 'error' },
  { id: 'exempt',        label: 'Exempte',       variant: 'info' },
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
  const netInfo = (id) => SUPPORTED_NETWORKS.find(n => n.id === id) || { icon: '?', color: '#999', name: id };

  if (loading) {
    return (
      <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
        <h3 className="text-[14px] font-semibold text-[#0F0F10] mb-4">Configuration de risque</h3>
        <div className="flex justify-center py-8"><Spinner /></div>
      </div>
    );
  }

  // No config yet
  if (!config) {
    return (
      <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
        <h3 className="text-[14px] font-semibold text-[#0F0F10] mb-4">Configuration de risque</h3>
        <div className="text-center py-6">
          <div className="w-10 h-10 bg-[rgba(0,0,23,0.03)] rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-[#A8A29E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>
          <p className="text-[13px] font-medium text-[#0F0F10]">Aucune configuration</p>
          <p className="text-[12px] text-[#A8A29E] mt-0.5 mb-4">Definissez les parametres de risque pour ce client</p>
          {isAdmin && (
            <button
              onClick={handleCreate}
              disabled={saving}
              className="px-4 py-2 bg-[#6366F1] text-white text-[13px] font-medium rounded-xl hover:bg-[#5558E6] transition-colors disabled:opacity-40"
            >
              {saving ? 'Creation...' : 'Configurer'}
            </button>
          )}
        </div>
      </div>
    );
  }

  const risk = riskInfo(editing ? draft.risk_level : config.risk_level);
  const fatca = fatcaInfo(editing ? draft.fatca_status : config.fatca_status);
  const currentNetworks = editing ? draft.allowed_networks : (config.allowed_networks || []);
  const currentPep = editing ? draft.pep_status : config.pep_status;
  const currentWhitelistOnly = editing ? draft.whitelist_only : config.whitelist_only;

  return (
    <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-semibold text-[#0F0F10]">Configuration de risque</h3>
        {isAdmin && !editing && (
          <button
            onClick={startEdit}
            className="px-3 py-1 text-[12px] font-medium text-[#6366F1] bg-[#EEF2FF] rounded-lg hover:bg-[#E0E7FF] transition-colors"
          >
            Modifier
          </button>
        )}
      </div>

      <div className="space-y-4">
        {/* Risk level */}
        <div>
          <p className="text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider mb-1.5">Niveau de risque</p>
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
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: risk.color }}
              />
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium"
                style={{ backgroundColor: risk.bg, color: risk.color }}
              >
                {risk.label}
              </span>
            </div>
          )}
        </div>

        {/* Max single transfer */}
        <div>
          <p className="text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider mb-1.5">Transfert max. unique</p>
          {editing ? (
            <input
              type="number"
              value={draft.max_single_transfer}
              onChange={e => setDraft(d => ({ ...d, max_single_transfer: Number(e.target.value) }))}
              className={inputCls}
            />
          ) : (
            <p className="text-[13px] font-medium text-[#0F0F10] tabular-nums">{fmtEUR(config.max_single_transfer)}</p>
          )}
        </div>

        {/* Max daily volume */}
        <div>
          <p className="text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider mb-1.5">Volume max. journalier</p>
          {editing ? (
            <input
              type="number"
              value={draft.max_daily_volume}
              onChange={e => setDraft(d => ({ ...d, max_daily_volume: Number(e.target.value) }))}
              className={inputCls}
            />
          ) : (
            <p className="text-[13px] font-medium text-[#0F0F10] tabular-nums">{fmtEUR(config.max_daily_volume)}</p>
          )}
        </div>

        {/* Approval threshold */}
        <div>
          <p className="text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider mb-1.5">Seuil d'approbation</p>
          {editing ? (
            <input
              type="number"
              value={draft.approval_threshold}
              onChange={e => setDraft(d => ({ ...d, approval_threshold: Number(e.target.value) }))}
              className={inputCls}
            />
          ) : (
            <p className="text-[13px] font-medium text-[#0F0F10] tabular-nums">{fmtEUR(config.approval_threshold)}</p>
          )}
        </div>

        {/* Whitelist only */}
        <div>
          <p className="text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider mb-1.5">Whitelist uniquement</p>
          {editing ? (
            <button
              onClick={() => setDraft(d => ({ ...d, whitelist_only: !d.whitelist_only }))}
              className={`relative w-10 h-[22px] rounded-full transition-colors ${currentWhitelistOnly ? 'bg-[#059669]' : 'bg-[rgba(0,0,29,0.12)]'}`}
            >
              <span className={`absolute top-[2px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform ${currentWhitelistOnly ? 'left-[20px]' : 'left-[2px]'}`} />
            </button>
          ) : (
            <Badge variant={currentWhitelistOnly ? 'success' : 'default'}>
              {currentWhitelistOnly ? 'Oui' : 'Non'}
            </Badge>
          )}
        </div>

        {/* Allowed networks */}
        <div>
          <p className="text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider mb-1.5">Reseaux autorises</p>
          {editing ? (
            <div className="flex flex-wrap gap-1.5">
              {SUPPORTED_NETWORKS.map(n => {
                const active = draft.allowed_networks.includes(n.id);
                return (
                  <button
                    key={n.id}
                    onClick={() => toggleNetwork(n.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-all"
                    style={{
                      backgroundColor: active ? `${n.color}12` : 'transparent',
                      color: active ? n.color : '#A8A29E',
                      borderColor: active ? `${n.color}30` : 'rgba(0,0,29,0.08)',
                    }}
                  >
                    <span className="text-[10px]">{n.icon}</span>
                    {n.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {currentNetworks.length > 0 ? currentNetworks.map(nId => {
                const n = netInfo(nId);
                return (
                  <span
                    key={nId}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium"
                    style={{ backgroundColor: `${n.color}12`, color: n.color }}
                  >
                    <span className="text-[10px]">{n.icon}</span>
                    {n.name}
                  </span>
                );
              }) : (
                <span className="text-[12px] text-[#A8A29E]">Aucun</span>
              )}
            </div>
          )}
        </div>

        {/* PEP status */}
        <div>
          <p className="text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider mb-1.5">Personne politiquement exposee (PEP)</p>
          {editing ? (
            <button
              onClick={() => setDraft(d => ({ ...d, pep_status: !d.pep_status }))}
              className={`relative w-10 h-[22px] rounded-full transition-colors ${currentPep ? 'bg-[#DC2626]' : 'bg-[rgba(0,0,29,0.12)]'}`}
            >
              <span className={`absolute top-[2px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform ${currentPep ? 'left-[20px]' : 'left-[2px]'}`} />
            </button>
          ) : (
            <Badge variant={currentPep ? 'error' : 'success'}>
              {currentPep ? 'Oui' : 'Non'}
            </Badge>
          )}
        </div>

        {/* FATCA status */}
        <div>
          <p className="text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider mb-1.5">Statut FATCA</p>
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
            <Badge variant={fatca.variant}>{fatca.label}</Badge>
          )}
        </div>

        {/* Review dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider mb-1.5">Derniere revue</p>
            {editing ? (
              <input
                type="date"
                value={draft.last_review_date || ''}
                onChange={e => setDraft(d => ({ ...d, last_review_date: e.target.value }))}
                className={inputCls}
              />
            ) : (
              <p className="text-[12px] text-[#787881]">{fmtDate(config.last_review_date)}</p>
            )}
          </div>
          <div>
            <p className="text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider mb-1.5">Prochaine revue</p>
            {editing ? (
              <input
                type="date"
                value={draft.next_review_date || ''}
                onChange={e => setDraft(d => ({ ...d, next_review_date: e.target.value }))}
                className={inputCls}
              />
            ) : (
              <p className="text-[12px] text-[#787881]">{fmtDate(config.next_review_date)}</p>
            )}
          </div>
        </div>

        {/* Edit actions */}
        {editing && (
          <div className="flex gap-3 pt-2 border-t border-[rgba(0,0,29,0.06)]">
            <button
              onClick={() => { setEditing(false); setDraft(null); }}
              className="flex-1 py-2 text-[13px] font-medium text-[#787881] bg-[rgba(0,0,23,0.04)] rounded-xl hover:bg-[rgba(0,0,23,0.07)] transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2 bg-[#6366F1] text-white text-[13px] font-medium rounded-xl hover:bg-[#5558E6] transition-colors disabled:opacity-40"
            >
              {saving ? 'Sauvegarde...' : 'Enregistrer'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
