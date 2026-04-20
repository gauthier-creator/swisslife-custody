import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchDelegations, createDelegation, revokeDelegation } from '../services/complianceApi';
import {
  Badge, Modal, Spinner, EmptyState, useToast, ToastContainer,
  inputCls, selectCls, labelCls, Button, Card, Metric, MetricRow,
} from './shared';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const permBadge = (level) => {
  if (level === 'transfer') return <Badge variant="warning" dot>Transfert</Badge>;
  return <Badge variant="gold" dot>Consultation</Badge>;
};

const statusBadge = (s) => {
  if (s === 'active')  return <Badge variant="success" dot>Actif</Badge>;
  if (s === 'revoked') return <Badge variant="error"   dot>Révoqué</Badge>;
  if (s === 'expired') return <Badge variant="default" dot>Expiré</Badge>;
  return <Badge variant="default">{s || '—'}</Badge>;
};

export default function DelegationPanel({ client }) {
  const { profile } = useAuth();
  const { toasts, toast } = useToast();

  const [delegations, setDelegations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  // Revoke confirmation modal — replaces window.confirm() for a cleaner UX.
  const [revokeTarget, setRevokeTarget] = useState(null); // { id, delegate_email, ... } | null
  const [revoking, setRevoking] = useState(false);
  const [form, setForm] = useState({
    delegateEmail: '',
    delegateName: '',
    permissionLevel: 'view',
    transferLimit: '',
    currency: 'EUR',
    expiresAt: '',
    notes: '',
  });

  const accountId = client?.id;

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const raw = await fetchDelegations(accountId);
      const data = raw?.data || raw;
      setDelegations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Delegation load error:', err);
    }
    setLoading(false);
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => setForm({
    delegateEmail: '', delegateName: '', permissionLevel: 'view',
    transferLimit: '', currency: 'EUR', expiresAt: '', notes: '',
  });

  const handleCreate = async () => {
    setErrorMsg(null);
    if (!form.delegateEmail?.trim()) {
      setErrorMsg('L\'email du délégataire est obligatoire.');
      return;
    }
    // Basic email sanity — avoid sending obvious garbage to the API
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.delegateEmail.trim())) {
      setErrorMsg('Adresse email invalide.');
      return;
    }
    if (!profile?.email) {
      setErrorMsg('Session expirée — reconnectez-vous pour créer une délégation.');
      return;
    }
    setSubmitting(true);
    try {
      await createDelegation({
        grantorAccountId: accountId,
        grantorName: client?.name,
        delegateEmail: form.delegateEmail.trim(),
        delegateName: form.delegateName || null,
        permissionLevel: form.permissionLevel,
        transferLimit: form.permissionLevel === 'transfer' && form.transferLimit ? Number(form.transferLimit) : null,
        currency: form.currency,
        expiresAt: form.expiresAt || null,
        notes: form.notes || null,
        grantedByEmail: profile.email,
      });
      toast('Délégation créée · tracée dans le journal d\'audit');
      setShowModal(false);
      resetForm();
      load();
    } catch (err) {
      setErrorMsg(err.message || 'Erreur lors de la création de la délégation.');
    }
    setSubmitting(false);
  };

  const handleRevoke = async () => {
    if (!revokeTarget?.id) return;
    if (!profile?.email) {
      toast('Session expirée · reconnectez-vous', 'error');
      return;
    }
    setRevoking(true);
    try {
      await revokeDelegation(revokeTarget.id, profile.email);
      toast('Délégation révoquée');
      setRevokeTarget(null);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
    setRevoking(false);
  };

  const activeDelegations = delegations.filter(d => d.status === 'active');
  const inactiveDelegations = delegations.filter(d => d.status !== 'active');
  const viewCount = activeDelegations.filter(d => d.permission_level === 'view').length;
  const transferCount = activeDelegations.filter(d => d.permission_level === 'transfer').length;

  return (
    <div className="space-y-7">
      <ToastContainer toasts={toasts} />

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10.5px] font-medium text-[#8A8278] uppercase tracking-[0.12em] mb-2 flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-[#C8924B]" />
            Gouvernance · AMF
          </p>
          <h3 className="font-display text-[24px] text-[#0A0A0A] leading-[1.08]" style={{ letterSpacing: '-0.024em' }}>
            Délégations d'accès
          </h3>
          <p className="text-[13px] text-[#5D5D5D] mt-1 tracking-[-0.003em] max-w-[56ch]">
            Gestion des accès famille et tiers autorisés. Chaque délégation est horodatée et révocable à tout moment.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowModal(true)}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nouvelle délégation
        </Button>
      </div>

      {/* ── Stats strip ─────────────────────────────────── */}
      <MetricRow>
        <Metric
          label="Actives"
          value={activeDelegations.length}
          caption="Délégations en cours"
          progress={Math.min(100, activeDelegations.length * 25)}
        />
        <Metric
          label="Consultation"
          value={viewCount}
          caption="Lecture seule"
          progress={Math.min(100, viewCount * 30)}
        />
        <Metric
          label="Transfert"
          value={transferCount}
          caption="Avec limites définies"
          progress={Math.min(100, transferCount * 30)}
        />
      </MetricRow>

      {/* ── List ────────────────────────────────────────── */}
      {loading ? (
        <Card className="flex items-center justify-center py-14">
          <Spinner size="w-5 h-5" />
        </Card>
      ) : delegations.length === 0 ? (
        <Card>
          <EmptyState
            illustration="shield"
            title="Aucune délégation"
            description="Aucun accès délégué pour ce client. Ajoutez une délégation famille ou un tiers autorisé pour partager l'accès sous conditions."
            action={
              <Button variant="primary" onClick={() => setShowModal(true)}>
                Créer la première délégation
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Active delegations */}
          {activeDelegations.length > 0 && (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E7E7E7] bg-white">
                      <th className="px-6 py-3.5 text-[10px] font-medium text-[#7C5E3C] tracking-[0.1em] uppercase">Délégataire</th>
                      <th className="px-6 py-3.5 text-[10px] font-medium text-[#7C5E3C] tracking-[0.1em] uppercase">Email</th>
                      <th className="px-6 py-3.5 text-[10px] font-medium text-[#7C5E3C] tracking-[0.1em] uppercase">Permission</th>
                      <th className="px-6 py-3.5 text-[10px] font-medium text-[#7C5E3C] tracking-[0.1em] uppercase text-right">Limite</th>
                      <th className="px-6 py-3.5 text-[10px] font-medium text-[#7C5E3C] tracking-[0.1em] uppercase">Expiration</th>
                      <th className="px-6 py-3.5 text-[10px] font-medium text-[#7C5E3C] tracking-[0.1em] uppercase">Statut</th>
                      <th className="px-6 py-3.5 text-[10px] font-medium text-[#7C5E3C] tracking-[0.1em] uppercase">Accordé par</th>
                      <th className="px-6 py-3.5 w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDelegations.map((d, i) => (
                      <tr
                        key={d.id}
                        className="border-b border-[#E7E7E7] transition-colors hover:bg-white hover:bg-[#FDFBF6] row-stagger"
                        style={{ '--i': i }}
                      >
                        <td className="px-6 py-4 text-[13px] font-medium text-[#0A0A0A] tracking-[-0.006em]">{d.delegate_name || '—'}</td>
                        <td className="px-6 py-4 text-[12px] text-[#5D5D5D] font-mono tracking-[-0.003em]">{d.delegate_email}</td>
                        <td className="px-6 py-4">{permBadge(d.permission_level)}</td>
                        <td className="px-6 py-4 text-right text-[13px] font-medium text-[#0A0A0A] tabular-nums">
                          {d.permission_level === 'transfer' && d.transfer_limit
                            ? `${Number(d.transfer_limit).toLocaleString('fr-FR')} ${d.currency || 'EUR'}`
                            : d.permission_level === 'transfer' ? 'Illimité' : '—'}
                        </td>
                        <td className="px-6 py-4 text-[12px] text-[#5D5D5D] tabular-nums">
                          {d.expires_at ? fmtDate(d.expires_at) : 'Permanent'}
                        </td>
                        <td className="px-6 py-4">{statusBadge(d.status)}</td>
                        <td className="px-6 py-4 text-[12px] text-[#5D5D5D]">{d.granted_by_email || '—'}</td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => setRevokeTarget(d)}
                            className="inline-flex items-center h-7 px-2.5 rounded-full text-[11.5px] font-medium text-[#DC2626] border border-[rgba(220,38,38,0.22)] bg-white hover:bg-[#FEF2F2] hover:border-[rgba(220,38,38,0.4)] transition-colors tracking-[-0.003em]"
                          >
                            Révoquer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Revoked / expired */}
          {inactiveDelegations.length > 0 && (
            <details className="group">
              <summary className="inline-flex items-center gap-2 text-[12px] text-[#5D5D5D] cursor-pointer hover:text-[#0A0A0A] transition-colors tracking-[-0.003em]">
                <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                {inactiveDelegations.length} délégation{inactiveDelegations.length > 1 ? 's' : ''} révoquée{inactiveDelegations.length > 1 ? 's' : ''} / expirée{inactiveDelegations.length > 1 ? 's' : ''}
              </summary>
              <Card className="mt-3 overflow-hidden opacity-75">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E7E7E7] bg-white">
                      <th className="px-6 py-3 text-[10px] font-medium text-[#7C5E3C] tracking-[0.1em] uppercase">Délégataire</th>
                      <th className="px-6 py-3 text-[10px] font-medium text-[#7C5E3C] tracking-[0.1em] uppercase">Permission</th>
                      <th className="px-6 py-3 text-[10px] font-medium text-[#7C5E3C] tracking-[0.1em] uppercase">Statut</th>
                      <th className="px-6 py-3 text-[10px] font-medium text-[#7C5E3C] tracking-[0.1em] uppercase">Révoqué le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inactiveDelegations.map(d => (
                      <tr key={d.id} className="border-b border-[#E7E7E7]">
                        <td className="px-6 py-3 text-[13px] text-[#5D5D5D] tracking-[-0.003em]">{d.delegate_name || d.delegate_email}</td>
                        <td className="px-6 py-3">{permBadge(d.permission_level)}</td>
                        <td className="px-6 py-3">{statusBadge(d.status)}</td>
                        <td className="px-6 py-3 text-[12px] text-[#5D5D5D] tabular-nums">{fmtDate(d.revoked_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </details>
          )}
        </div>
      )}

      {/* ── Create Delegation Modal ─────────────────────── */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setErrorMsg(null); }}
        title="Nouvelle délégation d'accès"
        subtitle="Partage d'accès conditionnel. Chaque délégation est horodatée dans le journal d'audit ACPR."
      >
        <div className="space-y-5">
          <div className="px-4 py-3 bg-[#F9F8F5] border border-[#E7E7E7] rounded-[8px]">
            <p className="text-[12px] text-[#5D5D5D] leading-[1.5] tracking-[-0.003em]">
              <strong className="text-[#0A0A0A]">Grantor :</strong> {client?.name || '—'}<br />
              La délégation sera conservée 5 ans dans le journal d'audit (obligation ACPR art. L.561-12 CMF).
            </p>
          </div>
          <div>
            <label className={labelCls}>Email du délégataire *</label>
            <input
              value={form.delegateEmail}
              onChange={e => setForm(f => ({ ...f, delegateEmail: e.target.value }))}
              className={inputCls}
              placeholder="exemple@email.com"
              type="email"
            />
          </div>
          <div>
            <label className={labelCls}>Nom du délégataire</label>
            <input
              value={form.delegateName}
              onChange={e => setForm(f => ({ ...f, delegateName: e.target.value }))}
              className={inputCls}
              placeholder="Prénom Nom"
            />
          </div>
          <div>
            <label className={labelCls}>Niveau de permission *</label>
            <select
              value={form.permissionLevel}
              onChange={e => setForm(f => ({ ...f, permissionLevel: e.target.value }))}
              className={selectCls}
            >
              <option value="view">Consultation — Voir soldes et historique</option>
              <option value="transfer">Transfert — Initier des transferts (avec limite)</option>
            </select>
          </div>
          {form.permissionLevel === 'transfer' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Limite par transfert</label>
                <input
                  value={form.transferLimit}
                  onChange={e => setForm(f => ({ ...f, transferLimit: e.target.value }))}
                  className={inputCls}
                  placeholder="Ex. 10 000"
                  type="number"
                />
              </div>
              <div>
                <label className={labelCls}>Devise</label>
                <select
                  value={form.currency}
                  onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                  className={selectCls}
                >
                  <option value="EUR">EUR</option>
                  <option value="CHF">CHF</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
          )}
          <div>
            <label className={labelCls}>Date d'expiration</label>
            <input
              value={form.expiresAt}
              onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
              className={inputCls}
              type="date"
            />
            <p className="text-[11px] text-[#8A8278] mt-1.5 tracking-[-0.003em]">Laisser vide pour une délégation permanente</p>
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className={`${inputCls} min-h-[84px] py-3 resize-none`}
              placeholder="Relation familiale, contexte, conditions…"
              rows={3}
            />
          </div>
          {errorMsg && (
            <div className="px-4 py-3 bg-[#FEF2F2] border border-[rgba(220,38,38,0.22)] rounded-[8px]">
              <p className="text-[12.5px] text-[#991B1B] tracking-[-0.003em]">{errorMsg}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-5 border-t border-[#E7E7E7]">
            <Button variant="ghost" onClick={() => { setShowModal(false); setErrorMsg(null); }}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={submitting || !form.delegateEmail?.trim()}
            >
              {submitting ? 'Création…' : 'Créer la délégation'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Revoke confirmation modal ───────────────────── */}
      <Modal
        isOpen={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title="Révoquer la délégation ?"
        subtitle="La révocation est immédiate et tracée dans le journal d'audit. Elle ne peut pas être annulée — il faudra recréer une nouvelle délégation si besoin."
      >
        <div className="space-y-5">
          {revokeTarget && (
            <div className="px-4 py-3 bg-[#F9F8F5] border border-[#E7E7E7] rounded-[8px]">
              <div className="grid grid-cols-2 gap-4 text-[12.5px]">
                <div>
                  <p className="text-[10.5px] font-medium text-[#8A8278] uppercase tracking-[0.1em]">Délégataire</p>
                  <p className="text-[13px] text-[#0A0A0A] font-medium mt-1">{revokeTarget.delegate_name || revokeTarget.delegate_email}</p>
                  {revokeTarget.delegate_name && (
                    <p className="text-[11.5px] text-[#5D5D5D] font-mono mt-0.5">{revokeTarget.delegate_email}</p>
                  )}
                </div>
                <div>
                  <p className="text-[10.5px] font-medium text-[#8A8278] uppercase tracking-[0.1em]">Permission</p>
                  <div className="mt-1">{permBadge(revokeTarget.permission_level)}</div>
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-5 border-t border-[#E7E7E7]">
            <Button variant="ghost" onClick={() => setRevokeTarget(null)}>Annuler</Button>
            <Button variant="primary" onClick={handleRevoke} disabled={revoking}>
              {revoking ? 'Révocation…' : 'Confirmer la révocation'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
