import { useState, useEffect } from 'react';
import { listPolicies, createPolicy } from '../services/dfnsApi';
import { Badge, Modal, Spinner, EmptyState, inputCls, selectCls, labelCls } from './shared';

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

  return (
    <div className="page-slide-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[22px] font-semibold text-[#0F0F10] tracking-tight">Policies</h2>
          <p className="text-[13px] text-[#787881] mt-0.5">{policies.length} politique{policies.length > 1 ? 's' : ''} d'approbation Dfns</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-[#0F0F10] text-white text-[13px] font-medium rounded-xl hover:bg-[#1a1a1a] transition-colors">
          + Nouvelle politique
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Politiques actives', value: policies.filter(p => p.status === 'Active').length },
          { label: 'En attente', value: policies.filter(p => p.status === 'Pending').length },
          { label: 'Total', value: policies.length },
        ].map((s, i) => (
          <div key={i} className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-5 text-center">
            <p className="text-[12px] text-[#A8A29E] font-medium mb-1">{s.label}</p>
            <p className="text-[22px] font-bold text-[#0F0F10] tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : policies.length === 0 ? (
        <EmptyState
          title="Aucune politique"
          description="Configurez des politiques d'approbation pour securiser les operations"
          icon={<svg className="w-6 h-6 text-[#A8A29E]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
        />
      ) : (
        <div className="space-y-3">
          {policies.map(pol => (
            <div key={pol.id} className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-5 hover:border-[rgba(0,0,29,0.15)] transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-[#EEF2FF] rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-[#6366F1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-[14px] font-semibold text-[#0F0F10]">{pol.name}</h3>
                    {pol.description && <p className="text-[13px] text-[#787881] mt-0.5">{pol.description}</p>}
                    <div className="flex items-center gap-3 mt-2">
                      <Badge variant="info">{pol.activityKind}</Badge>
                      <span className="text-[12px] text-[#A8A29E]">{pol.rule?.kind || '—'}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant={pol.status === 'Active' ? 'success' : pol.status === 'Pending' ? 'warning' : 'default'}>{pol.status}</Badge>
                  <p className="text-[11px] text-[#A8A29E] mt-1">{pol.dateCreated ? new Date(pol.dateCreated).toLocaleDateString('fr-FR') : ''}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Policy Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nouvelle politique">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Nom</label>
            <input className={inputCls} placeholder="Ex: Approbation transferts > 10k" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <input className={inputCls} placeholder="Description optionnelle" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Type d'activite</label>
            <select className={selectCls} value={form.activityKind} onChange={e => setForm(p => ({ ...p, activityKind: e.target.value }))}>
              <option value="Wallets:Sign">Signature de wallet</option>
              <option value="Wallets:IncomingTransaction">Transaction entrante</option>
              <option value="Wallets:TransferAsset">Transfert d'actif</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Regle</label>
            <select className={selectCls} value={form.rule} onChange={e => setForm(p => ({ ...p, rule: e.target.value }))}>
              <option value="AlwaysRequireApproval">Toujours exiger approbation</option>
              <option value="RequestApproval">Demander approbation</option>
            </select>
          </div>
          <button onClick={handleCreate} disabled={creating || !form.name}
            className="w-full py-2.5 bg-[#0F0F10] text-white text-[14px] font-medium rounded-xl hover:bg-[#1a1a1a] transition-colors disabled:opacity-40">
            {creating ? 'Creation...' : 'Creer la politique'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

