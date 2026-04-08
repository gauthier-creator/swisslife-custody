import { useState, useEffect } from 'react';
import { listWallets, listTransfers, getWalletHistory, transferAsset } from '../services/dfnsApi';
import { getNetwork, getExplorerUrl } from '../utils/networks';
import { truncateAddress, timeAgo } from '../utils/format';
import { Modal, Badge, Spinner, EmptyState, inputCls, selectCls, labelCls } from './shared';

// DFNS transfer status → display
const transferStatusMap = {
  Pending: { label: 'En attente (policy)', variant: 'warning', icon: '⏳' },
  Executing: { label: 'Execution', variant: 'info', icon: '⚙' },
  Broadcasted: { label: 'Diffuse', variant: 'info', icon: '📡' },
  Confirmed: { label: 'Confirme', variant: 'success', icon: '✓' },
  Failed: { label: 'Echoue', variant: 'error', icon: '✗' },
  Rejected: { label: 'Rejete (compliance)', variant: 'error', icon: '🛑' },
};

function TransferStatusBadge({ status, reason, approvalId, datePolicyResolved }) {
  const info = transferStatusMap[status] || { label: status || '—', variant: 'default' };
  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant={info.variant}>
        {info.label}
      </Badge>
      {status === 'Rejected' && reason && (
        <span className="text-[10px] text-[#DC2626] leading-tight">{reason}</span>
      )}
      {status === 'Pending' && approvalId && (
        <span className="text-[10px] text-[#D97706] leading-tight">Approval requise</span>
      )}
      {datePolicyResolved && status !== 'Pending' && (
        <span className="text-[10px] text-[#787881] leading-tight">
          Policy: {new Date(datePolicyResolved).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}

export default function TransferList({ clientId, toast }) {
  const [wallets, setWallets] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTransfer, setShowTransfer] = useState(false);
  const [viewMode, setViewMode] = useState('transfers'); // 'transfers' | 'history'

  useEffect(() => { loadData(); }, [clientId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const ws = await listWallets(clientId);
      setWallets(ws);

      // Load DFNS transfers (with compliance status)
      const allTransfers = await Promise.all(ws.map(async (w) => {
        try {
          const items = await listTransfers(w.id);
          return items.map(t => ({ ...t, walletName: w.name, walletNetwork: w.network, walletAddress: w.address }));
        } catch { return []; }
      }));
      setTransfers(allTransfers.flat().sort((a, b) => new Date(b.dateRequested || 0) - new Date(a.dateRequested || 0)));

      // Load wallet history (on-chain confirmed)
      const allHistory = await Promise.all(ws.map(async (w) => {
        try {
          const h = await getWalletHistory(w.id);
          return (h.items || []).map(item => ({ ...item, walletName: w.name, walletNetwork: w.network }));
        } catch { return []; }
      }));
      setHistory(allHistory.flat().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    } catch { setTransfers([]); setHistory([]); }
    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Spinner /></div>;

  // Stats
  const pending = transfers.filter(t => t.status === 'Pending').length;
  const rejected = transfers.filter(t => t.status === 'Rejected').length;
  const confirmed = transfers.filter(t => t.status === 'Confirmed').length;

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-xl p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#EEF2FF] text-[#6366F1] flex items-center justify-center text-[13px] font-bold">{transfers.length}</div>
          <div><p className="text-[12px] font-medium text-[#0F0F10]">Total transferts</p></div>
        </div>
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-xl p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#FFFBEB] text-[#D97706] flex items-center justify-center text-[13px] font-bold">{pending}</div>
          <div><p className="text-[12px] font-medium text-[#0F0F10]">En attente policy</p></div>
        </div>
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-xl p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center text-[13px] font-bold">{rejected}</div>
          <div><p className="text-[12px] font-medium text-[#0F0F10]">Rejetes compliance</p></div>
        </div>
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-xl p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#ECFDF5] text-[#059669] flex items-center justify-center text-[13px] font-bold">{confirmed}</div>
          <div><p className="text-[12px] font-medium text-[#0F0F10]">Confirmes on-chain</p></div>
        </div>
      </div>

      {/* Toggle + action */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1 bg-[rgba(0,0,23,0.03)] rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('transfers')}
            className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${viewMode === 'transfers' ? 'bg-white text-[#0F0F10] shadow-sm' : 'text-[#787881]'}`}
          >
            Transferts DFNS ({transfers.length})
          </button>
          <button
            onClick={() => setViewMode('history')}
            className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all ${viewMode === 'history' ? 'bg-white text-[#0F0F10] shadow-sm' : 'text-[#787881]'}`}
          >
            Historique on-chain ({history.length})
          </button>
        </div>
        {wallets.length > 0 && (
          <button
            onClick={() => setShowTransfer(true)}
            className="px-4 py-2 bg-[#0F0F10] text-white rounded-xl text-[13px] font-medium hover:bg-[#292524] transition-colors"
          >
            Envoyer
          </button>
        )}
      </div>

      {/* DFNS Transfers view (with compliance status) */}
      {viewMode === 'transfers' && (
        transfers.length === 0 ? (
          <EmptyState
            title="Aucun transfert"
            description="Les transferts inities via DFNS apparaitront ici avec leur statut compliance (Chainalysis KYT)"
          />
        ) : (
          <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-[rgba(0,0,29,0.06)] bg-[rgba(0,0,23,0.02)]">
                  <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Date</th>
                  <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Wallet</th>
                  <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Destination</th>
                  <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium text-right">Montant</th>
                  <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Statut compliance</th>
                  <th className="px-5 py-3 text-[12px] text-[#A8A29E] font-medium">Tx</th>
                </tr>
              </thead>
              <tbody className="stagger-rows">
                {transfers.slice(0, 50).map((tx) => {
                  const reqBody = tx.requestBody || {};
                  return (
                    <tr key={tx.id} className="border-b border-[rgba(0,0,29,0.04)] hover:bg-[rgba(0,0,23,0.02)] transition-colors">
                      <td className="px-5 py-3 text-[12px] text-[#787881]">
                        {tx.dateRequested ? timeAgo(tx.dateRequested) : '—'}
                      </td>
                      <td className="px-5 py-3 text-[12px] text-[#787881]">
                        {tx.walletName || truncateAddress(tx.walletId || '')}
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-[10px] text-[#787881]">
                          {truncateAddress(reqBody.to || '')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-[12px] font-medium text-[#0F0F10] tabular-nums">
                        {reqBody.amount || '—'}
                        {tx.metadata?.asset?.symbol ? ` ${tx.metadata.asset.symbol}` : ''}
                      </td>
                      <td className="px-5 py-3">
                        <TransferStatusBadge
                          status={tx.status}
                          reason={tx.reason}
                          approvalId={tx.approvalId}
                          datePolicyResolved={tx.datePolicyResolved}
                        />
                      </td>
                      <td className="px-5 py-3">
                        {tx.txHash ? (
                          <a href={getExplorerUrl(tx.walletNetwork, tx.txHash)} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] font-mono text-[#6366F1] hover:underline">
                            {truncateAddress(tx.txHash)}
                          </a>
                        ) : (
                          <span className="text-[10px] text-[#A8A29E]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* On-chain history view */}
      {viewMode === 'history' && (
        history.length === 0 ? (
          <EmptyState
            title="Aucune transaction"
            description="Les transactions on-chain apparaitront ici une fois confirmees"
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
                      <td className="px-5 py-3"><Badge>{tx.kind || '—'}</Badge></td>
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
        )
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
      toast?.('Transfert initie — en attente de verification compliance');
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
        <div className="bg-[#EEF2FF] border border-[rgba(99,102,241,0.15)] rounded-xl px-4 py-3 text-[12px] text-[#6366F1]">
          Le transfert sera soumis au screening Chainalysis (KYT) via DFNS. Il peut etre bloque ou mis en attente d'approbation selon les policies configurees.
        </div>
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
          {sending ? <><Spinner size="w-4 h-4" /> Envoi en cours...</> : 'Soumettre au screening'}
        </button>
      </div>
    </Modal>
  );
}
