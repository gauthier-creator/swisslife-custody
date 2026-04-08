import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchDelegations, createDelegation, revokeDelegation } from '../services/complianceApi';
import { Badge, Modal, Spinner, EmptyState, useToast, ToastContainer, inputCls, selectCls, labelCls } from './shared';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const permBadge = (level) => {
  if (level === 'transfer') return <Badge variant="warning">Transfert</Badge>;
  return <Badge variant="info">Consultation</Badge>;
};

const statusBadge = (s) => {
  if (s === 'active') return <Badge variant="success">Actif</Badge>;
  if (s === 'revoked') return <Badge variant="error">Revoque</Badge>;
  if (s === 'expired') return <Badge variant="default">Expire</Badge>;
  return <Badge variant="default">{s || '—'}</Badge>;
};

export default function DelegationPanel({ client }) {
  const { profile } = useAuth();
  const { toasts, toast } = useToast();

  const [delegations, setDelegations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    delegateEmail: '',
    delegateName: '',
    permissionLevel: 'view',
    transferLimit: '',
    currency: 'CHF',
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

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    try {
      await createDelegation({
        grantorAccountId: accountId,
        grantorName: client?.name,
        delegateEmail: form.delegateEmail,
        delegateName: form.delegateName || null,
        permissionLevel: form.permissionLevel,
        transferLimit: form.permissionLevel === 'transfer' && form.transferLimit ? Number(form.transferLimit) : null,
        currency: form.currency,
        expiresAt: form.expiresAt || null,
        notes: form.notes || null,
        grantedByEmail: profile?.email,
      });
      toast('Delegation creee');
      setShowModal(false);
      setForm({ delegateEmail: '', delegateName: '', permissionLevel: 'view', transferLimit: '', currency: 'CHF', expiresAt: '', notes: '' });
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleRevoke = async (id) => {
    try {
      await revokeDelegation(id, profile?.email);
      toast('Delegation revoquee');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const activeDelegations = delegations.filter(d => d.status === 'active');
  const inactiveDelegations = delegations.filter(d => d.status !== 'active');

  return (
    <div>
      <ToastContainer toasts={toasts} />

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-[16px] font-semibold text-[#0F0F10]">Delegations d'acces</h3>
          <p className="text-[12px] text-[#787881] mt-0.5">
            Gestion des acces famille et tiers autorises
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 text-[13px] font-medium text-white bg-[#6366F1] hover:bg-[#4F46E5] rounded-xl transition-colors"
        >
          Nouvelle delegation
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#ECFDF5] text-[#059669] flex items-center justify-center text-[14px] font-bold">
            {activeDelegations.length}
          </div>
          <div>
            <p className="text-[13px] font-medium text-[#0F0F10]">Actives</p>
            <p className="text-[11px] text-[#787881]">Delegations en cours</p>
          </div>
        </div>
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#EEF2FF] text-[#6366F1] flex items-center justify-center text-[14px] font-bold">
            {activeDelegations.filter(d => d.permission_level === 'view').length}
          </div>
          <div>
            <p className="text-[13px] font-medium text-[#0F0F10]">Consultation</p>
            <p className="text-[11px] text-[#787881]">Acces lecture seule</p>
          </div>
        </div>
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#FFFBEB] text-[#D97706] flex items-center justify-center text-[14px] font-bold">
            {activeDelegations.filter(d => d.permission_level === 'transfer').length}
          </div>
          <div>
            <p className="text-[13px] font-medium text-[#0F0F10]">Transfert</p>
            <p className="text-[11px] text-[#787881]">Avec limites</p>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Spinner /></div>
      ) : delegations.length === 0 ? (
        <EmptyState
          title="Aucune delegation"
          description="Aucun acces delegue pour ce client. Ajoutez une delegation famille ou tiers autorise."
        />
      ) : (
        <div className="space-y-4">
          {/* Active delegations */}
          {activeDelegations.length > 0 && (
            <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-[rgba(0,0,29,0.06)] bg-[rgba(0,0,23,0.02)]">
                    <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Delegataire</th>
                    <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Email</th>
                    <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Permission</th>
                    <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium text-right">Limite</th>
                    <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Expiration</th>
                    <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Statut</th>
                    <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Accorde par</th>
                    <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {activeDelegations.map(d => (
                    <tr key={d.id} className="border-b border-[rgba(0,0,29,0.04)] hover:bg-[rgba(0,0,23,0.02)] transition-colors">
                      <td className="px-5 py-3.5 text-[13px] font-medium text-[#0F0F10]">{d.delegate_name || '—'}</td>
                      <td className="px-5 py-3.5 text-[12px] text-[#787881]">{d.delegate_email}</td>
                      <td className="px-5 py-3.5">{permBadge(d.permission_level)}</td>
                      <td className="px-5 py-3.5 text-right text-[13px] font-medium text-[#0F0F10] tabular-nums">
                        {d.permission_level === 'transfer' && d.transfer_limit
                          ? `${Number(d.transfer_limit).toLocaleString('fr-FR')} ${d.currency || 'CHF'}`
                          : d.permission_level === 'transfer' ? 'Illimite' : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-[12px] text-[#787881]">
                        {d.expires_at ? fmtDate(d.expires_at) : 'Permanent'}
                      </td>
                      <td className="px-5 py-3.5">{statusBadge(d.status)}</td>
                      <td className="px-5 py-3.5 text-[12px] text-[#787881]">{d.granted_by_email || '—'}</td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => handleRevoke(d.id)}
                          className="px-2.5 py-1 rounded-lg text-[12px] font-medium text-[#DC2626] hover:bg-[#FEF2F2] transition-all"
                        >
                          Revoquer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Revoked/expired */}
          {inactiveDelegations.length > 0 && (
            <details className="group">
              <summary className="text-[13px] text-[#787881] cursor-pointer hover:text-[#0F0F10] transition-colors">
                {inactiveDelegations.length} delegation{inactiveDelegations.length > 1 ? 's' : ''} revoquee{inactiveDelegations.length > 1 ? 's' : ''}/expiree{inactiveDelegations.length > 1 ? 's' : ''}
              </summary>
              <div className="mt-3 bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl overflow-hidden opacity-60">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-[rgba(0,0,29,0.06)] bg-[rgba(0,0,23,0.02)]">
                      <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Delegataire</th>
                      <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Permission</th>
                      <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Statut</th>
                      <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Revoque le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inactiveDelegations.map(d => (
                      <tr key={d.id} className="border-b border-[rgba(0,0,29,0.04)]">
                        <td className="px-5 py-3 text-[13px] text-[#787881]">{d.delegate_name || d.delegate_email}</td>
                        <td className="px-5 py-3">{permBadge(d.permission_level)}</td>
                        <td className="px-5 py-3">{statusBadge(d.status)}</td>
                        <td className="px-5 py-3 text-[12px] text-[#787881]">{fmtDate(d.revoked_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}

      {/* Create Delegation Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Nouvelle delegation d'acces">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Email du delegataire *</label>
            <input
              value={form.delegateEmail}
              onChange={e => setForm(f => ({ ...f, delegateEmail: e.target.value }))}
              className={inputCls}
              placeholder="exemple@email.com"
              type="email"
            />
          </div>
          <div>
            <label className={labelCls}>Nom du delegataire</label>
            <input
              value={form.delegateName}
              onChange={e => setForm(f => ({ ...f, delegateName: e.target.value }))}
              className={inputCls}
              placeholder="Prenom Nom"
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Limite par transfert</label>
                <input
                  value={form.transferLimit}
                  onChange={e => setForm(f => ({ ...f, transferLimit: e.target.value }))}
                  className={inputCls}
                  placeholder="Ex: 10000"
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
                  <option value="CHF">CHF</option>
                  <option value="EUR">EUR</option>
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
            <p className="text-[11px] text-[#A8A29E] mt-1">Laisser vide pour une delegation permanente</p>
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className={`${inputCls} min-h-[80px] resize-none`}
              placeholder="Relation familiale, contexte..."
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowModal(false)}
              className="px-4 py-2 text-[13px] font-medium rounded-xl border border-[rgba(0,0,29,0.1)] text-[#787881] hover:text-[#0F0F10] transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleCreate}
              disabled={!form.delegateEmail}
              className="px-4 py-2 text-[13px] font-medium text-white bg-[#6366F1] hover:bg-[#4F46E5] rounded-xl transition-colors disabled:opacity-40"
            >
              Creer la delegation
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
