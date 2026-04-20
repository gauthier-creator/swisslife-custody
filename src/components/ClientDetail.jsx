import { useState, useEffect } from 'react';
import { listWallets, createWallet, getWalletAssets, transferAsset, getWalletHistory, archiveWallet, unarchiveWallet } from '../services/dfnsApi';
import { fetchContacts, fetchClientById, parseDescription, getSalesforceStatus } from '../services/salesforceApi';
import WhitelistPanel from './WhitelistPanel';
import RiskConfigPanel from './RiskConfigPanel';
import KYCFlow from './KYCFlow';
import DelegationPanel from './DelegationPanel';
import WalletFreezePanel from './WalletFreezePanel';
import CustodyEligibilityPanel from './CustodyEligibilityPanel';
import { SUPPORTED_NETWORKS } from '../config/constants';
import { createApproval, checkTransferRisk, checkWalletFreeze, screenAddress, fetchApprovals, fetchAuditLog } from '../services/complianceApi';
import { fetchOraclePrices } from '../services/oracleApi';
import { getKycStatus } from '../services/kycService';
import { useAuth } from '../context/AuthContext';
import {
  fmtEUR, fmtCompactEUR, Badge, Card, Modal, Spinner, EmptyState, Button,
  Avatar, Metric, MetricRow, Delta, inputCls, selectCls, labelCls, useCountUp,
  Drawer, CopyButton,
} from './shared';
import { VerifiedBadge } from './brand';
import { BrandGlyph } from './BrandGlyphs';
import { API_BASE } from '../config/constants';

/* ─────────────────────────────────────────────────────────
   ClientDetail — Editorial client dossier
   Big display header · Mercury metric row · refined tabs
   ───────────────────────────────────────────────────────── */

const truncAddr = (a, n = 8) => a ? `${a.slice(0, n)}…${a.slice(-n)}` : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const typeLabel = (t) => {
  if (t === 'Customer - Direct') return 'UHNWI';
  if (t === 'Other' || t === 'Institutional') return 'Institutionnel';
  return t || '—';
};
const typeVariant = (t) => {
  if (t === 'Customer - Direct') return 'gold';
  if (t === 'Other' || t === 'Institutional') return 'info';
  return 'default';
};

export default function ClientDetail({ client: initialClient, onBack, embedded = false }) {
  const [client, setClient] = useState(initialClient);
  const [tab, setTab] = useState('profile');
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newWallet, setNewWallet] = useState({ name: '', network: 'EthereumSepolia' });
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [assets, setAssets] = useState(null);
  const [history, setHistory] = useState([]);
  // Liste des demandes de transfert (transfer_approvals) pour ce client.
  // Montre toutes statuses pending/approved/executed/rejected, pas seulement
  // celles du wallet sélectionné — le banquier veut la vue globale du client.
  const [approvals, setApprovals] = useState([]);
  const [loadingApprovals, setLoadingApprovals] = useState(false);
  // Timeline d'événements pour ce client (audit_log filtré).
  // Rassemble KYC/contrat/adéquation/transferts/gels/UBO/risk
  // dans un seul flux chronologique.
  const [timeline, setTimeline] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transfer, setTransfer] = useState({ to: '', amount: '', kind: 'Native' });
  // Transfer request flow — 3 stages inside the modal :
  //   'form'    → user fills destination / montant / type
  //   'review'  → compliance risk check + Chainalysis screening + recap
  //   'success' → approval ID shown + next step hint
  // Pas de window.confirm() natif, tout est en-modal.
  const [transferStage, setTransferStage] = useState('form');
  const [transferRisk, setTransferRisk] = useState(null);
  const [transferScreening, setTransferScreening] = useState(null);
  const [transferResult, setTransferResult] = useState(null);
  const [sending, setSending] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [error, setError] = useState(null);
  const [kycLive, setKycLive] = useState(null);
  const [kycModuleEnabled, setKycModuleEnabled] = useState(false);
  const [frozenWallets, setFrozenWallets] = useState({});
  const [sfStatus, setSfStatus] = useState(null);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [holdings, setHoldings] = useState(null);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [walletDrawerId, setWalletDrawerId] = useState(null);
  // Screening runtime state — Chainalysis multi-address flow.
  // results: [{ address, network, status: 'pending'|'clean'|'flagged'|'error', hits, error }]
  const [screeningOpen, setScreeningOpen] = useState(false);
  const [screeningResults, setScreeningResults] = useState([]);
  const [screeningRunning, setScreeningRunning] = useState(false);
  const [lastScreeningAt, setLastScreeningAt] = useState(null);
  const { profile, isAdmin } = useAuth();
  const user = profile; // legacy alias — AuthContext exposes `profile`, not `user`

  const reloadClient = async () => {
    try {
      const updated = await fetchClientById(client.id);
      setClient(updated);
    } catch (err) { console.error(err); }
  };

  const parsed = parseDescription(client.description);
  const kycValid = !kycModuleEnabled || kycLive?.overallStatus === 'validated' || parsed.kyc?.toLowerCase().includes('valid');

  useEffect(() => {
    loadWallets(); loadContacts(); loadKycStatus(); loadApprovals(); loadTimeline();
    fetch(`${API_BASE}/api/admin/settings`).then(r => r.json()).then(s => setKycModuleEnabled(!!s.kyc_module_enabled)).catch(() => {});
    getSalesforceStatus().then(setSfStatus).catch(() => {});
  }, []);

  // Charge les demandes de transfert pour ce client — toutes statuses.
  // Recharge après chaque createApproval + chaque fois qu'on revient
  // sur l'onglet transferts.
  const loadApprovals = async () => {
    setLoadingApprovals(true);
    try {
      const raw = await fetchApprovals({ salesforceAccountId: client.id, limit: 100 });
      const list = raw?.data || raw || [];
      setApprovals(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('loadApprovals error:', err);
      setApprovals([]);
    }
    setLoadingApprovals(false);
  };

  // Charge l'historique complet du client : tous les événements
  // audit_log liés à cet Account (KYC, contrat, transferts, gels,
  // UBO, risk config, signatures…).
  const loadTimeline = async () => {
    setLoadingTimeline(true);
    try {
      const raw = await fetchAuditLog({ salesforceAccountId: client.id, limit: 200 });
      const list = raw?.data || raw || [];
      setTimeline(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('loadTimeline error:', err);
      setTimeline([]);
    }
    setLoadingTimeline(false);
  };

  // Deep-link to the Salesforce Lightning Account record in a new tab.
  // Instance URL comes from our /api/salesforce/status endpoint; if not
  // connected yet, falls back to the sandbox domain.
  const openInSalesforce = () => {
    const base = sfStatus?.instanceUrl || 'https://login.salesforce.com';
    const url = `${base}/lightning/r/Account/${client.id}/view`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Run Chainalysis sanctions screening against all the client's wallet
  // addresses. Shows live per-address progress in a modal, auto-opens
  // compliance alerts server-side on any hit (Tornado Cash, Lazarus, …).
  const runSanctionsScreening = async () => {
    if (!wallets.length) return;
    const addresses = wallets
      .filter(w => w.address)
      .map(w => ({ address: w.address, network: w.network, name: w.name, walletId: w.id }));
    if (addresses.length === 0) return;
    setScreeningOpen(true);
    setScreeningRunning(true);
    // Seed all rows as pending so the user sees the full list immediately
    setScreeningResults(addresses.map(a => ({ ...a, status: 'pending' })));
    for (let i = 0; i < addresses.length; i++) {
      const row = addresses[i];
      try {
        const result = await screenAddress({
          address: row.address,
          chain: row.network,
          walletId: row.walletId,
          context: 'client_profile_bulk_screening',
        });
        const hitItem = result?.results?.find(r => r.address === row.address);
        setScreeningResults(prev => prev.map((x, idx) => idx === i
          ? { ...x,
              status: hitItem?.flagged ? 'flagged' : 'clean',
              hits: hitItem?.identifications || [],
              provider: result?.provider,
            }
          : x));
      } catch (err) {
        setScreeningResults(prev => prev.map((x, idx) => idx === i
          ? { ...x, status: 'error', error: err.message || 'Échec du screening' }
          : x));
      }
    }
    setScreeningRunning(false);
    setLastScreeningAt(new Date().toISOString());
  };

  const loadKycStatus = async () => {
    try { const data = await getKycStatus(client.id); setKycLive(data); }
    catch { /* ignore */ }
  };

  const loadWallets = async () => {
    setLoading(true); setError(null);
    try {
      const all = await listWallets(client.id);
      setWallets(all);
      const freezeMap = {};
      await Promise.all(all.map(async (w) => {
        try { const result = await checkWalletFreeze(w.id); freezeMap[w.id] = result.frozen; }
        catch { freezeMap[w.id] = false; }
      }));
      setFrozenWallets(freezeMap);
      // Kick off the aggregated holdings fetch (parallel per-wallet /assets)
      loadHoldings(all);
    } catch (err) {
      console.error(err); setError(err.message); setWallets([]);
    }
    setLoading(false);
  };

  // Fallback prices used only if Chainlink RPC is unreachable AND the
  // server fallback itself fails. Testnets sont alias de mainnet pour
  // la démo (SepoliaETH ≈ ETH, TEST_MATIC ≈ POL) — donnent un solde
  // parlant au banquier au lieu de "€0" trompeur.
  const FALLBACK_PRICES_EUR = {
    BTC: 58000, ETH: 2950, SOL: 135,
    USDC: 0.92, USDT: 0.92, DAI: 0.92,
    POL: 0.35, MATIC: 0.35,
    // Testnet aliases — mêmes valeurs que leur mainnet équivalent
    SepoliaETH: 2950, EthereumGoerli: 2950, HoleskyETH: 2950,
    TEST_MATIC: 0.35, BitcoinTestnet: 58000,
  };
  // Normalise un symbole testnet vers son équivalent mainnet pour le
  // lookup Chainlink (miroir de l'alias server-side).
  const normalizeSymbol = (sym) => {
    const s = (sym || '').toUpperCase();
    const aliases = {
      SEPOLIAETH: 'ETH', ETHEREUMGOERLI: 'ETH', HOLESKYETH: 'ETH',
      TEST_MATIC: 'POL', TESTMATIC: 'POL',
      BITCOINTESTNET: 'BTC', TBTC: 'BTC',
      SOLANADEVNET: 'SOL',
    };
    return aliases[s] || s;
  };
  const humanBalance = (a) => {
    const raw = parseFloat(a.balance || 0);
    const dec = a.decimals || 0;
    // DFNS usually returns decimal-adjusted already; fall back to raw if no decimals.
    return dec > 6 ? raw / Math.pow(10, dec) : raw;
  };
  const resolvePriceEur = (symbol, oraclePrices) => {
    const s = (symbol || '').toUpperCase();
    // 1. Try the raw symbol in case it was fetched directly
    const live = oraclePrices?.[s]?.priceEur;
    if (typeof live === 'number' && live > 0) return live;
    // 2. Testnet → map to mainnet equivalent pour Chainlink lookup
    const normalized = normalizeSymbol(s);
    const liveNormalized = oraclePrices?.[normalized]?.priceEur;
    if (typeof liveNormalized === 'number' && liveNormalized > 0) return liveNormalized;
    // 3. Static fallback
    return FALLBACK_PRICES_EUR[symbol] ?? FALLBACK_PRICES_EUR[s] ?? FALLBACK_PRICES_EUR[normalized] ?? 0;
  };

  const loadHoldings = async (wlts) => {
    if (!wlts || wlts.length === 0) { setHoldings(null); return; }
    setHoldingsLoading(true);
    try {
      // Fetch oracle prices and wallet assets in parallel. Oracle call
      // has a 60s server-side cache, so multiple clients on screen
      // at once cost essentially nothing.
      const uniqueSymbols = ['BTC', 'ETH', 'SOL', 'USDC', 'USDT', 'LINK'];
      const [pricesResp, ...walletResults] = await Promise.all([
        fetchOraclePrices(uniqueSymbols).catch(() => null),
        ...wlts.map(w =>
          getWalletAssets(w.id)
            .then(data => ({ wallet: w, assets: data.assets || [] }))
            .catch(() => ({ wallet: w, assets: [] }))
        ),
      ]);
      const oraclePrices = pricesResp?.prices || {};
      const oracleMeta = {
        fetchedAt: pricesResp?.fetchedAt,
        source: pricesResp?.source || 'fallback',
        rpc: pricesResp?.rpcEndpoint,
        // Keep the full price map so the wallet drawer can re-price assets
        // without refetching the oracle.
        prices: oraclePrices,
      };
      const results = walletResults;
      // Aggregate by asset symbol using oracle prices
      const byAsset = {};
      results.forEach(({ wallet, assets }) => {
        assets.forEach(a => {
          const key = a.symbol || a.kind || '?';
          const price = resolvePriceEur(key, oraclePrices);
          const bal = humanBalance(a);
          if (!byAsset[key]) byAsset[key] = { symbol: key, kind: a.kind, balance: 0, valueEur: 0, walletCount: 0, priceEur: price };
          byAsset[key].balance += bal;
          byAsset[key].valueEur += bal * price;
          byAsset[key].walletCount += 1;
        });
      });
      const totalValueEur = Object.values(byAsset).reduce((s, a) => s + a.valueEur, 0);
      const assetList = Object.values(byAsset)
        .map(a => ({ ...a, percentage: totalValueEur > 0 ? (a.valueEur / totalValueEur) * 100 : 0 }))
        .sort((a, b) => b.valueEur - a.valueEur);
      setHoldings({ totalValueEur, assets: assetList, walletsBreakdown: results, oracle: oracleMeta });
    } catch (err) {
      console.error('loadHoldings error:', err); setHoldings(null);
    }
    setHoldingsLoading(false);
  };

  const loadContacts = async () => {
    setLoadingContacts(true);
    try { const data = await fetchContacts(client.id); setContacts(data); }
    catch { setContacts([]); }
    setLoadingContacts(false);
  };

  const handleCreate = async () => {
    if (client.Custody_Eligible__c !== true && !kycValid) {
      alert('Compliance : le client doit être éligible à la custody avant toute création de wallet.');
      return;
    }
    setCreating(true); setError(null);
    try {
      await createWallet({
        network: newWallet.network,
        name: newWallet.name,
        externalId: client.id,
        tags: [`client:${client.name}`],
      });
      await loadWallets();
      setShowCreate(false);
      setNewWallet({ name: '', network: 'EthereumSepolia' });
    } catch (err) {
      console.error(err); setError(err.message);
      alert('Erreur : ' + err.message);
    }
    setCreating(false);
  };

  const selectWallet = async (w) => {
    setSelectedWallet(w); setAssets(null); setHistory([]);
    try {
      const [a, h] = await Promise.all([getWalletAssets(w.id), getWalletHistory(w.id)]);
      setAssets(a); setHistory(h.items || []);
    } catch (err) { console.error(err); }
  };

  // Close the transfer modal and reset everything (stage, risk, result, form)
  const resetTransfer = () => {
    setShowTransfer(false);
    setTransferStage('form');
    setTransferRisk(null);
    setTransferScreening(null);
    setTransferResult(null);
    setTransfer({ to: '', amount: '', kind: 'Native' });
  };

  // Stage 1 → 2 : user clicks "Continuer" in the form
  // Fetches compliance risk check + Chainalysis screening in parallel,
  // moves to review stage. Blocks displayed there with a clear stop message.
  const handleTransferReview = async () => {
    if (!selectedWallet || !transfer.to || !transfer.amount) return;
    setSending(true); setError(null);
    try {
      const netInfo = SUPPORTED_NETWORKS.find(n => n.id === selectedWallet.network);
      // checkTransferRisk fait déjà le screening Chainalysis + tous les
      // gates serveur (freeze, hard cap, daily volume, whitelist, réseau).
      // screenAddress était redondant en duo — on le garde en parallèle
      // uniquement pour afficher le détail Chainalysis dans l'UI (mode
      // LIVE/DEMO, listes, provider). Si le gate renvoie flagged=true,
      // le bouton Confirmer sera désactivé.
      const [riskCheck, screen] = await Promise.all([
        checkTransferRisk({
          salesforceAccountId: client.id,
          amount: transfer.amount,
          assetSymbol: netInfo?.symbol || transfer.kind,
          network: selectedWallet.network,
          walletId: selectedWallet.id,
          to: transfer.to,
        }).catch(err => ({ allowed: true, warnings: [err.message || 'Check unavailable'], blocks: [] })),
        screenAddress({
          address: transfer.to,
          chain: selectedWallet.network,
          walletId: selectedWallet.id,
          context: 'pre_transfer_request',
        }).catch(() => ({ results: [], flagged: false })),
      ]);
      setTransferRisk(riskCheck);
      setTransferScreening(screen);
      setTransferStage('review');
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
    setSending(false);
  };

  // Stage 2 → 3 : user confirmed in review, actually create the approval.
  // Fix : server expects `to` / `amount` / `walletId` as body keys (not
  // destinationAddress). Le 400 "walletId, to, and amount are required"
  // venait du nommage incohérent.
  const handleTransferConfirm = async () => {
    if (!selectedWallet) return;
    setSending(true); setError(null);
    try {
      const netInfo = SUPPORTED_NETWORKS.find(n => n.id === selectedWallet.network);
      const approval = await createApproval({
        walletId: selectedWallet.id,
        to: transfer.to,
        amount: transfer.amount,
        assetSymbol: netInfo?.symbol || 'NATIVE',
        network: selectedWallet.network,
        kind: transfer.kind || 'Native',             // DFNS TransferAsset kind
        contract: transfer.contract || null,          // ERC20 / Erc721 : token contract
        note: `Transfert ${transfer.amount} ${netInfo?.symbol || ''} vers ${transfer.to.slice(0, 12)}…`,
        walletName: selectedWallet.name,
        salesforceAccountId: client.id,
        clientName: client.name,
        requestedByEmail: user?.email || 'unknown',
      });
      setTransferResult(approval);
      setTransferStage('success');
      loadApprovals(); // nouvelle ligne "pending" visible sur l'onglet Transferts
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
    setSending(false);
  };

  const net = (id) => SUPPORTED_NETWORKS.find(n => n.id === id) || { icon: '?', color: '#6B6B6B', name: id };

  const kycStatusText = kycValid ? 'Valide'
    : kycLive?.overallStatus === 'in_progress' ? 'En cours'
    : kycLive?.overallStatus === 'ready_for_validation' ? 'À valider'
    : kycLive?.overallStatus === 'attention_required' ? 'Attention'
    : parsed.kyc?.toLowerCase().includes('cours') ? 'En cours'
    : 'Non vérifié';

  const tabs = [
    { id: 'profile', label: 'Fiche' },
    { id: 'eligibility', label: 'Éligibilité' },
    ...(kycModuleEnabled ? [{ id: 'kyc', label: 'KYC / KYB' }] : []),
    { id: 'wallets', label: `Wallets ${wallets.length > 0 ? `(${wallets.length})` : ''}`.trim() },
    { id: 'delegations', label: 'Délégations' },
    // Onglet UBO retiré : les bénéficiaires effectifs sont gérés
    // directement dans Salesforce (Contact.Custody_Is_UBO__c) — pas
    // de duplication d'interface. Voir sf-bootstrap-ubo-fields.mjs.
    { id: 'transfers', label: 'Transferts' },
    { id: 'history', label: 'Historique' },
  ];

  return (
    <div className="space-y-6">
      {/* ── Back link (hidden when embedded in drawer) ──── */}
      {!embedded && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[13px] font-medium text-[#8A8278] hover:text-[#1E1E1E] transition-colors group"
        >
          <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Registre clients
        </button>
      )}

      {/* ── Client identity row — operational, not editorial ───── */}
      <header className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <Avatar name={client.name} size={48} />
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold text-[#0F0F10] leading-[1.2]" style={{ letterSpacing: '-0.016em' }}>
              {client.name}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap text-[12.5px]">
              <Badge variant={typeVariant(client.type)} size="sm">{typeLabel(client.type)}</Badge>
              <span className="text-[#5D5D5D]">
                {[client.city, client.country].filter(Boolean).join(' · ') || '—'}
                {client.industry && <span className="text-[#8A8278]"> · {client.industry}</span>}
              </span>
              {client.accountNumber && (
                <span className="text-[#8A8278] font-mono text-[11.5px] ml-1">№ {client.accountNumber}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[11px] font-medium text-[#8A8278]">Actifs sous gestion</p>
            <p className="text-[22px] font-semibold text-[#0F0F10] tabular-nums leading-[1.15]" style={{ letterSpacing: '-0.018em' }}>
              {client.aum ? fmtCompactEUR(client.aum) : '—'}
            </p>
          </div>
          {kycValid && (
            <div className="hidden lg:flex items-center gap-2 h-9 px-3 rounded-[6px] bg-[#ECFAF0] text-[#0F9868] text-[12.5px] font-semibold">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              KYC validé
            </div>
          )}
        </div>
      </header>

      {/* ── Tabs ─────────────────────────────────────── */}
      <div className="border-b border-[#E7E7E7]">
        <nav className="flex items-center gap-6 -mb-px overflow-x-auto">
          {tabs.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative py-2.5 text-[13.5px] font-semibold whitespace-nowrap transition-colors ${
                  active ? 'text-[#0F0F10]' : 'text-[#8A8278] hover:text-[#0F0F10]'
                }`}
              >
                {t.label}
                {active && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#7C5E3C] rounded-t-full" />}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ══════════ PROFILE ══════════
          Layout redesigned as Ramify-style asymmetric blocks of varying widths
          rather than one tall right sidebar. Rationale: the previous 8/4 split
          stacked 7 cards on the right, creating a 1800px-tall column while the
          left ran out of content at 800px, leaving a visual void.
          New flow, banker-priority ordered:
          R1 — Intro + quick actions (what + how)
          R2 — Crypto holdings (flagship) + Patrimoine consolidé (context)
          R3 — Compliance duo : KYC / Mandat + Métadonnées
          R4 — Detailed info + Address
          R5 — Contacts list + Metadata
          R6 — Risk config (full width)
      */}
      {tab === 'profile' && (
        <div className="space-y-6 animate-fade">

          {/* ── Deux colonnes indépendantes qui coulent verticalement ──
              Contrairement à "rows horizontaux" (où chaque row attend le plus
              grand item → crée des vides sous le plus court), ici chaque
              colonne s'empile indépendamment. Plus de dead space entre cards
              d'une même colonne.

              LEFT (3fr ≈ 60%) : identité + custody data + contacts
              → contenu qui bénéficie de la largeur (grids 2-col, listes larges)
              RIGHT (2fr ≈ 40%) : actions + patrimoine + compliance + meta
              → cards compactes type "sidebar"

              Répartition choisie pour équilibrer à ±10% les hauteurs totales.
          */}
          <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-6 items-start">

            {/* ══════════ LEFT column ══════════ */}
            <div className="min-w-0 space-y-6">

              {/* Résumé client */}
              <SectionCard title={parsed.text ? 'À propos' : 'Résumé client'}>
                {parsed.text ? (
                  <p className="text-[14px] text-[#1E1E1E] leading-[1.65] tracking-[-0.003em]">
                    {parsed.text}
                  </p>
                ) : (
                  <div className="space-y-3 text-[14px] text-[#1E1E1E] leading-[1.65] tracking-[-0.003em]">
                    <p>
                      <span className="font-medium">{client.name}</span>
                      {' · '}
                      <span className="text-[#5D5D5D]">{typeLabel(client.type)}</span>
                      {client.industry && <span className="text-[#5D5D5D]"> · {client.industry}</span>}
                    </p>
                    <p className="text-[13px] text-[#5D5D5D]">
                      {client.aum ? `AUM consolidé ${fmtCompactEUR(client.aum)}.` : 'Patrimoine non renseigné.'}
                      {wallets.length > 0 ? ` ${wallets.length} wallet${wallets.length > 1 ? 's' : ''} sous conservation DFNS.` : ' Aucun wallet en custody.'}
                    </p>
                  </div>
                )}
              </SectionCard>

              {/* Cryptos détenues — flagship custody view */}
              <CryptoHoldingsCard
                wallets={wallets}
                holdings={holdings}
                loading={holdingsLoading}
                net={(id) => SUPPORTED_NETWORKS.find(n => n.id === id) || { icon: '?', color: '#8A8278', name: id }}
                onSelectWallet={(w) => setWalletDrawerId(w.id)}
              />

              {/* Informations détaillées (wide 2-col grid) */}
              <SectionCard title="Informations détaillées">
                <div className="grid grid-cols-2 gap-x-10 gap-y-6">
                  <Field label="Nom complet" value={client.name} />
                  <Field label="Numéro de compte" value={client.accountNumber} mono />
                  <Field label="Type de compte" value={typeLabel(client.type)} />
                  <Field label="Industrie" value={client.industry} />
                  <Field label="Chiffre d'affaires / AUM" value={client.aum ? fmtEUR(client.aum) : '—'} />
                  <Field label="Téléphone" value={client.phone} />
                  <Field label="Site web" value={client.website} link />
                  <Field label="Nombre d'employés" value={client.employees} />
                </div>
              </SectionCard>

              {/* Adresse de facturation — identity data stays in LEFT */}
              <SectionCard title="Adresse de facturation">
                <div className="grid grid-cols-2 gap-x-10 gap-y-6">
                  <Field label="Rue" value={client.street} />
                  <Field label="Ville" value={client.city} />
                  <Field label="Code postal" value={client.postalCode} />
                  <Field label="Pays" value={client.country} />
                </div>
              </SectionCard>

              {/* Contacts list */}
              <Card>
                <div className="px-6 py-4 flex items-center justify-between border-b border-[#E7E7E7]">
                  <h3 className="text-[14px] font-medium text-[#0A0A0A] tracking-[-0.01em]">Contacts</h3>
                  <span className="text-[12px] text-[#5D5D5D] tracking-[-0.003em]">{contacts.length} personne{contacts.length > 1 ? 's' : ''}</span>
                </div>
                {loadingContacts ? (
                  <div className="py-10 text-center"><Spinner /></div>
                ) : contacts.length === 0 ? (
                  <p className="px-6 py-8 text-[13px] text-[#5D5D5D]">Aucun contact associé.</p>
                ) : (
                  <ul>
                    {contacts.map((c, i) => {
                      const name = [c.FirstName, c.LastName].filter(Boolean).join(' ');
                      return (
                        <li
                          key={c.Id}
                          className={`px-6 py-4 flex items-center justify-between gap-4 ${i < contacts.length - 1 ? 'border-b border-[#E7E7E7]' : ''}`}
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <Avatar name={name} size={38} />
                            <div className="min-w-0">
                              <p className="text-[14px] font-medium text-[#0A0A0A] tracking-[-0.01em] truncate">
                                {name || '—'}
                              </p>
                              {c.Title && <p className="text-[12px] text-[#5D5D5D] mt-0.5 tracking-[-0.003em]">{c.Title}</p>}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            {c.Email && (
                              <a
                                href={`mailto:${c.Email}`}
                                className="text-[12.5px] text-[#1E1E1E] tracking-[-0.003em] hover:text-[#7C5E3C] hover:underline decoration-[#C8924B]/40 underline-offset-2 transition-colors"
                              >
                                {c.Email}
                              </a>
                            )}
                            {c.Phone && (
                              <a
                                href={`tel:${c.Phone.replace(/[^+\d]/g, '')}`}
                                className="block text-[11.5px] text-[#8A8278] mt-0.5 hover:text-[#7C5E3C] hover:underline decoration-[#C8924B]/40 underline-offset-2 transition-colors"
                              >
                                {c.Phone}
                              </a>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>

            {/* ══════════ RIGHT column ══════════ */}
            <div className="min-w-0 space-y-6">

              {/* Actions banquier */}
              <Card>
                <div className="px-5 py-4 border-b border-[#E7E7E7]">
                  <p className="text-[11px] font-semibold text-[#8A8278] uppercase tracking-[0.1em]">
                    Actions banquier
                  </p>
                  <p className="text-[13px] text-[#5D5D5D] mt-1">
                    Workflow custody pour ce client
                  </p>
                </div>
                <div className="p-4 space-y-2">
                  <ActionRow
                    onClick={openInSalesforce}
                    icon={
                      <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3h7v7M10 14L21 3M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5" />
                      </svg>
                    }
                    title="Ouvrir dans Salesforce"
                    subtitle={sfStatus?.configured ? 'Compte · Contacts · CRM' : 'Salesforce non configuré'}
                    disabled={!sfStatus?.configured}
                  />
                  <ActionRow
                    onClick={runSanctionsScreening}
                    icon={
                      <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22" />
                      </svg>
                    }
                    title={screeningRunning ? 'Screening en cours…' : 'Lancer screening'}
                    subtitle={wallets.length > 0 ? `Chainalysis · ${wallets.length} adresse${wallets.length > 1 ? 's' : ''}` : 'Aucun wallet à screener'}
                    disabled={wallets.length === 0 || screeningRunning}
                  />
                  <ActionRow
                    onClick={() => { setTab('wallets'); setShowCreate(true); }}
                    icon={
                      <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="12" cy="12" r="4" />
                      </svg>
                    }
                    title="Créer un wallet"
                    subtitle={wallets.length > 0 ? `${wallets.length} existant${wallets.length > 1 ? 's' : ''} · DFNS MPC` : 'DFNS · MPC 2 / 3'}
                  />
                  <ActionRow
                    onClick={() => setShowStatementModal(true)}
                    icon={
                      <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" />
                      </svg>
                    }
                    title="Envoyer relevé custody"
                    subtitle={wallets.length > 0 ? 'PDF signé · horodaté · ACPR' : 'Créez un wallet d\'abord'}
                    disabled={wallets.length === 0}
                  />
                </div>
              </Card>

              {/* Patrimoine consolidé — lit Custody_AUM_*__c depuis SFDC.
                  Si tous null → fallback sur l'ancienne heuristique basée
                  sur AnnualRevenue (compatibilité avec comptes non remplis).
                  Le banquier édite les 4 champs dans la fiche SFDC
                  (section "Custody · Conformité KYC" — on ajoutera un
                  tab dédié au patrimoine plus tard). */}
              <PatrimonyCard client={client} parsedAllocation={parsed.allocation} />

              {/* Conformité KYC — compact compliance dashboard */}
              <Card>
                <div className="px-5 py-4 border-b border-[#E7E7E7] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex-shrink-0 w-8 h-8 rounded-[7px] bg-[#F3F2EE] text-[#1E1E1E] flex items-center justify-center">
                      <BrandGlyph name="stamp" size={16} />
                    </span>
                    <p className="text-[13.5px] font-semibold text-[#0F0F10]">Conformité KYC</p>
                  </div>
                  <span
                    className="flex-shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[5px] text-[11px] font-semibold"
                    style={{
                      background: kycValid ? '#ECFAF0' : kycLive?.overallStatus === 'attention_required' ? '#FEF2F2' : '#FEF9EC',
                      color: kycValid ? '#0F9868' : kycLive?.overallStatus === 'attention_required' ? '#DC2626' : '#B45309',
                    }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
                    {kycValid ? 'Validé' : kycLive?.overallStatus === 'attention_required' ? 'À revoir' : 'En cours'}
                  </span>
                </div>
                <dl className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 text-[12.5px]">
                    <dt className="text-[#8A8278]">Documents vérifiés</dt>
                    <dd className="font-medium text-[#0F0F10] tabular-nums">
                      {kycLive?.stats?.documentsVerified ?? (parsed.documents.length || 0)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[12.5px]">
                    <dt className="text-[#8A8278]">AML screening</dt>
                    <dd className="font-medium text-[#0F9868] inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0F9868]" />
                      {kycLive?.stats?.amlClean === false ? 'À revoir' : 'Clean'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[12.5px]">
                    <dt className="text-[#8A8278]">Sanctions OFAC</dt>
                    <dd className="font-medium text-[#0F9868] inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0F9868]" />
                      Aucun hit
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[12.5px]">
                    <dt className="text-[#8A8278]">PEP</dt>
                    <dd className="font-medium text-[#0F0F10]">Non exposé</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[12.5px] pt-3 border-t border-[#E7E7E7]">
                    <dt className="text-[#8A8278]">Prochaine revue</dt>
                    <dd className="font-medium text-[#0F0F10] tabular-nums">
                      {(() => {
                        const d = client.createdDate ? new Date(client.createdDate) : new Date();
                        d.setFullYear(d.getFullYear() + 1);
                        return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
                      })()}
                    </dd>
                  </div>
                </dl>
                {!kycValid && kycModuleEnabled && (
                  <div className="px-5 pb-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() => setTab('kyc')}
                    >
                      Lancer la vérification
                    </Button>
                  </div>
                )}
              </Card>

              {/* Mandat de conservation */}
              <MandatCard
                isSigned={!!parsed.kyc?.toLowerCase().includes('valid')}
                createdDate={client.createdDate}
              />

              {/* Métadonnées */}
              <SectionCard title="Métadonnées">
                <dl className="space-y-4">
                  <MetaRow label="ID Salesforce" value={client.id} mono />
                  <MetaRow label="Propriétaire" value={client.ownerId || '—'} mono />
                  <MetaRow label="Créé le" value={fmtDate(client.createdDate)} />
                </dl>
              </SectionCard>
            </div>
          </div>

          {/* Configuration de risque — full width (son grid 3-col a besoin d'espace) */}
          <RiskConfigPanel client={client} />
        </div>
      )}

      {/* ══════════ ELIGIBILITY ══════════ */}
      {tab === 'eligibility' && (
        <div className="animate-fade">
          <CustodyEligibilityPanel client={client} onUpdate={reloadClient} />
        </div>
      )}

      {/* ══════════ KYC ══════════ */}
      {tab === 'kyc' && (
        <div className="animate-fade">
          <KYCFlow client={client} onComplete={loadKycStatus} />
        </div>
      )}

      {/* ══════════ DELEGATIONS ══════════ */}
      {tab === 'delegations' && (
        <div className="animate-fade">
          <DelegationPanel client={client} />
        </div>
      )}

      {/* UBO tab retiré — gestion dans Salesforce Contact (bug #5) */}

      {/* ══════════ WALLETS ══════════ */}
      {tab === 'wallets' && (
        <div className="animate-fade space-y-6">
          {client.Custody_Eligible__c !== true && !kycValid && (
            <Card className="px-5 py-4 flex items-start gap-3">
              <svg className="w-4 h-4 text-[#CA8A04] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div className="flex-1">
                <p className="text-[13.5px] font-medium text-[#0A0A0A] tracking-[-0.01em]">Client non éligible à la custody</p>
                <p className="text-[12.5px] text-[#5D5D5D] mt-0.5 tracking-[-0.003em]">
                  La création de wallets requiert l'éligibilité MiCA Art. 60.{' '}
                  <button
                    onClick={() => setTab('eligibility')}
                    className="text-[#0A0A0A] font-medium underline underline-offset-2 hover:no-underline"
                  >
                    Ouvrir l'onglet Éligibilité
                  </button>
                </p>
              </div>
            </Card>
          )}

          {error && (
            <Card className="px-5 py-4">
              <p className="text-[13px] font-medium text-[#991B1B] tracking-[-0.003em]">Erreur DFNS : {error}</p>
            </Card>
          )}

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="display-sm text-[#0A0A0A]">Wallets DFNS</h2>
              <p className="text-[13.5px] text-[#5D5D5D] mt-1.5 tracking-[-0.003em]">
                {wallets.length} wallet{wallets.length > 1 ? 's' : ''} · Conservation MPC · Clés fragmentées par threshold cryptography
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => setShowCreate(true)}
              disabled={client.Custody_Eligible__c !== true && !kycValid}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Créer un wallet
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Spinner size="w-6 h-6" /></div>
          ) : wallets.length === 0 ? (
            <Card className="py-4">
              <EmptyState
                title="Aucun wallet"
                description="Aucun portefeuille de conservation n'a encore été créé pour ce client. Utilisez le bouton ci-dessus pour en provisionner un via DFNS."
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                }
              />
            </Card>
          ) : (
            <Card>
              {wallets.map((w, i) => {
                const n = net(w.network);
                return (
                  <div
                    key={w.id}
                    // Click = open detail drawer (right-slide) + select the wallet
                    // in parent state so the Freeze panel below (and Transferts
                    // tab) have the context they need. Unified UX with the
                    // Profil tab wallet rows.
                    onClick={() => { setWalletDrawerId(w.id); selectWallet(w); }}
                    className="flex items-center gap-5 px-6 py-5 cursor-pointer transition-colors hover:bg-[#FDFBF6] active:bg-[#F9F8F5] border-b border-[#E7E7E7] last:border-b-0 group"
                  >
                    <div className="w-11 h-11 rounded-[10px] flex items-center justify-center bg-[#F5F3EE] border border-[#E7E7E7] flex-shrink-0">
                      <span className="font-mono text-[12px] font-medium text-[#0A0A0A]">{n.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[14.5px] font-medium text-[#0A0A0A] truncate tracking-[-0.015em]">{w.name || n.name}</p>
                        {frozenWallets[w.id] && <Badge variant="error" size="sm" dot>Gelé</Badge>}
                        {(w.tags || []).includes('sl:archived') && <Badge variant="default" size="sm" dot>Archivé</Badge>}
                        <Badge variant={w.status === 'Active' ? 'success' : 'warning'} size="sm" dot>{w.status}</Badge>
                      </div>
                      <p className="text-[12px] font-mono text-[#5D5D5D] truncate mt-1">{truncAddr(w.address, 12)}</p>
                    </div>
                    <div className="text-right flex-shrink-0 hidden sm:block w-28">
                      <p className="text-[11px] font-medium text-[#8A8278] uppercase tracking-[0.04em]">Réseau</p>
                      <p className="text-[13px] font-medium text-[#0A0A0A] mt-1 tracking-[-0.01em]">{n.name}</p>
                    </div>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[#8A8278] flex-shrink-0 group-hover:text-[#1E1E1E] group-hover:translate-x-0.5 transition-all">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}

          {/* Freeze panel déplacé dans le drawer de détail wallet
              (cf. plus bas) — pour centraliser toutes les actions
              par-wallet au même endroit. */}

          <WhitelistPanel client={client} />
        </div>
      )}

      {/* ══════════ TRANSFERS ══════════ */}
      {/* Onglet complet, visible même sans wallet sélectionné : affiche
          (1) les demandes de transfert (transfer_approvals) du client,
              toutes statuses : pending / approved / executed / rejected
          (2) l'historique on-chain DFNS du wallet sélectionné si un est actif.
          Le banquier voit ainsi le workflow compliance ET les mouvements réels. */}
      {tab === 'transfers' && (
        <div className="animate-fade space-y-8">
          {/* Header + CTA */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="display-sm text-[#0A0A0A]">Transferts</h2>
              <p className="text-[13.5px] text-[#5D5D5D] mt-1.5 tracking-[-0.003em]">
                {approvals.length} demande{approvals.length > 1 ? 's' : ''} · {history.length} mouvement{history.length > 1 ? 's' : ''} on-chain {selectedWallet ? `· ${selectedWallet.name}` : ''}
              </p>
            </div>
            {selectedWallet && (
              <Button variant="primary" onClick={() => setShowTransfer(true)}>
                Nouveau transfert
              </Button>
            )}
          </div>

          {/* ─── (1) Demandes de transfert (compliance queue) ─── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-medium text-[#0A0A0A] tracking-[-0.015em]">
                Demandes <span className="font-display italic text-[#7C5E3C]">4-yeux</span>
              </h3>
              <button
                onClick={loadApprovals}
                disabled={loadingApprovals}
                className="text-[11.5px] font-medium text-[#5D5D5D] hover:text-[#1E1E1E] transition-colors"
              >
                {loadingApprovals ? 'Chargement…' : 'Rafraîchir'}
              </button>
            </div>
            {approvals.length === 0 ? (
              <Card className="py-4">
                <EmptyState
                  title={loadingApprovals ? 'Chargement…' : 'Aucune demande'}
                  description="Les demandes de transfert (en attente, approuvées, exécutées, rejetées) apparaîtront ici."
                />
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[#E7E7E7] bg-[#FAFAF8]">
                      <th className="text-left px-5 h-11 text-[10.5px] font-semibold text-[#8A8278] uppercase tracking-[0.08em]">Statut</th>
                      <th className="text-left px-5 h-11 text-[10.5px] font-semibold text-[#8A8278] uppercase tracking-[0.08em]">Wallet</th>
                      <th className="text-left px-5 h-11 text-[10.5px] font-semibold text-[#8A8278] uppercase tracking-[0.08em]">Destination</th>
                      <th className="text-right px-5 h-11 text-[10.5px] font-semibold text-[#8A8278] uppercase tracking-[0.08em]">Montant</th>
                      <th className="text-left px-5 h-11 text-[10.5px] font-semibold text-[#8A8278] uppercase tracking-[0.08em]">Demand\u00e9 par</th>
                      <th className="text-left px-5 h-11 text-[10.5px] font-semibold text-[#8A8278] uppercase tracking-[0.08em]">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvals.map(a => {
                      const status = a.status || 'pending';
                      const badgeVariant = {
                        pending: 'warning', approved: 'info', executed: 'success', rejected: 'error',
                      }[status] || 'default';
                      const badgeLabel = {
                        pending: 'En attente', approved: 'Approuvé', executed: 'Exécuté', rejected: 'Rejeté',
                      }[status] || status;
                      return (
                        <tr key={a.id} className="border-b border-[#E7E7E7] last:border-0 hover:bg-[#FDFBF6] transition-colors">
                          <td className="px-5 py-3.5">
                            <Badge variant={badgeVariant} size="sm" dot>{badgeLabel}</Badge>
                          </td>
                          <td className="px-5 py-3.5 text-[#0A0A0A] font-medium truncate max-w-[140px]" title={a.wallet_name || a.wallet_id}>
                            {a.wallet_name || truncAddr(a.wallet_id, 6)}
                          </td>
                          <td className="px-5 py-3.5 font-mono text-[11.5px] text-[#1E1E1E]">
                            {truncAddr(a.to_address, 8)}
                          </td>
                          <td className="px-5 py-3.5 text-right font-medium text-[#0A0A0A] tabular-nums tracking-[-0.015em]">
                            {a.amount ? `${a.amount} ${a.asset_symbol || ''}` : '—'}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#5D5D5D] truncate max-w-[160px]" title={a.requested_by_email}>
                            {a.requested_by_email || '—'}
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#5D5D5D] tabular-nums">
                            {a.requested_at ? new Date(a.requested_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            )}
          </div>

          {/* ─── (2) Historique on-chain DFNS du wallet sélectionné ─── */}
          {selectedWallet && (
            <div>
              <h3 className="text-[15px] font-medium text-[#0A0A0A] tracking-[-0.015em] mb-3">
                Historique <span className="font-display italic text-[#7C5E3C]">on-chain</span>
                <span className="text-[12.5px] font-normal text-[#8A8278] ml-3">· {selectedWallet.name}</span>
              </h3>
              {history.length === 0 ? (
                <Card className="py-4">
                  <EmptyState title="Aucun mouvement on-chain" description="Les transactions signées par DFNS apparaîtront ici après broadcast et confirmation réseau." />
                </Card>
              ) : (
                <Card className="overflow-hidden">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-[#E7E7E7] bg-[#FAFAF8]">
                        <th className="text-left px-5 h-11 text-[10.5px] font-semibold text-[#8A8278] uppercase tracking-[0.08em]">Direction</th>
                        <th className="text-left px-5 h-11 text-[10.5px] font-semibold text-[#8A8278] uppercase tracking-[0.08em]">Adresse</th>
                        <th className="text-right px-5 h-11 text-[10.5px] font-semibold text-[#8A8278] uppercase tracking-[0.08em]">Montant</th>
                        <th className="text-left px-5 h-11 text-[10.5px] font-semibold text-[#8A8278] uppercase tracking-[0.08em]">Statut</th>
                        <th className="text-left px-5 h-11 text-[10.5px] font-semibold text-[#8A8278] uppercase tracking-[0.08em]">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((tx, i) => (
                        <tr key={tx.id || i} className="border-b border-[#E7E7E7] last:border-0 hover:bg-[#FDFBF6] transition-colors">
                          <td className="px-5 py-3.5">
                            <Badge variant={tx.direction === 'In' ? 'success' : 'default'} size="sm" dot>{tx.direction || '—'}</Badge>
                          </td>
                          <td className="px-5 py-3.5 font-mono text-[11.5px] text-[#1E1E1E]">
                            {truncAddr(tx.to || tx.from, 8)}
                          </td>
                          <td className="px-5 py-3.5 text-right font-medium text-[#0A0A0A] tabular-nums tracking-[-0.015em]">
                            {tx.value || '—'}
                          </td>
                          <td className="px-5 py-3.5">
                            <Badge variant={tx.status === 'Confirmed' ? 'success' : 'warning'} size="sm" dot>{tx.status || 'Pending'}</Badge>
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-[#5D5D5D] tabular-nums">
                            {tx.timestamp ? new Date(tx.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </div>
          )}

          {!selectedWallet && history.length === 0 && (
            <p className="text-[12.5px] text-[#8A8278] text-center pt-2">
              Astuce : sélectionne un wallet dans l'onglet Wallets pour voir son historique on-chain détaillé.
            </p>
          )}
        </div>
      )}

      {/* ══════════ HISTORY ══════════ */}
      {/* Timeline chronologique de TOUS les événements client :
          KYC, adéquation, contrat, UBO, transferts, gels, risk config,
          signatures, screenings. Source : audit_log filtré par
          salesforce_account_id, 200 derniers événements. */}
      {tab === 'history' && (
        <div className="animate-fade space-y-6">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h2 className="display-sm text-[#0A0A0A]">
                Journal <span className="font-display italic text-[#7C5E3C]">d'audit</span>
              </h2>
              <p className="text-[13.5px] text-[#5D5D5D] mt-1.5 tracking-[-0.003em] max-w-[60ch]">
                Tous les événements liés à ce client — KYC, signatures, transferts, gels, UBO.
                Piste d'audit ACPR Art. L.561-12 CMF · archivage 5 ans.
              </p>
            </div>
            <button
              onClick={loadTimeline}
              disabled={loadingTimeline}
              className="text-[11.5px] font-medium text-[#5D5D5D] hover:text-[#1E1E1E] transition-colors"
            >
              {loadingTimeline ? 'Chargement…' : `Rafraîchir · ${timeline.length} événement${timeline.length > 1 ? 's' : ''}`}
            </button>
          </div>

          {timeline.length === 0 && !loadingTimeline ? (
            <Card className="py-4">
              <EmptyState
                title="Aucun événement"
                description="Les actions sur ce dossier apparaîtront ici chronologiquement."
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-[#E7E7E7]">
                {timeline.map(ev => <TimelineEvent key={ev.id} event={ev} />)}
              </ul>
            </Card>
          )}
        </div>
      )}

      {/* ── Create Wallet Modal ─────────────────────────── */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Créer un wallet"
        subtitle={`Portefeuille MPC provisionné via DFNS pour ${client.name}. La clé privée est fragmentée par threshold cryptography — aucune partie seule ne peut signer.`}
      >
        <div className="space-y-5">
          <div>
            <label className={labelCls}>Nom du wallet</label>
            <input
              className={inputCls}
              placeholder="Ex : Wallet ETH principal"
              value={newWallet.name}
              onChange={e => setNewWallet(p => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls}>Réseau</label>
            <select
              className={selectCls}
              value={newWallet.network}
              onChange={e => setNewWallet(p => ({ ...p, network: e.target.value }))}
            >
              {SUPPORTED_NETWORKS.map(n => <option key={n.id} value={n.id}>{n.name} ({n.symbol})</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Annuler</Button>
            <Button variant="primary" onClick={handleCreate} disabled={creating || !newWallet.name}>
              {creating ? 'Création…' : 'Créer le wallet'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Transfer Modal ── 3 stages in sequence ─────── */}
      <Modal
        isOpen={showTransfer}
        onClose={resetTransfer}
        title={
          transferStage === 'form'    ? 'Nouveau transfert'
          : transferStage === 'review' ? 'Revue compliance'
          :                              'Demande soumise'
        }
        subtitle={
          transferStage === 'form'    ? 'Les fonds sont contrôlés par Chainalysis + 4-eye avant signature DFNS.'
          : transferStage === 'review' ? 'Vérifiez les résultats de screening avant de confirmer.'
          :                              'Un second approbateur doit valider dans l\'onglet Compliance.'
        }
      >
        {/* ─── Stage 1 : Form ─── */}
        {transferStage === 'form' && (
          <div className="space-y-5">
            {selectedWallet && (
              <div className="flex items-center gap-3 px-4 py-3 bg-[#F9F8F5] border border-[#E7E7E7] rounded-[8px]">
                <span
                  className="w-8 h-8 rounded-[7px] flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                  style={{ backgroundColor: net(selectedWallet.network).color }}
                >
                  {net(selectedWallet.network).icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-[#0F0F10]">{selectedWallet.name}</p>
                  <p className="text-[11px] text-[#8A8278] font-mono truncate">{selectedWallet.address}</p>
                </div>
              </div>
            )}
            <div>
              <label className={labelCls}>Adresse de destination</label>
              <input
                className={inputCls}
                placeholder="0x… ou addr1…"
                value={transfer.to}
                onChange={e => setTransfer(p => ({ ...p, to: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Montant</label>
                <input
                  className={inputCls}
                  type="number" step="any" placeholder="0.0"
                  value={transfer.amount}
                  onChange={e => setTransfer(p => ({ ...p, amount: e.target.value }))}
                />
              </div>
              <div>
                <label className={labelCls}>Type d'actif</label>
                <select
                  className={selectCls}
                  value={transfer.kind}
                  onChange={e => setTransfer(p => ({ ...p, kind: e.target.value }))}
                >
                  <option value="Native">Natif ({selectedWallet ? (net(selectedWallet.network).symbol || 'ETH') : 'ETH'})</option>
                  <option value="Erc20">ERC-20 · Token</option>
                </select>
              </div>
            </div>
            {error && (
              <div className="px-3 py-2 bg-[#FEF2F2] border border-[rgba(220,38,38,0.2)] rounded-[6px] text-[12.5px] text-[#991B1B]">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-[#E7E7E7]">
              <Button variant="ghost" onClick={resetTransfer}>Annuler</Button>
              <Button
                variant="primary"
                onClick={handleTransferReview}
                disabled={sending || !transfer.to || !transfer.amount}
              >
                {sending && <Spinner />}
                {sending ? 'Vérification compliance…' : 'Continuer'}
              </Button>
            </div>
          </div>
        )}

        {/* ─── Stage 2 : Review ─── */}
        {transferStage === 'review' && selectedWallet && (
          <div className="space-y-4">
            {/* Recap */}
            <div className="bg-[#F9F8F5] border border-[#E7E7E7] rounded-[8px] p-4 space-y-3">
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-[#8A8278]">Depuis</span>
                <span className="text-[#0F0F10] font-semibold">{selectedWallet.name} · {net(selectedWallet.network).name}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="text-[#8A8278] flex-shrink-0">Vers</span>
                <span className="text-[#0F0F10] font-mono text-[11.5px] text-right break-all">{transfer.to}</span>
              </div>
              <div className="flex items-center justify-between text-[12.5px] pt-3 border-t border-[#E7E7E7]">
                <span className="text-[#8A8278]">Montant</span>
                <span className="text-[#0F0F10] font-semibold tabular-nums text-[15px]">
                  {transfer.amount} {net(selectedWallet.network).symbol || transfer.kind}
                </span>
              </div>
            </div>

            {/* Chainalysis screening result — badge LIVE / sandbox pour que
                le banquier voie clairement si c'est la vraie API ou la liste
                OFAC curée de démo. `mode` vient du serveur (live|sandbox). */}
            {transferScreening && (() => {
              const topResult = transferScreening.results?.[0];
              const mode = topResult?.mode || (String(transferScreening.provider || '').includes('sandbox') ? 'sandbox' : 'live');
              const isLive = mode === 'live';
              return (
                <div className={`px-4 py-3 rounded-[8px] border ${
                  transferScreening.flagged
                    ? 'bg-[#FEF2F2] border-[rgba(220,38,38,0.2)]'
                    : 'bg-[#ECFAF0] border-[rgba(15,152,104,0.2)]'
                }`}>
                  <div className="flex items-start gap-3">
                    <span className={`w-1.5 h-1.5 rounded-full mt-[7px] flex-shrink-0 ${
                      transferScreening.flagged ? 'bg-[#DC2626]' : 'bg-[#0F9868]'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-[12.5px] font-semibold ${
                          transferScreening.flagged ? 'text-[#991B1B]' : 'text-[#0F7548]'
                        }`}>
                          {transferScreening.flagged
                            ? `⚠ Adresse sanctionnée — ${topResult?.identifications?.[0]?.name || 'OFAC hit'}`
                            : 'Adresse clean · OFAC · EU · UN · UK HMT'}
                        </p>
                        <span className={`inline-flex items-center gap-1 px-1.5 h-[18px] rounded-[3px] text-[9.5px] font-semibold tracking-[0.06em] uppercase ${
                          isLive
                            ? 'bg-[#0A0A0A] text-white'
                            : 'bg-[#F5EEE0] text-[#7C5E3C]'
                        }`}>
                          <span className={`w-1 h-1 rounded-full ${isLive ? 'bg-[#6DE49F]' : 'bg-[#C8924B]'}`} />
                          {isLive ? 'LIVE' : 'DEMO'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#8A8278] mt-0.5">
                        {transferScreening.flagged
                          ? 'Transfert bloqué au niveau serveur (Règlement UE 2015/847).'
                          : isLive
                            ? `Chainalysis Public Sanctions API · ${topResult?.identifications?.length || 0} match`
                            : 'Liste OFAC curée (mode démo — ajouter CHAINALYSIS_API_KEY pour LIVE).'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Risk warnings / blocks */}
            {transferRisk?.blocks?.length > 0 && (
              <div className="px-4 py-3 bg-[#FEF2F2] border border-[rgba(220,38,38,0.2)] rounded-[8px]">
                <p className="text-[12.5px] font-semibold text-[#991B1B] mb-1">Blocages compliance</p>
                <ul className="text-[11.5px] text-[#991B1B] space-y-0.5">
                  {transferRisk.blocks.map((b, i) => <li key={i}>· {b}</li>)}
                </ul>
              </div>
            )}
            {transferRisk?.warnings?.length > 0 && (
              <div className="px-4 py-3 bg-[#FEF9EC] border border-[rgba(202,138,4,0.2)] rounded-[8px]">
                <p className="text-[12.5px] font-semibold text-[#B45309] mb-1">Avertissements</p>
                <ul className="text-[11.5px] text-[#B45309] space-y-0.5">
                  {transferRisk.warnings.map((w, i) => <li key={i}>· {w}</li>)}
                </ul>
              </div>
            )}

            {/* Info banner */}
            <div className="px-4 py-3 bg-[#FDFBF6] border border-[#E7E7E7] rounded-[8px]">
              <p className="text-[11.5px] text-[#5D5D5D] leading-[1.5]">
                Après confirmation, la demande d'approbation sera créée dans <span className="font-semibold text-[#1E1E1E]">transfer_approvals</span>.
                Un second banquier devra la valider (règle quatre-yeux · ACPR LCB-FT Art. 14) avant que DFNS n'exécute la signature MPC.
              </p>
            </div>

            {error && (
              <div className="px-3 py-2 bg-[#FEF2F2] border border-[rgba(220,38,38,0.2)] rounded-[6px] text-[12.5px] text-[#991B1B]">
                {error}
              </div>
            )}

            <div className="flex justify-between gap-2 pt-2 border-t border-[#E7E7E7]">
              <Button variant="ghost" onClick={() => { setTransferStage('form'); setError(null); }}>
                ← Retour
              </Button>
              <Button
                variant="primary"
                onClick={handleTransferConfirm}
                disabled={sending || transferScreening?.flagged || transferRisk?.blocks?.length > 0}
              >
                {sending && <Spinner />}
                {sending ? 'Création de la demande…' : 'Confirmer et soumettre'}
              </Button>
            </div>
          </div>
        )}

        {/* ─── Stage 3 : Success ─── */}
        {transferStage === 'success' && transferResult && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 px-4 py-4 bg-[#ECFAF0] border border-[rgba(15,152,104,0.2)] rounded-[8px]">
              <div className="w-10 h-10 rounded-full bg-[#0F9868] text-white flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-semibold text-[#0F7548]">Demande d'approbation créée</p>
                <p className="text-[11.5px] text-[#0F7548] mt-0.5">
                  ID · <span className="font-mono">{transferResult.id?.slice(0, 8)}…</span>
                </p>
              </div>
            </div>

            <div className="bg-[#F9F8F5] border border-[#E7E7E7] rounded-[8px] p-4 space-y-2.5 text-[12.5px]">
              <div className="flex items-center justify-between">
                <span className="text-[#8A8278]">Statut</span>
                <Badge variant="warning" dot>En attente de validation</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#8A8278]">Règle appliquée</span>
                <span className="text-[#0F0F10] font-semibold">Quatre-yeux · ACPR Art. 14</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#8A8278]">Demandeur</span>
                <span className="text-[#0F0F10]">{user?.email || 'banquier'}</span>
              </div>
            </div>

            <p className="text-[11.5px] text-[#5D5D5D] leading-[1.55]">
              <span className="font-semibold text-[#1E1E1E]">Étape suivante :</span> un second banquier (distinct du demandeur) doit approuver la demande depuis l'onglet Compliance. Dès validation, DFNS signe la transaction via MPC 2/3.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E7E7E7]">
              <Button variant="ghost" onClick={resetTransfer}>Fermer</Button>
              <Button variant="primary" onClick={() => { resetTransfer(); setTab('transfers'); }}>
                Voir dans Transferts →
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══ Screening Modal — Chainalysis sanctions check ═══
         Fires on the "Lancer screening" ActionRow. Screens every
         client wallet address sequentially against OFAC/EU/UN/UK
         sanctions lists (Chainalysis Public API). Each row flips from
         pending → clean (green) or flagged (red) with real-time UI.
         Any flagged address auto-opens a compliance_alert server-side. */}
      <Modal
        isOpen={screeningOpen}
        onClose={() => !screeningRunning && setScreeningOpen(false)}
        title="Screening Chainalysis"
        subtitle="Contrôle OFAC · UE · UN · HMT de toutes les adresses wallets du client."
        maxWidth="max-w-2xl"
      >
        <div className="space-y-5">
          <div className="flex items-center gap-3 px-4 py-3 rounded-[8px] bg-[#FAFAFA] border border-[#E7E7E7]">
            <div className="flex-shrink-0 w-9 h-9 rounded-[8px] bg-white border border-[#E7E7E7] flex items-center justify-center">
              <svg className="w-4 h-4 text-[#1E1E1E]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[#0F0F10]">
                {screeningRunning
                  ? `Screening en cours · ${screeningResults.filter(r => r.status !== 'pending').length} / ${screeningResults.length}`
                  : screeningResults.some(r => r.status === 'flagged')
                    ? `⚠ ${screeningResults.filter(r => r.status === 'flagged').length} hit${screeningResults.filter(r => r.status === 'flagged').length > 1 ? 's' : ''} — alerte compliance ouverte`
                    : screeningResults.length > 0
                      ? 'Aucune adresse sanctionnée — le client peut transférer'
                      : 'Prêt à lancer le screening'}
              </p>
              <p className="text-[11.5px] text-[#8A8278] mt-0.5">
                Listes consultées : OFAC SDN · EU Consolidated · UK HMT · UN Security Council · Règlement 2015/847
              </p>
            </div>
          </div>

          <ul className="space-y-2">
            {screeningResults.map((row, i) => {
              const n = SUPPORTED_NETWORKS.find(x => x.id === row.network) || { icon: '?', color: '#8A8278', name: row.network };
              return (
                <li
                  key={i}
                  className={`px-4 py-3 rounded-[8px] border flex items-center gap-3 transition-colors ${
                    row.status === 'flagged' ? 'border-[#DC2626] bg-[#FEF2F2]'
                    : row.status === 'clean' ? 'border-[#E7E7E7] bg-white'
                    : row.status === 'error' ? 'border-[#CA8A04] bg-[#FEF9EC]'
                    : 'border-[#E7E7E7] bg-[#FAFAFA]'
                  }`}
                >
                  <span
                    className="w-6 h-6 rounded-[5px] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                    style={{ backgroundColor: n.color }}
                  >
                    {n.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium text-[#0F0F10] truncate">{row.name || n.name}</p>
                    <p className="text-[11px] text-[#8A8278] font-mono truncate">{row.address}</p>
                    {row.status === 'flagged' && row.hits?.length > 0 && (
                      <p className="text-[11.5px] text-[#DC2626] font-medium mt-1 truncate">
                        {row.hits.map(h => h.name).join(' · ')}
                      </p>
                    )}
                    {row.status === 'error' && (
                      <p className="text-[11.5px] text-[#B45309] mt-1 truncate">{row.error}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {row.status === 'pending' && <Spinner size="w-3.5 h-3.5" />}
                    {row.status === 'clean' && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[5px] bg-[#ECFAF0] text-[#0F9868] text-[11px] font-semibold">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Clean
                      </span>
                    )}
                    {row.status === 'flagged' && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[5px] bg-[#DC2626] text-white text-[11px] font-semibold">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M4.062 19.94a2 2 0 001.732 1.06h12.412a2 2 0 001.732-1.06l-6.206-10.746a2 2 0 00-3.464 0L4.062 19.94z" />
                        </svg>
                        Sanctionné
                      </span>
                    )}
                    {row.status === 'error' && (
                      <span className="text-[11px] text-[#B45309] font-semibold">Erreur</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between pt-4 border-t border-[#E7E7E7]">
            <p className="text-[11px] text-[#8A8278]">
              {lastScreeningAt && `Dernier contrôle · ${new Date(lastScreeningAt).toLocaleString('fr-FR')}`}
            </p>
            <div className="flex gap-2">
              {!screeningRunning && screeningResults.some(r => r.status === 'flagged') && (
                <Button variant="secondary" onClick={() => setTab('compliance')}>
                  Voir alertes compliance
                </Button>
              )}
              <Button
                variant="primary"
                onClick={() => setScreeningOpen(false)}
                disabled={screeningRunning}
              >
                {screeningRunning ? 'Patientez…' : 'Fermer'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ═══ Statement Modal — "Envoyer relevé custody" ═══
         Pre-filled email composer with the client's primary contact,
         a wallet balances summary and the ACPR/MiCA reference. PDF
         generation is stubbed (calls /api/salesforce/generate-statement
         once wired). For now shows the compose preview + toast. */}
      <Modal
        isOpen={showStatementModal}
        onClose={() => setShowStatementModal(false)}
        title="Relevé custody trimestriel"
        subtitle="PDF signé + cachet Sℓ · horodatage ACPR · envoi par mail au client"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Destinataire</label>
              <input
                type="email"
                className={inputCls}
                defaultValue={contacts[0]?.Email || ''}
                placeholder="Aucun contact trouvé sur SFDC"
                readOnly={!!contacts[0]?.Email}
              />
            </div>
            <div>
              <label className={labelCls}>Période</label>
              <select className={selectCls} defaultValue="current-q">
                <option value="current-q">Trimestre courant</option>
                <option value="prev-q">Trimestre précédent</option>
                <option value="year">Année fiscale</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Objet</label>
            <input
              type="text"
              className={inputCls}
              defaultValue={`Relevé custody · ${client.name} · T${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`}
            />
          </div>

          {/* Wallet balances preview — what will appear in the PDF */}
          <div>
            <label className={labelCls}>Soldes à inclure ({wallets.length} wallet{wallets.length > 1 ? 's' : ''})</label>
            <div className="bg-[#FDFBF6] border border-[#E7E7E7] rounded-[8px] divide-y divide-[#E7E7E7]">
              {wallets.length === 0 ? (
                <p className="px-4 py-3 text-[12.5px] text-[#8A8278]">Aucun wallet sous mandat.</p>
              ) : wallets.map(w => (
                <div key={w.id} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-[5px] flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: '#7C5E3C' }}>
                      {(w.network || '').slice(0, 1)}
                    </span>
                    <span className="text-[13px] text-[#1E1E1E] font-medium truncate">{w.name || '—'}</span>
                    <span className="text-[11.5px] text-[#8A8278] font-mono truncate">
                      {w.address ? truncAddr(w.address, 6) : ''}
                    </span>
                  </div>
                  <span className="text-[12.5px] text-[#8A8278] tabular-nums">
                    Solde live au signing
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Regulatory mention */}
          <div className="bg-[#EBF5FF] border border-[rgba(59,130,246,0.1)] rounded-[8px] px-4 py-3 flex items-start gap-3">
            <svg className="w-4 h-4 text-[#1E40AF] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-[12.5px] font-semibold text-[#1E40AF]">Conforme ACPR · MiCA Art. 75(7)</p>
              <p className="text-[11.5px] text-[#1E40AF]/80 mt-0.5">
                Le PDF est horodaté, scellé (Sℓ), archivé dans le coffre-fort clients Supabase et
                journalisé dans l'audit log (<span className="font-mono">statement.sent</span>).
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-[#E7E7E7]">
            <Button variant="ghost" onClick={() => setShowStatementModal(false)}>Annuler</Button>
            <Button variant="primary" onClick={() => { setShowStatementModal(false); }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Générer & envoyer
            </Button>
          </div>
        </div>
      </Modal>

      {/* ═══ Wallet drawer — slide-in from the right, same UX as the client
          profile drawer. Triggered by clicking a row in CryptoHoldingsCard
          or the Wallets tab. Closes on Esc / backdrop click. */}
      {(() => {
        const w = wallets.find(x => x.id === walletDrawerId);
        const breakdown = holdings?.walletsBreakdown?.find(x => x.wallet.id === walletDrawerId);
        const walletAssets = breakdown?.assets || [];
        const n = w ? (SUPPORTED_NETWORKS.find(s => s.id === w.network) || { icon: '?', color: '#8A8278', name: w.network }) : null;
        const walletEur = walletAssets.reduce((s, a) => {
          const bal = (a.decimals > 6 ? parseFloat(a.balance || 0) / Math.pow(10, a.decimals) : parseFloat(a.balance || 0));
          const price = resolvePriceEur(a.symbol, holdings?.oracle?.prices) || FALLBACK_PRICES_EUR[a.symbol] || 0;
          return s + bal * price;
        }, 0);
        return (
          <Drawer
            isOpen={!!walletDrawerId && !!w}
            onClose={() => setWalletDrawerId(null)}
            size="md"
            title={w?.name || 'Wallet'}
            eyebrow={n?.name}
            trailing={
              <Badge variant={w?.status === 'Active' ? 'success' : 'warning'}>
                {w?.status || 'Inconnu'}
              </Badge>
            }
          >
            {w && (
              <div className="space-y-5 animate-fade">
                {/* Gel des avoirs — en tête pour que le banquier voie
                    immédiatement si le wallet est bloqué. Per-wallet via
                    walletId, conforme MiCA Art. 68 · LCB-FT. */}
                <WalletFreezePanel
                  walletId={w.id}
                  walletName={w.name}
                  walletAddress={w.address}
                  walletNetwork={w.network}
                  salesforceAccountId={client.id}
                  clientName={client.name || client.Name}
                />

                {/* Live balance — big number same pattern as CryptoHoldingsCard */}
                <div className="bg-[#F9F8F5] border border-[#E7E7E7] rounded-[8px] p-5">
                  <p className="text-[10.5px] font-semibold text-[#8A8278] uppercase tracking-[0.1em]">
                    Solde en conservation
                  </p>
                  <p className="text-[32px] font-semibold text-[#0F0F10] tabular-nums mt-1 leading-[1.05]" style={{ letterSpacing: '-0.022em' }}>
                    {walletEur > 0 ? fmtEUR(Math.round(walletEur)) : '€0'}
                  </p>
                  <p className="text-[11.5px] text-[#8A8278] mt-1">
                    {walletAssets.length} actif{walletAssets.length > 1 ? 's' : ''} · réseau {n?.name}
                  </p>
                </div>

                {/* Deposit address */}
                <div>
                  <p className="text-[10.5px] font-semibold text-[#8A8278] uppercase tracking-[0.1em] mb-2">
                    Adresse de dépôt
                  </p>
                  <div className="flex items-center gap-2 bg-white border border-[#E7E7E7] rounded-[8px] px-3 py-2.5">
                    <span className="font-mono text-[12px] text-[#0F0F10] break-all flex-1 leading-relaxed">
                      {w.address || '—'}
                    </span>
                    {w.address && <CopyButton value={w.address} label="" />}
                  </div>
                  <p className="text-[11px] text-[#8A8278] mt-1.5">
                    Partagez uniquement cette adresse avec le client — elle est propre au wallet.
                  </p>
                </div>

                {/* Assets list */}
                {walletAssets.length > 0 && (
                  <div>
                    <p className="text-[10.5px] font-semibold text-[#8A8278] uppercase tracking-[0.1em] mb-2">
                      Actifs
                    </p>
                    <ul className="bg-white border border-[#E7E7E7] rounded-[8px] divide-y divide-[#E7E7E7]">
                      {walletAssets.map((a, i) => {
                        const bal = (a.decimals > 6 ? parseFloat(a.balance || 0) / Math.pow(10, a.decimals) : parseFloat(a.balance || 0));
                        const price = resolvePriceEur(a.symbol, holdings?.oracle?.prices) || FALLBACK_PRICES_EUR[a.symbol] || 0;
                        const eur = bal * price;
                        return (
                          <li key={i} className="px-4 py-3 flex items-center gap-3">
                            <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: colorForAsset(a.symbol) }} />
                            <span className="text-[13px] text-[#0F0F10] font-semibold min-w-[80px] max-w-[110px] truncate flex-shrink-0" title={a.symbol}>{a.symbol}</span>
                            <span className="text-[12.5px] text-[#5D5D5D] tabular-nums flex-1 min-w-0 truncate">{bal.toFixed(bal > 1 ? 2 : 6)}</span>
                            <span className="text-[13px] text-[#0F0F10] font-medium tabular-nums flex-shrink-0">
                              {eur > 0 ? fmtEUR(Math.round(eur)) : '—'}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Meta */}
                <div className="pt-4 border-t border-[#E7E7E7] space-y-2.5 text-[12.5px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#8A8278]">Wallet ID</span>
                    <span className="text-[#1E1E1E] font-mono text-[11.5px]">{w.id}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#8A8278]">Créé le</span>
                    <span className="text-[#1E1E1E] tabular-nums">{fmtDate(w.dateCreated)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#8A8278]">Signature MPC</span>
                    <span className="text-[#1E1E1E] font-semibold tabular-nums">2 / 3</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#8A8278]">Client lié</span>
                    <span className="text-[#1E1E1E] font-mono text-[11.5px]">{w.externalId || '—'}</span>
                  </div>
                </div>

                {/* Actions — keyboard-focusable.
                    • Historique → tab Transferts avec ce wallet sélectionné
                    • Transfert → tab Transferts + ouvre modal transfert
                    • Archiver → soft-delete via DFNS tag (archivage ACPR)
                    Les deux premiers sont désactivés si le wallet est archivé. */}
                {(() => {
                  const isArchived = (w.tags || []).includes('sl:archived');
                  return (
                    <div className="space-y-2 pt-4 border-t border-[#E7E7E7]">
                      {isArchived && (
                        <div className="px-3 py-2.5 bg-[#FEF2F2] border border-[rgba(220,38,38,0.18)] rounded-[8px] mb-1">
                          <p className="text-[12px] text-[#991B1B] tracking-[-0.003em]">
                            <strong>Wallet archivé</strong> — Aucun transfert possible.
                            Conservé 5 ans pour audit ACPR (Art. L.561-12 CMF).
                          </p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={() => { setWalletDrawerId(null); setTab('transfers'); setSelectedWallet(w); }}
                        >
                          Voir l'historique
                        </Button>
                        <Button
                          variant="primary"
                          size="md"
                          disabled={isArchived}
                          onClick={() => { setWalletDrawerId(null); setTab('transfers'); setSelectedWallet(w); setShowTransfer(true); }}
                        >
                          Demander un transfert
                        </Button>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const label = isArchived ? 'désarchiver' : 'archiver';
                          if (!confirm(`Confirmer ${label} ce wallet ?${isArchived ? '' : '\n\nL\'archivage est réversible. Le solde doit être à zéro et aucune demande de transfert en attente.'}`)) return;
                          try {
                            if (isArchived) await unarchiveWallet(w.id);
                            else await archiveWallet(w.id);
                            setWalletDrawerId(null);
                            await loadWallets();
                          } catch (err) {
                            alert(err.message || 'Erreur');
                          }
                        }}
                        className={`w-full h-9 px-4 rounded-[6px] text-[13px] font-semibold border transition-colors ${
                          isArchived
                            ? 'bg-white text-[#7C5E3C] border-[rgba(124,94,60,0.28)] hover:bg-[#FDFBF6]'
                            : 'bg-white text-[#DC2626] border-[rgba(220,38,38,0.22)] hover:bg-[#FEF2F2] hover:border-[rgba(220,38,38,0.4)]'
                        }`}
                      >
                        {isArchived ? 'Désarchiver ce wallet' : 'Archiver ce wallet'}
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </Drawer>
        );
      })()}
    </div>
  );
}

/* ─── Sub-components ─── */

// ActionRow — one row in the "Actions banquier" card. Monochrome grey icon
// badge (Ramify-inspired neutral) + title + subtitle + chevron that slides
// in from the left on hover. Disabled dims the whole row.
// Grey tokens:
//   badge bg   #F3F2EE  (warm-neutral stone)
//   badge fg   #1E1E1E  (ink)
//   hover bg   #F9F8F5  (very subtle warm-neutral lift)
//   hover bdr  #D1D5DB  (cool grey, not bronze)
function ActionRow({ icon, title, subtitle, onClick, disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[6px] border transition-all duration-150 text-left group
        ${disabled
          ? 'bg-[#FAFAFA] border-[#E7E7E7] opacity-60 cursor-not-allowed'
          : 'bg-white border-[#E7E7E7] hover:border-[#D1D5DB] hover:bg-[#F9F8F5] active:scale-[0.995]'}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-8 h-8 rounded-[7px] bg-[#F3F2EE] text-[#1E1E1E] flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-[1.04]">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#0F0F10] truncate">{title}</p>
          <p className="text-[11.5px] text-[#8A8278] truncate">{subtitle}</p>
        </div>
      </div>
      {!disabled && (
        <svg className="w-3.5 h-3.5 text-[#8A8278] group-hover:text-[#1E1E1E] group-hover:translate-x-0.5 transition-all flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      )}
    </button>
  );
}

function SectionCard({ title, children }) {
  return (
    <Card className="p-6">
      <h3 className="text-[14px] font-medium text-[#0A0A0A] tracking-[-0.01em] mb-5">{title}</h3>
      {children}
    </Card>
  );
}

function Field({ label, value, mono, link }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-[#8A8278] uppercase tracking-[0.04em] mb-1.5">{label}</p>
      {link && value ? (
        <a
          href={value.startsWith('http') ? value : `https://${value}`}
          target="_blank" rel="noopener noreferrer"
          className="text-[14px] font-medium text-[#0A0A0A] hover:underline underline-offset-2 tracking-[-0.01em]"
        >
          {value}
        </a>
      ) : (
        <p className={`text-[14px] ${mono ? 'font-mono text-[#1E1E1E]' : 'text-[#0A0A0A] font-medium tracking-[-0.01em]'}`}>
          {value || '—'}
        </p>
      )}
    </div>
  );
}

function MetaRow({ label, value, mono }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-[#8A8278] uppercase tracking-[0.04em] mb-1">{label}</dt>
      <dd className={`text-[12.5px] ${mono ? 'font-mono text-[#1E1E1E] break-all' : 'text-[#0A0A0A] font-medium tracking-[-0.01em]'}`}>{value}</dd>
    </div>
  );
}

/* PatrimonyCard — répartition du patrimoine lue depuis SFDC (4 custom fields).
   Si aucun champ n'est rempli, fallback sur l'ancienne répartition fictive
   basée sur AnnualRevenue (pour ne pas casser les comptes existants). */
function PatrimonyCard({ client, parsedAllocation }) {
  const liquidity   = Number(client.Custody_AUM_Liquidity__c)     || 0;
  const securities  = Number(client.Custody_AUM_Securities__c)    || 0;
  const realEstate  = Number(client.Custody_AUM_RealEstate__c)    || 0;
  const cryptoTgt   = Number(client.Custody_AUM_Crypto_Target__c) || 0;
  const sfTotal     = liquidity + securities + realEstate + cryptoTgt;
  const hasSfdcData = sfTotal > 0;

  // Fallback : ancienne répartition 15/65/15/5 sur AnnualRevenue
  const fallbackTotal = Number(client.aum) || 0;
  const showFallback  = !hasSfdcData && fallbackTotal > 0;

  const total = hasSfdcData ? sfTotal : fallbackTotal;
  const rows = hasSfdcData
    ? [
        { label: 'Liquidités',        sub: 'Comptes courants',    value: liquidity,  pct: total ? (liquidity / total) * 100 : 0 },
        { label: 'Investissements',   sub: 'Actions · Obligations · AV', value: securities, pct: total ? (securities / total) * 100 : 0 },
        { label: 'Immobilier',        sub: 'Direct et indirect',  value: realEstate, pct: total ? (realEstate / total) * 100 : 0 },
        { label: 'Actifs numériques', sub: parsedAllocation ? `Cible ${parsedAllocation}` : 'Allocation cible custody', value: cryptoTgt, pct: total ? (cryptoTgt / total) * 100 : 0 },
      ]
    : [
        { label: 'Liquidités',        sub: 'Comptes courants',    value: Math.round(fallbackTotal * 0.15), pct: 15 },
        { label: 'Investissements',   sub: 'Actions · Obligations', value: Math.round(fallbackTotal * 0.65), pct: 65 },
        { label: 'Immobilier',        sub: 'Direct et indirect',  value: Math.round(fallbackTotal * 0.15), pct: 15 },
        { label: 'Actifs numériques', sub: parsedAllocation ? `Cible ${parsedAllocation}` : 'Conservation MiCA', value: Math.round(fallbackTotal * 0.05), pct: 5 },
      ];

  return (
    <Card>
      <div className="px-6 pt-5 pb-4 border-b border-[#E7E7E7]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-eyebrow">Patrimoine consolidé</p>
            <p className="display-sm text-[#0A0A0A] tabular-nums mt-2">
              {total ? fmtCompactEUR(total) : '—'}
            </p>
          </div>
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-[5px] text-[10px] font-semibold uppercase tracking-[0.06em] ${
            hasSfdcData
              ? 'bg-[#ECFDF5] text-[#065F46]'
              : 'bg-[#FFFBEB] text-[#92400E]'
          }`}>
            <span className="w-1 h-1 rounded-full" style={{ background: 'currentColor' }} />
            {hasSfdcData ? 'Salesforce' : 'Estimé'}
          </span>
        </div>
        {showFallback && (
          <p className="text-[11px] text-[#92400E] mt-2 tracking-[-0.003em]">
            Répartition estimative — remplir Custody_AUM_* dans Salesforce pour une ventilation réelle.
          </p>
        )}
      </div>
      <ul>
        {rows.map((r, i) => (
          <WealthRow
            key={r.label}
            label={r.label}
            sub={r.sub}
            value={fmtEUR(r.value)}
            pct={r.pct}
            last={i === rows.length - 1}
          />
        ))}
      </ul>
    </Card>
  );
}

function WealthRow({ label, sub, value, pct, last }) {
  return (
    <li className={`px-6 py-4 ${!last ? 'border-b border-[#E7E7E7]' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[13.5px] font-medium text-[#0A0A0A] tracking-[-0.01em]">{label}</p>
          <p className="text-[11.5px] text-[#5D5D5D] mt-0.5 tracking-[-0.003em]">{sub}</p>
        </div>
        <div className="text-right">
          <p className="text-[13.5px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.015em]">{value}</p>
          <p className="text-[11px] text-[#8A8278] tabular-nums mt-0.5">{pct}%</p>
        </div>
      </div>
      {/* Progress bar — hairline */}
      <div className="h-[3px] rounded-full bg-[#F5F3EE] overflow-hidden">
        <div
          className="h-full bg-[#0A0A0A] rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </li>
  );
}

// ═══ CryptoHoldingsCard — the "combien de crypto a mon client" card ═══════
// Shows: (1) total custody value in EUR, (2) per-asset breakdown with a
// stacked bar + rows (symbol · balance · €value · %), (3) per-wallet
// breakdown below with network badge + wallet name + inline asset summary.
// Uses BrandGlyph 'briefcase' as the signature icon.
// Asset colors come from a lookup tuned for recognisability (BTC orange,
// ETH blue, USDC blue-teal, SOL green).
const ASSET_COLORS = {
  BTC:  '#F7931A', ETH: '#627EEA', SOL: '#14F195',
  USDC: '#2775CA', USDT: '#26A17B', DAI: '#F4B731',
  SepoliaETH: '#AAB7D1', EthereumGoerli: '#AAB7D1', BitcoinTestnet: '#D2B48C',
};
const colorForAsset = (symbol) => ASSET_COLORS[symbol] || '#7C5E3C';

function CryptoHoldingsCard({ wallets, holdings, loading, net, onSelectWallet }) {
  // Always call hooks unconditionally — React rules. We gate rendering below.
  const animatedTotal = useCountUp(holdings?.totalValueEur || 0, { duration: 900 });
  const [barMounted, setBarMounted] = useState(false);
  useEffect(() => {
    // Next frame so the browser paints 0% first, then animates to target width.
    if (holdings?.assets?.length) {
      const raf = requestAnimationFrame(() => setBarMounted(true));
      return () => cancelAnimationFrame(raf);
    }
    setBarMounted(false);
  }, [holdings]);

  if (!wallets || wallets.length === 0) return null;
  const networkCount = new Set(wallets.map(w => w.network)).size;
  const walletsWithAssets = holdings?.walletsBreakdown || wallets.map(w => ({ wallet: w, assets: [] }));

  return (
    <Card>
      <div className="px-5 pt-4 pb-4 border-b border-[#E7E7E7]">
        <div className="flex items-center gap-2.5">
          <span className="flex-shrink-0 w-8 h-8 rounded-[7px] bg-[#F3F2EE] text-[#1E1E1E] flex items-center justify-center">
            <BrandGlyph name="briefcase" size={16} />
          </span>
          <p className="text-[13.5px] font-semibold text-[#0F0F10]">Cryptos détenues</p>
          {loading && <Spinner size="w-3 h-3" />}
        </div>
        <p className="text-[24px] font-semibold text-[#0F0F10] tabular-nums mt-2 leading-[1.1]"
           style={{ letterSpacing: '-0.02em' }}>
          {holdings ? fmtEUR(Math.round(animatedTotal)) : '—'}
        </p>
        <p className="text-[11.5px] text-[#8A8278] mt-1">
          {wallets.length} wallet{wallets.length > 1 ? 's' : ''} · {networkCount} réseau{networkCount > 1 ? 'x' : ''}
          {holdings?.totalValueEur === 0 && <span className="ml-2 text-[#CA8A04]">· solde testnet</span>}
        </p>
        {/* Chainlink oracle source — transparence banquier.
            Badge vert si prix live Chainlink, orange si fallback. */}
        {holdings?.oracle && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-[10.5px]" title={`Source : ${holdings.oracle.source} · RPC ${holdings.oracle.rpc || ''} · maj ${holdings.oracle.fetchedAt ? new Date(holdings.oracle.fetchedAt).toLocaleTimeString('fr-FR') : '?'}`}>
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${holdings.oracle.source === 'chainlink' ? 'bg-[#2A5ADA]' : 'bg-[#CA8A04]'}`}
            />
            <span className="text-[#5D5D5D]">
              Prix {holdings.oracle.source === 'chainlink' ? 'Chainlink · on-chain' : 'fallback (RPC indispo)'}
            </span>
            {holdings.oracle.fetchedAt && (
              <span className="text-[#8A8278] tabular-nums">
                · {new Date(holdings.oracle.fetchedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Stacked bar + per-asset rows */}
      {holdings && holdings.assets.length > 0 && (
        <div className="px-5 pt-4 pb-1">
          <div className="flex h-2 rounded-[3px] overflow-hidden bg-[#F3F2EE]">
            {holdings.assets.map((a, i) => (
              <div
                key={i}
                className="h-full"
                style={{
                  width: barMounted ? `${Math.max(2, a.percentage)}%` : '0%',
                  background: colorForAsset(a.symbol),
                  transition: `width 700ms cubic-bezier(0.2, 0.8, 0.2, 1) ${i * 60}ms`,
                }}
                title={`${a.symbol}: ${a.percentage.toFixed(1)}%`}
              />
            ))}
          </div>
          <ul className="mt-3 space-y-1.5">
            {holdings.assets.map((a, i) => (
              <li
                key={i}
                className="flex items-center gap-2.5 text-[12.5px] row-stagger"
                style={{ '--i': i }}
              >
                <span className="w-2 h-2 rounded-[2px] flex-shrink-0 transition-transform group-hover:scale-110" style={{ background: colorForAsset(a.symbol) }} />
                {/* min-w-[72px] + truncate + title : accommode SepoliaETH,
                    EthereumGoerli, BitcoinTestnet sans overflow sur la
                    colonne balance, et tooltip si vraiment trop long. */}
                <span className="text-[#0F0F10] font-semibold min-w-[72px] max-w-[96px] truncate flex-shrink-0" title={a.symbol}>{a.symbol}</span>
                <span className="text-[#5D5D5D] tabular-nums flex-1 min-w-0 truncate">{a.balance.toFixed(a.balance > 1 ? 2 : 6)}</span>
                <span className="text-[#0F0F10] font-medium tabular-nums flex-shrink-0">
                  {a.valueEur > 0 ? fmtEUR(Math.round(a.valueEur)) : '—'}
                </span>
                <span className="text-[#8A8278] tabular-nums w-10 text-right flex-shrink-0">
                  {a.valueEur > 0 ? `${Math.round(a.percentage)}%` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {holdings && holdings.assets.length === 0 && !loading && (
        <p className="px-5 py-5 text-[12.5px] text-[#8A8278] text-center">
          Aucun actif en conservation — les wallets sont provisionnés mais vides.
        </p>
      )}

      {/* Per-wallet breakdown — each row is clickable → jumps to Wallets tab
         and selects the wallet (triggers the detail view). */}
      <div className="border-t border-[#E7E7E7] mt-3">
        <p className="px-5 pt-3 pb-1 text-[10.5px] font-semibold text-[#8A8278] uppercase tracking-[0.1em]">
          Détail par wallet
        </p>
        <ul className="divide-y divide-[#E7E7E7]">
          {walletsWithAssets.map(({ wallet, assets }) => {
            // Local price lookup — this component is outside ClientDetail's
            // closure so we can't use resolvePriceEur. Read directly from
            // holdings.oracle.prices (passed via prop) with static fallback.
            // Testnets (SepoliaETH, TEST_MATIC…) aliased to mainnet equivalent.
            const priceFor = (symbol) => {
              const s = (symbol || '').toUpperCase();
              const aliases = {
                SEPOLIAETH: 'ETH', ETHEREUMGOERLI: 'ETH', HOLESKYETH: 'ETH',
                TEST_MATIC: 'POL', TESTMATIC: 'POL',
                BITCOINTESTNET: 'BTC', TBTC: 'BTC', SOLANADEVNET: 'SOL',
              };
              const norm = aliases[s] || s;
              const live = holdings?.oracle?.prices?.[s]?.priceEur
                         || holdings?.oracle?.prices?.[norm]?.priceEur;
              if (typeof live === 'number' && live > 0) return live;
              const fb = { BTC: 58000, ETH: 2950, SOL: 135, USDC: 0.92, USDT: 0.92, LINK: 13, POL: 0.35 };
              return fb[norm] ?? fb[s] ?? 0;
            };
            const walletEur = assets.reduce((s, a) => {
              const bal = (a.decimals > 6 ? parseFloat(a.balance || 0) / Math.pow(10, a.decimals) : parseFloat(a.balance || 0));
              return s + bal * priceFor(a.symbol);
            }, 0);
            const n = net(wallet.network);
            const summary = assets.length > 0
              ? assets.map(a => {
                  const bal = (a.decimals > 6 ? parseFloat(a.balance || 0) / Math.pow(10, a.decimals) : parseFloat(a.balance || 0));
                  return `${bal.toFixed(bal > 1 ? 2 : 4)} ${a.symbol || a.kind || ''}`;
                }).join(' · ')
              : 'Wallet vide';
            return (
              <li key={wallet.id}>
                <button
                  type="button"
                  onClick={() => onSelectWallet?.(wallet)}
                  className="w-full px-5 py-2.5 text-left group hover:bg-[#FDFBF6] active:bg-[#F5EEE0] transition-colors focus-visible:outline-none focus-visible:bg-[#FDFBF6] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgba(124,94,60,0.2)]"
                  aria-label={`Ouvrir le wallet ${wallet.name || n.name}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-[4px] flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 transition-transform group-hover:scale-[1.08]" style={{ backgroundColor: n.color }}>
                        {n.icon}
                      </span>
                      <span className="text-[12.5px] font-medium text-[#1E1E1E] truncate">{wallet.name || n.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[12.5px] font-semibold text-[#0F0F10] tabular-nums">
                        {walletEur > 0 ? fmtEUR(Math.round(walletEur)) : '€0'}
                      </span>
                      {/* Chevron toujours visible (opacity 40%) pour signaler
                          la cliquabilité — Ramify pattern. */}
                      <svg className="w-3 h-3 text-[#8A8278] opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#8A8278] mt-0.5 truncate">
                    {summary}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

// ═══ MandatCard — contract state + renewal countdown ═══════════
// Matches Ramify's card DNA: header with eyebrow + headline, hairline
// divider, body with label/value rows, footer with a single semantic CTA.
// Uses BrandGlyph 'stamp' for the header mark. Days-til-renewal computed
// from createdDate + 365 days (mandate de conservation = annual by default).
function MandatCard({ isSigned, createdDate }) {
  const signedAt = createdDate ? new Date(createdDate) : null;
  const renewAt = signedAt ? new Date(signedAt.getTime() + 365 * 24 * 60 * 60 * 1000) : null;
  const daysLeft = renewAt ? Math.ceil((renewAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const status = !isSigned ? 'pending' : daysLeft != null && daysLeft < 30 ? 'expiring' : 'active';
  const statusTone = {
    pending:  { bg: '#FEF5E7', fg: '#92400E', label: 'À signer' },
    expiring: { bg: '#FEF5E7', fg: '#92400E', label: `Expire dans ${daysLeft} j` },
    active:   { bg: '#ECFAF0', fg: '#0F9868', label: 'En vigueur' },
  }[status];

  return (
    <Card>
      <div className="px-5 py-4 border-b border-[#E7E7E7] flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex-shrink-0 w-8 h-8 rounded-[7px] bg-[#F3F2EE] text-[#1E1E1E] flex items-center justify-center">
            <BrandGlyph name="stamp" size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-[#0F0F10]">Mandat de conservation</p>
            <p className="text-[11.5px] text-[#8A8278]">MiCA Art. 75 · annuel tacite</p>
          </div>
        </div>
        <span className="inline-flex items-center h-[22px] px-2 rounded-[4px] text-[10.5px] font-semibold uppercase tracking-[0.04em] flex-shrink-0" style={{ backgroundColor: statusTone.bg, color: statusTone.fg }}>
          {statusTone.label}
        </span>
      </div>
      <div className="px-5 py-4 space-y-2.5 text-[12.5px]">
        <div className="flex items-center justify-between">
          <span className="text-[#5D5D5D]">Signature initiale</span>
          <span className="text-[#0F0F10] font-medium tabular-nums">
            {signedAt ? signedAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[#5D5D5D]">Prochain renouvellement</span>
          <span className="text-[#0F0F10] font-medium tabular-nums">
            {renewAt ? renewAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[#5D5D5D]">Référence contractuelle</span>
          <span className="text-[#0F0F10] font-mono text-[11.5px]">Sℓ-{(createdDate || '').slice(2, 10).replace(/-/g, '')}</span>
        </div>
      </div>
    </Card>
  );
}

/* ─── Sub · TimelineEvent ─────────────────────────────────
   Rend une ligne du journal d'audit — icône/couleur selon
   la catégorie, label lisible, détails en petit caractères. */
function TimelineEvent({ event }) {
  const { action, category, severity, details, user_email, timestamp } = event || {};
  const cat = category || 'other';
  // Couleur/icône par catégorie — palette bronze + semantic
  const CAT_STYLE = {
    transfer:   { bg: '#F5EEE0', fg: '#7C5E3C', icon: 'M4 4h16v16H4z M8 12h8' },
    approval:   { bg: '#F5EEE0', fg: '#7C5E3C', icon: 'M9 12l2 2 4-4' },
    compliance: { bg: '#FEF2F2', fg: '#991B1B', icon: 'M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    custody:    { bg: '#F5F3EE', fg: '#0A0A0A', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
    risk:       { bg: '#FFFBEB', fg: '#92400E', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    delegation: { bg: '#F5EEE0', fg: '#7C5E3C', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857' },
    whitelist:  { bg: '#ECFDF5', fg: '#065F46', icon: 'M5 13l4 4L19 7' },
    policy:     { bg: '#F5F3EE', fg: '#0A0A0A', icon: 'M9 12l2 2 4-4' },
    auth:       { bg: '#F5F3EE', fg: '#5D5D5D', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    other:      { bg: '#F5F3EE', fg: '#5D5D5D', icon: 'M12 9v2m0 4h.01' },
  };
  const style = CAT_STYLE[cat] || CAT_STYLE.other;

  // Mapping des actions vers libellés FR lisibles
  const ACTION_LABELS = {
    'kyc.aml_screening': 'Screening AML lancé',
    'kyc.validated': 'KYC validé',
    'kyc.rejected': 'KYC rejeté',
    'adequacy_link_generated': "Lien d'adéquation généré",
    'adequacy_signed_by_client': 'Questionnaire d\'adéquation signé par le client',
    'custody_contract_signed_in_app': 'Contrat signé en présentiel',
    'custody_contract_signed': 'Contrat signé par le client',
    'custody_contract_redownloaded': 'Contrat re-téléchargé',
    'approval.requested': 'Demande de transfert créée',
    'approval.approved': 'Transfert approuvé (4-yeux)',
    'approval.rejected': 'Transfert rejeté',
    'approval.executed': 'Transfert exécuté',
    'approval.execution_failed': 'Échec exécution transfert',
    'transfer.initiated': 'Transfert initié',
    'transfer.completed': 'Transfert complété',
    'transfer.failed': 'Transfert échoué',
    'transfer.blocked_frozen_wallet': 'Transfert bloqué · wallet gelé',
    'transfer.blocked_sanctions_match': 'Transfert bloqué · adresse sanctionnée',
    'transfer.blocked_whitelist': 'Transfert bloqué · absent whitelist',
    'transfer.blocked_hard_cap': 'Transfert bloqué · plafond dépassé',
    'wallet_frozen': 'Wallet gelé',
    'wallet_unfrozen': 'Wallet dégelé',
    'compliance.sanctions_hit_blocked': 'Adresse sanctionnée détectée',
    'compliance.address_screening': 'Screening d\'adresse',
    'compliance.screen_unavailable': 'Screening indisponible',
    'ubo_added': 'Bénéficiaire effectif ajouté',
    'ubo_verified': 'Bénéficiaire effectif vérifié',
    'ubo_removed': 'Bénéficiaire effectif retiré',
    'delegation.created': 'Délégation créée',
    'delegation.revoked': 'Délégation révoquée',
    'risk.config_updated': 'Configuration de risque modifiée',
    'risk.transfer_check': 'Vérification préalable au transfert',
    'whitelist.address_added': 'Adresse ajoutée à la whitelist',
    'whitelist.address_approved': 'Adresse whitelist approuvée',
    'whitelist.address_revoked': 'Adresse whitelist révoquée',
    'dfns.policy_archived': 'Policy DFNS archivée',
    'salesforce_account_update': 'Compte Salesforce modifié',
  };
  const label = ACTION_LABELS[action] || action || 'Événement';

  // Date + heure ("12 sept. 2026 · 14:32")
  const d = timestamp ? new Date(timestamp) : null;
  const dateStr = d
    ? `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
    : '—';

  // Construit un sous-texte depuis les détails les plus pertinents
  const buildSubtext = () => {
    if (!details || typeof details !== 'object') return null;
    const parts = [];
    if (details.amount && details.assetSymbol) parts.push(`${details.amount} ${details.assetSymbol}`);
    else if (details.amount) parts.push(String(details.amount));
    if (details.to) parts.push(`→ ${String(details.to).slice(0, 10)}…`);
    if (details.destination) parts.push(`→ ${String(details.destination).slice(0, 10)}…`);
    if (details.riskLevel) parts.push(`Niveau ${details.riskLevel}`);
    if (details.verdict) parts.push(`Verdict: ${details.verdict}`);
    if (details.scoring?.score != null) parts.push(`Score ${details.scoring.score}/${details.scoring.max}`);
    if (details.reason) parts.push(details.reason);
    if (details.fileName) parts.push(details.fileName);
    return parts.join(' · ') || null;
  };
  const subtext = buildSubtext();

  return (
    <li className="px-6 py-4 flex items-start gap-4 hover:bg-[#FDFBF6] transition-colors">
      <div
        className="flex-shrink-0 w-9 h-9 rounded-[8px] flex items-center justify-center"
        style={{ background: style.bg, color: style.fg }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d={style.icon} />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-medium text-[#0A0A0A] tracking-[-0.006em]">{label}</p>
          {severity === 'critical' && <Badge variant="error" size="sm">Critique</Badge>}
          {severity === 'warning'  && <Badge variant="warning" size="sm">Avertissement</Badge>}
          {severity === 'high'     && <Badge variant="error" size="sm">Haute</Badge>}
        </div>
        {subtext && (
          <p className="text-[12px] text-[#5D5D5D] mt-0.5 truncate">{subtext}</p>
        )}
        <p className="text-[11px] text-[#8A8278] mt-1 tabular-nums">
          <span>{dateStr}</span>
          {user_email && <> · <span className="font-mono">{user_email}</span></>}
        </p>
      </div>
    </li>
  );
}

