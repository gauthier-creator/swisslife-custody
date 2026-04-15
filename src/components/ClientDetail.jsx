import { useState, useEffect } from 'react';
import { listWallets, createWallet, getWalletAssets, transferAsset, getWalletHistory } from '../services/dfnsApi';
import { fetchContacts, fetchClientById, parseDescription } from '../services/salesforceApi';
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
  fmtEUR, Badge, Card, Modal, Spinner, EmptyState, Button,
  Avatar, IconPill, KPITile, ListRow, Delta, Sparkline,
  inputCls, selectCls, labelCls,
} from './shared';
import { API_BASE } from '../config/constants';

/* ─────────────────────────────────────────────────────────
   ClientDetail — Revolut-flavored fintech detail view
   Elevated cards · big numbers · colorful icon pills
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

export default function ClientDetail({ client: initialClient, onBack }) {
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
  }, []);

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
    } catch (err) {
      console.error(err); setError(err.message); setWallets([]);
    }
    setLoading(false);
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

  const net = (id) => SUPPORTED_NETWORKS.find(n => n.id === id) || { icon: '?', color: '#75808A', name: id };

  const kycStatusText = kycValid ? 'Valide'
    : kycLive?.overallStatus === 'in_progress' ? 'En cours'
    : kycLive?.overallStatus === 'ready_for_validation' ? 'À valider'
    : kycLive?.overallStatus === 'attention_required' ? 'Attention'
    : parsed.kyc?.toLowerCase().includes('cours') ? 'En cours'
    : 'Non vérifié';

  const kycTone = kycValid ? 'green'
    : kycLive?.overallStatus === 'attention_required' ? 'red'
    : 'amber';

  const tabs = [
    { id: 'profile', label: 'Fiche client' },
    { id: 'eligibility', label: 'Éligibilité' },
    ...(kycModuleEnabled ? [{ id: 'kyc', label: 'KYC / KYB' }] : []),
    { id: 'wallets', label: `Wallets (${wallets.length})` },
    { id: 'delegations', label: 'Délégations' },
    ...(client.type !== 'Customer - Direct' ? [{ id: 'ubo', label: 'UBO' }] : []),
    { id: 'transfers', label: 'Transferts' },
    { id: 'history', label: 'Historique' },
  ];

  return (
    <div>
      {/* ── Back ─────────────────────────────────────────── */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[13px] font-medium text-[#75808A] hover:text-[#191C1F] transition-colors mb-5 group"
      >
        <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Retour aux clients
      </button>

      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 mb-6 flex-wrap">
        <div className="flex items-center gap-5 min-w-0 flex-1">
          <Avatar name={client.name} size={64} />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[#75808A]">Fiche client</p>
            <div className="flex items-center gap-3 flex-wrap mt-1">
              <h1 className="text-[28px] font-semibold text-[#191C1F] tracking-[-0.5px] leading-[1.1]">
                {client.name}
              </h1>
              <Badge variant={typeVariant(client.type)} dot>{typeLabel(client.type)}</Badge>
            </div>
            <p className="text-[14px] text-[#75808A] mt-1.5">
              {[client.street, client.postalCode, client.city, client.country].filter(Boolean).join(', ') || '—'}
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[12px] font-medium text-[#75808A] uppercase tracking-wider">
            Actifs sous gestion
          </p>
          <p className="text-[32px] font-semibold text-[#191C1F] tabular-nums tracking-[-0.6px] leading-[1.1] mt-1">
            {client.aum ? fmtEUR(client.aum) : '—'}
          </p>
          <div className="flex items-center justify-end gap-2 mt-1">
            <Delta value="2.4%" positive prefix="+" />
            <span className="text-[12px] text-[#A5ADB6]">12 mois</span>
          </div>
          {client.accountNumber && (
            <p className="text-[11px] text-[#A5ADB6] font-mono mt-1">№ {client.accountNumber}</p>
          )}
        </div>
      </div>

      {/* ── KPI strip ───────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPITile
          label="Conformité KYC"
          value={kycStatusText}
          delta={<Badge variant={kycValid ? 'success' : kycLive?.overallStatus === 'attention_required' ? 'error' : 'warning'} size="sm" dot>MiCA Art. 66</Badge>}
          visual={
            <IconPill tone={kycTone} size={48}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                {kycValid
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
              </svg>
            </IconPill>
          }
        />
        <KPITile
          label="Profil de risque"
          value={parsed.risk || 'Non défini'}
          delta={parsed.allocation ? <span className="text-[12px] font-medium text-[#75808A]">Allocation : {parsed.allocation}</span> : null}
          visual={
            <IconPill tone="indigo" size={48}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </IconPill>
          }
        />
        <KPITile
          label="Wallets DFNS"
          value={wallets.length}
          delta={<span className="text-[12px] font-medium text-[#75808A]">{wallets.filter(w => w.status === 'Active').length} actif{wallets.filter(w => w.status === 'Active').length > 1 ? 's' : ''}</span>}
          visual={<Sparkline tone="blue" points={[0.2, 0.35, 0.3, 0.5, 0.45, 0.65, 0.6, 0.85]} width={130} height={40} />}
        />
        <KPITile
          label="Client depuis"
          value={fmtDate(client.createdDate)}
          delta={<span className="text-[12px] font-medium text-[#75808A]">{client.industry || 'Secteur N/A'}</span>}
          visual={
            <IconPill tone="pink" size={48}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </IconPill>
          }
        />
      </div>

      {/* ── Tabs ────────────────────────────────────────── */}
      <div className="mb-6">
        <nav className="inline-flex items-center gap-1 bg-white rounded-full p-1 border border-[rgba(25,28,31,0.06)] shadow-[0_0_20px_-10px_rgba(0,0,0,0.1)] overflow-x-auto max-w-full">
          {tabs.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`h-9 px-4 text-[13px] font-semibold rounded-full whitespace-nowrap transition-all tracking-[-0.1px] ${
                  active
                    ? 'bg-[#191C1F] text-white shadow-[0_2px_8px_-2px_rgba(25,28,31,0.3)]'
                    : 'text-[#75808A] hover:text-[#191C1F] hover:bg-[#F7F8FA]'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ══════════ PROFILE ══════════ */}
      {tab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 animate-fade">
          <div className="lg:col-span-2 space-y-5">
            {parsed.text && (
              <SectionCard title="À propos">
                <p className="text-[14px] text-[#52585F] leading-relaxed">{parsed.text}</p>
              </SectionCard>
            )}

            <SectionCard title="Informations détaillées">
              <div className="grid grid-cols-2 gap-x-8 gap-y-5">
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

            <SectionCard title="Adresse de facturation">
              <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                <Field label="Rue" value={client.street} />
                <Field label="Ville" value={client.city} />
                <Field label="Code postal" value={client.postalCode} />
                <Field label="Pays" value={client.country} />
              </div>
            </SectionCard>

            <Card>
              <div className="px-5 py-4 flex items-center justify-between border-b border-[rgba(25,28,31,0.06)]">
                <h3 className="text-[15px] font-semibold text-[#191C1F] tracking-[-0.15px]">
                  Contacts
                </h3>
                <span className="text-[13px] font-medium text-[#75808A]">{contacts.length} personne{contacts.length > 1 ? 's' : ''}</span>
              </div>
              {loadingContacts ? (
                <div className="py-8 text-center"><Spinner /></div>
              ) : contacts.length === 0 ? (
                <p className="px-5 py-6 text-[13px] text-[#75808A]">Aucun contact associé.</p>
              ) : (
                <div>
                  {contacts.map((c, i) => {
                    const name = [c.FirstName, c.LastName].filter(Boolean).join(' ');
                    return (
                      <ListRow
                        key={c.Id}
                        icon={<Avatar name={name} size={40} />}
                        title={name || '—'}
                        subtitle={c.Title || c.Email || ''}
                        trailing={c.Email || ''}
                        trailingSub={c.Phone || ''}
                        divider={i < contacts.length - 1}
                      />
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <aside className="space-y-5">
            {/* Wealth breakdown (Revolut-style) */}
            <Card>
              <div className="px-5 pt-5 pb-3">
                <p className="text-[13px] font-medium text-[#75808A]">Répartition du patrimoine</p>
                <p className="text-[26px] font-semibold text-[#191C1F] tabular-nums tracking-[-0.4px] mt-1">
                  {client.aum ? fmtEUR(client.aum) : '—'}
                </p>
              </div>
              <div className="pt-1">
                <ListRow
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  }
                  tone="blue"
                  title="Liquidités"
                  subtitle="Compte courant"
                  trailing={fmtEUR(Math.round((client.aum || 0) * 0.15))}
                  trailingSub="15%"
                />
                <ListRow
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  }
                  tone="green"
                  title="Investissements"
                  subtitle="Actions · Obligations"
                  trailing={fmtEUR(Math.round((client.aum || 0) * 0.65))}
                  trailingSub="65%"
                />
                <ListRow
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                  tone="indigo"
                  title="Immobilier"
                  subtitle="Résidentiel · Commercial"
                  trailing={fmtEUR(Math.round((client.aum || 0) * 0.15))}
                  trailingSub="15%"
                />
                <ListRow
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  }
                  tone="orange"
                  title="Actifs numériques"
                  subtitle={parsed.allocation ? `Cible ${parsed.allocation}` : 'Crypto custody'}
                  trailing={fmtEUR(Math.round((client.aum || 0) * 0.05))}
                  trailingSub="5%"
                  divider={false}
                />
              </div>
            </Card>

            <SectionCard title="Conformité KYC">
              <div className="flex items-center gap-3">
                <IconPill tone={kycTone} size={40}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    {kycValid
                      ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      : <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
                  </svg>
                </IconPill>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-[#191C1F] tracking-[-0.1px]">{kycStatusText}</p>
                  {kycLive?.stats && (
                    <p className="text-[12px] text-[#75808A] mt-0.5">
                      {kycLive.stats.documentsVerified} doc{kycLive.stats.documentsVerified > 1 ? 's' : ''} · AML {kycLive.stats.amlClean ? 'clean' : 'en attente'}
                    </p>
                  )}
                </div>
              </div>
              {!kycValid && kycModuleEnabled && (
                <Button
                  variant="accent"
                  size="sm"
                  className="w-full mt-4"
                  onClick={() => setTab('kyc')}
                >
                  Lancer la vérification
                </Button>
              )}
              {parsed.documents.length > 0 && (
                <div className="mt-5 pt-4 border-t border-[rgba(25,28,31,0.06)]">
                  <p className="text-[11px] font-semibold text-[#75808A] uppercase tracking-wider mb-2.5">
                    Documents Salesforce
                  </p>
                  <ul className="space-y-2">
                    {parsed.documents.map((doc, i) => (
                      <li key={i} className="flex items-center gap-2.5 text-[13px] text-[#52585F]">
                        <svg className="w-3.5 h-3.5 text-[#00BE90] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {doc}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Actions rapides">
              <div className="space-y-2">
                <Button
                  variant="accent"
                  size="md"
                  className="w-full justify-start"
                  onClick={() => { setTab('wallets'); setShowCreate(true); }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Créer un wallet
                </Button>
                {client.website && (
                  <a
                    href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full h-10 inline-flex items-center justify-start gap-2 px-4 text-[14px] font-semibold rounded-xl bg-white text-[#191C1F] border border-[rgba(25,28,31,0.1)] hover:bg-[#F7F8FA] transition-colors tracking-[-0.1px]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Ouvrir le site
                  </a>
                )}
              </div>
            </SectionCard>

            <RiskConfigPanel client={client} />

            <SectionCard title="Metadata Salesforce">
              <dl className="space-y-3.5">
                <div>
                  <dt className="text-[11px] font-semibold text-[#75808A] uppercase tracking-wider mb-1">ID Salesforce</dt>
                  <dd className="text-[11px] font-mono text-[#52585F] break-all">{client.id}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold text-[#75808A] uppercase tracking-wider mb-1">Propriétaire</dt>
                  <dd className="text-[11px] font-mono text-[#52585F] break-all">{client.ownerId || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold text-[#75808A] uppercase tracking-wider mb-1">Créé le</dt>
                  <dd className="text-[13px] text-[#191C1F] font-medium">{fmtDate(client.createdDate)}</dd>
                </div>
              </dl>
            </SectionCard>
          </aside>
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
        <div className="animate-fade space-y-5">
          {client.Custody_Eligible__c !== true && !kycValid && (
            <div className="px-5 py-4 bg-[#FFF6E0] border border-[rgba(255,184,0,0.25)] rounded-2xl flex items-start gap-3">
              <IconPill tone="amber" size={36}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </IconPill>
              <div className="flex-1 pt-0.5">
                <p className="text-[14px] font-semibold text-[#191C1F]">Client non éligible à la custody</p>
                <p className="text-[13px] text-[#75808A] mt-0.5">
                  La création de wallets requiert l'éligibilité.{' '}
                  <button
                    onClick={() => setTab('eligibility')}
                    className="underline font-semibold text-[#B07800] hover:text-[#191C1F]"
                  >
                    Voir l'onglet Éligibilité
                  </button>
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="px-5 py-4 bg-[#FDECEE] border border-[rgba(236,76,90,0.2)] rounded-2xl">
              <p className="text-[13px] font-medium text-[#C93545]">Erreur DFNS : {error}</p>
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-[20px] font-semibold text-[#191C1F] tracking-[-0.3px]">Wallets DFNS</h2>
              <p className="text-[13px] text-[#75808A] mt-0.5">{wallets.length} wallet{wallets.length > 1 ? 's' : ''} · MPC custody</p>
            </div>
            <Button
              variant="accent"
              onClick={() => setShowCreate(true)}
              disabled={client.Custody_Eligible__c !== true && !kycValid}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
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
                description="Créez un premier wallet pour ce client via DFNS."
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
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
                    className={`flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors ${
                      active ? 'bg-[#E6F0FD]' : 'hover:bg-[#F7F8FA]'
                    } ${i < wallets.length - 1 ? 'border-b border-[rgba(25,28,31,0.06)]' : ''}`}
                  >
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-[13px] flex-shrink-0 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.2)]"
                      style={{ backgroundColor: n.color }}
                    >
                      {n.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[15px] font-semibold text-[#191C1F] truncate tracking-[-0.15px]">{w.name || n.name}</p>
                        {frozenWallets[w.id] && <Badge variant="error" size="sm" dot>Gelé</Badge>}
                        <Badge variant={w.status === 'Active' ? 'success' : 'warning'} size="sm" dot>{w.status}</Badge>
                      </div>
                      <p className="text-[12px] font-mono text-[#75808A] truncate mt-0.5">{truncAddr(w.address, 10)}</p>
                    </div>
                    <div className="text-right flex-shrink-0 hidden sm:block">
                      <p className="text-[11px] font-semibold text-[#75808A] uppercase tracking-wider">Réseau</p>
                      <p className="text-[13px] font-semibold text-[#191C1F] mt-0.5">{n.name}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-[#F7F8FA] flex items-center justify-center text-[#75808A] flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
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
              <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-[13px] flex-shrink-0"
                    style={{ backgroundColor: net(selectedWallet.network).color }}
                  >
                    {net(selectedWallet.network).icon}
                  </div>
                  <div>
                    <h3 className="text-[18px] font-semibold text-[#191C1F] tracking-[-0.2px]">{selectedWallet.name || 'Wallet'}</h3>
                    <p className="text-[12px] text-[#75808A] mt-0.5">{net(selectedWallet.network).name}</p>
                  </div>
                </div>
                <Button
                  variant="accent"
                  onClick={() => setShowTransfer(true)}
                  disabled={client.Custody_Eligible__c !== true && !kycValid}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  Envoyer
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                <div className="bg-[#F7F8FA] rounded-xl p-4">
                  <p className="text-[11px] font-semibold text-[#75808A] uppercase tracking-wider mb-1.5">Adresse</p>
                  <p className="text-[12px] font-mono text-[#191C1F] break-all">{selectedWallet.address}</p>
                </div>
                <div className="bg-[#F7F8FA] rounded-xl p-4">
                  <p className="text-[11px] font-semibold text-[#75808A] uppercase tracking-wider mb-1.5">Valeur nette</p>
                  <p className="text-[20px] font-semibold text-[#191C1F] tabular-nums tracking-[-0.2px]">
                    {assets?.netWorth?.USD ? `$${assets.netWorth.USD.toLocaleString()}` : '—'}
                  </p>
                </div>
                <div className="bg-[#F7F8FA] rounded-xl p-4">
                  <p className="text-[11px] font-semibold text-[#75808A] uppercase tracking-wider mb-1.5">Actifs</p>
                  <p className="text-[20px] font-semibold text-[#191C1F] tabular-nums tracking-[-0.2px]">
                    {assets?.assets?.length || 0}
                  </p>
                </div>
              </div>

              {assets?.assets?.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-[#75808A] uppercase tracking-wider mb-2">Portefeuille</p>
                  <div className="space-y-1.5">
                    {assets.assets.map((a, i) => (
                      <div key={i} className="flex items-center justify-between py-3 px-4 bg-[#F7F8FA] rounded-xl">
                        <div className="flex items-center gap-3">
                          <IconPill tone="blue" size={36}>
                            <span className="text-[11px] font-bold">{a.symbol?.slice(0, 3)}</span>
                          </IconPill>
                          <div>
                            <p className="text-[14px] font-semibold text-[#191C1F]">{a.symbol}</p>
                            <p className="text-[11px] text-[#75808A]">{a.kind}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[14px] font-semibold text-[#191C1F] tabular-nums">{a.balance}</p>
                          {a.quotes?.USD && <p className="text-[11px] text-[#75808A] tabular-nums">${a.quotes.USD.toLocaleString()}</p>}
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
        <div className="animate-fade">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-[20px] font-semibold text-[#191C1F] tracking-[-0.3px]">Transferts — {selectedWallet.name}</h2>
              <p className="text-[13px] text-[#75808A] mt-0.5">{history.length} opération{history.length > 1 ? 's' : ''}</p>
            </div>
            <Button variant="accent" onClick={() => setShowTransfer(true)}>
              Nouveau transfert
            </Button>
          </div>
          {history.length === 0 ? (
            <Card className="py-4">
              <EmptyState title="Aucun transfert" description="Les transferts apparaîtront ici." />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[rgba(25,28,31,0.06)] bg-[#F7F8FA]">
                    <th className="text-left px-5 h-11 text-[11px] font-semibold text-[#75808A] uppercase tracking-wider">Direction</th>
                    <th className="text-left px-5 h-11 text-[11px] font-semibold text-[#75808A] uppercase tracking-wider">Adresse</th>
                    <th className="text-right px-5 h-11 text-[11px] font-semibold text-[#75808A] uppercase tracking-wider">Montant</th>
                    <th className="text-left px-5 h-11 text-[11px] font-semibold text-[#75808A] uppercase tracking-wider">Statut</th>
                    <th className="text-left px-5 h-11 text-[11px] font-semibold text-[#75808A] uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((tx, i) => (
                    <tr key={tx.id || i} className="border-b border-[rgba(25,28,31,0.06)] last:border-0 hover:bg-[#F7F8FA]">
                      <td className="px-5 py-3">
                        <Badge variant={tx.direction === 'In' ? 'success' : 'info'} dot>{tx.direction || '—'}</Badge>
                      </td>
                      <td className="px-5 py-3 font-mono text-[12px] text-[#52585F]">
                        {truncAddr(tx.to || tx.from, 8)}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-[#191C1F] tabular-nums">
                        {tx.value || '—'}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={tx.status === 'Confirmed' ? 'success' : 'warning'} dot>{tx.status || 'Pending'}</Badge>
                      </td>
                      <td className="px-5 py-3 text-[13px] text-[#75808A]">
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
              description="Choisissez un wallet dans l'onglet Wallets pour voir ses transferts."
            />
          </Card>
        </div>
      )}

      {/* ══════════ HISTORY ══════════ */}
      {tab === 'history' && (
        <div className="animate-fade">
          <div className="mb-5">
            <h2 className="text-[20px] font-semibold text-[#191C1F] tracking-[-0.3px]">Historique global</h2>
            <p className="text-[13px] text-[#75808A] mt-0.5">Tous les wallets du client</p>
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
                    className={`px-5 py-4 flex items-center justify-between gap-4 ${i < wallets.length - 1 ? 'border-b border-[rgba(25,28,31,0.06)]' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[12px] font-bold"
                        style={{ backgroundColor: n.color }}
                      >
                        {n.icon}
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold text-[#191C1F] tracking-[-0.1px]">{w.name}</p>
                        <p className="font-mono text-[12px] text-[#75808A]">{truncAddr(w.address, 8)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={w.status === 'Active' ? 'success' : 'default'} size="sm" dot>{w.status}</Badge>
                      <p className="text-[11px] text-[#75808A] mt-1">
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
        subtitle={`Le wallet sera lié au client ${client.name}. La clé privée est générée via MPC par DFNS.`}
      >
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Nom du wallet</label>
            <input
              className={inputCls}
              placeholder="Ex: Wallet ETH principal"
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
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Annuler</Button>
            <Button variant="accent" onClick={handleCreate} disabled={creating || !newWallet.name}>
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
        subtitle="La demande sera soumise à approbation (principe 4-eye)."
      >
        <div className="space-y-4">
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
            <label className={labelCls}>Type</label>
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
            <Button variant="secondary" onClick={() => setShowTransfer(false)}>Annuler</Button>
            <Button variant="accent" onClick={handleTransfer} disabled={sending || !transfer.to || !transfer.amount}>
              {sending ? 'Envoi…' : 'Soumettre'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ─── Sub-components ─── */
function SectionCard({ title, children }) {
  return (
    <Card className="p-6">
      <h3 className="text-[15px] font-semibold text-[#191C1F] tracking-[-0.15px] mb-5">{title}</h3>
      {children}
    </Card>
  );
}

function Field({ label, value, mono, link }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[#75808A] uppercase tracking-wider mb-1.5">{label}</p>
      {link && value ? (
        <a
          href={value.startsWith('http') ? value : `https://${value}`}
          target="_blank" rel="noopener noreferrer"
          className="text-[14px] font-semibold text-[#0666EB] hover:underline"
        >
          {value}
        </a>
      ) : (
        <p className={`text-[14px] ${mono ? 'font-mono text-[#52585F]' : 'text-[#191C1F] font-semibold tracking-[-0.1px]'}`}>
          {value || '—'}
        </p>
      )}
    </div>
  );
}
