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
  fmtEUR, fmtCompactEUR, Badge, Card, Modal, Spinner, EmptyState, Button,
  Avatar, Metric, MetricRow, Delta, inputCls, selectCls, labelCls,
} from './shared';
import { WaxSeal, CornerFleuron } from './brand';
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
    <div className="space-y-8">
      {/* ── Back link ──────────────────────────────────── */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[13px] font-medium text-[#6B6B6B] hover:text-[#0A0A0A] transition-colors group -mt-4"
      >
        <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Retour au registre
      </button>

      {/* ── Editorial header ───────────────────────────── */}
      <header className="flex items-start justify-between gap-10 flex-wrap animate-slide-up">
        <div className="flex items-start gap-6 min-w-0 flex-1">
          <Avatar name={client.name} size={72} />
          <div className="min-w-0 pt-1">
            <p className="text-eyebrow">Dossier client · Conservation</p>
            <div className="flex items-center gap-3 flex-wrap mt-2">
              <h1 className="display-md text-[#0A0A0A]">
                {client.name}
              </h1>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Badge variant={typeVariant(client.type)} size="sm" dot>{typeLabel(client.type)}</Badge>
              <span className="text-[13px] text-[#6B6B6B] tracking-[-0.003em]">
                {[client.city, client.country].filter(Boolean).join(' · ') || '—'}
                {client.industry && <span className="text-[#9B9B9B]"> · {client.industry}</span>}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-5 flex-shrink-0 animate-slide-up stagger-1">
          {kycValid && (
            <div className="hidden lg:block pt-2">
              <WaxSeal size={64} label="KYC validé" tilt={-5} />
            </div>
          )}
          <div className="text-right">
            <p className="text-eyebrow">Actifs sous gestion</p>
            <p className="display-md text-[#0A0A0A] tabular-nums mt-2">
              {client.aum ? fmtCompactEUR(client.aum) : '—'}
            </p>
            <div className="flex items-center justify-end gap-2 mt-2.5">
              <Delta value="2.4%" positive prefix="+" />
              <span className="text-[12px] text-[#6B6B6B] tracking-[-0.003em]">12 mois</span>
            </div>
            {client.accountNumber && (
              <p className="text-[11px] text-[#9B9B9B] font-mono mt-3 tracking-wider">№ {client.accountNumber}</p>
            )}
          </div>
        </div>
      </header>

      {/* ── Metric row ─────────────────────────────────── */}
      <div className="animate-slide-up stagger-2">
        <MetricRow>
          <Metric
            label="Conformité KYC"
            value={kycStatusText}
            caption="MiCA Art. 66"
          />
          <Metric
            label="Profil de risque"
            value={parsed.risk || 'Non défini'}
            caption={parsed.allocation ? `Cible ${parsed.allocation}` : 'À définir'}
          />
          <Metric
            label="Wallets actifs"
            value={wallets.length}
            caption={`${wallets.filter(w => w.status === 'Active').length} opérationnel${wallets.filter(w => w.status === 'Active').length > 1 ? 's' : ''}`}
          />
          <Metric
            label="Client depuis"
            value={fmtDate(client.createdDate)}
            caption="Mandat continu"
          />
        </MetricRow>
      </div>

      {/* ── Tabs — editorial underline nav ─────────────── */}
      <div className="border-b border-[rgba(10,10,10,0.08)] animate-slide-up stagger-3">
        <nav className="flex items-center gap-1 -mb-px overflow-x-auto">
          {tabs.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative h-11 px-4 text-[13.5px] font-medium whitespace-nowrap transition-colors tracking-[-0.01em] ${
                  active ? 'text-[#0A0A0A]' : 'text-[#6B6B6B] hover:text-[#0A0A0A]'
                }`}
              >
                {t.label}
                {active && <span className="absolute left-4 right-4 -bottom-px h-[2px] bg-[#0A0A0A] rounded-t-full" />}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ══════════ PROFILE ══════════ */}
      {tab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade">
          <div className="lg:col-span-2 space-y-6">
            {parsed.text && (
              <SectionCard title="À propos">
                <p className="text-[14px] text-[#4A4A4A] leading-[1.65] tracking-[-0.003em] max-w-2xl">{parsed.text}</p>
              </SectionCard>
            )}

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

            <SectionCard title="Adresse de facturation">
              <div className="grid grid-cols-2 gap-x-10 gap-y-6">
                <Field label="Rue" value={client.street} />
                <Field label="Ville" value={client.city} />
                <Field label="Code postal" value={client.postalCode} />
                <Field label="Pays" value={client.country} />
              </div>
            </SectionCard>

            <Card>
              <div className="px-6 py-4 flex items-center justify-between border-b border-[rgba(10,10,10,0.06)]">
                <h3 className="text-[14px] font-medium text-[#0A0A0A] tracking-[-0.01em]">Contacts</h3>
                <span className="text-[12px] text-[#6B6B6B] tracking-[-0.003em]">{contacts.length} personne{contacts.length > 1 ? 's' : ''}</span>
              </div>
              {loadingContacts ? (
                <div className="py-10 text-center"><Spinner /></div>
              ) : contacts.length === 0 ? (
                <p className="px-6 py-8 text-[13px] text-[#6B6B6B]">Aucun contact associé.</p>
              ) : (
                <ul>
                  {contacts.map((c, i) => {
                    const name = [c.FirstName, c.LastName].filter(Boolean).join(' ');
                    return (
                      <li
                        key={c.Id}
                        className={`px-6 py-4 flex items-center justify-between gap-4 ${i < contacts.length - 1 ? 'border-b border-[rgba(10,10,10,0.06)]' : ''}`}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <Avatar name={name} size={38} />
                          <div className="min-w-0">
                            <p className="text-[14px] font-medium text-[#0A0A0A] tracking-[-0.01em] truncate">
                              {name || '—'}
                            </p>
                            {c.Title && <p className="text-[12px] text-[#6B6B6B] mt-0.5 tracking-[-0.003em]">{c.Title}</p>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {c.Email && <p className="text-[12.5px] text-[#4A4A4A] tracking-[-0.003em]">{c.Email}</p>}
                          {c.Phone && <p className="text-[11.5px] text-[#9B9B9B] mt-0.5">{c.Phone}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <aside className="space-y-6">
            {/* Wealth breakdown */}
            <Card>
              <div className="px-6 pt-5 pb-4 border-b border-[rgba(10,10,10,0.06)]">
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

            {/* KYC summary */}
            <SectionCard title="Conformité KYC">
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
                    <p className="text-[12px] text-[#6B6B6B] mt-0.5 tracking-[-0.003em]">
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
                <div className="mt-5 pt-5 border-t border-[rgba(10,10,10,0.06)]">
                  <p className="text-[11px] font-medium text-[#9B9B9B] uppercase tracking-[0.04em] mb-3">
                    Documents Salesforce
                  </p>
                  <ul className="space-y-2">
                    {parsed.documents.map((doc, i) => (
                      <li key={i} className="flex items-center gap-2 text-[13px] text-[#4A4A4A] tracking-[-0.003em]">
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

            {/* Actions */}
            <SectionCard title="Actions rapides">
              <div className="space-y-2">
                <Button
                  variant="primary"
                  size="md"
                  className="w-full"
                  onClick={() => { setTab('wallets'); setShowCreate(true); }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Créer un wallet DFNS
                </Button>
                {client.website && (
                  <a
                    href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full h-10 inline-flex items-center justify-center gap-2 px-5 text-[13.5px] font-medium rounded-full bg-white text-[#0A0A0A] border border-[rgba(10,10,10,0.12)] hover:bg-[#FBFAF7] transition-colors tracking-[-0.01em]"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Ouvrir le site
                  </a>
                )}
              </div>
            </SectionCard>

            <RiskConfigPanel client={client} />

            <SectionCard title="Métadonnées">
              <dl className="space-y-4">
                <MetaRow label="ID Salesforce" value={client.id} mono />
                <MetaRow label="Propriétaire" value={client.ownerId || '—'} mono />
                <MetaRow label="Créé le" value={fmtDate(client.createdDate)} />
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
        <div className="animate-fade space-y-6">
          {client.Custody_Eligible__c !== true && !kycValid && (
            <Card className="px-5 py-4 flex items-start gap-3">
              <svg className="w-4 h-4 text-[#CA8A04] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div className="flex-1">
                <p className="text-[13.5px] font-medium text-[#0A0A0A] tracking-[-0.01em]">Client non éligible à la custody</p>
                <p className="text-[12.5px] text-[#6B6B6B] mt-0.5 tracking-[-0.003em]">
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
              <p className="text-[13.5px] text-[#6B6B6B] mt-1.5 tracking-[-0.003em]">
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
                      active ? 'bg-[#FBFAF7]' : 'hover:bg-[#FBFAF7]'
                    } ${i < wallets.length - 1 ? 'border-b border-[rgba(10,10,10,0.06)]' : ''}`}
                  >
                    <div className="w-11 h-11 rounded-[10px] flex items-center justify-center bg-[#F5F3EE] border border-[rgba(10,10,10,0.06)] flex-shrink-0">
                      <span className="font-mono text-[12px] font-medium text-[#0A0A0A]">{n.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[14.5px] font-medium text-[#0A0A0A] truncate tracking-[-0.015em]">{w.name || n.name}</p>
                        {frozenWallets[w.id] && <Badge variant="error" size="sm" dot>Gelé</Badge>}
                        <Badge variant={w.status === 'Active' ? 'success' : 'warning'} size="sm" dot>{w.status}</Badge>
                      </div>
                      <p className="text-[12px] font-mono text-[#6B6B6B] truncate mt-1">{truncAddr(w.address, 12)}</p>
                    </div>
                    <div className="text-right flex-shrink-0 hidden sm:block w-28">
                      <p className="text-[11px] font-medium text-[#9B9B9B] uppercase tracking-[0.04em]">Réseau</p>
                      <p className="text-[13px] font-medium text-[#0A0A0A] mt-1 tracking-[-0.01em]">{n.name}</p>
                    </div>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[#9B9B9B] flex-shrink-0">
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
                  <div className="w-12 h-12 rounded-[10px] flex items-center justify-center bg-[#F5F3EE] border border-[rgba(10,10,10,0.06)]">
                    <span className="font-mono text-[13px] font-medium text-[#0A0A0A]">{net(selectedWallet.network).icon}</span>
                  </div>
                  <div>
                    <h3 className="text-[18px] font-medium text-[#0A0A0A] tracking-[-0.02em]">{selectedWallet.name || 'Wallet'}</h3>
                    <p className="text-[12.5px] text-[#6B6B6B] mt-0.5 tracking-[-0.003em]">{net(selectedWallet.network).name}</p>
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
                <div className="p-4 bg-[#FBFAF7] rounded-[12px] border border-[rgba(10,10,10,0.04)]">
                  <p className="text-[11px] font-medium text-[#9B9B9B] uppercase tracking-[0.04em] mb-1.5">Adresse</p>
                  <p className="text-[12px] font-mono text-[#0A0A0A] break-all leading-relaxed">{selectedWallet.address}</p>
                </div>
                <div className="p-4 bg-[#FBFAF7] rounded-[12px] border border-[rgba(10,10,10,0.04)]">
                  <p className="text-[11px] font-medium text-[#9B9B9B] uppercase tracking-[0.04em] mb-1.5">Valeur nette</p>
                  <p className="text-[22px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.025em]">
                    {assets?.netWorth?.USD ? `$${assets.netWorth.USD.toLocaleString()}` : '—'}
                  </p>
                </div>
                <div className="p-4 bg-[#FBFAF7] rounded-[12px] border border-[rgba(10,10,10,0.04)]">
                  <p className="text-[11px] font-medium text-[#9B9B9B] uppercase tracking-[0.04em] mb-1.5">Actifs</p>
                  <p className="text-[22px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.025em]">
                    {assets?.assets?.length || 0}
                  </p>
                </div>
              </div>

              {assets?.assets?.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-[#9B9B9B] uppercase tracking-[0.04em] mb-3">Portefeuille</p>
                  <div className="space-y-2">
                    {assets.assets.map((a, i) => (
                      <div key={i} className="flex items-center justify-between py-3 px-4 bg-[#FBFAF7] rounded-[10px] border border-[rgba(10,10,10,0.04)]">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-white border border-[rgba(10,10,10,0.08)] flex items-center justify-center">
                            <span className="text-[10px] font-medium font-mono">{a.symbol?.slice(0, 3)}</span>
                          </div>
                          <div>
                            <p className="text-[14px] font-medium text-[#0A0A0A] tracking-[-0.01em]">{a.symbol}</p>
                            <p className="text-[11px] text-[#6B6B6B]">{a.kind}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[14px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.015em]">{a.balance}</p>
                          {a.quotes?.USD && <p className="text-[11px] text-[#6B6B6B] tabular-nums">${a.quotes.USD.toLocaleString()}</p>}
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
              <p className="text-[13.5px] text-[#6B6B6B] mt-1.5 tracking-[-0.003em]">
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
                  <tr className="border-b border-[rgba(10,10,10,0.06)]">
                    <th className="text-left px-6 h-12 text-[11px] font-medium text-[#9B9B9B] uppercase tracking-[0.04em]">Direction</th>
                    <th className="text-left px-6 h-12 text-[11px] font-medium text-[#9B9B9B] uppercase tracking-[0.04em]">Adresse</th>
                    <th className="text-right px-6 h-12 text-[11px] font-medium text-[#9B9B9B] uppercase tracking-[0.04em]">Montant</th>
                    <th className="text-left px-6 h-12 text-[11px] font-medium text-[#9B9B9B] uppercase tracking-[0.04em]">Statut</th>
                    <th className="text-left px-6 h-12 text-[11px] font-medium text-[#9B9B9B] uppercase tracking-[0.04em]">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((tx, i) => (
                    <tr key={tx.id || i} className="border-b border-[rgba(10,10,10,0.06)] last:border-0 hover:bg-[#FBFAF7] transition-colors">
                      <td className="px-6 py-3.5">
                        <Badge variant={tx.direction === 'In' ? 'success' : 'default'} size="sm" dot>{tx.direction || '—'}</Badge>
                      </td>
                      <td className="px-6 py-3.5 font-mono text-[12px] text-[#4A4A4A]">
                        {truncAddr(tx.to || tx.from, 8)}
                      </td>
                      <td className="px-6 py-3.5 text-right font-medium text-[#0A0A0A] tabular-nums tracking-[-0.015em]">
                        {tx.value || '—'}
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge variant={tx.status === 'Confirmed' ? 'success' : 'warning'} size="sm" dot>{tx.status || 'Pending'}</Badge>
                      </td>
                      <td className="px-6 py-3.5 text-[12.5px] text-[#6B6B6B]">
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
            <p className="text-[13.5px] text-[#6B6B6B] mt-1.5 tracking-[-0.003em]">Tous les wallets sous mandat</p>
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
                    className={`px-6 py-4 flex items-center justify-between gap-4 ${i < wallets.length - 1 ? 'border-b border-[rgba(10,10,10,0.06)]' : ''}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-[10px] flex items-center justify-center bg-[#F5F3EE] border border-[rgba(10,10,10,0.06)]">
                        <span className="font-mono text-[11px] font-medium">{n.icon}</span>
                      </div>
                      <div>
                        <p className="text-[13.5px] font-medium text-[#0A0A0A] tracking-[-0.01em]">{w.name}</p>
                        <p className="font-mono text-[11.5px] text-[#6B6B6B]">{truncAddr(w.address, 10)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={w.status === 'Active' ? 'success' : 'default'} size="sm" dot>{w.status}</Badge>
                      <p className="text-[11px] text-[#9B9B9B] mt-1">
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
    </div>
  );
}

/* ─── Sub-components ─── */
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
      <p className="text-[11px] font-medium text-[#9B9B9B] uppercase tracking-[0.04em] mb-1.5">{label}</p>
      {link && value ? (
        <a
          href={value.startsWith('http') ? value : `https://${value}`}
          target="_blank" rel="noopener noreferrer"
          className="text-[14px] font-medium text-[#0A0A0A] hover:underline underline-offset-2 tracking-[-0.01em]"
        >
          {value}
        </a>
      ) : (
        <p className={`text-[14px] ${mono ? 'font-mono text-[#4A4A4A]' : 'text-[#0A0A0A] font-medium tracking-[-0.01em]'}`}>
          {value || '—'}
        </p>
      )}
    </div>
  );
}

function MetaRow({ label, value, mono }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-[#9B9B9B] uppercase tracking-[0.04em] mb-1">{label}</dt>
      <dd className={`text-[12.5px] ${mono ? 'font-mono text-[#4A4A4A] break-all' : 'text-[#0A0A0A] font-medium tracking-[-0.01em]'}`}>{value}</dd>
    </div>
  );
}

function WealthRow({ label, sub, value, pct, last }) {
  return (
    <li className={`px-6 py-4 ${!last ? 'border-b border-[rgba(10,10,10,0.06)]' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[13.5px] font-medium text-[#0A0A0A] tracking-[-0.01em]">{label}</p>
          <p className="text-[11.5px] text-[#6B6B6B] mt-0.5 tracking-[-0.003em]">{sub}</p>
        </div>
        <div className="text-right">
          <p className="text-[13.5px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.015em]">{value}</p>
          <p className="text-[11px] text-[#9B9B9B] tabular-nums mt-0.5">{pct}%</p>
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
