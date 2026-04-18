import { useState, useEffect, useRef } from 'react';
import { listWallets, listTransfers, getWalletHistory, transferAsset } from '../services/dfnsApi';
import { screenAddress } from '../services/complianceApi';
import { getNetwork, getExplorerUrl } from '../utils/networks';
import { truncateAddress, timeAgo } from '../utils/format';
import {
  Modal, Badge, Spinner, EmptyState, Button, Card,
  inputCls, selectCls, labelCls,
} from './shared';

/* ─────────────────────────────────────────────────────────
   TransferList — editorial refresh + real Chainalysis KYT
   DFNS operates the custody; Chainalysis screens every
   destination address before the transfer is submitted.
   ───────────────────────────────────────────────────────── */

const transferStatusMap = {
  Pending:     { label: 'En attente · policy',   variant: 'warning' },
  Executing:   { label: 'Exécution',              variant: 'info'    },
  Broadcasted: { label: 'Diffusé',                variant: 'info'    },
  Confirmed:   { label: 'Confirmé on-chain',      variant: 'success' },
  Failed:      { label: 'Échoué',                  variant: 'error'   },
  Rejected:    { label: 'Rejeté · compliance',    variant: 'error'   },
};

function TransferStatusCell({ status, reason, approvalId, datePolicyResolved }) {
  const info = transferStatusMap[status] || { label: status || '—', variant: 'default' };
  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant={info.variant} dot>{info.label}</Badge>
      {status === 'Rejected' && reason && (
        <span className="text-[10.5px] text-[#991B1B] leading-tight tracking-[-0.003em]">{reason}</span>
      )}
      {status === 'Pending' && approvalId && (
        <span className="text-[10.5px] text-[#CA8A04] leading-tight tracking-[-0.003em]">Approbation requise</span>
      )}
      {datePolicyResolved && status !== 'Pending' && (
        <span className="text-[10.5px] text-[#8A8278] leading-tight tracking-[-0.003em]">
          Policy · {new Date(datePolicyResolved).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
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

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [clientId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const ws = await listWallets(clientId);
      setWallets(ws);

      const allTransfers = await Promise.all(ws.map(async (w) => {
        try {
          const items = await listTransfers(w.id);
          return items.map(t => ({ ...t, walletName: w.name, walletNetwork: w.network, walletAddress: w.address }));
        } catch { return []; }
      }));
      setTransfers(allTransfers.flat().sort((a, b) => new Date(b.dateRequested || 0) - new Date(a.dateRequested || 0)));

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

  if (loading) return <div className="flex items-center justify-center py-16"><Spinner /></div>;

  const pending = transfers.filter(t => t.status === 'Pending').length;
  const rejected = transfers.filter(t => t.status === 'Rejected').length;
  const confirmed = transfers.filter(t => t.status === 'Confirmed').length;

  return (
    <div className="space-y-5">
      {/* ── Stats row — editorial tiles ──────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Total transferts"    value={transfers.length} />
        <StatTile label="En attente policy"   value={pending}    tone="warning" />
        <StatTile label="Rejetés compliance"  value={rejected}   tone="error" />
        <StatTile label="Confirmés on-chain"  value={confirmed}  tone="success" />
      </div>

      {/* ── Chainalysis KYT banner ──────────────────────── */}
      <Card className="px-5 py-4 flex items-start gap-4 accent-ruler-left">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white border border-[#E9E4D9] shadow-crisp flex items-center justify-center">
          <svg className="w-[18px] h-[18px] text-[#0A0A0A]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-eyebrow">DFNS × Chainalysis · screening on-chain</p>
          <p className="text-[13.5px] text-[#1E1E1E] mt-1.5 leading-relaxed tracking-[-0.006em]">
            Chaque adresse destinataire est contrôlée en temps réel sur les listes <span className="font-medium text-[#0A0A0A]">OFAC SDN, EU Consolidated, UK HMT, ONU</span> via l'API publique Chainalysis avant d'être soumise au moteur de signature DFNS. Un match bloque immédiatement la transaction et crée une alerte Tracfin.
          </p>
        </div>
      </Card>

      {/* ── Toggle + action ──────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="inline-flex items-center p-0.5 bg-white border border-[#E9E4D9] rounded-full shadow-crisp">
          <button
            onClick={() => setViewMode('transfers')}
            className={`px-4 h-8 text-[12.5px] font-medium rounded-full transition-all tracking-[-0.006em] ${
              viewMode === 'transfers' ? 'bg-[#0A0A0A] text-white' : 'text-[#5D5D5D] hover:text-[#0A0A0A]'
            }`}
          >
            Transferts DFNS · {transfers.length}
          </button>
          <button
            onClick={() => setViewMode('history')}
            className={`px-4 h-8 text-[12.5px] font-medium rounded-full transition-all tracking-[-0.006em] ${
              viewMode === 'history' ? 'bg-[#0A0A0A] text-white' : 'text-[#5D5D5D] hover:text-[#0A0A0A]'
            }`}
          >
            Historique on-chain · {history.length}
          </button>
        </div>
        {wallets.length > 0 && (
          <Button variant="primary" onClick={() => setShowTransfer(true)}>
            <svg className="w-[13px] h-[13px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nouveau transfert
          </Button>
        )}
      </div>

      {/* ── Transfers table ──────────────────────────────── */}
      {viewMode === 'transfers' && (
        transfers.length === 0 ? (
          <EmptyState
            title="Aucun transfert"
            description="Les transferts initiés via DFNS apparaîtront ici avec leur statut compliance (Chainalysis KYT)."
          />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-[#E9E4D9] bg-white">
                  <th className="px-6 py-3.5 text-[11px] text-[#8A8278] font-medium uppercase tracking-[0.06em]">Date</th>
                  <th className="px-6 py-3.5 text-[11px] text-[#8A8278] font-medium uppercase tracking-[0.06em]">Wallet</th>
                  <th className="px-6 py-3.5 text-[11px] text-[#8A8278] font-medium uppercase tracking-[0.06em]">Destination</th>
                  <th className="px-6 py-3.5 text-[11px] text-[#8A8278] font-medium uppercase tracking-[0.06em] text-right">Montant</th>
                  <th className="px-6 py-3.5 text-[11px] text-[#8A8278] font-medium uppercase tracking-[0.06em]">Statut compliance</th>
                  <th className="px-6 py-3.5 text-[11px] text-[#8A8278] font-medium uppercase tracking-[0.06em]">Tx</th>
                </tr>
              </thead>
              <tbody>
                {transfers.slice(0, 50).map((tx) => {
                  const reqBody = tx.requestBody || {};
                  return (
                    <tr key={tx.id} className="border-b border-[#E9E4D9] hover:bg-white transition-colors">
                      <td className="px-6 py-4 text-[12.5px] text-[#5D5D5D] tracking-[-0.003em]">
                        {tx.dateRequested ? timeAgo(tx.dateRequested) : '—'}
                      </td>
                      <td className="px-6 py-4 text-[12.5px] text-[#0A0A0A] tracking-[-0.006em] font-medium">
                        {tx.walletName || truncateAddress(tx.walletId || '')}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-[11px] text-[#1E1E1E]">
                          {truncateAddress(reqBody.to || '')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-[13px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.01em]">
                        {reqBody.amount || '—'}
                        {tx.metadata?.asset?.symbol ? ` ${tx.metadata.asset.symbol}` : ''}
                      </td>
                      <td className="px-6 py-4">
                        <TransferStatusCell
                          status={tx.status}
                          reason={tx.reason}
                          approvalId={tx.approvalId}
                          datePolicyResolved={tx.datePolicyResolved}
                        />
                      </td>
                      <td className="px-6 py-4">
                        {tx.txHash ? (
                          <a
                            href={getExplorerUrl(tx.walletNetwork, tx.txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-mono text-[#7C5E3C] hover:text-[#0A0A0A] transition-colors"
                          >
                            {truncateAddress(tx.txHash)}
                          </a>
                        ) : (
                          <span className="text-[11px] text-[#8A8278]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )
      )}

      {/* ── On-chain history view ───────────────────────── */}
      {viewMode === 'history' && (
        history.length === 0 ? (
          <EmptyState
            title="Aucune transaction"
            description="Les transactions on-chain apparaîtront ici une fois confirmées sur le réseau."
          />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-[#E9E4D9] bg-white">
                  <th className="px-6 py-3.5 text-[11px] text-[#8A8278] font-medium uppercase tracking-[0.06em]">Date</th>
                  <th className="px-6 py-3.5 text-[11px] text-[#8A8278] font-medium uppercase tracking-[0.06em]">Type</th>
                  <th className="px-6 py-3.5 text-[11px] text-[#8A8278] font-medium uppercase tracking-[0.06em]">Direction</th>
                  <th className="px-6 py-3.5 text-[11px] text-[#8A8278] font-medium uppercase tracking-[0.06em]">Wallet</th>
                  <th className="px-6 py-3.5 text-[11px] text-[#8A8278] font-medium uppercase tracking-[0.06em] text-right">Montant</th>
                  <th className="px-6 py-3.5 text-[11px] text-[#8A8278] font-medium uppercase tracking-[0.06em]">Tx</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 50).map((tx, i) => {
                  const net = getNetwork(tx.walletNetwork);
                  return (
                    <tr key={i} className="border-b border-[#E9E4D9] hover:bg-white transition-colors">
                      <td className="px-6 py-4 text-[12.5px] text-[#5D5D5D]">{tx.timestamp ? timeAgo(tx.timestamp) : '—'}</td>
                      <td className="px-6 py-4"><Badge>{tx.kind || '—'}</Badge></td>
                      <td className="px-6 py-4">
                        <Badge variant={tx.direction === 'In' ? 'success' : 'warning'} dot>
                          {tx.direction || '—'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-[12.5px] text-[#0A0A0A] font-medium tracking-[-0.006em]">
                        {tx.walletName || net.name}
                      </td>
                      <td className="px-6 py-4 text-right text-[13px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.01em]">
                        {tx.value || '—'}
                      </td>
                      <td className="px-6 py-4">
                        {tx.txHash ? (
                          <a
                            href={getExplorerUrl(tx.walletNetwork, tx.txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-mono text-[#7C5E3C] hover:text-[#0A0A0A] transition-colors"
                          >
                            {truncateAddress(tx.txHash)}
                          </a>
                        ) : (
                          <span className="text-[11px] text-[#8A8278]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )
      )}

      {/* Transfer modal */}
      <TransferModal
        isOpen={showTransfer}
        onClose={() => setShowTransfer(false)}
        wallets={wallets}
        toast={toast}
        onSuccess={loadData}
      />
    </div>
  );
}

/* ─── Sub · stat tile ─── */
function StatTile({ label, value, tone }) {
  const toneColor = {
    warning: '#CA8A04',
    error:   '#DC2626',
    success: '#16A34A',
  }[tone] || '#0A0A0A';
  return (
    <div className="bg-white border border-[#E9E4D9] rounded-[8px] shadow-crisp px-5 py-4">
      <p className="text-eyebrow">{label}</p>
      <p className="text-[32px] font-medium mt-2 tabular-nums leading-none tracking-[-0.025em]" style={{ color: toneColor }}>
        {value}
      </p>
    </div>
  );
}

/* ─── Sub · Transfer Modal with live Chainalysis screening ─── */
function TransferModal({ isOpen, onClose, wallets, toast, onSuccess }) {
  const [walletId, setWalletId] = useState(wallets[0]?.id || '');
  const [kind, setKind] = useState('Native');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [contract, setContract] = useState('');
  const [sending, setSending] = useState(false);

  // Chainalysis screening state
  const [screening, setScreening] = useState(false);
  const [screenResult, setScreenResult] = useState(null);
  const [screenError, setScreenError] = useState(null);
  const debounceRef = useRef(null);

  // Reset on open
  useEffect(() => {
    if (!isOpen) {
      setTo(''); setAmount(''); setContract('');
      setScreenResult(null); setScreenError(null); setScreening(false);
    }
  }, [isOpen]);

  // Debounced real-time screening whenever the destination address changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setScreenResult(null);
    setScreenError(null);

    const addr = to.trim();
    if (!addr || addr.length < 10) return;

    debounceRef.current = setTimeout(async () => {
      const currentWallet = wallets.find(w => w.id === walletId);
      setScreening(true);
      try {
        const result = await screenAddress({
          address: addr,
          chain: currentWallet?.network,
          walletId,
          context: 'pre_transfer',
        });
        setScreenResult(result);
      } catch (err) {
        setScreenError(err.message || 'Echec du screening');
      } finally {
        setScreening(false);
      }
    }, 500);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [to, walletId, wallets]);

  const blocked = screenResult?.flagged === true;
  const clear = screenResult?.flagged === false;

  const handleSend = async () => {
    if (!to || !amount) return;
    if (blocked) {
      toast?.('Transfert bloqué — adresse sanctionnée');
      return;
    }
    setSending(true);
    try {
      await transferAsset(walletId, { kind, to, amount, contract: kind === 'Erc20' ? contract : undefined });
      toast?.('Transfert initié — en attente de vérification compliance');
      onClose();
      onSuccess?.();
    } catch (err) {
      toast?.('Erreur : ' + err.message);
    }
    setSending(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nouveau transfert"
      subtitle="Chaque destination est contrôlée par Chainalysis avant d'être soumise au moteur DFNS."
      maxWidth="max-w-xl"
    >
      <div className="space-y-5">
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
            <option value="Native">Natif (ETH, BTC, ADA...)</option>
            <option value="Erc20">ERC-20 · Token</option>
            <option value="Erc721">NFT · ERC-721</option>
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
          <input
            type="text"
            value={to}
            onChange={e => setTo(e.target.value)}
            placeholder="0x... ou addr1..."
            className={inputCls}
          />

          {/* Live screening card */}
          {(screening || screenResult || screenError) && (
            <div className="mt-3">
              <ScreeningCard screening={screening} result={screenResult} error={screenError} />
            </div>
          )}
        </div>

        <div>
          <label className={labelCls}>Montant</label>
          <input type="text" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.0" className={inputCls} />
        </div>

        <div className="flex justify-end gap-2 pt-5 border-t border-[#E9E4D9]">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button
            variant="primary"
            onClick={handleSend}
            disabled={sending || !to || !amount || blocked || screening}
          >
            {sending && <Spinner />}
            {sending ? 'Soumission…' : blocked ? 'Bloqué · sanction' : 'Soumettre au moteur DFNS'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Sub · Chainalysis live screening card ─── */
function ScreeningCard({ screening, result, error }) {
  if (screening) {
    return (
      <div className="rounded-[10px] border border-[#E9E4D9] bg-white px-4 py-3 flex items-center gap-3">
        <Spinner />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#8A8278]">Chainalysis</p>
          <p className="text-[13px] text-[#0A0A0A] tracking-[-0.006em] mt-0.5">Analyse de l'adresse en cours…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[10px] border border-[rgba(220,38,38,0.22)] bg-white px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#991B1B]">Erreur Chainalysis</p>
        <p className="text-[12.5px] text-[#991B1B] mt-1 tracking-[-0.003em]">{error}</p>
      </div>
    );
  }

  if (!result) return null;

  const flagged = result.flagged;
  const topHit = result.results?.[0];
  const identifications = topHit?.identifications || [];

  return (
    <div className={`rounded-[12px] border overflow-hidden ${flagged ? 'border-[rgba(220,38,38,0.25)]' : 'border-[rgba(22,163,74,0.25)]'} bg-white`}>
      <div className={`px-4 py-3 border-b border-[#E9E4D9] flex items-center gap-3 ${flagged ? 'bg-[rgba(220,38,38,0.04)]' : 'bg-[rgba(22,163,74,0.04)]'}`}>
        <div
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
          style={flagged ? { background: '#DC2626', color: '#fff' } : { background: '#0A0A0A', color: '#fff' }}
        >
          {flagged ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#8A8278]">{result.provider}</p>
          <p className={`text-[13.5px] font-medium tracking-[-0.006em] mt-0.5 ${flagged ? 'text-[#991B1B]' : 'text-[#0A0A0A]'}`}>
            {flagged
              ? `Adresse sanctionnée — transfert bloqué`
              : 'Adresse blanchie · aucune correspondance'}
          </p>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {(result.lists || []).map(l => (
            <span
              key={l}
              className="inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full bg-white border border-[#E9E4D9] text-[10.5px] font-medium text-[#1E1E1E] tracking-[-0.003em]"
            >
              <span className="w-1 h-1 rounded-full bg-[#7C5E3C]" />
              {l}
            </span>
          ))}
        </div>

        {flagged && identifications.length > 0 && (
          <ul className="space-y-1.5 pt-2">
            {identifications.map((id, i) => (
              <li
                key={i}
                className="px-3 py-2 rounded-[8px] bg-[rgba(220,38,38,0.04)] border border-[rgba(220,38,38,0.15)]"
              >
                <p className="text-[12.5px] font-medium text-[#0A0A0A] tracking-[-0.003em]">{id.name}</p>
                {id.description && (
                  <p className="text-[11px] text-[#5D5D5D] mt-0.5 tracking-[-0.003em] leading-snug">{id.description}</p>
                )}
                {id.url && (
                  <a
                    href={id.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10.5px] text-[#7C5E3C] hover:text-[#0A0A0A] mt-1 inline-block tracking-[-0.003em]"
                  >
                    Voir la désignation OFAC →
                  </a>
                )}
              </li>
            ))}
            <p className="text-[11px] text-[#5D5D5D] leading-relaxed tracking-[-0.003em] pt-1">
              Une alerte Tracfin a été créée. Le transfert ne peut pas être soumis au moteur DFNS (MiCA Art. 68 · Règlement 2015/847).
            </p>
          </ul>
        )}
      </div>
    </div>
  );
}
