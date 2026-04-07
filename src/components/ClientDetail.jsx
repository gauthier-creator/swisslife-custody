import { useState, useEffect } from 'react';
import { listWallets, createWallet, getWalletAssets, transferAsset, getWalletHistory } from '../services/dfnsApi';
import { SUPPORTED_NETWORKS } from '../config/constants';
import { fmtEUR, Badge, Modal, Spinner, EmptyState, inputCls, selectCls, labelCls } from './shared';

const truncAddr = (a, n = 8) => a ? `${a.slice(0, n)}...${a.slice(-n)}` : '—';

export default function ClientDetail({ client, onBack }) {
  const [tab, setTab] = useState('wallets');
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newWallet, setNewWallet] = useState({ name: '', network: 'EthereumSepolia' });
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [assets, setAssets] = useState(null);
  const [history, setHistory] = useState([]);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transfer, setTransfer] = useState({ to: '', amount: '', kind: 'Native' });
  const [sending, setSending] = useState(false);

  useEffect(() => { loadWallets(); }, []);

  const loadWallets = async () => {
    setLoading(true);
    try {
      const all = await listWallets(client.id);
      setWallets(all);
    } catch { setWallets([]); }
    setLoading(false);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createWallet({ network: newWallet.network, name: newWallet.name, externalId: client.id, tags: [`client:${client.name}`] });
      await loadWallets();
      setShowCreate(false);
      setNewWallet({ name: '', network: 'EthereumSepolia' });
    } catch (err) { alert(err.message); }
    setCreating(false);
  };

  const selectWallet = async (w) => {
    setSelectedWallet(w);
    setAssets(null);
    setHistory([]);
    try {
      const [a, h] = await Promise.all([getWalletAssets(w.id), getWalletHistory(w.id)]);
      setAssets(a);
      setHistory(h.items || []);
    } catch { /* ignore */ }
  };

  const handleTransfer = async () => {
    if (!selectedWallet) return;
    setSending(true);
    try {
      await transferAsset(selectedWallet.id, transfer);
      setShowTransfer(false);
      setTransfer({ to: '', amount: '', kind: 'Native' });
    } catch (err) { alert(err.message); }
    setSending(false);
  };

  const net = (id) => SUPPORTED_NETWORKS.find(n => n.id === id) || { icon: '?', color: '#999', name: id };

  return (
    <div className="page-slide-in">
      {/* Back + Client header */}
      <button onClick={onBack} className="flex items-center gap-2 text-[13px] text-[#787881] hover:text-[#0F0F10] transition-colors font-medium group mb-6">
        <svg className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Retour aux clients
      </button>

      <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-[#0F0F10] rounded-xl flex items-center justify-center text-white text-[14px] font-bold">
                {client.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-[20px] font-bold text-[#0F0F10] tracking-tight">{client.name}</h2>
                <p className="text-[13px] text-[#787881]">{[client.city, client.country].filter(Boolean).join(', ')}</p>
              </div>
            </div>
            {client.description && <p className="text-[13px] text-[#787881] mt-2 max-w-xl">{client.description}</p>}
          </div>
          <div className="text-right">
            <p className="text-[12px] text-[#A8A29E] font-medium">AUM</p>
            <p className="text-[22px] font-bold text-[#0F0F10] tabular-nums">{client.aum ? fmtEUR(client.aum) : '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[rgba(0,0,29,0.06)]">
          <div className="text-[12px]"><span className="text-[#A8A29E]">Type</span> <Badge variant={client.type === 'Institutional' ? 'info' : client.type === 'UHNWI' ? 'success' : 'default'}>{client.type}</Badge></div>
          <div className="text-[12px]"><span className="text-[#A8A29E]">Industrie</span> <span className="text-[#0F0F10] font-medium ml-1">{client.industry || '—'}</span></div>
          {client.phone && <div className="text-[12px]"><span className="text-[#A8A29E]">Tel</span> <span className="text-[#0F0F10] font-medium ml-1">{client.phone}</span></div>}
          <div className="text-[12px]"><span className="text-[#A8A29E]">ID Salesforce</span> <span className="font-mono text-[#787881] ml-1 text-[11px]">{client.id}</span></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-[rgba(0,0,23,0.03)] rounded-lg p-0.5 mb-6 w-fit">
        {['wallets', 'transfers', 'history'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-[13px] font-medium rounded-md transition-all capitalize ${tab === t ? 'bg-white text-[#0F0F10] shadow-[0_1px_3px_rgba(0,0,0,0.06)]' : 'text-[#787881] hover:text-[#0F0F10]'}`}>
            {t === 'wallets' ? `Wallets (${wallets.length})` : t === 'transfers' ? 'Transferts' : 'Historique'}
          </button>
        ))}
      </div>

      {/* Wallets Tab */}
      {tab === 'wallets' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px] font-semibold text-[#0F0F10]">Wallets Dfns</h3>
            <button onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-[#0F0F10] text-white text-[13px] font-medium rounded-xl hover:bg-[#1a1a1a] transition-colors">
              + Creer un wallet
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : wallets.length === 0 ? (
            <EmptyState
              title="Aucun wallet"
              description="Creez un premier wallet pour ce client via Dfns"
              icon={<svg className="w-6 h-6 text-[#A8A29E]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>}
            />
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {wallets.map(w => {
                const n = net(w.network);
                return (
                  <button key={w.id} onClick={() => selectWallet(w)}
                    className={`bg-white border rounded-2xl p-5 text-left hover:border-[rgba(0,0,29,0.15)] transition-all ${selectedWallet?.id === w.id ? 'border-[#6366F1] shadow-[0_0_0_3px_rgba(99,102,241,0.08)]' : 'border-[rgba(0,0,29,0.08)]'}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-[14px]" style={{ backgroundColor: n.color }}>
                        {n.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-[#0F0F10] truncate">{w.name || n.name}</p>
                        <p className="text-[11px] text-[#A8A29E]">{n.name}</p>
                      </div>
                      <Badge variant={w.status === 'Active' ? 'success' : 'warning'}>{w.status}</Badge>
                    </div>
                    <div className="font-mono text-[12px] text-[#787881] bg-[rgba(0,0,23,0.025)] rounded-lg px-3 py-2 truncate">
                      {truncAddr(w.address, 10)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Wallet detail panel */}
          {selectedWallet && (
            <div className="mt-6 bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[16px] font-semibold text-[#0F0F10]">{selectedWallet.name || 'Wallet'}</h4>
                <button onClick={() => setShowTransfer(true)}
                  className="px-4 py-2 bg-[#6366F1] text-white text-[13px] font-medium rounded-xl hover:bg-[#5558E6] transition-colors">
                  Envoyer
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-[rgba(0,0,23,0.025)] rounded-xl p-4">
                  <p className="text-[12px] text-[#A8A29E] mb-1">Adresse</p>
                  <p className="font-mono text-[12px] text-[#0F0F10] break-all">{selectedWallet.address}</p>
                </div>
                <div className="bg-[rgba(0,0,23,0.025)] rounded-xl p-4">
                  <p className="text-[12px] text-[#A8A29E] mb-1">Reseau</p>
                  <p className="text-[13px] font-medium text-[#0F0F10]">{net(selectedWallet.network).name}</p>
                </div>
                <div className="bg-[rgba(0,0,23,0.025)] rounded-xl p-4">
                  <p className="text-[12px] text-[#A8A29E] mb-1">Valeur nette</p>
                  <p className="text-[18px] font-bold text-[#0F0F10] tabular-nums">{assets?.netWorth?.USD ? `$${assets.netWorth.USD.toLocaleString()}` : '—'}</p>
                </div>
              </div>

              {/* Assets */}
              {assets?.assets?.length > 0 && (
                <div>
                  <h5 className="text-[14px] font-semibold text-[#0F0F10] mb-3">Actifs</h5>
                  <div className="space-y-2">
                    {assets.assets.map((a, i) => (
                      <div key={i} className="flex items-center justify-between py-2.5 px-4 bg-[rgba(0,0,23,0.015)] rounded-xl">
                        <div className="flex items-center gap-3">
                          <span className="text-[14px] font-bold text-[#0F0F10]">{a.symbol}</span>
                          <Badge>{a.kind}</Badge>
                        </div>
                        <div className="text-right">
                          <p className="text-[14px] font-semibold text-[#0F0F10] tabular-nums">{a.balance}</p>
                          {a.quotes?.USD && <p className="text-[11px] text-[#A8A29E] tabular-nums">${a.quotes.USD.toLocaleString()}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Transfers Tab */}
      {tab === 'transfers' && selectedWallet && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px] font-semibold text-[#0F0F10]">Transferts — {selectedWallet.name}</h3>
            <button onClick={() => setShowTransfer(true)}
              className="px-4 py-2 bg-[#0F0F10] text-white text-[13px] font-medium rounded-xl hover:bg-[#1a1a1a] transition-colors">
              + Nouveau transfert
            </button>
          </div>
          {history.length === 0 ? (
            <EmptyState title="Aucun transfert" description="Les transferts apparaitront ici" />
          ) : (
            <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(0,0,29,0.06)] bg-[rgba(0,0,23,0.02)]">
                    <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium text-left">Direction</th>
                    <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium text-left">Adresse</th>
                    <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium text-right">Montant</th>
                    <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium text-left">Statut</th>
                    <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium text-left">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((tx, i) => (
                    <tr key={tx.id || i} className="border-b border-[rgba(0,0,29,0.04)] hover:bg-[rgba(0,0,23,0.02)]">
                      <td className="px-5 py-3">
                        <Badge variant={tx.direction === 'In' ? 'success' : 'info'}>{tx.direction || '—'}</Badge>
                      </td>
                      <td className="px-5 py-3 font-mono text-[12px] text-[#787881]">{truncAddr(tx.to || tx.from, 8)}</td>
                      <td className="px-5 py-3 text-right text-[13px] font-medium text-[#0F0F10] tabular-nums">{tx.value || '—'}</td>
                      <td className="px-5 py-3"><Badge variant={tx.status === 'Confirmed' ? 'success' : 'warning'}>{tx.status || 'Pending'}</Badge></td>
                      <td className="px-5 py-3 text-[12px] text-[#787881]">{tx.timestamp ? new Date(tx.timestamp).toLocaleDateString('fr-FR') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'transfers' && !selectedWallet && (
        <EmptyState title="Selectionnez un wallet" description="Choisissez un wallet dans l'onglet Wallets pour voir ses transferts" />
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div>
          <h3 className="text-[16px] font-semibold text-[#0F0F10] mb-4">Historique global</h3>
          {wallets.length === 0 ? (
            <EmptyState title="Aucun wallet" description="Creez un wallet pour voir l'historique" />
          ) : (
            <div className="space-y-3">
              {wallets.map(w => {
                const n = net(w.network);
                return (
                  <div key={w.id} className="bg-white border border-[rgba(0,0,29,0.08)] rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[12px] font-bold" style={{ backgroundColor: n.color }}>{n.icon}</div>
                      <div>
                        <p className="text-[13px] font-medium text-[#0F0F10]">{w.name}</p>
                        <p className="font-mono text-[11px] text-[#A8A29E]">{truncAddr(w.address, 6)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={w.status === 'Active' ? 'success' : 'default'}>{w.status}</Badge>
                      <p className="text-[11px] text-[#A8A29E] mt-1">{w.dateCreated ? new Date(w.dateCreated).toLocaleDateString('fr-FR') : ''}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create Wallet Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Creer un wallet">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Nom du wallet</label>
            <input className={inputCls} placeholder="Ex: Wallet ETH principal" value={newWallet.name} onChange={e => setNewWallet(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Reseau</label>
            <select className={selectCls} value={newWallet.network} onChange={e => setNewWallet(p => ({ ...p, network: e.target.value }))}>
              {SUPPORTED_NETWORKS.map(n => <option key={n.id} value={n.id}>{n.name} ({n.symbol})</option>)}
            </select>
          </div>
          <div className="bg-[rgba(0,0,23,0.025)] rounded-xl p-3 text-[12px] text-[#787881]">
            <p>Le wallet sera lie au client <strong className="text-[#0F0F10]">{client.name}</strong> via l'ID Salesforce <code className="text-[#6366F1]">{client.id}</code>.</p>
          </div>
          <button onClick={handleCreate} disabled={creating || !newWallet.name}
            className="w-full py-2.5 bg-[#0F0F10] text-white text-[14px] font-medium rounded-xl hover:bg-[#1a1a1a] transition-colors disabled:opacity-40">
            {creating ? 'Creation...' : 'Creer le wallet'}
          </button>
        </div>
      </Modal>

      {/* Transfer Modal */}
      <Modal isOpen={showTransfer} onClose={() => setShowTransfer(false)} title="Envoyer des fonds">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Adresse de destination</label>
            <input className={inputCls} placeholder="0x..." value={transfer.to} onChange={e => setTransfer(p => ({ ...p, to: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Montant</label>
            <input className={inputCls} type="number" step="any" placeholder="0.0" value={transfer.amount} onChange={e => setTransfer(p => ({ ...p, amount: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <select className={selectCls} value={transfer.kind} onChange={e => setTransfer(p => ({ ...p, kind: e.target.value }))}>
              <option value="Native">Native</option>
              <option value="Erc20">ERC-20</option>
            </select>
          </div>
          <button onClick={handleTransfer} disabled={sending || !transfer.to || !transfer.amount}
            className="w-full py-2.5 bg-[#6366F1] text-white text-[14px] font-medium rounded-xl hover:bg-[#5558E6] transition-colors disabled:opacity-40">
            {sending ? 'Envoi...' : 'Confirmer le transfert'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

