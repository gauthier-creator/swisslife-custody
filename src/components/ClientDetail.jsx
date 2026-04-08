import { useState, useEffect } from 'react';
import { listWallets, createWallet, getWalletAssets, transferAsset, getWalletHistory } from '../services/dfnsApi';
import { fetchContacts, fetchClientById, parseDescription } from '../services/salesforceApi';
// DocumentsPanel removed — documents are managed directly in Salesforce
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
import { fmtEUR, Badge, Modal, Spinner, EmptyState, inputCls, selectCls, labelCls } from './shared';
import { API_BASE } from '../config/constants';

const truncAddr = (a, n = 8) => a ? `${a.slice(0, n)}...${a.slice(-n)}` : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

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
  const [kycLive, setKycLive] = useState(null); // live KYC status from Supabase
  const [kycModuleEnabled, setKycModuleEnabled] = useState(false);
  const [frozenWallets, setFrozenWallets] = useState({}); // { walletId: true/false }
  const { user, isAdmin } = useAuth();

  const reloadClient = async () => {
    try {
      const updated = await fetchClientById(client.id);
      setClient(updated);
    } catch (err) {
      console.error('reloadClient error:', err);
    }
  };

  const parsed = parseDescription(client.description);
  // KYC is valid if:
  // 1. KYC module is disabled (bank handles KYC externally) → always valid
  // 2. OR Salesforce description says so
  // 3. OR live KYC checks are validated in Supabase
  const kycValid = !kycModuleEnabled || kycLive?.overallStatus === 'validated' || parsed.kyc?.toLowerCase().includes('valid');

  useEffect(() => {
    loadWallets(); loadContacts(); loadKycStatus();
    fetch(`${API_BASE}/api/admin/settings`).then(r => r.json()).then(s => setKycModuleEnabled(!!s.kyc_module_enabled)).catch(() => {});
  }, []);

  const loadKycStatus = async () => {
    try {
      const data = await getKycStatus(client.id);
      setKycLive(data);
    } catch { /* ignore */ }
  };

  const loadWallets = async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await listWallets(client.id);
      setWallets(all);
      // Check freeze status for each wallet
      const freezeMap = {};
      await Promise.all(all.map(async (w) => {
        try {
          const result = await checkWalletFreeze(w.id);
          freezeMap[w.id] = result.frozen;
        } catch { freezeMap[w.id] = false; }
      }));
      setFrozenWallets(freezeMap);
    } catch (err) {
      console.error('loadWallets error:', err);
      setError(err.message);
      setWallets([]);
    }
    setLoading(false);
  };

  const loadContacts = async () => {
    setLoadingContacts(true);
    try {
      const data = await fetchContacts(client.id);
      setContacts(data);
    } catch { setContacts([]); }
    setLoadingContacts(false);
  };

  const handleCreate = async () => {
    // Compliance check: client must be eligible for custody before creating wallets
    if (client.Custody_Eligible__c !== true && !kycValid) {
      alert('Compliance: Le client doit etre eligible a la custody avant de creer un wallet. Veuillez completer les etapes dans l\'onglet Eligibilite.');
      return;
    }
    setCreating(true);
    setError(null);
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
      console.error('createWallet error:', err);
      setError(err.message);
      alert('Erreur creation wallet: ' + err.message);
    }
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
    } catch (err) {
      console.error('selectWallet error:', err);
    }
  };

  const handleTransfer = async () => {
    if (!selectedWallet) return;
    setSending(true);
    setError(null);
    try {
      // 1. Pre-flight risk check
      const riskCheck = await checkTransferRisk({
        salesforceAccountId: client.id,
        amount: transfer.amount,
        network: selectedWallet.network,
        destinationAddress: transfer.to,
      }).catch(() => ({ allowed: true, warnings: [], blocks: [] }));

      if (riskCheck.blocks && riskCheck.blocks.length > 0) {
        alert('TRANSFERT BLOQUE PAR LA COMPLIANCE\n\n' + riskCheck.blocks.join('\n'));
        setSending(false);
        return;
      }

      let warningMsg = '';
      if (riskCheck.warnings && riskCheck.warnings.length > 0) {
        warningMsg = '\n\nAvertissements compliance:\n- ' + riskCheck.warnings.join('\n- ');
      }

      // 2. Double confirmation
      const netInfo = SUPPORTED_NETWORKS.find(n => n.id === selectedWallet.network);
      const confirmMsg = `DEMANDE DE TRANSFERT\n\nDepuis: ${selectedWallet.name}\nVers: ${transfer.to}\nMontant: ${transfer.amount} ${netInfo?.symbol || ''}\nType: ${transfer.kind}${warningMsg}\n\nLe transfert sera soumis a approbation (principe des 4 yeux).\nConfirmez-vous cette demande ?`;
      if (!confirm(confirmMsg)) {
        setSending(false);
        return;
      }

      // 3. Create approval request (4-eye principle) — DFNS handles Travel Rule (Notabene) and monitoring (Chainalysis KYT)
      const approval = await createApproval({
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

      alert('Demande de transfert soumise avec succes.\n\nUn administrateur doit approuver la demande dans l\'onglet Compliance avant execution.');
      setShowTransfer(false);
      setTransfer({ to: '', amount: '', kind: 'Native' });
    } catch (err) {
      console.error('transfer error:', err);
      setError(err.message);
      alert('Erreur: ' + err.message);
    }
    setSending(false);
  };

  const net = (id) => SUPPORTED_NETWORKS.find(n => n.id === id) || { icon: '?', color: '#999', name: id };

  // KYC status badge
  const kycVariant = parsed.kyc
    ? parsed.kyc.toLowerCase().includes('valid') ? 'success'
    : parsed.kyc.toLowerCase().includes('cours') ? 'warning'
    : 'error'
    : 'default';

  // Risk profile color
  const riskColor = parsed.risk
    ? parsed.risk.toLowerCase().includes('agressif') ? 'text-[#DC2626]'
    : parsed.risk.toLowerCase().includes('conservateur') ? 'text-[#059669]'
    : 'text-[#D97706]'
    : 'text-[#787881]';

  return (
    <div className="page-slide-in">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-2 text-[13px] text-[#787881] hover:text-[#0F0F10] transition-colors font-medium group mb-6">
        <svg className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Retour aux clients
      </button>

      {/* Client Header Card */}
      <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-[#0F0F10] to-[#374151] rounded-2xl flex items-center justify-center text-white text-[20px] font-bold shadow-sm">
              {client.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-[22px] font-bold text-[#0F0F10] tracking-tight">{client.name}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[13px] text-[#787881]">
                  {[client.street, client.postalCode, client.city, client.country].filter(Boolean).join(', ') || [client.city, client.country].filter(Boolean).join(', ') || '—'}
                </span>
                {client.type && (
                  <Badge variant={client.type === 'Other' ? 'info' : client.type === 'Customer - Direct' ? 'success' : 'default'}>
                    {client.type === 'Customer - Direct' ? 'UHNWI' : client.type === 'Other' ? 'Institutionnel' : client.type}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-[#A8A29E] font-medium uppercase tracking-wider">AUM</p>
            <p className="text-[26px] font-bold text-[#0F0F10] tabular-nums tracking-tight">{client.aum ? fmtEUR(client.aum) : '—'}</p>
            {client.accountNumber && (
              <p className="text-[12px] text-[#787881] mt-1 font-mono">N° {client.accountNumber}</p>
            )}
            <p className="text-[12px] text-[#A8A29E] mt-0.5">{wallets.length} wallet{wallets.length !== 1 ? 's' : ''} crypto</p>
          </div>
        </div>

        {/* Quick stats bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5 pt-5 border-t border-[rgba(0,0,29,0.06)]">
          <InfoPill label="Industrie" value={client.industry || '—'} />
          <InfoPill label="Telephone" value={client.phone || '—'} />
          <InfoPill label="KYC" value={parsed.kyc || 'Non renseigne'} badge badgeVariant={kycVariant} />
          <InfoPill label="Profil de risque" value={parsed.risk || 'Non defini'} className={riskColor} />
          <InfoPill label="Client depuis" value={fmtDate(client.createdDate)} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-[rgba(0,0,23,0.03)] rounded-lg p-0.5 mb-6 w-fit">
        {[
          { id: 'profile', label: 'Fiche client' },
          { id: 'eligibility', label: 'Eligibilite' },
          ...(kycModuleEnabled ? [{ id: 'kyc', label: 'KYC / KYB' }] : []),
          { id: 'wallets', label: `Wallets (${wallets.length})` },
          { id: 'delegations', label: 'Delegations' },
          ...(client.type !== 'Customer - Direct' ? [{ id: 'ubo', label: 'UBO' }] : []),
          { id: 'transfers', label: 'Transferts' },
          { id: 'history', label: 'Historique' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 text-[13px] font-medium rounded-md transition-all ${tab === t.id ? 'bg-white text-[#0F0F10] shadow-[0_1px_3px_rgba(0,0,0,0.06)]' : 'text-[#787881] hover:text-[#0F0F10]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ========== PROFILE TAB ========== */}
      {tab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Informations generales + Adresse */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description / A propos */}
            {parsed.text && (
              <SectionCard title="A propos">
                <p className="text-[13px] text-[#787881] leading-relaxed">{parsed.text}</p>
              </SectionCard>
            )}

            {/* Informations detaillees */}
            <SectionCard title="Informations detaillees">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <DetailField label="Nom complet" value={client.name} />
                <DetailField label="Numero de compte" value={client.accountNumber || '—'} mono />
                <DetailField label="Type de compte" value={client.type === 'Customer - Direct' ? 'UHNWI (Client direct)' : client.type === 'Other' ? 'Institutionnel' : client.type || '—'} />
                <DetailField label="Industrie" value={client.industry || '—'} />
                <DetailField label="Chiffre d'affaires / AUM" value={client.aum ? fmtEUR(client.aum) : '—'} />
                <DetailField label="Telephone" value={client.phone || '—'} />
                <DetailField label="Site web" value={client.website} link />
                <DetailField label="Nombre d'employes" value={client.employees || '—'} />
                <DetailField label="ID Salesforce" value={client.id} mono />
              </div>
            </SectionCard>

            {/* Adresse */}
            <SectionCard title="Adresse de facturation">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <DetailField label="Rue" value={client.street || '—'} />
                <DetailField label="Ville" value={client.city || '—'} />
                <DetailField label="Code postal" value={client.postalCode || '—'} />
                <DetailField label="Pays" value={client.country || '—'} />
              </div>
            </SectionCard>

            {/* Contacts */}
            <SectionCard title={`Contacts (${contacts.length})`}>
              {loadingContacts ? (
                <div className="py-6 text-center"><Spinner size="w-5 h-5" /></div>
              ) : contacts.length === 0 ? (
                <p className="text-[13px] text-[#A8A29E] py-4 text-center">Aucun contact associe</p>
              ) : (
                <div className="space-y-3">
                  {contacts.map(c => (
                    <div key={c.Id} className="flex items-center justify-between py-3 px-4 bg-[rgba(0,0,23,0.02)] rounded-xl hover:bg-[rgba(0,0,23,0.04)] transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[#EEF2FF] rounded-xl flex items-center justify-center text-[#6366F1] text-[13px] font-bold">
                          {(c.FirstName?.[0] || '')}{(c.LastName?.[0] || '')}
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-[#0F0F10]">{[c.FirstName, c.LastName].filter(Boolean).join(' ')}</p>
                          {c.Title && <p className="text-[11px] text-[#A8A29E]">{c.Title}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        {c.Email && <p className="text-[12px] text-[#787881]">{c.Email}</p>}
                        {c.Phone && <p className="text-[11px] text-[#A8A29E]">{c.Phone}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Right column: KYC / Compliance / Allocation */}
          <div className="space-y-6">
            {/* KYC Status */}
            <SectionCard title="Conformite KYC">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${kycValid ? 'bg-[#059669]' : kycVariant === 'warning' || kycLive?.overallStatus === 'in_progress' ? 'bg-[#F59E0B]' : kycLive?.overallStatus === 'attention_required' ? 'bg-[#DC2626]' : 'bg-[#A8A29E]'}`} />
                  <div>
                    <p className="text-[14px] font-semibold text-[#0F0F10]">
                      {kycValid ? 'KYC Valide' :
                       kycLive?.overallStatus === 'in_progress' ? 'KYC En cours' :
                       kycLive?.overallStatus === 'ready_for_validation' ? 'Pret pour validation' :
                       kycLive?.overallStatus === 'attention_required' ? 'Attention requise' :
                       kycVariant === 'warning' ? 'KYC En cours' :
                       kycVariant === 'error' ? 'KYC Rejete' : 'Non verifie'}
                    </p>
                    {kycLive?.stats && (
                      <p className="text-[12px] text-[#787881]">
                        {kycLive.stats.documentsVerified} doc(s) verifie(s) — AML {kycLive.stats.amlClean ? 'clean' : 'en attente'}
                      </p>
                    )}
                    {!kycLive?.stats && parsed.kyc && <p className="text-[12px] text-[#787881]">{parsed.kyc}</p>}
                  </div>
                </div>

                {!kycValid && (
                  <button
                    onClick={() => setTab('kyc')}
                    className="w-full py-2 px-4 text-[13px] font-medium text-[#6366F1] bg-[#EEF2FF] rounded-xl hover:bg-[#E0E7FF] transition-colors text-center"
                  >
                    Lancer la verification KYC
                  </button>
                )}

                {parsed.documents.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider mb-2">Documents Salesforce</p>
                    <div className="space-y-1.5">
                      {parsed.documents.map((doc, i) => (
                        <div key={i} className="flex items-center gap-2 py-1.5 px-3 bg-[rgba(0,0,23,0.02)] rounded-lg">
                          <svg className="w-3.5 h-3.5 text-[#059669] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-[12px] text-[#0F0F10]">{doc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Risk Profile */}
            <SectionCard title="Profil de risque">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  parsed.risk?.toLowerCase().includes('agressif') ? 'bg-[#FEF2F2]' :
                  parsed.risk?.toLowerCase().includes('conservateur') ? 'bg-[#ECFDF5]' : 'bg-[#FFFBEB]'
                }`}>
                  <svg className={`w-5 h-5 ${riskColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <p className={`text-[14px] font-semibold ${riskColor}`}>{parsed.risk || 'Non defini'}</p>
                  {parsed.allocation && <p className="text-[12px] text-[#787881]">Cible: {parsed.allocation}</p>}
                </div>
              </div>
              {parsed.allocation && (
                <div className="bg-[rgba(0,0,23,0.02)] rounded-xl p-3">
                  <p className="text-[12px] text-[#787881]">
                    <span className="font-medium text-[#0F0F10]">Allocation crypto:</span> {parsed.allocation}
                  </p>
                </div>
              )}
            </SectionCard>

            {/* Quick actions */}
            <SectionCard title="Actions rapides">
              <div className="space-y-2">
                <button
                  onClick={() => { setTab('wallets'); setShowCreate(true); }}
                  className="w-full flex items-center gap-3 py-2.5 px-4 text-[13px] font-medium text-[#0F0F10] bg-[rgba(0,0,23,0.02)] rounded-xl hover:bg-[rgba(0,0,23,0.05)] transition-colors text-left"
                >
                  <svg className="w-4 h-4 text-[#6366F1]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  Creer un wallet
                </button>
                {client.website && (
                  <a href={client.website.startsWith('http') ? client.website : `https://${client.website}`} target="_blank" rel="noopener noreferrer"
                    className="w-full flex items-center gap-3 py-2.5 px-4 text-[13px] font-medium text-[#0F0F10] bg-[rgba(0,0,23,0.02)] rounded-xl hover:bg-[rgba(0,0,23,0.05)] transition-colors">
                    <svg className="w-4 h-4 text-[#A8A29E]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    Ouvrir le site web
                  </a>
                )}
              </div>
            </SectionCard>

            {/* Risk Config */}
            <RiskConfigPanel client={client} />

            {/* Metadata */}
            <SectionCard title="Metadata Salesforce">
              <div className="space-y-2.5">
                <DetailField label="ID Salesforce" value={client.id} mono small />
                <DetailField label="Proprietaire" value={client.ownerId || '—'} mono small />
                <DetailField label="Date de creation" value={fmtDate(client.createdDate)} small />
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {/* ========== ELIGIBILITY TAB ========== */}
      {tab === 'eligibility' && (
        <CustodyEligibilityPanel client={client} onUpdate={reloadClient} />
      )}

      {/* ========== KYC TAB ========== */}
      {tab === 'kyc' && (
        <KYCFlow client={client} onComplete={loadKycStatus} />
      )}

      {/* ========== DELEGATIONS TAB ========== */}
      {tab === 'delegations' && (
        <DelegationPanel client={client} />
      )}

      {/* ========== UBO TAB ========== */}
      {tab === 'ubo' && (
        <UBOPanel salesforceAccountId={client.id} clientName={client.name} />
      )}

      {/* ========== WALLETS TAB ========== */}
      {tab === 'wallets' && (
        <div>
          {/* Eligibility Warning */}
          {client.Custody_Eligible__c !== true && !kycValid && (
            <div className="bg-[#FFFBEB] border border-[rgba(217,119,6,0.15)] rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
              <svg className="w-5 h-5 text-[#D97706] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.072 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <p className="text-[13px] font-medium text-[#92400E]">Compliance : Client non eligible</p>
                <p className="text-[12px] text-[#B45309]">
                  La creation de wallets et les transferts necessitent que le client soit eligible a la custody.{' '}
                  <button onClick={() => setTab('eligibility')} className="underline font-medium hover:text-[#92400E]">Voir l'onglet Eligibilite</button>
                </p>
              </div>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="bg-[#FEF2F2] border border-[rgba(220,38,38,0.15)] rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
              <svg className="w-5 h-5 text-[#DC2626] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <p className="text-[13px] font-medium text-[#991B1B]">Erreur Dfns</p>
                <p className="text-[12px] text-[#B91C1C] font-mono">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-[#DC2626] hover:text-[#991B1B]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px] font-semibold text-[#0F0F10]">Wallets Dfns</h3>
            <button onClick={() => setShowCreate(true)}
              disabled={client.Custody_Eligible__c !== true && !kycValid}
              className="px-4 py-2 bg-[#0F0F10] text-white text-[13px] font-medium rounded-xl hover:bg-[#1a1a1a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
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
                      <div className="flex items-center gap-1.5">
                        {frozenWallets[w.id] && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-md uppercase tracking-wide">GELE</span>
                        )}
                        <Badge variant={w.status === 'Active' ? 'success' : 'warning'}>{w.status}</Badge>
                      </div>
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
                  disabled={client.Custody_Eligible__c !== true && !kycValid}
                  className="px-4 py-2 bg-[#6366F1] text-white text-[13px] font-medium rounded-xl hover:bg-[#5558E6] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title={client.Custody_Eligible__c !== true && !kycValid ? 'Eligibilite requise pour les transferts' : ''}>
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

          {/* Wallet Freeze Panel */}
          {selectedWallet && (
            <div className="mt-4">
              <WalletFreezePanel
                walletId={selectedWallet.id}
                salesforceAccountId={client.id}
                clientName={client.name || client.Name}
              />
            </div>
          )}
        </div>
      )}

      {/* Whitelist section in wallets tab */}
      {tab === 'wallets' && (
        <div className="mt-6">
          <WhitelistPanel client={client} />
        </div>
      )}

      {/* ========== TRANSFERS TAB ========== */}
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

      {/* ========== HISTORY TAB ========== */}
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

// ==========================================
// Sub-components
// ==========================================

function SectionCard({ title, children }) {
  return (
    <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
      <h3 className="text-[14px] font-semibold text-[#0F0F10] mb-4">{title}</h3>
      {children}
    </div>
  );
}

function InfoPill({ label, value, badge, badgeVariant, className }) {
  return (
    <div className="bg-[rgba(0,0,23,0.02)] rounded-xl px-3.5 py-2.5">
      <p className="text-[11px] text-[#A8A29E] font-medium mb-0.5">{label}</p>
      {badge ? (
        <Badge variant={badgeVariant}>{value}</Badge>
      ) : (
        <p className={`text-[13px] font-medium ${className || 'text-[#0F0F10]'} truncate`}>{value}</p>
      )}
    </div>
  );
}

function DetailField({ label, value, mono, link, small }) {
  const textSize = small ? 'text-[12px]' : 'text-[13px]';
  return (
    <div>
      <p className={`text-[11px] text-[#A8A29E] font-medium mb-0.5 ${small ? '' : 'uppercase tracking-wider'}`}>{label}</p>
      {link && value ? (
        <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer"
          className={`${textSize} text-[#6366F1] hover:underline font-medium`}>{value}</a>
      ) : (
        <p className={`${textSize} ${mono ? 'font-mono text-[#787881]' : 'text-[#0F0F10]'} font-medium`}>{value || '—'}</p>
      )}
    </div>
  );
}
