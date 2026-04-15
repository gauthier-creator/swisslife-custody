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
import { fmtEUR, Badge, Modal, Spinner, EmptyState, Button, Rule, Datum, inputCls, selectCls, labelCls } from './shared';
import { API_BASE } from '../config/constants';

/* ─────────────────────────────────────────────────────────
   Client detail — editorial monograph
   One client, patiently set. Navigation as quiet labels.
   ───────────────────────────────────────────────────────── */

const truncAddr = (a, n = 8) => a ? `${a.slice(0, n)}···${a.slice(-n)}` : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
const typeLabel = (t) => {
  if (t === 'Customer - Direct') return 'Personne physique';
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
    } catch (err) { console.error('reloadClient error:', err); }
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
      console.error('loadWallets error:', err); setError(err.message); setWallets([]);
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
      alert('Conformité : le client doit être éligible à la conservation avant toute création de portefeuille. Complétez l\'onglet Éligibilité.');
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
      console.error('createWallet error:', err); setError(err.message);
      alert('Erreur création portefeuille : ' + err.message);
    }
    setCreating(false);
  };

  const selectWallet = async (w) => {
    setSelectedWallet(w); setAssets(null); setHistory([]);
    try {
      const [a, h] = await Promise.all([getWalletAssets(w.id), getWalletHistory(w.id)]);
      setAssets(a); setHistory(h.items || []);
    } catch (err) { console.error('selectWallet error:', err); }
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
        alert('Transfert bloqué par la conformité\n\n' + riskCheck.blocks.join('\n'));
        setSending(false); return;
      }

      let warningMsg = '';
      if (riskCheck.warnings && riskCheck.warnings.length > 0) {
        warningMsg = '\n\nAvertissements :\n· ' + riskCheck.warnings.join('\n· ');
      }

      const netInfo = SUPPORTED_NETWORKS.find(n => n.id === selectedWallet.network);
      const confirmMsg = `Demande de transfert\n\nDepuis : ${selectedWallet.name}\nVers : ${transfer.to}\nMontant : ${transfer.amount} ${netInfo?.symbol || ''}${warningMsg}\n\nLe transfert sera soumis à approbation (principe des quatre yeux). Confirmez-vous ?`;
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

      alert('Demande soumise. Un administrateur doit approuver la demande dans l\'onglet Conformité.');
      setShowTransfer(false);
      setTransfer({ to: '', amount: '', kind: 'Native' });
    } catch (err) {
      console.error('transfer error:', err); setError(err.message);
      alert('Erreur : ' + err.message);
    }
    setSending(false);
  };

  const net = (id) => SUPPORTED_NETWORKS.find(n => n.id === id) || { icon: '?', color: '#8A6F3D', name: id };

  const kycStatusText = kycValid ? 'Validé'
    : kycLive?.overallStatus === 'in_progress' ? 'En cours'
    : kycLive?.overallStatus === 'ready_for_validation' ? 'À valider'
    : kycLive?.overallStatus === 'attention_required' ? 'Attention requise'
    : parsed.kyc?.toLowerCase().includes('cours') ? 'En cours'
    : 'Non vérifié';

  const tabs = [
    { id: 'profile', label: 'Fiche' },
    { id: 'eligibility', label: 'Éligibilité' },
    ...(kycModuleEnabled ? [{ id: 'kyc', label: 'KYC / KYB' }] : []),
    { id: 'wallets', label: 'Portefeuilles' },
    { id: 'delegations', label: 'Délégations' },
    ...(client.type !== 'Customer - Direct' ? [{ id: 'ubo', label: 'Bénéficiaires effectifs' }] : []),
    { id: 'transfers', label: 'Transferts' },
    { id: 'history', label: 'Historique' },
  ];

  return (
    <div>
      {/* ── Back ─────────────────────────────────────────── */}
      <button
        onClick={onBack}
        className="group flex items-center gap-2 eyebrow text-[#6B6B70] hover:text-[#0B0B0C] transition-colors mb-10"
      >
        <svg className="w-3 h-3 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Retour à l'index
      </button>

      {/* ── Editorial header ─────────────────────────────── */}
      <header className="mb-12">
        <div className="flex items-start justify-between gap-10">
          <div className="flex-1 min-w-0">
            <p className="eyebrow mb-4">{typeLabel(client.type)}</p>
            <h1 className="font-display-tight text-[68px] leading-[0.94] text-[#0B0B0C]">
              {client.name}
            </h1>
            <p className="mt-5 text-[14px] text-[#6B6B70] leading-relaxed max-w-xl">
              {[client.street, client.postalCode, client.city, client.country].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>

          {client.aum && (
            <div className="text-right flex-shrink-0">
              <p className="eyebrow mb-3">Actifs sous gestion</p>
              <p className="font-display text-[42px] text-[#0B0B0C] tabular leading-none">
                {fmtEUR(client.aum)}
              </p>
              {client.accountNumber && (
                <p className="eyebrow mt-3 text-[#A8A8AD]">№ {client.accountNumber}</p>
              )}
            </div>
          )}
        </div>

        {/* ── Datum strip ─────────────────────────────── */}
        <div className="mt-12 pt-8 border-t border-[rgba(11,11,12,0.08)] grid grid-cols-5 gap-8">
          <Datum label="Conformité KYC" value={kycStatusText} />
          <Datum label="Profil de risque" value={parsed.risk || 'Non défini'} />
          <Datum label="Industrie" value={client.industry || '—'} />
          <Datum label="Portefeuilles" value={String(wallets.length).padStart(2, '0')} />
          <Datum label="Client depuis" value={fmtDate(client.createdDate)} />
        </div>
      </header>

      {/* ── Navigation ──────────────────────────────────── */}
      <nav className="flex items-center gap-8 border-b border-[rgba(11,11,12,0.08)] mb-12 overflow-x-auto">
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="relative py-4 text-[13px] tracking-tight whitespace-nowrap transition-colors"
              style={{ color: active ? '#0B0B0C' : '#6B6B70' }}
            >
              {t.label}
              {active && <span className="absolute left-0 right-0 -bottom-px h-px bg-[#0B0B0C]" />}
            </button>
          );
        })}
      </nav>

      {/* ══════════ PROFILE ══════════ */}
      {tab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 animate-fade">
          <div className="lg:col-span-2 space-y-12">
            {parsed.text && (
              <Section title="Note">
                <p className="text-[15px] text-[#2C2C2E] leading-[1.7] font-light max-w-2xl">
                  {parsed.text}
                </p>
              </Section>
            )}

            <Section title="Informations">
              <div className="grid grid-cols-2 gap-x-12 gap-y-7">
                <Datum label="Nom complet" value={client.name} />
                <Datum label="Numéro de compte" value={client.accountNumber || '—'} />
                <Datum label="Type de compte" value={typeLabel(client.type)} />
                <Datum label="Industrie" value={client.industry || '—'} />
                <Datum label="Chiffre d'affaires / AUM" value={client.aum ? fmtEUR(client.aum) : '—'} />
                <Datum label="Téléphone" value={client.phone || '—'} />
                <Datum label="Site internet" value={client.website || '—'} />
                <Datum label="Effectifs" value={client.employees || '—'} />
              </div>
            </Section>

            <Section title="Adresse de facturation">
              <div className="grid grid-cols-2 gap-x-12 gap-y-7">
                <Datum label="Rue" value={client.street || '—'} />
                <Datum label="Ville" value={client.city || '—'} />
                <Datum label="Code postal" value={client.postalCode || '—'} />
                <Datum label="Pays" value={client.country || '—'} />
              </div>
            </Section>

            <Section title={`Contacts · ${contacts.length}`}>
              {loadingContacts ? (
                <div className="py-6"><Spinner /></div>
              ) : contacts.length === 0 ? (
                <p className="text-[13px] text-[#A8A8AD] font-light">Aucun contact associé.</p>
              ) : (
                <ul className="divide-y divide-[rgba(11,11,12,0.08)]">
                  {contacts.map(c => (
                    <li key={c.Id} className="py-5 flex items-baseline justify-between gap-6">
                      <div>
                        <p className="font-display text-[18px] text-[#0B0B0C] leading-tight">
                          {[c.FirstName, c.LastName].filter(Boolean).join(' ')}
                        </p>
                        {c.Title && <p className="eyebrow mt-1">{c.Title}</p>}
                      </div>
                      <div className="text-right">
                        {c.Email && <p className="text-[12px] text-[#6B6B70]">{c.Email}</p>}
                        {c.Phone && <p className="text-[12px] text-[#A8A8AD] mt-0.5">{c.Phone}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <aside className="space-y-12">
            <Section title="Conformité">
              <div className="flex items-baseline gap-3">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: kycValid ? '#2E5D4F' : kycLive?.overallStatus === 'attention_required' ? '#7A2424' : '#8A4A1B' }}
                />
                <div>
                  <p className="font-display text-[22px] text-[#0B0B0C] leading-tight">{kycStatusText}</p>
                  {kycLive?.stats && (
                    <p className="text-[12px] text-[#6B6B70] mt-1">
                      {kycLive.stats.documentsVerified} document(s) vérifié(s) · AML {kycLive.stats.amlClean ? 'clean' : 'en attente'}
                    </p>
                  )}
                </div>
              </div>
              {!kycValid && kycModuleEnabled && (
                <button
                  onClick={() => setTab('kyc')}
                  className="mt-5 eyebrow text-[#8A6F3D] hover:text-[#0B0B0C] transition-colors"
                >
                  Lancer la vérification →
                </button>
              )}
              {parsed.documents.length > 0 && (
                <div className="mt-6 pt-6 border-t border-[rgba(11,11,12,0.08)]">
                  <p className="eyebrow mb-3">Documents Salesforce</p>
                  <ul className="space-y-2">
                    {parsed.documents.map((doc, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] text-[#2C2C2E] font-light">
                        <span className="text-[#8A6F3D] mt-0.5">·</span>
                        {doc}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>

            <Section title="Profil de risque">
              <p className="font-display text-[22px] text-[#0B0B0C] leading-tight">
                {parsed.risk || 'Non défini'}
              </p>
              {parsed.allocation && (
                <p className="text-[13px] text-[#6B6B70] mt-3 font-light leading-relaxed">
                  Allocation crypto cible : <span className="text-[#0B0B0C]">{parsed.allocation}</span>
                </p>
              )}
            </Section>

            <Section title="Actions">
              <div className="space-y-3">
                <button
                  onClick={() => { setTab('wallets'); setShowCreate(true); }}
                  className="w-full text-left py-3 eyebrow text-[#0B0B0C] border-b border-[rgba(11,11,12,0.08)] hover:border-[#0B0B0C] transition-colors"
                >
                  Créer un portefeuille →
                </button>
                {client.website && (
                  <a
                    href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                    target="_blank" rel="noopener noreferrer"
                    className="block text-left py-3 eyebrow text-[#0B0B0C] border-b border-[rgba(11,11,12,0.08)] hover:border-[#0B0B0C] transition-colors"
                  >
                    Ouvrir le site internet ↗
                  </a>
                )}
              </div>
            </Section>

            <RiskConfigPanel client={client} />

            <Section title="Métadonnées">
              <dl className="space-y-4">
                <div>
                  <dt className="eyebrow mb-1">Identifiant Salesforce</dt>
                  <dd className="text-[12px] text-[#6B6B70] font-mono break-all">{client.id}</dd>
                </div>
                <div>
                  <dt className="eyebrow mb-1">Propriétaire</dt>
                  <dd className="text-[12px] text-[#6B6B70] font-mono break-all">{client.ownerId || '—'}</dd>
                </div>
                <div>
                  <dt className="eyebrow mb-1">Créé le</dt>
                  <dd className="text-[13px] text-[#2C2C2E] font-light">{fmtDate(client.createdDate)}</dd>
                </div>
              </dl>
            </Section>
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
            <div className="mb-10 py-5 px-6 border-l-2 border-[#8A4A1B] bg-[rgba(138,74,27,0.04)]">
              <p className="eyebrow text-[#8A4A1B] mb-1">Conformité</p>
              <p className="text-[14px] text-[#2C2C2E] font-light leading-relaxed">
                La création de portefeuilles et les transferts requièrent que le client soit éligible à la conservation.{' '}
                <button onClick={() => setTab('eligibility')} className="text-[#8A6F3D] underline underline-offset-4 hover:text-[#0B0B0C] transition-colors">
                  Voir l'éligibilité
                </button>
              </p>
            </div>
          )}

          {error && (
            <div className="mb-6 py-4 px-5 border-l-2 border-[#7A2424] bg-[rgba(122,36,36,0.04)]">
              <p className="eyebrow text-[#7A2424] mb-1">Erreur DFNS</p>
              <p className="text-[13px] text-[#7A2424] font-mono">{error}</p>
            </div>
          )}

          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="eyebrow mb-2">Custody opérationnelle</p>
              <h2 className="font-display text-[34px] leading-tight text-[#0B0B0C]">Portefeuilles</h2>
            </div>
            <Button
              variant="primary"
              onClick={() => setShowCreate(true)}
              disabled={client.Custody_Eligible__c !== true && !kycValid}
            >
              Créer un portefeuille
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><Spinner /></div>
          ) : wallets.length === 0 ? (
            <EmptyState
              title="Aucun portefeuille"
              description="Créez le premier portefeuille de ce client. La clé sera générée via DFNS, sous MPC."
            />
          ) : (
            <ul className="divide-y divide-[rgba(11,11,12,0.08)]">
              {wallets.map(w => {
                const n = net(w.network);
                const active = selectedWallet?.id === w.id;
                return (
                  <li key={w.id}>
                    <button
                      onClick={() => selectWallet(w)}
                      className="w-full text-left py-6 group transition-colors hover:bg-[rgba(11,11,12,0.015)] px-4 -mx-4"
                    >
                      <div className="flex items-baseline justify-between gap-6">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-3">
                            <p className={`font-display text-[22px] text-[#0B0B0C] leading-tight truncate ${active ? 'underline underline-offset-[6px] decoration-[#8A6F3D]' : ''}`}>
                              {w.name || n.name}
                            </p>
                            {frozenWallets[w.id] && <Badge variant="error">Gelé</Badge>}
                            <Badge variant={w.status === 'Active' ? 'success' : 'warning'}>{w.status}</Badge>
                          </div>
                          <p className="eyebrow mt-2">{n.name}</p>
                          <p className="mt-3 text-[12px] text-[#6B6B70] font-mono tabular">
                            {truncAddr(w.address, 10)}
                          </p>
                        </div>
                        <svg className="w-3 h-3 text-[#CFCFD1] group-hover:text-[#0B0B0C] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {selectedWallet && (
            <div className="mt-12 pt-12 border-t border-[rgba(11,11,12,0.08)]">
              <div className="flex items-end justify-between mb-8">
                <div>
                  <p className="eyebrow mb-2">Détail</p>
                  <h3 className="font-display text-[30px] leading-tight text-[#0B0B0C]">
                    {selectedWallet.name || 'Portefeuille'}
                  </h3>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowTransfer(true)}
                  disabled={client.Custody_Eligible__c !== true && !kycValid}
                >
                  Envoyer
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-10 mb-10">
                <div>
                  <p className="eyebrow mb-2">Adresse</p>
                  <p className="text-[12px] text-[#0B0B0C] font-mono break-all leading-relaxed">
                    {selectedWallet.address}
                  </p>
                </div>
                <Datum label="Réseau" value={net(selectedWallet.network).name} />
                <Datum
                  label="Valeur nette"
                  value={assets?.netWorth?.USD ? `$${assets.netWorth.USD.toLocaleString()}` : '—'}
                />
              </div>

              {assets?.assets?.length > 0 && (
                <>
                  <Rule className="mb-6">Actifs</Rule>
                  <ul className="divide-y divide-[rgba(11,11,12,0.08)]">
                    {assets.assets.map((a, i) => (
                      <li key={i} className="py-4 flex items-baseline justify-between">
                        <div className="flex items-baseline gap-4">
                          <span className="font-display text-[18px] text-[#0B0B0C]">{a.symbol}</span>
                          <span className="eyebrow">{a.kind}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-[15px] text-[#0B0B0C] tabular">{a.balance}</p>
                          {a.quotes?.USD && (
                            <p className="text-[11px] text-[#6B6B70] tabular mt-0.5">
                              ${a.quotes.USD.toLocaleString()}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="mt-10">
                <WalletFreezePanel
                  walletId={selectedWallet.id}
                  salesforceAccountId={client.id}
                  clientName={client.name || client.Name}
                />
              </div>
            </div>
          )}

          <div className="mt-16">
            <WhitelistPanel client={client} />
          </div>
        </div>
      )}

      {/* ══════════ TRANSFERS ══════════ */}
      {tab === 'transfers' && selectedWallet && (
        <div className="animate-fade">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="eyebrow mb-2">{selectedWallet.name}</p>
              <h2 className="font-display text-[34px] leading-tight text-[#0B0B0C]">Transferts</h2>
            </div>
            <Button variant="primary" onClick={() => setShowTransfer(true)}>Nouveau transfert</Button>
          </div>
          {history.length === 0 ? (
            <EmptyState title="Aucun transfert" description="L'historique du portefeuille apparaîtra ici." />
          ) : (
            <ul className="divide-y divide-[rgba(11,11,12,0.08)]">
              {history.map((tx, i) => (
                <li key={tx.id || i} className="py-5 grid grid-cols-12 gap-4 items-baseline">
                  <span className="col-span-2"><Badge variant={tx.direction === 'In' ? 'success' : 'info'}>{tx.direction || '—'}</Badge></span>
                  <span className="col-span-4 text-[12px] text-[#6B6B70] font-mono truncate">{truncAddr(tx.to || tx.from, 8)}</span>
                  <span className="col-span-2 text-right font-display text-[17px] text-[#0B0B0C] tabular">{tx.value || '—'}</span>
                  <span className="col-span-2"><Badge variant={tx.status === 'Confirmed' ? 'success' : 'warning'}>{tx.status || 'Pending'}</Badge></span>
                  <span className="col-span-2 text-[12px] text-[#6B6B70] text-right">
                    {tx.timestamp ? new Date(tx.timestamp).toLocaleDateString('fr-FR') : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'transfers' && !selectedWallet && (
        <div className="animate-fade">
          <EmptyState
            title="Sélectionnez un portefeuille"
            description="Choisissez un portefeuille dans l'onglet Portefeuilles pour consulter ses transferts."
          />
        </div>
      )}

      {/* ══════════ HISTORY ══════════ */}
      {tab === 'history' && (
        <div className="animate-fade">
          <div className="mb-10">
            <p className="eyebrow mb-2">Chronologie</p>
            <h2 className="font-display text-[34px] leading-tight text-[#0B0B0C]">Historique</h2>
          </div>
          {wallets.length === 0 ? (
            <EmptyState title="Aucun portefeuille" description="Créez un portefeuille pour voir son historique." />
          ) : (
            <ul className="divide-y divide-[rgba(11,11,12,0.08)]">
              {wallets.map(w => {
                const n = net(w.network);
                return (
                  <li key={w.id} className="py-6 flex items-baseline justify-between">
                    <div>
                      <p className="font-display text-[20px] text-[#0B0B0C] leading-tight">{w.name}</p>
                      <p className="text-[11px] text-[#6B6B70] font-mono mt-1">{truncAddr(w.address, 10)}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={w.status === 'Active' ? 'success' : 'default'}>{w.status}</Badge>
                      <p className="eyebrow mt-2">
                        {w.dateCreated ? new Date(w.dateCreated).toLocaleDateString('fr-FR') : ''}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ── Create Wallet Modal ─────────────────────────── */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Nouveau portefeuille"
        subtitle={`Le portefeuille sera lié au client ${client.name}. La clé privée est générée en MPC par DFNS.`}
      >
        <div className="space-y-8">
          <div>
            <label className={labelCls}>Nom</label>
            <input
              className={inputCls}
              placeholder="Portefeuille Ethereum principal"
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
              {SUPPORTED_NETWORKS.map(n => <option key={n.id} value={n.id}>{n.name} · {n.symbol}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Annuler</Button>
            <Button variant="primary" onClick={handleCreate} disabled={creating || !newWallet.name}>
              {creating ? 'Création…' : 'Créer'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Transfer Modal ──────────────────────────────── */}
      <Modal
        isOpen={showTransfer}
        onClose={() => setShowTransfer(false)}
        title="Envoyer des fonds"
        subtitle="La demande sera soumise à approbation selon le principe des quatre yeux."
      >
        <div className="space-y-8">
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
              type="number" step="any" placeholder="0,00"
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
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setShowTransfer(false)}>Annuler</Button>
            <Button variant="primary" onClick={handleTransfer} disabled={sending || !transfer.to || !transfer.amount}>
              {sending ? 'Envoi…' : 'Soumettre'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ─── Section — editorial block with eyebrow label ─── */
function Section({ title, children }) {
  return (
    <section>
      <div className="flex items-center gap-4 mb-6">
        <p className="eyebrow">{title}</p>
        <div className="flex-1 border-t border-[rgba(11,11,12,0.08)]" />
      </div>
      {children}
    </section>
  );
}
