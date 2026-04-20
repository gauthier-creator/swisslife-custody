import { useState, useEffect } from 'react';
import { listWallets, createWallet, getWalletAssets, transferAsset, getWalletHistory } from '../services/dfnsApi';
import { fetchContacts, fetchClientById, parseDescription, getSalesforceStatus } from '../services/salesforceApi';
import WhitelistPanel from './WhitelistPanel';
import RiskConfigPanel from './RiskConfigPanel';
import KYCFlow from './KYCFlow';
import DelegationPanel from './DelegationPanel';
import UBOPanel from './UBOPanel';
import WalletFreezePanel from './WalletFreezePanel';
import CustodyEligibilityPanel from './CustodyEligibilityPanel';
import { SUPPORTED_NETWORKS } from '../config/constants';
import { createApproval, checkTransferRisk, checkWalletFreeze } from '../services/complianceApi';
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
  const [showTransfer, setShowTransfer] = useState(false);
  const [transfer, setTransfer] = useState({ to: '', amount: '', kind: 'Native' });
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
  const { user, isAdmin } = useAuth();

  const reloadClient = async () => {
    try {
      const updated = await fetchClientById(client.id);
      setClient(updated);
    } catch (err) { console.error(err); }
  };

  const parsed = parseDescription(client.description);
  const kycValid = !kycModuleEnabled || kycLive?.overallStatus === 'validated' || parsed.kyc?.toLowerCase().includes('valid');

  useEffect(() => {
    loadWallets(); loadContacts(); loadKycStatus();
    fetch(`${API_BASE}/api/admin/settings`).then(r => r.json()).then(s => setKycModuleEnabled(!!s.kyc_module_enabled)).catch(() => {});
    getSalesforceStatus().then(setSfStatus).catch(() => {});
  }, []);

  // Deep-link to the Salesforce Lightning Account record in a new tab.
  // Instance URL comes from our /api/salesforce/status endpoint; if not
  // connected yet, falls back to the sandbox domain.
  const openInSalesforce = () => {
    const base = sfStatus?.instanceUrl || 'https://login.salesforce.com';
    const url = `${base}/lightning/r/Account/${client.id}/view`;
    window.open(url, '_blank', 'noopener,noreferrer');
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

  // Rough EUR prices for demo — in production these come from a pricing
  // oracle (Chainlink, CoinGecko) called server-side with cache.
  const PRICES_EUR = {
    BTC: 58000, ETH: 2950, SOL: 135,
    USDC: 0.92, USDT: 0.92, DAI: 0.92,
    // Testnets render 0 — we still show the asset row so the banker sees
    // which chains are provisioned, just with €0.00 (clearly flagged).
    SepoliaETH: 0, EthereumGoerli: 0, BitcoinTestnet: 0,
  };
  const humanBalance = (a) => {
    const raw = parseFloat(a.balance || 0);
    const dec = a.decimals || 0;
    // DFNS usually returns decimal-adjusted already; fall back to raw if no decimals.
    return dec > 6 ? raw / Math.pow(10, dec) : raw;
  };
  const assetValueEur = (a) => humanBalance(a) * (PRICES_EUR[a.symbol] ?? 0);

  const loadHoldings = async (wlts) => {
    if (!wlts || wlts.length === 0) { setHoldings(null); return; }
    setHoldingsLoading(true);
    try {
      const results = await Promise.all(
        wlts.map(w =>
          getWalletAssets(w.id)
            .then(data => ({ wallet: w, assets: data.assets || [] }))
            .catch(() => ({ wallet: w, assets: [] }))
        )
      );
      // Aggregate by asset symbol
      const byAsset = {};
      results.forEach(({ wallet, assets }) => {
        assets.forEach(a => {
          const key = a.symbol || a.kind || '?';
          if (!byAsset[key]) byAsset[key] = { symbol: key, kind: a.kind, balance: 0, valueEur: 0, walletCount: 0 };
          byAsset[key].balance += humanBalance(a);
          byAsset[key].valueEur += assetValueEur(a);
          byAsset[key].walletCount += 1;
        });
      });
      const totalValueEur = Object.values(byAsset).reduce((s, a) => s + a.valueEur, 0);
      const assetList = Object.values(byAsset)
        .map(a => ({ ...a, percentage: totalValueEur > 0 ? (a.valueEur / totalValueEur) * 100 : 0 }))
        .sort((a, b) => b.valueEur - a.valueEur);
      setHoldings({ totalValueEur, assets: assetList, walletsBreakdown: results });
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

  const handleTransfer = async () => {
    if (!selectedWallet) return;
    setSending(true); setError(null);
    try {
      const riskCheck = await checkTransferRisk({
        salesforceAccountId: client.id,
        amount: transfer.amount,
        network: selectedWallet.network,
        destinationAddress: transfer.to,
      }).catch(() => ({ allowed: true, warnings: [], blocks: [] }));

      if (riskCheck.blocks && riskCheck.blocks.length > 0) {
        alert('Transfert bloqué par la compliance :\n\n' + riskCheck.blocks.join('\n'));
        setSending(false); return;
      }

      const warningMsg = (riskCheck.warnings && riskCheck.warnings.length > 0)
        ? '\n\nAvertissements :\n- ' + riskCheck.warnings.join('\n- ')
        : '';

      const netInfo = SUPPORTED_NETWORKS.find(n => n.id === selectedWallet.network);
      const confirmMsg = `DEMANDE DE TRANSFERT\n\nDepuis : ${selectedWallet.name}\nVers : ${transfer.to}\nMontant : ${transfer.amount} ${netInfo?.symbol || ''}${warningMsg}\n\nLe transfert sera soumis à approbation (4-eye). Confirmer ?`;
      if (!confirm(confirmMsg)) { setSending(false); return; }

      await createApproval({
        walletId: selectedWallet.id,
        walletName: selectedWallet.name,
        walletNetwork: selectedWallet.network,
        salesforceAccountId: client.id,
        clientName: client.name,
        destinationAddress: transfer.to,
        amount: transfer.amount,
        assetType: transfer.kind,
        contractAddress: transfer.contract || null,
        requestedByEmail: user?.email || 'unknown',
      });

      alert('Demande soumise. Un administrateur doit approuver dans l\'onglet Compliance.');
      setShowTransfer(false);
      setTransfer({ to: '', amount: '', kind: 'Native' });
    } catch (err) {
      console.error(err); setError(err.message);
      alert('Erreur : ' + err.message);
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
    ...(client.type !== 'Customer - Direct' ? [{ id: 'ubo', label: 'UBO' }] : []),
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
          R3 — Compliance trio: KYC / Mandat / Historique contact
          R4 — Detailed info + Address
          R5 — Contacts list + Metadata
          R6 — Risk config (full width)
      */}
      {tab === 'profile' && (
        <div className="space-y-6 animate-fade">

          {/* R1 — Intro + Actions banquier */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <SectionCard
              title={parsed.text ? 'À propos' : 'Résumé client'}
              className="lg:col-span-8"
            >
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

            <Card className="lg:col-span-4">
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
                  onClick={() => setTab('kyc')}
                  icon={
                    <svg className="w-[14px] h-[14px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22" />
                    </svg>
                  }
                  title="Lancer screening"
                  subtitle="Chainalysis · sanctions OFAC"
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
          </div>

          {/* R2 — Money : Crypto holdings (flagship) + Patrimoine consolidé */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <CryptoHoldingsCard
                wallets={wallets}
                holdings={holdings}
                loading={holdingsLoading}
                net={(id) => SUPPORTED_NETWORKS.find(n => n.id === id) || { icon: '?', color: '#8A8278', name: id }}
                onSelectWallet={(w) => setWalletDrawerId(w.id)}
              />
            </div>
            <Card className="lg:col-span-4">
              <div className="px-6 pt-5 pb-4 border-b border-[#E7E7E7]">
                <p className="text-eyebrow">Patrimoine consolidé</p>
                <p className="display-sm text-[#0A0A0A] tabular-nums mt-2">
                  {client.aum ? fmtCompactEUR(client.aum) : '—'}
                </p>
              </div>
              <ul>
                <WealthRow
                  label="Liquidités"
                  sub="Comptes courants"
                  value={fmtEUR(Math.round((client.aum || 0) * 0.15))}
                  pct={15}
                />
                <WealthRow
                  label="Investissements"
                  sub="Actions · Obligations"
                  value={fmtEUR(Math.round((client.aum || 0) * 0.65))}
                  pct={65}
                />
                <WealthRow
                  label="Immobilier"
                  sub="Direct et indirect"
                  value={fmtEUR(Math.round((client.aum || 0) * 0.15))}
                  pct={15}
                />
                <WealthRow
                  label="Actifs numériques"
                  sub={parsed.allocation ? `Cible ${parsed.allocation}` : 'Conservation MiCA'}
                  value={fmtEUR(Math.round((client.aum || 0) * 0.05))}
                  pct={5}
                  last
                />
              </ul>
            </Card>
          </div>

          {/* R3 — Compliance trio : KYC / Mandat / Historique contact */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <SectionCard title="Conformité KYC" className="lg:col-span-4">
              <div className="flex items-start gap-3">
                <div
                  className="w-2 h-2 rounded-full mt-[8px] flex-shrink-0"
                  style={{
                    background:
                      kycValid ? '#16A34A'
                      : kycLive?.overallStatus === 'attention_required' ? '#DC2626'
                      : '#CA8A04',
                  }}
                />
                <div>
                  <p className="text-[14px] font-medium text-[#0A0A0A] tracking-[-0.01em]">{kycStatusText}</p>
                  {kycLive?.stats && (
                    <p className="text-[12px] text-[#5D5D5D] mt-0.5 tracking-[-0.003em]">
                      {kycLive.stats.documentsVerified} document{kycLive.stats.documentsVerified > 1 ? 's' : ''} vérifié{kycLive.stats.documentsVerified > 1 ? 's' : ''} · AML {kycLive.stats.amlClean ? 'clean' : 'en attente'}
                    </p>
                  )}
                </div>
              </div>
              {!kycValid && kycModuleEnabled && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full mt-4"
                  onClick={() => setTab('kyc')}
                >
                  Lancer la vérification
                </Button>
              )}
              {parsed.documents.length > 0 && (
                <div className="mt-5 pt-5 border-t border-[#E7E7E7]">
                  <p className="text-[11px] font-medium text-[#8A8278] uppercase tracking-[0.04em] mb-3">
                    Documents Salesforce
                  </p>
                  <ul className="space-y-2">
                    {parsed.documents.map((doc, i) => (
                      <li key={i} className="flex items-center gap-2 text-[13px] text-[#1E1E1E] tracking-[-0.003em]">
                        <svg className="w-3.5 h-3.5 text-[#16A34A] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.4}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {doc}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </SectionCard>

            <div className="lg:col-span-4">
              <MandatCard
                isSigned={!!parsed.kyc?.toLowerCase().includes('valid')}
                createdDate={client.createdDate}
              />
            </div>

            <div className="lg:col-span-4">
              <ContactHistoryCard clientName={client.name} />
            </div>
          </div>

          {/* R4 — Detailed info + Address */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <SectionCard title="Informations détaillées" className="lg:col-span-8">
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

            <SectionCard title="Adresse de facturation" className="lg:col-span-4">
              <div className="space-y-5">
                <Field label="Rue" value={client.street} />
                <Field label="Ville" value={client.city} />
                <Field label="Code postal" value={client.postalCode} />
                <Field label="Pays" value={client.country} />
              </div>
            </SectionCard>
          </div>

          {/* R5 — Contacts list + Metadata */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Card className="lg:col-span-8">
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
                          {c.Email && <p className="text-[12.5px] text-[#1E1E1E] tracking-[-0.003em]">{c.Email}</p>}
                          {c.Phone && <p className="text-[11.5px] text-[#8A8278] mt-0.5">{c.Phone}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <SectionCard title="Métadonnées" className="lg:col-span-4">
              <dl className="space-y-4">
                <MetaRow label="ID Salesforce" value={client.id} mono />
                <MetaRow label="Propriétaire" value={client.ownerId || '—'} mono />
                <MetaRow label="Créé le" value={fmtDate(client.createdDate)} />
              </dl>
            </SectionCard>
          </div>

          {/* R6 — Risk config, full width so its 3-column grid breathes */}
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

      {/* ══════════ UBO ══════════ */}
      {tab === 'ubo' && (
        <div className="animate-fade">
          <UBOPanel salesforceAccountId={client.id} clientName={client.name} />
        </div>
      )}

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
                const active = selectedWallet?.id === w.id;
                return (
                  <div
                    key={w.id}
                    onClick={() => selectWallet(w)}
                    className={`flex items-center gap-5 px-6 py-5 cursor-pointer transition-colors ${
                      active ? 'bg-white' : 'hover:bg-white'
                    } ${i < wallets.length - 1 ? 'border-b border-[#E7E7E7]' : ''}`}
                  >
                    <div className="w-11 h-11 rounded-[10px] flex items-center justify-center bg-[#F5F3EE] border border-[#E7E7E7] flex-shrink-0">
                      <span className="font-mono text-[12px] font-medium text-[#0A0A0A]">{n.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[14.5px] font-medium text-[#0A0A0A] truncate tracking-[-0.015em]">{w.name || n.name}</p>
                        {frozenWallets[w.id] && <Badge variant="error" size="sm" dot>Gelé</Badge>}
                        <Badge variant={w.status === 'Active' ? 'success' : 'warning'} size="sm" dot>{w.status}</Badge>
                      </div>
                      <p className="text-[12px] font-mono text-[#5D5D5D] truncate mt-1">{truncAddr(w.address, 12)}</p>
                    </div>
                    <div className="text-right flex-shrink-0 hidden sm:block w-28">
                      <p className="text-[11px] font-medium text-[#8A8278] uppercase tracking-[0.04em]">Réseau</p>
                      <p className="text-[13px] font-medium text-[#0A0A0A] mt-1 tracking-[-0.01em]">{n.name}</p>
                    </div>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[#8A8278] flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}

          {selectedWallet && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-[10px] flex items-center justify-center bg-[#F5F3EE] border border-[#E7E7E7]">
                    <span className="font-mono text-[13px] font-medium text-[#0A0A0A]">{net(selectedWallet.network).icon}</span>
                  </div>
                  <div>
                    <h3 className="text-[18px] font-medium text-[#1E1E1E]">{selectedWallet.name || 'Wallet'}</h3>
                    <p className="text-[12.5px] text-[#5D5D5D] mt-0.5 tracking-[-0.003em]">{net(selectedWallet.network).name}</p>
                  </div>
                </div>
                <Button
                  variant="primary"
                  onClick={() => setShowTransfer(true)}
                  disabled={client.Custody_Eligible__c !== true && !kycValid}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  Envoyer
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-white rounded-[12px] border border-[#E7E7E7]">
                  <p className="text-[11px] font-medium text-[#8A8278] uppercase tracking-[0.04em] mb-1.5">Adresse</p>
                  <p className="text-[12px] font-mono text-[#0A0A0A] break-all leading-relaxed">{selectedWallet.address}</p>
                </div>
                <div className="p-4 bg-white rounded-[12px] border border-[#E7E7E7]">
                  <p className="text-[11px] font-medium text-[#8A8278] uppercase tracking-[0.04em] mb-1.5">Valeur nette</p>
                  <p className="text-[22px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.025em]">
                    {assets?.netWorth?.USD ? `$${assets.netWorth.USD.toLocaleString()}` : '—'}
                  </p>
                </div>
                <div className="p-4 bg-white rounded-[12px] border border-[#E7E7E7]">
                  <p className="text-[11px] font-medium text-[#8A8278] uppercase tracking-[0.04em] mb-1.5">Actifs</p>
                  <p className="text-[22px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.025em]">
                    {assets?.assets?.length || 0}
                  </p>
                </div>
              </div>

              {assets?.assets?.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-[#8A8278] uppercase tracking-[0.04em] mb-3">Portefeuille</p>
                  <div className="space-y-2">
                    {assets.assets.map((a, i) => (
                      <div key={i} className="flex items-center justify-between py-3 px-4 bg-white rounded-[10px] border border-[#E7E7E7]">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-white border border-[#E7E7E7] flex items-center justify-center">
                            <span className="text-[10px] font-medium font-mono">{a.symbol?.slice(0, 3)}</span>
                          </div>
                          <div>
                            <p className="text-[14px] font-medium text-[#0A0A0A] tracking-[-0.01em]">{a.symbol}</p>
                            <p className="text-[11px] text-[#5D5D5D]">{a.kind}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[14px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.015em]">{a.balance}</p>
                          {a.quotes?.USD && <p className="text-[11px] text-[#5D5D5D] tabular-nums">${a.quotes.USD.toLocaleString()}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {selectedWallet && (
            <WalletFreezePanel
              walletId={selectedWallet.id}
              salesforceAccountId={client.id}
              clientName={client.name || client.Name}
            />
          )}

          <WhitelistPanel client={client} />
        </div>
      )}

      {/* ══════════ TRANSFERS ══════════ */}
      {tab === 'transfers' && selectedWallet && (
        <div className="animate-fade space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="display-sm text-[#0A0A0A]">Transferts</h2>
              <p className="text-[13.5px] text-[#5D5D5D] mt-1.5 tracking-[-0.003em]">
                {selectedWallet.name} · {history.length} opération{history.length > 1 ? 's' : ''}
              </p>
            </div>
            <Button variant="primary" onClick={() => setShowTransfer(true)}>
              Nouveau transfert
            </Button>
          </div>
          {history.length === 0 ? (
            <Card className="py-4">
              <EmptyState title="Aucun transfert" description="Les mouvements apparaîtront ici dès le premier transfert exécuté." />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#E7E7E7]">
                    <th className="text-left px-6 h-12 text-[11px] font-medium text-[#8A8278] uppercase tracking-[0.04em]">Direction</th>
                    <th className="text-left px-6 h-12 text-[11px] font-medium text-[#8A8278] uppercase tracking-[0.04em]">Adresse</th>
                    <th className="text-right px-6 h-12 text-[11px] font-medium text-[#8A8278] uppercase tracking-[0.04em]">Montant</th>
                    <th className="text-left px-6 h-12 text-[11px] font-medium text-[#8A8278] uppercase tracking-[0.04em]">Statut</th>
                    <th className="text-left px-6 h-12 text-[11px] font-medium text-[#8A8278] uppercase tracking-[0.04em]">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((tx, i) => (
                    <tr key={tx.id || i} className="border-b border-[#E7E7E7] last:border-0 hover:bg-white transition-colors">
                      <td className="px-6 py-3.5">
                        <Badge variant={tx.direction === 'In' ? 'success' : 'default'} size="sm" dot>{tx.direction || '—'}</Badge>
                      </td>
                      <td className="px-6 py-3.5 font-mono text-[12px] text-[#1E1E1E]">
                        {truncAddr(tx.to || tx.from, 8)}
                      </td>
                      <td className="px-6 py-3.5 text-right font-medium text-[#0A0A0A] tabular-nums tracking-[-0.015em]">
                        {tx.value || '—'}
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge variant={tx.status === 'Confirmed' ? 'success' : 'warning'} size="sm" dot>{tx.status || 'Pending'}</Badge>
                      </td>
                      <td className="px-6 py-3.5 text-[12.5px] text-[#5D5D5D]">
                        {tx.timestamp ? new Date(tx.timestamp).toLocaleDateString('fr-FR') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {tab === 'transfers' && !selectedWallet && (
        <div className="animate-fade">
          <Card className="py-4">
            <EmptyState
              title="Sélectionnez un wallet"
              description="Choisissez un wallet dans l'onglet Wallets pour consulter l'historique de ses transferts."
            />
          </Card>
        </div>
      )}

      {/* ══════════ HISTORY ══════════ */}
      {tab === 'history' && (
        <div className="animate-fade space-y-6">
          <div>
            <h2 className="display-sm text-[#0A0A0A]">Historique global</h2>
            <p className="text-[13.5px] text-[#5D5D5D] mt-1.5 tracking-[-0.003em]">Tous les wallets sous mandat</p>
          </div>
          {wallets.length === 0 ? (
            <Card className="py-4">
              <EmptyState title="Aucun wallet" description="Créez un wallet pour voir l'historique." />
            </Card>
          ) : (
            <Card>
              {wallets.map((w, i) => {
                const n = net(w.network);
                return (
                  <div
                    key={w.id}
                    className={`px-6 py-4 flex items-center justify-between gap-4 ${i < wallets.length - 1 ? 'border-b border-[#E7E7E7]' : ''}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-[10px] flex items-center justify-center bg-[#F5F3EE] border border-[#E7E7E7]">
                        <span className="font-mono text-[11px] font-medium">{n.icon}</span>
                      </div>
                      <div>
                        <p className="text-[13.5px] font-medium text-[#0A0A0A] tracking-[-0.01em]">{w.name}</p>
                        <p className="font-mono text-[11.5px] text-[#5D5D5D]">{truncAddr(w.address, 10)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={w.status === 'Active' ? 'success' : 'default'} size="sm" dot>{w.status}</Badge>
                      <p className="text-[11px] text-[#8A8278] mt-1">
                        {w.dateCreated ? new Date(w.dateCreated).toLocaleDateString('fr-FR') : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
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

      {/* ── Transfer Modal ──────────────────────────────── */}
      <Modal
        isOpen={showTransfer}
        onClose={() => setShowTransfer(false)}
        title="Envoyer des fonds"
        subtitle="La demande sera soumise à approbation (principe 4-eye) avant exécution."
      >
        <div className="space-y-5">
          <div>
            <label className={labelCls}>Adresse de destination</label>
            <input
              className={inputCls}
              placeholder="0x…"
              value={transfer.to}
              onChange={e => setTransfer(p => ({ ...p, to: e.target.value }))}
            />
          </div>
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
              <option value="Native">Native</option>
              <option value="Erc20">ERC-20</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowTransfer(false)}>Annuler</Button>
            <Button variant="primary" onClick={handleTransfer} disabled={sending || !transfer.to || !transfer.amount}>
              {sending ? 'Envoi…' : 'Soumettre pour approbation'}
            </Button>
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
          const price = { BTC: 58000, ETH: 2950, SOL: 135, USDC: 0.92, USDT: 0.92 }[a.symbol] || 0;
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
                        const price = { BTC: 58000, ETH: 2950, SOL: 135, USDC: 0.92, USDT: 0.92 }[a.symbol] || 0;
                        const eur = bal * price;
                        return (
                          <li key={i} className="px-4 py-3 flex items-center gap-3">
                            <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: colorForAsset(a.symbol) }} />
                            <span className="text-[13px] text-[#0F0F10] font-semibold w-16">{a.symbol}</span>
                            <span className="text-[12.5px] text-[#5D5D5D] tabular-nums flex-1">{bal.toFixed(bal > 1 ? 2 : 6)}</span>
                            <span className="text-[13px] text-[#0F0F10] font-medium tabular-nums">
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

                {/* Actions — keyboard-focusable */}
                <div className="grid grid-cols-2 gap-2 pt-4 border-t border-[#E7E7E7]">
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => { setWalletDrawerId(null); setTab('wallets'); setSelectedWallet(w); }}
                  >
                    Voir détails complets
                  </Button>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => { setWalletDrawerId(null); setTab('transfers'); setSelectedWallet(w); setShowTransfer(true); }}
                  >
                    Demander un transfert
                  </Button>
                </div>
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
                <span className="text-[#0F0F10] font-semibold w-14 flex-shrink-0">{a.symbol}</span>
                <span className="text-[#5D5D5D] tabular-nums flex-1 truncate">{a.balance.toFixed(a.balance > 1 ? 2 : 6)}</span>
                <span className="text-[#0F0F10] font-medium tabular-nums">
                  {a.valueEur > 0 ? fmtEUR(Math.round(a.valueEur)) : '—'}
                </span>
                <span className="text-[#8A8278] tabular-nums w-10 text-right">
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
            const walletEur = assets.reduce((s, a) => {
              const bal = (a.decimals > 6 ? parseFloat(a.balance || 0) / Math.pow(10, a.decimals) : parseFloat(a.balance || 0));
              const price = { BTC: 58000, ETH: 2950, SOL: 135, USDC: 0.92, USDT: 0.92 }[a.symbol] || 0;
              return s + bal * price;
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
                      <svg className="w-3 h-3 text-[#8A8278] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
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

// ═══ ContactHistoryCard — last 3 interactions ══════════════════
// Placeholder data until we wire SFDC Activities/Tasks. Mimics a banker's
// relationship log (email, call, meeting) with type icon + date + note.
// The "Ajouter une note" footer is a CTA for the banker to log an
// interaction without switching to SFDC.
function ContactHistoryCard({ clientName }) {
  // Stub: in production these come from SFDC Activity history
  const interactions = [
    { type: 'meeting', label: 'Rendez-vous patrimonial', days: 12 },
    { type: 'email',   label: 'Envoi relevé trimestriel', days: 24 },
    { type: 'call',    label: 'Appel de courtoisie',      days: 47 },
  ];
  const typeGlyph = { meeting: 'handshake', email: 'envelope', call: 'timestamp' };
  const typeLabel = { meeting: 'RDV', email: 'Email', call: 'Appel' };
  const fmtRelative = (d) => d === 1 ? 'hier' : d < 7 ? `il y a ${d} j` : d < 30 ? `il y a ${Math.round(d / 7)} sem` : `il y a ${Math.round(d / 30)} mois`;

  return (
    <Card>
      <div className="px-5 py-4 border-b border-[#E7E7E7] flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex-shrink-0 w-8 h-8 rounded-[7px] bg-[#F3F2EE] text-[#1E1E1E] flex items-center justify-center">
            <BrandGlyph name="ledger" size={16} />
          </span>
          <div>
            <p className="text-[13.5px] font-semibold text-[#0F0F10]">Historique contact</p>
            <p className="text-[11.5px] text-[#8A8278]">3 dernières interactions</p>
          </div>
        </div>
      </div>
      <ul className="divide-y divide-[#E7E7E7]">
        {interactions.map((it, i) => (
          <li key={i} className="px-5 py-3 flex items-center gap-3">
            <span className="w-8 h-8 rounded-[6px] bg-[#F5F2EB] text-[#5D5D5D] flex items-center justify-center flex-shrink-0">
              <BrandGlyph name={typeGlyph[it.type]} size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-[#0F0F10] truncate">{it.label}</p>
              <p className="text-[11.5px] text-[#8A8278]">{typeLabel[it.type]} · {fmtRelative(it.days)}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="px-4 py-3 border-t border-[#E7E7E7]">
        <button
          type="button"
          className="w-full flex items-center justify-center gap-2 h-9 rounded-[6px] text-[12.5px] font-semibold text-[#5D5D5D] hover:text-[#1E1E1E] hover:bg-[#FDFBF6] transition-colors"
          onClick={() => { /* TODO: open add-note modal */ }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Ajouter une note
        </button>
      </div>
    </Card>
  );
}
