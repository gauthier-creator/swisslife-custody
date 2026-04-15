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
import { fmtEUR, Badge, Card, Modal, Spinner, EmptyState, Button, StatCell, inputCls, selectCls, labelCls } from './shared';
import { API_BASE } from '../config/constants';

/* ─────────────────────────────────────────────────────────
   ClientDetail — compact fintech detail view
   ───────────────────────────────────────────────────────── */

const truncAddr = (a, n = 8) => a ? `${a.slice(0, n)}…${a.slice(-n)}` : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const typeLabel = (t) => {
  if (t === 'Customer - Direct') return 'UHNWI';
  if (t === 'Other' || t === 'Institutional') return 'Institutionnel';
  return t || '—';
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

  const net = (id) => SUPPORTED_NETWORKS.find(n => n.id === id) || { icon: '?', color: '#71717A', name: id };

  const kycStatusText = kycValid ? 'Valide'
    : kycLive?.overallStatus === 'in_progress' ? 'En cours'
    : kycLive?.overallStatus === 'ready_for_validation' ? 'À valider'
    : kycLive?.overallStatus === 'attention_required' ? 'Attention'
    : parsed.kyc?.toLowerCase().includes('cours') ? 'En cours'
    : 'Non vérifié';

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
        className="flex items-center gap-1.5 text-[12px] text-[#71717A] hover:text-[#09090B] transition-colors mb-4 group"
      >
        <svg className="w-3 h-3 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Retour aux clients
      </button>

      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 mb-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[22px] font-semibold text-[#09090B] tracking-tight">
              {client.name}
            </h1>
            <Badge variant="default">{typeLabel(client.type)}</Badge>
          </div>
          <p className="text-[13px] text-[#71717A] mt-1">
            {[client.street, client.postalCode, client.city, client.country].filter(Boolean).join(', ') || '—'}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[11px] font-medium text-[#71717A] uppercase tracking-wider mb-1">
            Actifs sous gestion
          </p>
          <p className="text-[22px] font-semibold text-[#09090B] tabular-nums">
            {client.aum ? fmtEUR(client.aum) : '—'}
          </p>
          {client.accountNumber && (
            <p className="text-[12px] text-[#71717A] font-mono mt-0.5">№ {client.accountNumber}</p>
          )}
        </div>
      </div>

      {/* ── Stats strip ─────────────────────────────────── */}
      <Card className="mb-6">
        <div className="grid grid-cols-5 divide-x divide-[rgba(9,9,11,0.06)]">
          <StatCell label="KYC" value={kycStatusText} />
          <StatCell label="Profil de risque" value={parsed.risk || 'Non défini'} />
          <StatCell label="Industrie" value={client.industry || '—'} />
          <StatCell label="Wallets" value={wallets.length} />
          <StatCell label="Client depuis" value={fmtDate(client.createdDate)} />
        </div>
      </Card>

      {/* ── Tabs ────────────────────────────────────────── */}
      <div className="border-b border-[rgba(9,9,11,0.08)] mb-6">
        <nav className="flex items-center gap-1 overflow-x-auto">
          {tabs.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative h-9 px-3 text-[13px] font-medium whitespace-nowrap transition-colors ${
                  active ? 'text-[#09090B]' : 'text-[#71717A] hover:text-[#09090B]'
                }`}
              >
                {t.label}
                {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#09090B]" />}
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
                <p className="text-[13px] text-[#52525B] leading-relaxed">{parsed.text}</p>
              </SectionCard>
            )}

            <SectionCard title="Informations détaillées">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
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
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <Field label="Rue" value={client.street} />
                <Field label="Ville" value={client.city} />
                <Field label="Code postal" value={client.postalCode} />
                <Field label="Pays" value={client.country} />
              </div>
            </SectionCard>

            <SectionCard title={`Contacts (${contacts.length})`}>
              {loadingContacts ? (
                <div className="py-6 text-center"><Spinner /></div>
              ) : contacts.length === 0 ? (
                <p className="text-[13px] text-[#71717A] py-4">Aucun contact associé.</p>
              ) : (
                <div className="divide-y divide-[rgba(9,9,11,0.06)] -mx-5">
                  {contacts.map(c => (
                    <div key={c.Id} className="px-5 py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#F4F4F5] rounded-md flex items-center justify-center text-[#52525B] text-[11px] font-semibold">
                          {(c.FirstName?.[0] || '') + (c.LastName?.[0] || '')}
                        </div>
                        <div>
                          <p className="text-[13px] font-medium text-[#09090B]">
                            {[c.FirstName, c.LastName].filter(Boolean).join(' ')}
                          </p>
                          {c.Title && <p className="text-[11px] text-[#71717A]">{c.Title}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        {c.Email && <p className="text-[12px] text-[#52525B]">{c.Email}</p>}
                        {c.Phone && <p className="text-[11px] text-[#71717A]">{c.Phone}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <aside className="space-y-5">
            <SectionCard title="Conformité KYC">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: kycValid ? '#10B981' : kycLive?.overallStatus === 'attention_required' ? '#EF4444' : '#F59E0B' }}
                />
                <p className="text-[13px] font-medium text-[#09090B]">{kycStatusText}</p>
              </div>
              {kycLive?.stats && (
                <p className="text-[12px] text-[#71717A] mt-2">
                  {kycLive.stats.documentsVerified} doc(s) vérifié(s) · AML {kycLive.stats.amlClean ? 'clean' : 'en attente'}
                </p>
              )}
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
                <div className="mt-4 pt-4 border-t border-[rgba(9,9,11,0.06)]">
                  <p className="text-[11px] font-semibold text-[#71717A] uppercase tracking-wider mb-2">
                    Documents Salesforce
                  </p>
                  <ul className="space-y-1">
                    {parsed.documents.map((doc, i) => (
                      <li key={i} className="flex items-center gap-2 text-[12px] text-[#52525B]">
                        <svg className="w-3 h-3 text-[#10B981] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {doc}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Profil de risque">
              <p className="text-[14px] font-semibold text-[#09090B]">
                {parsed.risk || 'Non défini'}
              </p>
              {parsed.allocation && (
                <p className="text-[12px] text-[#71717A] mt-1">
                  Allocation crypto cible : <span className="text-[#09090B] font-medium">{parsed.allocation}</span>
                </p>
              )}
            </SectionCard>

            <SectionCard title="Actions rapides">
              <div className="space-y-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => { setTab('wallets'); setShowCreate(true); }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Créer un wallet
                </Button>
                {client.website && (
                  <a
                    href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full h-8 inline-flex items-center gap-1.5 px-3 text-[13px] font-medium rounded-md bg-white text-[#09090B] border border-[rgba(9,9,11,0.1)] hover:bg-[#FAFAFA] transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Ouvrir le site
                  </a>
                )}
              </div>
            </SectionCard>

            <RiskConfigPanel client={client} />

            <SectionCard title="Metadata Salesforce">
              <dl className="space-y-3">
                <div>
                  <dt className="text-[11px] font-medium text-[#71717A] uppercase tracking-wider mb-0.5">ID Salesforce</dt>
                  <dd className="text-[11px] font-mono text-[#52525B] break-all">{client.id}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-[#71717A] uppercase tracking-wider mb-0.5">Propriétaire</dt>
                  <dd className="text-[11px] font-mono text-[#52525B] break-all">{client.ownerId || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-[#71717A] uppercase tracking-wider mb-0.5">Créé le</dt>
                  <dd className="text-[12px] text-[#09090B]">{fmtDate(client.createdDate)}</dd>
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
        <div className="animate-fade">
          {client.Custody_Eligible__c !== true && !kycValid && (
            <div className="mb-5 px-4 py-3 bg-[#FFFBEB] border border-[rgba(245,158,11,0.25)] rounded-md flex items-start gap-2.5">
              <svg className="w-4 h-4 text-[#F59E0B] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div className="flex-1">
                <p className="text-[13px] font-medium text-[#92400E]">Client non éligible à la custody</p>
                <p className="text-[12px] text-[#B45309] mt-0.5">
                  La création de wallets requiert l'éligibilité.{' '}
                  <button
                    onClick={() => setTab('eligibility')}
                    className="underline font-medium hover:text-[#92400E]"
                  >
                    Voir l'onglet Éligibilité
                  </button>
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-5 px-4 py-2.5 bg-[#FEF2F2] border border-[rgba(239,68,68,0.2)] rounded-md">
              <p className="text-[12px] font-medium text-[#B91C1C]">Erreur DFNS : {error}</p>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[15px] font-semibold text-[#09090B]">Wallets DFNS</h2>
              <p className="text-[12px] text-[#71717A] mt-0.5">{wallets.length} wallet{wallets.length > 1 ? 's' : ''} actif{wallets.length > 1 ? 's' : ''}</p>
            </div>
            <Button
              variant="primary"
              onClick={() => setShowCreate(true)}
              disabled={client.Custody_Eligible__c !== true && !kycValid}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Créer un wallet
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><Spinner /></div>
          ) : wallets.length === 0 ? (
            <Card>
              <EmptyState
                title="Aucun wallet"
                description="Créez un premier wallet pour ce client via DFNS."
              />
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {wallets.map(w => {
                const n = net(w.network);
                const active = selectedWallet?.id === w.id;
                return (
                  <button
                    key={w.id}
                    onClick={() => selectWallet(w)}
                    className={`bg-white border rounded-lg p-4 text-left transition-all ${
                      active
                        ? 'border-[#09090B] ring-2 ring-[rgba(9,9,11,0.08)]'
                        : 'border-[rgba(9,9,11,0.08)] hover:border-[rgba(9,9,11,0.15)] hover:bg-[#FAFAFA]'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-md flex items-center justify-center text-white font-bold text-[12px] flex-shrink-0" style={{ backgroundColor: n.color }}>
                        {n.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#09090B] truncate">{w.name || n.name}</p>
                        <p className="text-[11px] text-[#71717A]">{n.name}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {frozenWallets[w.id] && <Badge variant="error">Gelé</Badge>}
                        <Badge variant={w.status === 'Active' ? 'success' : 'warning'}>{w.status}</Badge>
                      </div>
                    </div>
                    <div className="font-mono text-[11px] text-[#52525B] bg-[#FAFAFA] rounded px-2.5 py-1.5 truncate">
                      {truncAddr(w.address, 10)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedWallet && (
            <Card className="mt-5 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[15px] font-semibold text-[#09090B]">{selectedWallet.name || 'Wallet'}</h3>
                <Button
                  variant="primary"
                  onClick={() => setShowTransfer(true)}
                  disabled={client.Custody_Eligible__c !== true && !kycValid}
                >
                  Envoyer
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-[#FAFAFA] rounded-md p-3">
                  <p className="text-[11px] font-medium text-[#71717A] uppercase tracking-wider mb-1">Adresse</p>
                  <p className="text-[11px] font-mono text-[#09090B] break-all">{selectedWallet.address}</p>
                </div>
                <div className="bg-[#FAFAFA] rounded-md p-3">
                  <p className="text-[11px] font-medium text-[#71717A] uppercase tracking-wider mb-1">Réseau</p>
                  <p className="text-[13px] font-medium text-[#09090B]">{net(selectedWallet.network).name}</p>
                </div>
                <div className="bg-[#FAFAFA] rounded-md p-3">
                  <p className="text-[11px] font-medium text-[#71717A] uppercase tracking-wider mb-1">Valeur nette</p>
                  <p className="text-[16px] font-semibold text-[#09090B] tabular-nums">
                    {assets?.netWorth?.USD ? `$${assets.netWorth.USD.toLocaleString()}` : '—'}
                  </p>
                </div>
              </div>

              {assets?.assets?.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-[#71717A] uppercase tracking-wider mb-2">Actifs</p>
                  <div className="space-y-1">
                    {assets.assets.map((a, i) => (
                      <div key={i} className="flex items-center justify-between py-2 px-3 bg-[#FAFAFA] rounded-md">
                        <div className="flex items-center gap-2.5">
                          <span className="text-[13px] font-semibold text-[#09090B]">{a.symbol}</span>
                          <Badge>{a.kind}</Badge>
                        </div>
                        <div className="text-right">
                          <p className="text-[13px] font-semibold text-[#09090B] tabular-nums">{a.balance}</p>
                          {a.quotes?.USD && <p className="text-[11px] text-[#71717A] tabular-nums">${a.quotes.USD.toLocaleString()}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {selectedWallet && (
            <div className="mt-5">
              <WalletFreezePanel
                walletId={selectedWallet.id}
                salesforceAccountId={client.id}
                clientName={client.name || client.Name}
              />
            </div>
          )}

          <div className="mt-5">
            <WhitelistPanel client={client} />
          </div>
        </div>
      )}

      {/* ══════════ TRANSFERS ══════════ */}
      {tab === 'transfers' && selectedWallet && (
        <div className="animate-fade">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[15px] font-semibold text-[#09090B]">Transferts — {selectedWallet.name}</h2>
              <p className="text-[12px] text-[#71717A] mt-0.5">{history.length} opération{history.length > 1 ? 's' : ''}</p>
            </div>
            <Button variant="primary" onClick={() => setShowTransfer(true)}>
              Nouveau transfert
            </Button>
          </div>
          {history.length === 0 ? (
            <Card>
              <EmptyState title="Aucun transfert" description="Les transferts apparaîtront ici." />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[rgba(9,9,11,0.08)] bg-[#FAFAFA]">
                    <th className="text-left px-4 h-9 text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">Direction</th>
                    <th className="text-left px-4 h-9 text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">Adresse</th>
                    <th className="text-right px-4 h-9 text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">Montant</th>
                    <th className="text-left px-4 h-9 text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">Statut</th>
                    <th className="text-left px-4 h-9 text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((tx, i) => (
                    <tr key={tx.id || i} className="border-b border-[rgba(9,9,11,0.06)] last:border-0 hover:bg-[#FAFAFA]">
                      <td className="px-4 py-2.5">
                        <Badge variant={tx.direction === 'In' ? 'success' : 'info'}>{tx.direction || '—'}</Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-[#52525B]">
                        {truncAddr(tx.to || tx.from, 8)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-[#09090B] tabular-nums">
                        {tx.value || '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={tx.status === 'Confirmed' ? 'success' : 'warning'}>{tx.status || 'Pending'}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-[#71717A]">
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
          <Card>
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
          <div className="mb-4">
            <h2 className="text-[15px] font-semibold text-[#09090B]">Historique global</h2>
            <p className="text-[12px] text-[#71717A] mt-0.5">Tous les wallets du client</p>
          </div>
          {wallets.length === 0 ? (
            <Card>
              <EmptyState title="Aucun wallet" description="Créez un wallet pour voir l'historique." />
            </Card>
          ) : (
            <Card className="divide-y divide-[rgba(9,9,11,0.06)]">
              {wallets.map(w => {
                const n = net(w.network);
                return (
                  <div key={w.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-md flex items-center justify-center text-white text-[11px] font-bold" style={{ backgroundColor: n.color }}>
                        {n.icon}
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-[#09090B]">{w.name}</p>
                        <p className="font-mono text-[11px] text-[#71717A]">{truncAddr(w.address, 8)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={w.status === 'Active' ? 'success' : 'default'}>{w.status}</Badge>
                      <p className="text-[11px] text-[#71717A] mt-0.5">
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
            <Button variant="primary" onClick={handleTransfer} disabled={sending || !transfer.to || !transfer.amount}>
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
    <Card className="p-5">
      <h3 className="text-[13px] font-semibold text-[#09090B] mb-4">{title}</h3>
      {children}
    </Card>
  );
}

function Field({ label, value, mono, link }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-[#71717A] uppercase tracking-wider mb-1">{label}</p>
      {link && value ? (
        <a
          href={value.startsWith('http') ? value : `https://${value}`}
          target="_blank" rel="noopener noreferrer"
          className="text-[13px] font-medium text-[#09090B] hover:underline"
        >
          {value}
        </a>
      ) : (
        <p className={`text-[13px] ${mono ? 'font-mono text-[#52525B]' : 'text-[#09090B] font-medium'}`}>
          {value || '—'}
        </p>
      )}
    </div>
  );
}
