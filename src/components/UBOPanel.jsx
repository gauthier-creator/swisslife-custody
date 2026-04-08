import { useState, useEffect, useCallback } from 'react';
import { fetchUBOs, addUBO, verifyUBO, deleteUBO } from '../services/complianceApi';
import { useAuth } from '../context/AuthContext';
import { useToast, ToastContainer, Badge, Modal, Spinner, EmptyState, inputCls, selectCls, labelCls } from './shared';

const CONTROL_TYPES = [
  { value: 'direct', label: 'Direct' },
  { value: 'indirect', label: 'Indirect' },
  { value: 'control', label: 'Controle' },
];

const DOC_TYPES = [
  { value: 'passport', label: 'Passeport' },
  { value: 'id_card', label: "Carte d'identite" },
  { value: 'driving_license', label: 'Permis de conduire' },
  { value: 'residence_permit', label: 'Titre de sejour' },
];

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : null;
const fmtPct = (v) => v != null ? `${Number(v).toFixed(2)}%` : '—';

const emptyForm = {
  fullName: '', birthDate: '', nationality: '', ownershipPercentage: '',
  controlType: 'direct', address: '', documentType: '', documentReference: '', notes: '',
};

export default function UBOPanel({ salesforceAccountId, clientName }) {
  const [ubos, setUbos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const { user, isAdmin } = useAuth();
  const { toasts, toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchUBOs(salesforceAccountId);
      setUbos(data);
    } catch (err) {
      toast('Erreur chargement UBOs', 'error');
    }
    setLoading(false);
  }, [salesforceAccountId]);

  useEffect(() => { load(); }, [load]);

  const totalPct = ubos.reduce((sum, u) => sum + (Number(u.ownership_percentage) || 0), 0);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addUBO({
        salesforceAccountId,
        fullName: form.fullName,
        birthDate: form.birthDate || null,
        nationality: form.nationality || null,
        ownershipPercentage: form.ownershipPercentage ? Number(form.ownershipPercentage) : null,
        controlType: form.controlType || null,
        address: form.address || null,
        documentType: form.documentType || null,
        documentReference: form.documentReference || null,
        addedByEmail: user?.email,
        notes: form.notes || null,
      });
      toast('Beneficiaire effectif ajoute', 'success');
      setShowAdd(false);
      setForm({ ...emptyForm });
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
    setSubmitting(false);
  };

  const handleVerify = async (id) => {
    try {
      await verifyUBO(id, user?.email);
      toast('UBO verifie', 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Supprimer le beneficiaire effectif "${name}" ?`)) return;
    try {
      await deleteUBO(id);
      toast('UBO supprime', 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const controlLabel = (t) => CONTROL_TYPES.find(c => c.value === t)?.label || t || '—';
  const docLabel = (t) => DOC_TYPES.find(d => d.value === t)?.label || t || '—';

  return (
    <div className="space-y-4">
      <ToastContainer toasts={toasts} />

      {/* Header */}
      <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[15px] font-semibold text-[#0F0F10]">Beneficiaires effectifs (UBO)</h3>
            <p className="text-[12px] text-[#787881] mt-0.5">{clientName}</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 bg-[#4F46E5] text-white text-[13px] font-medium rounded-lg hover:bg-[#4338CA] transition-colors"
          >
            + Ajouter un beneficiaire
          </button>
        </div>

        {/* Total ownership bar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 bg-[rgba(0,0,29,0.04)] rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${totalPct > 100 ? 'bg-[#DC2626]' : totalPct >= 25 ? 'bg-[#4F46E5]' : 'bg-[#F59E0B]'}`}
              style={{ width: `${Math.min(totalPct, 100)}%` }}
            />
          </div>
          <span className={`text-[13px] font-semibold tabular-nums ${totalPct > 100 ? 'text-[#DC2626]' : totalPct >= 25 ? 'text-[#4F46E5]' : 'text-[#F59E0B]'}`}>
            {totalPct.toFixed(2)}%
          </span>
        </div>
        {totalPct > 100 && (
          <div className="bg-[#FEF2F2] border border-[rgba(220,38,38,0.15)] rounded-lg px-3 py-2 mb-3">
            <p className="text-[12px] text-[#991B1B] font-medium">Total de detention superieur a 100% — verifiez les pourcentages saisis.</p>
          </div>
        )}
        {ubos.length > 0 && totalPct < 25 && (
          <div className="bg-[#FFFBEB] border border-[rgba(217,119,6,0.15)] rounded-lg px-3 py-2 mb-3">
            <p className="text-[12px] text-[#92400E] font-medium">Aucun beneficiaire effectif ne depasse le seuil de 25% — obligation reglementaire d'identification.</p>
          </div>
        )}

        {/* Legal notice */}
        <div className="bg-[rgba(0,0,29,0.02)] border border-[rgba(0,0,29,0.06)] rounded-lg px-3 py-2">
          <p className="text-[11px] text-[#787881] leading-relaxed">
            <span className="font-semibold">Art. L.561-2-2 CMF</span> — Obligation d'identification des beneficiaires effectifs detenant plus de 25% du capital ou des droits de vote.
          </p>
        </div>
      </div>

      {/* UBO Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : ubos.length === 0 ? (
        <EmptyState
          title="Aucun beneficiaire effectif"
          description="Ajoutez les beneficiaires effectifs de ce client institutionnel."
        />
      ) : (
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[rgba(0,0,29,0.06)]">
                <th className="text-left text-[11px] font-semibold text-[#787881] uppercase tracking-wider px-5 py-3">Nom</th>
                <th className="text-left text-[11px] font-semibold text-[#787881] uppercase tracking-wider px-5 py-3">Nationalite</th>
                <th className="text-right text-[11px] font-semibold text-[#787881] uppercase tracking-wider px-5 py-3">Detention</th>
                <th className="text-left text-[11px] font-semibold text-[#787881] uppercase tracking-wider px-5 py-3">Type controle</th>
                <th className="text-left text-[11px] font-semibold text-[#787881] uppercase tracking-wider px-5 py-3">Document</th>
                <th className="text-center text-[11px] font-semibold text-[#787881] uppercase tracking-wider px-5 py-3">Verifie</th>
                {isAdmin && <th className="text-right text-[11px] font-semibold text-[#787881] uppercase tracking-wider px-5 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {ubos.map((u) => (
                <tr key={u.id} className="border-b border-[rgba(0,0,29,0.04)] hover:bg-[rgba(0,0,29,0.015)] transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-[13px] font-medium text-[#0F0F10]">{u.full_name}</p>
                    {u.birth_date && <p className="text-[11px] text-[#787881]">Ne(e) le {fmtDate(u.birth_date)}</p>}
                  </td>
                  <td className="px-5 py-3 text-[13px] text-[#0F0F10]">{u.nationality || '—'}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={`text-[13px] font-semibold tabular-nums ${Number(u.ownership_percentage) >= 25 ? 'text-[#4F46E5]' : 'text-[#787881]'}`}>
                      {fmtPct(u.ownership_percentage)}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Badge color={u.control_type === 'direct' ? 'green' : u.control_type === 'indirect' ? 'yellow' : 'blue'}>
                      {controlLabel(u.control_type)}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    {u.document_type ? (
                      <div>
                        <p className="text-[12px] text-[#0F0F10]">{docLabel(u.document_type)}</p>
                        {u.document_reference && <p className="text-[11px] text-[#787881] font-mono">{u.document_reference}</p>}
                      </div>
                    ) : (
                      <span className="text-[12px] text-[#787881]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {u.verified ? (
                      <div className="flex flex-col items-center">
                        <svg className="w-5 h-5 text-[#059669]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {u.verified_at && <p className="text-[10px] text-[#787881] mt-0.5">{fmtDate(u.verified_at)}</p>}
                      </div>
                    ) : isAdmin ? (
                      <button
                        onClick={() => handleVerify(u.id)}
                        className="text-[12px] text-[#4F46E5] hover:text-[#4338CA] font-medium hover:underline"
                      >
                        Verifier
                      </button>
                    ) : (
                      <span className="text-[12px] text-[#F59E0B] font-medium">En attente</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleDelete(u.id, u.full_name)}
                        className="text-[12px] text-[#DC2626] hover:text-[#991B1B] font-medium hover:underline"
                      >
                        Supprimer
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add UBO Modal */}
      {showAdd && (
        <Modal title="Ajouter un beneficiaire effectif" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className={labelCls}>Nom complet *</label>
              <input className={inputCls} required value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="Prenom et nom" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Date de naissance</label>
                <input type="date" className={inputCls} value={form.birthDate} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Nationalite</label>
                <input className={inputCls} value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} placeholder="ex: Francaise" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Pourcentage de detention</label>
                <input type="number" step="0.01" min="0" max="100" className={inputCls} value={form.ownershipPercentage} onChange={e => setForm(f => ({ ...f, ownershipPercentage: e.target.value }))} placeholder="ex: 35.50" />
              </div>
              <div>
                <label className={labelCls}>Type de controle</label>
                <select className={selectCls} value={form.controlType} onChange={e => setForm(f => ({ ...f, controlType: e.target.value }))}>
                  {CONTROL_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Adresse</label>
              <input className={inputCls} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Adresse de residence" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Type de document</label>
                <select className={selectCls} value={form.documentType} onChange={e => setForm(f => ({ ...f, documentType: e.target.value }))}>
                  <option value="">-- Selectionner --</option>
                  {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Reference du document</label>
                <input className={inputCls} value={form.documentReference} onChange={e => setForm(f => ({ ...f, documentReference: e.target.value }))} placeholder="ex: 12AB34567" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <textarea className={inputCls} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Informations complementaires..." />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-[13px] text-[#787881] hover:text-[#0F0F10] font-medium">
                Annuler
              </button>
              <button type="submit" disabled={submitting} className="px-5 py-2 bg-[#4F46E5] text-white text-[13px] font-medium rounded-lg hover:bg-[#4338CA] transition-colors disabled:opacity-50">
                {submitting ? 'Ajout...' : 'Ajouter'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
