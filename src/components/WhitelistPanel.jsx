import { useState, useEffect } from 'react';
import { fetchWhitelist, addToWhitelist, approveWhitelistAddress, revokeWhitelistAddress } from '../services/complianceApi';
import { Badge, Modal, Spinner, inputCls, selectCls, labelCls } from './shared';
import { useAuth } from '../context/AuthContext';
import { SUPPORTED_NETWORKS } from '../config/constants';

const truncAddr = (a, n = 8) => a ? `${a.slice(0, n)}...${a.slice(-n)}` : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

const statusConfig = {
  pending:  { label: 'En attente', variant: 'warning' },
  approved: { label: 'Approuve',   variant: 'success' },
  revoked:  { label: 'Revoque',    variant: 'error' },
};

export default function WhitelistPanel({ client }) {
  const { isAdmin } = useAuth();
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [form, setForm] = useState({ address: '', network: 'EthereumSepolia', label: '', notes: '' });

  useEffect(() => { load(); }, [client.id]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchWhitelist(client.id);
      setAddresses(data);
    } catch (err) {
      console.error('fetchWhitelist error:', err);
      setAddresses([]);
    }
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!form.address.trim() || !form.label.trim()) return;
    setSaving(true);
    try {
      await addToWhitelist({
        clientId: client.id,
        address: form.address.trim(),
        network: form.network,
        label: form.label.trim(),
        notes: form.notes.trim() || null,
      });
      await load();
      setShowAdd(false);
      setForm({ address: '', network: 'EthereumSepolia', label: '', notes: '' });
    } catch (err) {
      console.error('addToWhitelist error:', err);
      alert('Erreur : ' + err.message);
    }
    setSaving(false);
  };

  const handleApprove = async (id) => {
    setActionLoading(id);
    try {
      await approveWhitelistAddress(id);
      await load();
    } catch (err) {
      console.error('approveWhitelistAddress error:', err);
      alert('Erreur : ' + err.message);
    }
    setActionLoading(null);
  };

  const handleRevoke = async (id) => {
    if (!confirm('Revoquer cette adresse ? Elle ne pourra plus recevoir de transferts.')) return;
    setActionLoading(id);
    try {
      await revokeWhitelistAddress(id);
      await load();
    } catch (err) {
      console.error('revokeWhitelistAddress error:', err);
      alert('Erreur : ' + err.message);
    }
    setActionLoading(null);
  };

  const net = (id) => SUPPORTED_NETWORKS.find(n => n.id === id) || { icon: '?', color: '#999', name: id };

  return (
    <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-semibold text-[#0F0F10]">Adresses whitelist</h3>
        <button
          onClick={() => setShowAdd(true)}
          className="px-3.5 py-1.5 bg-[#0F0F10] text-white text-[12px] font-medium rounded-lg hover:bg-[#1a1a1a] transition-colors"
        >
          + Ajouter une adresse
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : addresses.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-10 h-10 bg-[rgba(0,0,23,0.03)] rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-[#A8A29E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <p className="text-[13px] font-medium text-[#0F0F10]">Aucune adresse</p>
          <p className="text-[12px] text-[#A8A29E] mt-0.5">Ajoutez des adresses autorisees pour ce client</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[rgba(0,0,29,0.06)]">
                <th className="text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider pb-2.5 pr-4">Adresse</th>
                <th className="text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider pb-2.5 pr-4">Reseau</th>
                <th className="text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider pb-2.5 pr-4">Label</th>
                <th className="text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider pb-2.5 pr-4">Statut</th>
                <th className="text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider pb-2.5 pr-4">Date d'ajout</th>
                {isAdmin && <th className="text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider pb-2.5">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {addresses.map(a => {
                const n = net(a.network);
                const st = statusConfig[a.status] || statusConfig.pending;
                return (
                  <tr key={a.id} className="border-b border-[rgba(0,0,29,0.04)] last:border-0 hover:bg-[rgba(0,0,23,0.015)] transition-colors">
                    <td className="py-3 pr-4">
                      <span className="text-[12px] font-mono text-[#0F0F10]" title={a.address}>
                        {truncAddr(a.address)}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium"
                        style={{ backgroundColor: `${n.color}12`, color: n.color }}
                      >
                        <span className="text-[10px]">{n.icon}</span>
                        {n.name}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-[12px] text-[#0F0F10]">{a.label}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-[12px] text-[#787881]">{fmtDate(a.created_at)}</span>
                    </td>
                    {isAdmin && (
                      <td className="py-3">
                        <div className="flex items-center gap-1.5">
                          {a.status === 'pending' && (
                            <button
                              onClick={() => handleApprove(a.id)}
                              disabled={actionLoading === a.id}
                              className="px-2.5 py-1 bg-[#ECFDF5] text-[#059669] text-[11px] font-medium rounded-md hover:bg-[#D1FAE5] transition-colors disabled:opacity-40"
                            >
                              {actionLoading === a.id ? '...' : 'Approuver'}
                            </button>
                          )}
                          {a.status === 'approved' && (
                            <button
                              onClick={() => handleRevoke(a.id)}
                              disabled={actionLoading === a.id}
                              className="px-2.5 py-1 bg-[#FEF2F2] text-[#DC2626] text-[11px] font-medium rounded-md hover:bg-[#FEE2E2] transition-colors disabled:opacity-40"
                            >
                              {actionLoading === a.id ? '...' : 'Revoquer'}
                            </button>
                          )}
                          {a.status === 'revoked' && (
                            <span className="text-[11px] text-[#A8A29E]">—</span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Ajouter une adresse */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Ajouter une adresse a la whitelist">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Adresse</label>
            <input
              type="text"
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              placeholder="0x... ou bc1..."
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Reseau</label>
            <select
              value={form.network}
              onChange={e => setForm(f => ({ ...f, network: e.target.value }))}
              className={selectCls}
            >
              {SUPPORTED_NETWORKS.map(n => (
                <option key={n.id} value={n.id}>{n.icon} {n.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Label / Description</label>
            <input
              type="text"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder="Ex: Wallet principal Binance"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Notes (optionnel)</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Informations complementaires..."
              className={inputCls}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowAdd(false)}
              className="flex-1 py-2.5 text-[14px] font-medium text-[#787881] bg-[rgba(0,0,23,0.04)] rounded-xl hover:bg-[rgba(0,0,23,0.07)] transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !form.address.trim() || !form.label.trim()}
              className="flex-1 py-2.5 bg-[#6366F1] text-white text-[14px] font-medium rounded-xl hover:bg-[#5558E6] transition-colors disabled:opacity-40"
            >
              {saving ? 'Ajout...' : 'Ajouter'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
