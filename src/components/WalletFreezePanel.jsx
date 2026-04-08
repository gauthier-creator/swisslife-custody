import { useState, useEffect, useCallback } from 'react';
import { checkWalletFreeze, freezeWallet, unfreezeWallet } from '../services/complianceApi';
import { useAuth } from '../context/AuthContext';
import { Badge, Modal, Spinner, useToast, ToastContainer, inputCls, selectCls, labelCls } from './shared';

const LEGAL_REFERENCES = [
  { value: 'Gel Tracfin art. L.562-4 CMF', label: 'Gel Tracfin (art. L.562-4 CMF)' },
  { value: 'Gel judiciaire', label: 'Gel judiciaire' },
  { value: 'Sanctions UE/OFAC', label: 'Sanctions UE/OFAC' },
  { value: 'Autre', label: 'Autre' },
];

export default function WalletFreezePanel({ walletId, salesforceAccountId, clientName }) {
  const [freezeData, setFreezeData] = useState(null);
  const [isFrozen, setIsFrozen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showFreezeModal, setShowFreezeModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ reason: '', legalReference: LEGAL_REFERENCES[0].value, notes: '' });
  const { user, isAdmin } = useAuth();
  const { toasts, toast } = useToast();

  const loadFreezeStatus = useCallback(async () => {
    if (!walletId) return;
    setLoading(true);
    try {
      const result = await checkWalletFreeze(walletId);
      setIsFrozen(result.frozen);
      setFreezeData(result.freeze || null);
    } catch {
      setIsFrozen(false);
      setFreezeData(null);
    }
    setLoading(false);
  }, [walletId]);

  useEffect(() => { loadFreezeStatus(); }, [loadFreezeStatus]);

  const handleFreeze = async () => {
    if (!form.reason.trim()) {
      toast.error('Le motif est obligatoire');
      return;
    }
    setSubmitting(true);
    try {
      await freezeWallet({
        walletId,
        salesforceAccountId,
        clientName,
        reason: form.reason,
        legalReference: form.legalReference,
        frozenByEmail: user?.email,
        notes: form.notes || null,
      });
      toast.success('Wallet gele avec succes');
      setShowFreezeModal(false);
      setForm({ reason: '', legalReference: LEGAL_REFERENCES[0].value, notes: '' });
      await loadFreezeStatus();
    } catch (err) {
      toast.error(err.message || 'Erreur lors du gel');
    }
    setSubmitting(false);
  };

  const handleUnfreeze = async () => {
    if (!freezeData?.id) return;
    const confirmed = window.confirm(
      'Confirmez-vous le degel de ce wallet ?\nCette action sera tracee dans le journal d\'audit.'
    );
    if (!confirmed) return;
    setSubmitting(true);
    try {
      await unfreezeWallet(freezeData.id, user?.email, null);
      toast.success('Wallet degele avec succes');
      await loadFreezeStatus();
    } catch (err) {
      toast.error(err.message || 'Erreur lors du degel');
    }
    setSubmitting(false);
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--';

  if (loading) {
    return (
      <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-5">
        <div className="flex items-center gap-2 text-[13px] text-[#787881]">
          <Spinner /> Verification du statut de gel...
        </div>
      </div>
    );
  }

  return (
    <>
      <ToastContainer toasts={toasts} />
      <div className={`border rounded-2xl p-5 ${isFrozen ? 'bg-red-50 border-red-200' : 'bg-white border-[rgba(0,0,29,0.08)]'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className={`w-5 h-5 ${isFrozen ? 'text-red-500' : 'text-[#787881]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <h4 className="text-[14px] font-semibold text-[#0F0F10]">Gel des avoirs</h4>
          </div>
          {isFrozen ? (
            <Badge variant="error">GELE</Badge>
          ) : (
            <Badge variant="success">Actif</Badge>
          )}
        </div>

        {isFrozen && freezeData ? (
          <div className="space-y-3">
            <div className="bg-white/70 rounded-xl p-4 space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-[#A8A29E] uppercase tracking-wide">Motif</p>
                  <p className="text-[13px] text-[#0F0F10] font-medium">{freezeData.reason}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[#A8A29E] uppercase tracking-wide">Reference legale</p>
                  <p className="text-[13px] text-[#0F0F10] font-medium">{freezeData.legal_reference || '--'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[#A8A29E] uppercase tracking-wide">Gele par</p>
                  <p className="text-[13px] text-[#0F0F10]">{freezeData.frozen_by_email}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[#A8A29E] uppercase tracking-wide">Date du gel</p>
                  <p className="text-[13px] text-[#0F0F10]">{fmtDate(freezeData.frozen_at)}</p>
                </div>
              </div>
              {freezeData.notes && (
                <div>
                  <p className="text-[11px] text-[#A8A29E] uppercase tracking-wide">Notes</p>
                  <p className="text-[13px] text-[#787881]">{freezeData.notes}</p>
                </div>
              )}
            </div>
            {isAdmin && (
              <button
                onClick={handleUnfreeze}
                disabled={submitting}
                className="w-full px-4 py-2.5 bg-white border border-red-200 text-red-600 text-[13px] font-medium rounded-xl hover:bg-red-50 transition-colors disabled:opacity-40"
              >
                {submitting ? 'Degel en cours...' : 'Degeler le wallet'}
              </button>
            )}
          </div>
        ) : (
          <div>
            <p className="text-[13px] text-[#787881] mb-3">
              Aucun gel actif sur ce wallet. En cas de suspicion LCB-FT, un administrateur peut geler les avoirs.
            </p>
            {isAdmin && (
              <button
                onClick={() => setShowFreezeModal(true)}
                className="px-4 py-2.5 bg-red-600 text-white text-[13px] font-medium rounded-xl hover:bg-red-700 transition-colors"
              >
                Geler le wallet
              </button>
            )}
          </div>
        )}
      </div>

      {/* Freeze Modal */}
      {showFreezeModal && (
        <Modal title="Gel des avoirs" onClose={() => setShowFreezeModal(false)}>
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-[13px] text-amber-800 font-medium">
                Attention : le gel des avoirs bloque toute operation sur ce wallet. Cette action est tracee dans le journal d'audit conformement aux obligations LCB-FT.
              </p>
            </div>

            <div>
              <label className={labelCls}>Client</label>
              <p className="text-[14px] font-medium text-[#0F0F10]">{clientName || '--'}</p>
            </div>

            <div>
              <label className={labelCls}>Motif du gel *</label>
              <textarea
                className={`${inputCls} min-h-[80px]`}
                placeholder="Decrivez le motif du gel des avoirs..."
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              />
            </div>

            <div>
              <label className={labelCls}>Reference legale</label>
              <select
                className={selectCls}
                value={form.legalReference}
                onChange={e => setForm(f => ({ ...f, legalReference: e.target.value }))}
              >
                {LEGAL_REFERENCES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Notes complementaires</label>
              <textarea
                className={`${inputCls} min-h-[60px]`}
                placeholder="Notes optionnelles..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowFreezeModal(false)}
                className="flex-1 px-4 py-2.5 bg-white border border-[rgba(0,0,29,0.12)] text-[#0F0F10] text-[13px] font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleFreeze}
                disabled={submitting || !form.reason.trim()}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white text-[13px] font-medium rounded-xl hover:bg-red-700 transition-colors disabled:opacity-40"
              >
                {submitting ? 'Gel en cours...' : 'Confirmer le gel'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
