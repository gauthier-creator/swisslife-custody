// ============================================================
// WalletFreezePanel — Gel des avoirs PAR WALLET
// ============================================================
// Chaque gel est scopé à un wallet_id unique côté serveur
// (table wallet_freezes). La table stocke wallet_id + client_id +
// motif + référence légale (art. L.562-4 CMF, sanctions UE/OFAC…).
// Le gel bloque ensuite les transferts via un guard sur
// /api/compliance/approvals + /api/dfns/wallets/.../transfers.
//
// Fixes ce commit :
//  · useAuth() n'expose pas `user`, on lit `profile` (qui contient email)
//  · toast() est une fonction, pas un objet — toast.error → toast(msg,'error')
//  · window.confirm() remplacé par une modale de confirmation
//  · affichage explicite du wallet ciblé (nom + adresse) pour lever
//    l'ambiguïté "gel global vs gel par wallet"
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { checkWalletFreeze, freezeWallet, unfreezeWallet } from '../services/complianceApi';
import { useAuth } from '../context/AuthContext';
import { Badge, Modal, Spinner, useToast, ToastContainer, inputCls, selectCls, labelCls, Button } from './shared';

const LEGAL_REFERENCES = [
  { value: 'Gel Tracfin art. L.562-4 CMF', label: 'Gel Tracfin · art. L.562-4 CMF' },
  { value: 'Gel judiciaire',              label: 'Gel judiciaire' },
  { value: 'Sanctions UE/OFAC',           label: 'Sanctions UE / OFAC' },
  { value: 'Décision interne LCB-FT',     label: 'Décision interne LCB-FT' },
  { value: 'Autre',                       label: 'Autre' },
];

// Short address rendering — always show the start + end so the
// banquier sees clearly WHICH wallet is being frozen.
const shortAddr = (a = '') => (a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);

export default function WalletFreezePanel({
  walletId,
  walletName,
  walletAddress,
  walletNetwork,
  salesforceAccountId,
  clientName,
}) {
  const [freezeData, setFreezeData] = useState(null);
  const [isFrozen, setIsFrozen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showFreezeModal, setShowFreezeModal] = useState(false);
  const [showUnfreezeModal, setShowUnfreezeModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [form, setForm] = useState({
    reason: '',
    legalReference: LEGAL_REFERENCES[0].value,
    notes: '',
  });
  const { profile, isAdmin } = useAuth();
  const { toasts, toast } = useToast();

  const loadFreezeStatus = useCallback(async () => {
    if (!walletId) { setLoading(false); return; }
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

  const resetForm = () => setForm({ reason: '', legalReference: LEGAL_REFERENCES[0].value, notes: '' });

  const handleFreeze = async () => {
    setErrorMsg(null);
    if (!form.reason.trim()) {
      setErrorMsg('Le motif est obligatoire — il sera tracé dans le journal d\'audit ACPR.');
      return;
    }
    if (!profile?.email) {
      setErrorMsg('Session expirée — reconnectez-vous pour geler un wallet.');
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
        frozenByEmail: profile.email,
        notes: form.notes || null,
      });
      toast('Wallet gelé · tracé dans le journal ACPR');
      setShowFreezeModal(false);
      resetForm();
      await loadFreezeStatus();
    } catch (err) {
      setErrorMsg(err.message || 'Erreur lors du gel');
    }
    setSubmitting(false);
  };

  const handleUnfreeze = async () => {
    if (!freezeData?.id) return;
    setErrorMsg(null);
    if (!profile?.email) {
      setErrorMsg('Session expirée — reconnectez-vous pour dégeler.');
      return;
    }
    setSubmitting(true);
    try {
      await unfreezeWallet(freezeData.id, profile.email, null);
      toast('Wallet dégelé · opérations réautorisées');
      setShowUnfreezeModal(false);
      await loadFreezeStatus();
    } catch (err) {
      setErrorMsg(err.message || 'Erreur lors du dégel');
    }
    setSubmitting(false);
  };

  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  // ── Loading skeleton ─────────────────────────────────
  if (loading) {
    return (
      <div className="bg-white border border-[#E7E7E7] rounded-[10px] p-5">
        <div className="flex items-center gap-2 text-[13px] text-[#8A8278]">
          <Spinner /> Vérification du statut de gel…
        </div>
      </div>
    );
  }

  // ── Main card ────────────────────────────────────────
  return (
    <>
      <ToastContainer toasts={toasts} />
      <div
        className={`border rounded-[10px] p-6 transition-colors ${
          isFrozen
            ? 'bg-[#FEF2F2] border-[rgba(220,38,38,0.22)]'
            : 'bg-white border-[#E7E7E7]'
        }`}
      >
        {/* Header — très explicite sur le wallet ciblé */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-medium text-[#8A8278] uppercase tracking-[0.12em] mb-2 flex items-center gap-2">
              <span className={`w-1 h-1 rounded-full ${isFrozen ? 'bg-[#DC2626]' : 'bg-[#C8924B]'}`} />
              LCB-FT · Gel par wallet
            </p>
            <h4 className="font-display text-[20px] text-[#0A0A0A] leading-[1.1]" style={{ letterSpacing: '-0.022em' }}>
              Gel des avoirs
            </h4>
            <p className="text-[12.5px] text-[#5D5D5D] mt-1.5 tracking-[-0.003em] max-w-[60ch]">
              Cette action concerne uniquement le wallet ci-dessous — les autres wallets du client restent opérationnels.
            </p>
          </div>
          {isFrozen
            ? <Badge variant="error" dot>GELÉ</Badge>
            : <Badge variant="success" dot>Libre</Badge>
          }
        </div>

        {/* Wallet ciblé — banneau clair */}
        <div className="flex items-center gap-3 px-4 py-3 mb-5 bg-[#F9F8F5] border border-[#E7E7E7] rounded-[8px]">
          <div className="w-9 h-9 rounded-[8px] bg-white border border-[#E7E7E7] flex items-center justify-center text-[11px] font-medium text-[#0A0A0A] flex-shrink-0">
            {(walletNetwork || '?').slice(0, 3).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-[#0A0A0A] truncate tracking-[-0.006em]">
              {walletName || 'Wallet sélectionné'}
            </p>
            <p className="text-[11.5px] text-[#8A8278] font-mono truncate mt-0.5">
              {shortAddr(walletAddress || walletId)}
            </p>
          </div>
        </div>

        {/* Erreur globale */}
        {errorMsg && (
          <div className="mb-4 px-4 py-3 bg-[#FEF2F2] border border-[rgba(220,38,38,0.22)] rounded-[8px]">
            <p className="text-[12.5px] text-[#991B1B] tracking-[-0.003em]">{errorMsg}</p>
          </div>
        )}

        {/* État 1 : wallet GELÉ — show detail + Dégel CTA */}
        {isFrozen && freezeData ? (
          <div className="space-y-4">
            <div className="bg-white/70 rounded-[8px] p-4 space-y-3 border border-[rgba(220,38,38,0.12)]">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-medium text-[#8A8278] uppercase tracking-[0.1em]">Motif</p>
                  <p className="text-[13px] text-[#0A0A0A] font-medium mt-1">{freezeData.reason}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-[#8A8278] uppercase tracking-[0.1em]">Référence légale</p>
                  <p className="text-[13px] text-[#0A0A0A] font-medium mt-1">{freezeData.legal_reference || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-[#8A8278] uppercase tracking-[0.1em]">Gelé par</p>
                  <p className="text-[13px] text-[#5D5D5D] mt-1">{freezeData.frozen_by_email}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-[#8A8278] uppercase tracking-[0.1em]">Date du gel</p>
                  <p className="text-[13px] text-[#5D5D5D] mt-1 tabular-nums">{fmtDate(freezeData.frozen_at)}</p>
                </div>
              </div>
              {freezeData.notes && (
                <div className="pt-2 border-t border-[#E7E7E7]">
                  <p className="text-[10px] font-medium text-[#8A8278] uppercase tracking-[0.1em]">Notes</p>
                  <p className="text-[12.5px] text-[#5D5D5D] mt-1">{freezeData.notes}</p>
                </div>
              )}
            </div>
            {isAdmin ? (
              <Button
                variant="danger"
                className="w-full"
                onClick={() => { setErrorMsg(null); setShowUnfreezeModal(true); }}
                disabled={submitting}
              >
                Dégeler ce wallet
              </Button>
            ) : (
              <p className="text-[12px] text-[#8A8278] text-center">Seul un administrateur peut lever le gel.</p>
            )}
          </div>
        ) : (
          // État 2 : wallet LIBRE — show explanation + Gel CTA
          <div>
            <p className="text-[13px] text-[#5D5D5D] mb-4 tracking-[-0.003em] leading-[1.45]">
              Aucun gel actif. En cas de suspicion LCB-FT ou de notification Tracfin, un administrateur peut geler ce wallet — toute opération (transfert, signature, retrait) sera bloquée jusqu'au dégel.
            </p>
            {isAdmin ? (
              <Button
                variant="primary"
                onClick={() => { setErrorMsg(null); resetForm(); setShowFreezeModal(true); }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Geler ce wallet
              </Button>
            ) : (
              <p className="text-[12px] text-[#8A8278]">Seul un administrateur peut geler un wallet.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Modale de GEL ─────────────────────────────── */}
      <Modal
        isOpen={showFreezeModal}
        onClose={() => { setShowFreezeModal(false); setErrorMsg(null); }}
        title="Geler ce wallet"
        subtitle={`Action réversible. Tracée dans le journal d'audit ACPR (art. L.561-15 CMF).`}
      >
        <div className="space-y-5">
          {/* Wallet ciblé — répété dans la modale */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[#F9F8F5] border border-[#E7E7E7] rounded-[8px]">
            <div className="w-9 h-9 rounded-[8px] bg-white border border-[#E7E7E7] flex items-center justify-center text-[11px] font-medium text-[#0A0A0A] flex-shrink-0">
              {(walletNetwork || '?').slice(0, 3).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[#0A0A0A] truncate">{walletName || '—'}</p>
              <p className="text-[11.5px] text-[#8A8278] font-mono truncate mt-0.5">{shortAddr(walletAddress || walletId)}</p>
            </div>
          </div>

          <div className="px-4 py-3 bg-[#FEF8EC] border border-[rgba(200,146,75,0.22)] rounded-[8px]">
            <p className="text-[12.5px] text-[#7C5E3C] leading-[1.5] tracking-[-0.003em]">
              <strong>Client :</strong> {clientName || '—'}<br />
              Le gel bloquera tous les transferts sortants et l'exécution des ordres de signature sur ce wallet. Les autres wallets du client resteront opérationnels.
            </p>
          </div>

          <div>
            <label className={labelCls}>Motif du gel <span className="text-[#DC2626]">*</span></label>
            <textarea
              className={`${inputCls} min-h-[84px] py-3 resize-none`}
              placeholder="Ex. Alerte Tracfin #2024-… — transactions suspectes en provenance de…"
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            />
          </div>

          <div>
            <label className={labelCls}>Référence légale</label>
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
            <label className={labelCls}>Notes internes</label>
            <textarea
              className={`${inputCls} min-h-[60px] py-3 resize-none`}
              placeholder="Contexte, pièces jointes, interlocuteurs…"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {errorMsg && (
            <div className="px-4 py-3 bg-[#FEF2F2] border border-[rgba(220,38,38,0.22)] rounded-[8px]">
              <p className="text-[12.5px] text-[#991B1B]">{errorMsg}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-5 border-t border-[#E7E7E7]">
            <Button variant="ghost" onClick={() => { setShowFreezeModal(false); setErrorMsg(null); }}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleFreeze}
              disabled={submitting || !form.reason.trim()}
            >
              {submitting ? 'Gel en cours…' : 'Confirmer le gel'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modale de DÉGEL ───────────────────────────── */}
      <Modal
        isOpen={showUnfreezeModal}
        onClose={() => { setShowUnfreezeModal(false); setErrorMsg(null); }}
        title="Dégeler ce wallet"
        subtitle="Cette action réautorisera toutes les opérations sur le wallet. Elle est tracée dans le journal d'audit."
      >
        <div className="space-y-5">
          <div className="flex items-center gap-3 px-4 py-3 bg-[#F9F8F5] border border-[#E7E7E7] rounded-[8px]">
            <div className="w-9 h-9 rounded-[8px] bg-white border border-[#E7E7E7] flex items-center justify-center text-[11px] font-medium text-[#0A0A0A] flex-shrink-0">
              {(walletNetwork || '?').slice(0, 3).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[#0A0A0A] truncate">{walletName || '—'}</p>
              <p className="text-[11.5px] text-[#8A8278] font-mono truncate mt-0.5">{shortAddr(walletAddress || walletId)}</p>
            </div>
          </div>

          {freezeData && (
            <div className="px-4 py-3 bg-white border border-[#E7E7E7] rounded-[8px] text-[12.5px] text-[#5D5D5D] leading-[1.5]">
              Gelé le <strong className="text-[#0A0A0A]">{fmtDate(freezeData.frozen_at)}</strong> par <strong className="text-[#0A0A0A]">{freezeData.frozen_by_email}</strong><br />
              Motif : {freezeData.reason}
            </div>
          )}

          {errorMsg && (
            <div className="px-4 py-3 bg-[#FEF2F2] border border-[rgba(220,38,38,0.22)] rounded-[8px]">
              <p className="text-[12.5px] text-[#991B1B]">{errorMsg}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-5 border-t border-[#E7E7E7]">
            <Button variant="ghost" onClick={() => { setShowUnfreezeModal(false); setErrorMsg(null); }}>
              Annuler
            </Button>
            <Button variant="primary" onClick={handleUnfreeze} disabled={submitting}>
              {submitting ? 'Dégel en cours…' : 'Confirmer le dégel'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
