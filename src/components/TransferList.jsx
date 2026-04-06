import { useState, useEffect } from 'react';
import { listWallets, getWalletHistory, transferAsset } from '../services/dfnsApi';
import { getNetwork, getExplorerUrl } from '../utils/networks';
import { truncateAddress, timeAgo } from '../utils/format';
import { Modal, Badge, Spinner, EmptyState, inputCls, selectCls, labelCls, fmtUSD } from './shared';

export default function TransferList({ clientId, toast }) {
  const [wallets, setWallets] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTransfer, setShowTransfer] = useState(false);

  useEffect(() => { loadData(); }, [clientId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const ws = await listWallets(clientId);
      setWallets(ws);
      const allHistory = await Promise.all(ws.map(async (w) => {
        try {
          const h = await getWalletHistory(w.id);
          return (h.items || []).map(item => ({ ...item, walletName: w.name, walletNetwork: w.network }));
        } catch { return []; }
      }));
      setHistory(allHistory.flat().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    } catch { setHistory([]); }
    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Spinner /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] text-[#787881]">{history.length} transaction{history.length > 1 ? 's' : ''}</p>
        {wallets.length > 0 && (
          <button
            onClick={() => setShowTransfer(true)}
            className="px-4 py-2 bg-[#0F0F10] text-white rounded-xl text-[13px] font-medium hover:bg-[#292524] transition-colors"
          >
            Envoyer
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <EmptyState
          title="Aucune transaction"
          description="Les transactions apparaitront ici une fois que des transferts auront ete effectues"
        />
      ) : (
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-[rgba(0,0,29,0.06)] bg-[rgba(0,0,23,0.02)]">
                <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Date</th>
                <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Type</th>
                <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Direction</th>
                <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Wallet</th>
                <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium text-right">Montant</th>
                <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Tx</th>
              </tr>
            </thead>
            <tbody className="stagger-rows">
              {history.slice(0, 50).map((tx, i) => {
                const net = getNetwork(tx.walletNetwork);
                return (
                  <tr key={i} className="border-b border-[rgba(0,0,29,0.04)] hover:bg-[rgba(0,0,23,0.02)] transition-colors">
                    <td className="px-5 py-3 text-[12px] text-[#787881]">{tx.timestamp ? timeAgo(tx.timestamp) : '—'}</td>
                    <td className="px-5 py-3">
                      <Badge>{tx.kind || '—'}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={tx.direction === 'In' ? 'success' : 'warning'}>
                        {tx.direction || '—'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-[12px] text-[#787881]">{tx.walletName || net.name}</td>
                    <td className="px-5 py-3 text-right text-[12px] font-medium text-[#0F0F10] tabular-nums">
                      {tx.value || '—'}
                    </td>
                    <td className="px-5 py-3">
                      {tx.txHash ? (
                        <a href={getExplorerUrl(tx.walletNetwork, tx.txHash)} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] font-mono text-[#787881] hover:text-[#0F0F10] transition-colors">
                          {truncateAddress(tx.txHash)}
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Transfer modal */}
      <TransferModal isOpen={showTransfer} onClose={() => setShowTransfer(false)} wallets={wallets} toast={toast} onSuccess={loadData} />
    </div>
  );
}

function TransferModal({ isOpen, onClose, wallets, toast, onSuccess }) {
  const [walletId, setWalletId] = useState(wallets[0]?.id || '');
  const [kind, setKind] = useState('Native');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [contract, setContract] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!to || !amount) return;
    setSending(true);
    try {
      await transferAsset(walletId, { kind, to, amount, contract: kind === 'Erc20' ? contract : undefined });
      toast?.('Transfert initie avec succes');
      onClose();
      onSuccess?.();
    } catch (err) {
      toast?.('Erreur: ' + err.message);
    }
    setSending(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Envoyer des actifs">
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Wallet source</label>
          <select value={walletId} onChange={e => setWalletId(e.target.value)} className={selectCls}>
            {wallets.map(w => (
              <option key={w.id} value={w.id}>{w.name || w.network} — {truncateAddress(w.address)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Type de transfert</label>
          <select value={kind} onChange={e => setKind(e.target.value)} className={selectCls}>
            <option value="Native">Native (ETH, BTC, ADA...)</option>
            <option value="Erc20">ERC-20 Token</option>
            <option value="Erc721">NFT (ERC-721)</option>
          </select>
        </div>
        {kind === 'Erc20' && (
          <div>
            <label className={labelCls}>Adresse du contrat</label>
            <input type="text" value={contract} onChange={e => setContract(e.target.value)} placeholder="0x..." className={inputCls} />
          </div>
        )}
        <div>
          <label className={labelCls}>Adresse destinataire</label>
          <input type="text" value={to} onChange={e => setTo(e.target.value)} placeholder="0x... ou addr1..." className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Montant</label>
          <input type="text" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.0" className={inputCls} />
        </div>
        <button
          onClick={handleSend}
          disabled={sending || !to || !amount}
          className="w-full py-2.5 bg-[#0F0F10] text-white rounded-xl text-[14px] font-medium hover:bg-[#292524] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {sending ? <><Spinner size="w-4 h-4" /> Envoi en cours...</> : 'Envoyer'}
        </button>
      </div>
    </Modal>
  );
}
