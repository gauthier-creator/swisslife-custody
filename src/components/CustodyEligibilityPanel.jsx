import { useState, useEffect } from 'react';
import { Badge, Card, Modal, Spinner, Button, textareaCls, labelCls } from './shared';
import { getSalesforceStatus } from '../services/salesforceApi';
import { runAmlScreening } from '../services/kycService';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/constants';
import { supabase } from '../lib/supabase';
import CustodyContractModal from './CustodyContractModal';

/* ─────────────────────────────────────────────────────────
   CustodyEligibilityPanel — Editorial MiCA compliance dossier
   Hairline checklist · monochrome · bronze accent
   ───────────────────────────────────────────────────────── */

const kycVariant = (s) => {
  if (!s) return 'default';
  const k = s.toLowerCase();
  if (k === 'valide') return 'success';
  if (k === 'en cours') return 'warning';
  return 'error';
};

export default function CustodyEligibilityPanel({ client, onUpdate }) {
  const { isAdmin, session, profile } = useAuth();
  const currentEmail = profile?.email || session?.user?.email || null;
  const [showAdequacy, setShowAdequacy] = useState(false);
  const [showContract, setShowContract] = useState(false);
  const [adequacy, setAdequacy] = useState({ q1: null, q2: null, q3: null, q4: null, notes: '' });
  const [submittingAdequacy, setSubmittingAdequacy] = useState(false);
  const [signingLink, setSigningLink] = useState(null);
  const [adequacyLink, setAdequacyLink] = useState(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [adequacyLinkCopied, setAdequacyLinkCopied] = useState(false);

  // Salesforce deep-link (KYC is managed upstream by Swisslife teams in Salesforce)
  const [sfInstanceUrl, setSfInstanceUrl] = useState(null);
  useEffect(() => {
    let mounted = true;
    getSalesforceStatus().then(s => { if (mounted) setSfInstanceUrl(s?.instanceUrl || null); });
    return () => { mounted = false; };
  }, []);
  const salesforceDeepLink = sfInstanceUrl
    ? `${sfInstanceUrl.replace(/\/$/, '')}/lightning/r/Account/${client.id}/view`
    : null;

  // DFNS sanctions screening
  const [screening, setScreening] = useState(false);
  const [screeningResult, setScreeningResult] = useState(null);
  const [screeningError, setScreeningError] = useState(null);

  const isEligible = client.Custody_Eligible__c === true;

  const authHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
      : { 'Content-Type': 'application/json' };
  };

  const generateSigningLink = async () => {
    setGeneratingLink(true);
    try {
      const res = await fetch(`${API_BASE}/api/signing/generate`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          salesforceAccountId: client.id,
          clientName: client.name,
          clientEmail: client.email || null,
          clientStreet: client.street || null,
          clientCity: client.city || null,
          clientPostalCode: client.postalCode || null,
          clientCountry: client.country || null,
          clientPhone: client.phone || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur génération du lien');
      }
      const json = await res.json();
      setSigningLink(`${window.location.origin}/sign/${json.token}`);
    } catch (err) {
      alert('Erreur : ' + err.message);
    }
    setGeneratingLink(false);
  };

  const copyLink = () => {
    if (!signingLink) return;
    navigator.clipboard.writeText(signingLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const copyAdequacyLink = () => {
    if (!adequacyLink) return;
    navigator.clipboard.writeText(adequacyLink).then(() => {
      setAdequacyLinkCopied(true);
      setTimeout(() => setAdequacyLinkCopied(false), 2000);
    });
  };

  // Run ComplyCube AML screening (sanctions · PEP · adverse media)
  const runScreening = async () => {
    if (!client?.id) {
      setScreeningError('Client sans identifiant Salesforce — impossible de lancer le screening.');
      return;
    }
    setScreening(true);
    setScreeningError(null);
    setScreeningResult(null);
    try {
      const check = await runAmlScreening({
        salesforceAccountId: client.id,
        clientName: client.name,
        initiatedByEmail: currentEmail,
      });
      setScreeningResult(check);
      // Salesforce is patched server-side — refresh the parent so badges update.
      // Wrap in try/catch so a SFDC refresh failure doesn't hide the successful
      // screening result from the user.
      if (onUpdate) {
        try { await onUpdate(); }
        catch (e) { console.warn('[Screening] onUpdate refresh failed:', e.message); }
      }
    } catch (err) {
      console.error('[Screening] call failed:', err);
      setScreeningError(err.message || 'Echec du screening');
    } finally {
      setScreening(false);
    }
  };

  const openInSalesforce = () => {
    if (!salesforceDeepLink) return;
    window.open(salesforceDeepLink, '_blank', 'noopener,noreferrer');
  };

  // Génération du lien adéquation — plus de pré-remplissage banquier.
  // Le client répond lui-même aux 12 questions MiFID II et signe.
  // (Ancien comportement : banquier pré-remplissait 4 Oui/Non → non conforme
  // MiFID II Art. 25 qui exige que le test vienne du client.)
  const submitAdequacy = async () => {
    setSubmittingAdequacy(true);
    try {
      const res = await fetch(`${API_BASE}/api/signing/adequacy/generate`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          salesforceAccountId: client.id,
          clientName: client.name,
          clientStreet: client.street || null,
          clientCity: client.city || null,
          clientPostalCode: client.postalCode || null,
          clientCountry: client.country || null,
          clientPhone: client.phone || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur génération du lien');
      }
      const json = await res.json();
      setAdequacyLink(`${window.location.origin}/sign/adequacy/${json.token}`);
    } catch (err) {
      alert('Erreur : ' + err.message);
    }
    setSubmittingAdequacy(false);
  };

  const items = [
    {
      key: 'kyc',
      idx: 1,
      title: 'Vérification KYC',
      caption: 'Géré par les équipes Swisslife dans Salesforce · identité, domicile, origine des fonds',
      done: client.Custody_KYC_Status__c === 'Valide',
      action: (
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Badge variant={kycVariant(client.Custody_KYC_Status__c)} dot>
            {client.Custody_KYC_Status__c || 'Non renseigné'}
          </Badge>
          <Button
            size="sm"
            variant="secondary"
            onClick={openInSalesforce}
            disabled={!salesforceDeepLink}
            title={salesforceDeepLink || 'Salesforce non connecté'}
          >
            <svg className="w-[13px] h-[13px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Ouvrir dans Salesforce
          </Button>
        </div>
      ),
    },
    (() => {
      // Source de vérité = 1/ screeningResult local vient d'être posé
      //                    OU 2/ flag SFDC déjà positionné à true
      // Si le champ custom Custody_Sanctions_Clear__c n'existe pas dans
      // l'org SFDC, le PATCH server silencie mais le screeningResult local
      // reste autoritaire. Pas de régression UX.
      const screeningCleared = screeningResult?.status === 'complete' || client.Custody_Sanctions_Clear__c === true;
      const screeningFailed  = screeningResult?.status === 'failed';
      return {
        key: 'sanctions',
        idx: 2,
        title: 'Screening AML',
        caption: 'Listes OFAC, EU, ONU, UK HMT · PEP · adverse media — via ComplyCube',
        done: screeningCleared,
        action: (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Badge
              variant={
                screening ? 'warning' :
                screeningCleared ? 'success' :
                screeningFailed ? 'error' : 'default'
              }
              dot
            >
              {screening ? 'Analyse…' :
                screeningCleared ? 'Clear' :
                screeningFailed ? 'Alerte' : 'Non vérifié'}
            </Badge>
            {/* Screening ouvert à tous les banquiers : c'est une lecture OFAC
                non destructive. */}
            <Button
              size="sm"
              variant="secondary"
              onClick={runScreening}
              disabled={screening}
            >
              {screening && <Spinner />}
              {screeningCleared ? 'Relancer' : 'Lancer le screening'}
            </Button>
          </div>
        ),
        meta: (screeningResult || screeningError) && (
          <ScreeningReport check={screeningResult} error={screeningError} />
        ),
      };
    })(),
    {
      key: 'adequacy',
      idx: 3,
      title: "Évaluation d'adéquation",
      caption: 'Questionnaire MiFID II Art. 25 · MiCA Art. 66 · rempli et signé par le client',
      done: client.Custody_Adequacy_Done__c === true,
      action: (
        <div className="flex items-center gap-2">
          <Badge variant={client.Custody_Adequacy_Done__c ? 'success' : 'default'} dot>
            {client.Custody_Adequacy_Done__c ? 'Complétée' : 'Non réalisée'}
          </Badge>
          {!client.Custody_Adequacy_Done__c && (
            <Button size="sm" variant="secondary" onClick={submitAdequacy} disabled={submittingAdequacy}>
              {submittingAdequacy ? 'Génération…' : 'Générer le lien'}
            </Button>
          )}
        </div>
      ),
    },
    {
      key: 'contract',
      idx: 4,
      title: 'Contrat de conservation',
      caption: 'Convention signée · Art. 1367 C. civ.',
      done: client.Custody_Contract_Signed__c === true,
      action: (
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Badge variant={client.Custody_Contract_Signed__c ? 'success' : 'default'} dot>
            {client.Custody_Contract_Signed__c ? 'Signé' : 'Non signé'}
          </Badge>
          {!client.Custody_Contract_Signed__c && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setShowContract(true)}>
                Signer ici
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={generateSigningLink}
                disabled={generatingLink}
              >
                {generatingLink && <Spinner />}
                Envoyer au client
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const completedCount = items.filter(i => i.done).length;
  const progressPct = (completedCount / items.length) * 100;

  return (
    <div className="space-y-6">
      {/* ── Editorial header card ───────────────────────── */}
      <Card className="overflow-hidden">
        <div className="px-7 pt-7 pb-6 flex items-start justify-between gap-8 flex-wrap">
          <div className="min-w-0 max-w-2xl">
            <p className="text-eyebrow">Dossier de conformité · MiCA Art. 60</p>
            <h2 className="display-sm text-[#0A0A0A] mt-3">
              Éligibilité <span className="font-display italic text-[#7C5E3C]">conservation</span>
            </h2>
            <p className="mt-3 text-[14px] text-[#1E1E1E] leading-relaxed tracking-[-0.006em]">
              Quatre conditions impératives avant l'ouverture d'un portefeuille de
              conservation. Chaque étape est horodatée et auditée.
            </p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-eyebrow">Progression</p>
            <p className="text-[44px] font-medium text-[#0A0A0A] tabular-nums leading-none mt-3 tracking-[-0.035em]">
              {completedCount}<span className="text-[#BFBFBF]">/{items.length}</span>
            </p>
            <div className="mt-3 flex items-center gap-2 justify-end">
              <Badge variant={isEligible ? 'success' : 'default'} dot>
                {isEligible ? 'Éligible' : 'En attente'}
              </Badge>
              {client.Custody_Risk_Level__c && (
                <Badge variant={
                  client.Custody_Risk_Level__c === 'Faible' ? 'success' :
                  client.Custody_Risk_Level__c === 'Moyen' ? 'warning' : 'error'
                } dot>
                  Risque · {client.Custody_Risk_Level__c}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Refined progress bar */}
        <div className="px-7 pb-7">
          <div className="h-[3px] bg-[#F5F3EE] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${progressPct}%`,
                background: isEligible ? '#0A0A0A' : '#7C5E3C',
              }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-[#8A8278] tracking-[0.02em] uppercase font-medium">
            <span>{Math.round(progressPct)}% complété</span>
            <span>Audit temps-réel · Salesforce Cloud</span>
          </div>
        </div>
      </Card>

      {/* ── Conditional : Checklist (en cours) ou Dossier complet (4/4) ─── */}
      {isEligible ? (
        <EligibleDossierCard
          client={client}
          salesforceDeepLink={salesforceDeepLink}
          openInSalesforce={openInSalesforce}
          runScreening={runScreening}
          screening={screening}
          screeningResult={screeningResult}
          screeningError={screeningError}
        />
      ) : (
        <Card>
          <div className="px-7 py-5 border-b border-[#E7E7E7] flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-medium text-[#0A0A0A] tracking-[-0.015em]">Conditions réglementaires</h3>
              <p className="text-[12.5px] text-[#5D5D5D] mt-0.5 tracking-[-0.003em]">
                Checklist MiCA Art. 60 · chaque étape est horodatée et auditée
              </p>
            </div>
            <span className="text-[11px] text-[#8A8278] tracking-[0.04em] uppercase font-medium hidden md:block">
              {items.length} conditions
            </span>
          </div>
          <ul>
            {items.map((item, i) => (
              <li
                key={item.key}
                className={`px-7 py-5 ${i < items.length - 1 ? 'border-b border-[#E7E7E7]' : ''}`}
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="flex items-start gap-5 min-w-0 flex-1">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
                      style={item.done
                        ? { background: '#0A0A0A', color: '#FFFFFF' }
                        : { background: '#F5F3EE', color: '#6B6B6B', border: '1px solid rgba(10,10,10,0.06)' }
                      }
                    >
                      {item.done ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-[13px] font-medium tabular-nums">{item.idx}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <h4 className="text-[14.5px] font-medium text-[#0A0A0A] tracking-[-0.01em]">{item.title}</h4>
                      <p className="text-[13px] text-[#5D5D5D] mt-1 tracking-[-0.003em]">{item.caption}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 pt-0.5">{item.action}</div>
                </div>
                {item.meta && <div className="mt-4 pl-14">{item.meta}</div>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── Documents signés — uniquement quand PAS encore éligible, sinon
          c'est intégré dans EligibleDossierCard pour éviter la redondance. */}
      {!isEligible && (client.Custody_Contract_Signed__c || client.Custody_Adequacy_Done__c) && (
        <SignedDocumentsCard accountId={client.id} client={client} />
      )}

      {/* ── Signing link — contract ─────────────────────── */}
      {signingLink && (
        <SigningLinkCard
          title="Lien de signature du contrat"
          caption="Envoyez ce lien au client. Expiration dans 7 jours. Le PDF signé est automatiquement versé au dossier Salesforce."
          link={signingLink}
          copied={linkCopied}
          onCopy={copyLink}
        />
      )}

      {/* ── Signing link — adequacy ─────────────────────── */}
      {adequacyLink && (
        <SigningLinkCard
          title="Lien du questionnaire d'adéquation"
          caption="Le client consulte et signe le questionnaire pré-rempli. Le PDF est versé dans Salesforce."
          link={adequacyLink}
          copied={adequacyLinkCopied}
          onCopy={copyAdequacyLink}
        />
      )}

      {/* Plus de modal pré-remplissage adéquation — le client remplit
          lui-même le questionnaire MiFID II via le lien signé. */}

      {/* ── Contract Modal ──────────────────────────────── */}
      <CustodyContractModal
        isOpen={showContract}
        onClose={() => setShowContract(false)}
        client={client}
        onSigned={async () => { if (onUpdate) await onUpdate(); }}
      />
    </div>
  );
}

/* ─── Sub · signing link card ─── */
function SigningLinkCard({ title, caption, link, copied, onCopy }) {
  return (
    <Card className="px-7 py-6">
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-10 h-10 rounded-full bg-[#F5F3EE] border border-[#E7E7E7] flex items-center justify-center text-[#0A0A0A] flex-shrink-0">
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-medium text-[#0A0A0A] tracking-[-0.015em]">{title}</h3>
            <p className="text-[12.5px] text-[#5D5D5D] mt-1 max-w-xl leading-relaxed tracking-[-0.003em]">{caption}</p>
          </div>
        </div>
        <Badge variant="success" dot>Prêt</Badge>
      </div>
      <div className="flex items-center gap-2 p-2 bg-white border border-[#E7E7E7] rounded-[10px]">
        <div className="flex-1 min-w-0 text-[12px] text-[#0A0A0A] font-mono truncate px-3">
          {link}
        </div>
        <Button size="sm" variant={copied ? 'primary' : 'secondary'} onClick={onCopy}>
          {copied ? 'Copié ✓' : 'Copier'}
        </Button>
      </div>
    </Card>
  );
}

/* ─── Sub · ComplyCube AML screening report ─── */
function ScreeningReport({ check, error }) {
  if (error) {
    return (
      <div className="px-4 py-3 bg-white border border-[rgba(220,38,38,0.2)] rounded-[10px]">
        <p className="text-[12px] text-[#991B1B] tracking-[-0.003em]">
          <span className="font-medium">Erreur ComplyCube · </span>{error}
        </p>
      </div>
    );
  }
  if (!check) return null;

  const clear = check.status === 'complete';
  const screening = check.result?.screening || {};
  const sanctions = screening.sanctions || { matches: 0, lists: [] };
  const pep = screening.pep || { matches: 0 };
  const adverseMedia = screening.adverse_media || { matches: 0 };

  const categories = [
    { key: 'sanctions', label: 'Sanctions', n: sanctions.matches || 0, detail: sanctions.lists?.join(' · ') || 'OFAC · EU · UN · UK HMT' },
    { key: 'pep',       label: 'PEP',       n: pep.matches || 0,       detail: 'Personne politiquement exposée' },
    { key: 'media',     label: 'Adverse media', n: adverseMedia.matches || 0, detail: 'Presse · base Dow Jones' },
  ];

  const providerLabel = check.provider === 'demo' ? 'ComplyCube · mode sandbox' : 'ComplyCube · Screening API';

  return (
    <div
      className={`rounded-[12px] border overflow-hidden ${
        clear
          ? 'border-[#E7E7E7] bg-white'
          : 'border-[rgba(220,38,38,0.22)] bg-white'
      }`}
    >
      <div className="px-5 py-4 border-b border-[#E7E7E7] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
            style={clear ? { background: '#0A0A0A', color: '#fff' } : { background: '#FEF2F2', color: '#991B1B', border: '1px solid rgba(220,38,38,0.2)' }}
          >
            {clear ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#8A8278]">{providerLabel}</p>
            <p className="text-[14px] font-medium text-[#0A0A0A] tracking-[-0.01em] mt-0.5">
              {clear
                ? 'Aucune correspondance · dossier blanchi'
                : `${(sanctions.matches || 0) + (pep.matches || 0) + (adverseMedia.matches || 0)} correspondance(s) détectée(s)`}
            </p>
          </div>
        </div>
        <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#8A8278] tabular-nums whitespace-nowrap hidden sm:block">
          {check.created_at && new Date(check.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div>
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#8A8278] mb-2.5">Décomposition du screening</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {categories.map(c => (
              <div
                key={c.key}
                className={`px-3.5 py-3 rounded-[10px] border ${
                  c.n > 0
                    ? 'bg-[rgba(220,38,38,0.04)] border-[rgba(220,38,38,0.15)]'
                    : 'bg-white border-[#E7E7E7]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#5D5D5D]">{c.label}</p>
                  <span className={`text-[13px] font-medium tabular-nums ${c.n > 0 ? 'text-[#991B1B]' : 'text-[#0A0A0A]'}`}>
                    {c.n}
                  </span>
                </div>
                <p className="text-[11px] text-[#8A8278] tracking-[-0.003em] mt-1 leading-snug">{c.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {check.complycube_check_id && (
          <div className="flex items-center justify-between pt-3 border-t border-[#E7E7E7]">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#8A8278]">Référence ComplyCube</span>
            <span className="text-[11px] font-mono text-[#1E1E1E] truncate ml-4">{check.complycube_check_id}</span>
          </div>
        )}

        {!clear && (
          <p className="text-[11px] text-[#5D5D5D] leading-relaxed tracking-[-0.003em] pt-1">
            Une alerte de conformité a été créée dans le dashboard Tracfin. Revue manuelle requise avant ouverture du dossier.
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Sub · adequacy question ─── */
function AdequacyQuestion({ n, question, value, onChange }) {
  return (
    <div>
      <div className="flex items-start gap-3 mb-3">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#F5F3EE] border border-[#E7E7E7] text-[11px] font-medium text-[#1E1E1E] flex items-center justify-center tabular-nums mt-0.5">
          {n}
        </span>
        <p className="flex-1 text-[14px] text-[#0A0A0A] leading-relaxed tracking-[-0.006em]">{question}</p>
      </div>
      <div className="ml-9 flex gap-2">
        {['Oui', 'Non'].map(opt => {
          const active = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`h-9 px-5 text-[13px] font-medium rounded-full border transition-all tracking-[-0.01em] ${
                active
                  ? 'bg-[#0A0A0A] text-white border-[#0A0A0A]'
                  : 'bg-white text-[#5D5D5D] border-[rgba(10,10,10,0.1)] hover:bg-white hover:text-[#0A0A0A] hover:border-[rgba(10,10,10,0.2)]'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Sub · SignedDocumentsCard ───────────────────────────
   Liste les PDFs Custody attachés à l'Account Salesforce
   (contrat de conservation + questionnaire d'adéquation).
   Fetch via /api/sf-files, filtre par préfixe de nom.

   UX : une ligne par doc avec nom, date, taille, actions
   [Prévisualiser] [Télécharger] [Ouvrir dans Salesforce].
*/
/* ─── Sub · EligibleDossierCard ───────────────────────────
   Remplace la checklist quand client.Custody_Eligible__c = true
   (toutes les conditions MiCA 60 validées).
   4 actions en cards 2×2 :
     1. Ouvrir dans Salesforce
     2. Télécharger le contrat de conservation (PDF SFDC)
     3. Télécharger le questionnaire d'adéquation (PDF SFDC)
     4. Relancer le screening AML (Chainalysis + ComplyCube)
*/
function EligibleDossierCard({ client, salesforceDeepLink, openInSalesforce, runScreening, screening, screeningResult, screeningError }) {
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/sf-files/${client.id}`);
        const list = res.ok ? await res.json() : [];
        if (alive) setFiles(list || []);
      } catch {
        if (alive) setFiles([]);
      }
      if (alive) setLoadingFiles(false);
    })();
    return () => { alive = false; };
  }, [client.id, client?.Custody_Contract_Signed__c, client?.Custody_Adequacy_Done__c]);

  // Détection par préfixe de nom de fichier
  const contractFile = files.find(f => String(f.title || '').toLowerCase().startsWith('contrat_custody_'));
  const adequacyFile = files.find(f => {
    const t = String(f.title || '').toLowerCase();
    return t.startsWith('adequation_mifid_') || t.startsWith('adequation_custody_');
  });

  return (
    <Card className="overflow-hidden">
      <div className="px-7 py-5 border-b border-[#E7E7E7] flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-eyebrow">Dossier complet · MiCA Art. 60 validé</p>
          <h3 className="text-[15px] font-medium text-[#0A0A0A] tracking-[-0.015em] mt-1.5">
            Documents <span className="font-display italic text-[#7C5E3C]">& actions</span>
          </h3>
          <p className="text-[12.5px] text-[#5D5D5D] mt-1 tracking-[-0.003em] max-w-[58ch]">
            Le client est éligible à la conservation. Retrouve ici ses pièces signées
            et relance les contrôles de conformité.
          </p>
        </div>
        <Badge variant="success" dot>Éligible</Badge>
      </div>
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* ① Salesforce */}
        <DossierCard
          tone="ink"
          title="Fiche Salesforce"
          caption="Voir l'Account complet dans le CRM — conformité, activité, contacts."
          icon={(
            <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          )}
          primaryLabel="Ouvrir dans Salesforce"
          primaryOnClick={openInSalesforce}
          primaryDisabled={!salesforceDeepLink}
        />

        {/* ② Contrat de conservation */}
        <DossierCard
          tone="bronze"
          title="Contrat de conservation"
          caption={contractFile
            ? `Signé le ${new Date(contractFile.createdDate).toLocaleDateString('fr-FR')}`
            : 'PDF introuvable dans Salesforce · re-signer ?'}
          icon={(
            <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
          primaryLabel={contractFile ? 'Télécharger' : 'Indisponible'}
          primaryHref={contractFile ? `${API_BASE}/api/sf-files/download/${contractFile.versionId}` : null}
          primaryDownload={contractFile?.title}
          primaryDisabled={!contractFile || loadingFiles}
        />

        {/* ③ Questionnaire d'adéquation */}
        <DossierCard
          tone="bronze"
          title="Questionnaire d'adéquation"
          caption={adequacyFile
            ? `Signé le ${new Date(adequacyFile.createdDate).toLocaleDateString('fr-FR')}`
            : 'PDF introuvable dans Salesforce'}
          icon={(
            <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          )}
          primaryLabel={adequacyFile ? 'Télécharger' : 'Indisponible'}
          primaryHref={adequacyFile ? `${API_BASE}/api/sf-files/download/${adequacyFile.versionId}` : null}
          primaryDownload={adequacyFile?.title}
          primaryDisabled={!adequacyFile || loadingFiles}
        />

        {/* ④ Screening AML */}
        <DossierCard
          tone="cream"
          title="Screening AML"
          caption={screening
            ? 'En cours — Chainalysis + ComplyCube…'
            : screeningResult?.status === 'complete'
              ? 'Dernier screening : clean'
              : screeningResult?.status === 'failed'
                ? 'Dernier screening : match détecté'
                : 'Relancer pour vérifier les listes sanctions + adverse media'}
          icon={(
            <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          )}
          primaryLabel={screening ? 'Screening en cours…' : 'Lancer le screening'}
          primaryOnClick={runScreening}
          primaryDisabled={screening}
        />
      </div>
      {screeningError && (
        <div className="mx-5 mb-5 px-4 py-3 bg-[#FEF2F2] border border-[rgba(220,38,38,0.2)] rounded-[8px]">
          <p className="text-[12px] text-[#991B1B]">{screeningError}</p>
        </div>
      )}
    </Card>
  );
}

/* Petit tile réutilisable pour EligibleDossierCard. */
function DossierCard({ tone, title, caption, icon, primaryLabel, primaryOnClick, primaryHref, primaryDownload, primaryDisabled }) {
  const toneStyles = {
    ink:    { iconBg: '#0A0A0A',  iconFg: '#FFFFFF' },
    bronze: { iconBg: '#F5EEE0',  iconFg: '#7C5E3C' },
    cream:  { iconBg: '#FDFBF6',  iconFg: '#7C5E3C' },
  }[tone] || { iconBg: '#F5F3EE', iconFg: '#1E1E1E' };

  const btnDisabled = !!primaryDisabled;

  return (
    <div className="bg-white border border-[#E7E7E7] rounded-[10px] p-5 flex flex-col gap-4 hover:border-[#D1D5DB] transition-colors">
      <div className="flex items-start gap-3">
        <span
          className="flex-shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center"
          style={{ background: toneStyles.iconBg, color: toneStyles.iconFg }}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-[#0A0A0A] tracking-[-0.006em]">{title}</p>
          <p className="text-[12px] text-[#5D5D5D] mt-0.5 tracking-[-0.003em] leading-[1.5]">{caption}</p>
        </div>
      </div>
      {primaryHref ? (
        <a
          href={btnDisabled ? undefined : primaryHref}
          {...(primaryDownload ? { download: primaryDownload } : {})}
          target={primaryDownload ? undefined : '_blank'}
          rel="noopener noreferrer"
          aria-disabled={btnDisabled}
          className={`w-full inline-flex items-center justify-center gap-2 h-9 rounded-[6px] text-[12.5px] font-semibold transition-colors ${
            btnDisabled
              ? 'bg-[#F5F3EE] text-[#8A8278] cursor-not-allowed'
              : 'bg-[#1E1E1E] text-white hover:bg-black'
          }`}
        >
          {primaryLabel}
        </a>
      ) : (
        <button
          type="button"
          onClick={primaryOnClick}
          disabled={btnDisabled}
          className={`w-full inline-flex items-center justify-center gap-2 h-9 rounded-[6px] text-[12.5px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            btnDisabled
              ? 'bg-[#F5F3EE] text-[#8A8278]'
              : 'bg-[#1E1E1E] text-white hover:bg-black'
          }`}
        >
          {primaryLabel}
        </button>
      )}
    </div>
  );
}

function SignedDocumentsCard({ accountId, client }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/sf-files/${accountId}`);
        if (!res.ok) throw new Error('Impossible de charger les documents');
        const list = await res.json();
        if (!alive) return;
        // Garde uniquement les PDFs Custody (contrat + adéquation)
        const custodyFiles = (list || []).filter(f => {
          const title = String(f.title || '').toLowerCase();
          return title.startsWith('contrat_custody_')
              || title.startsWith('adequation_custody_')    // ancien format
              || title.startsWith('adequation_mifid_');
        });
        setFiles(custodyFiles);
      } catch (err) {
        if (alive) setError(err.message);
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [accountId, client?.Custody_Contract_Signed__c, client?.Custody_Adequacy_Done__c]);

  const docType = (title) => {
    const t = String(title || '').toLowerCase();
    if (t.includes('contrat')) return { label: 'Contrat de conservation', icon: 'scroll', tone: 'ink' };
    if (t.includes('adequation') || t.includes('adequation_mifid')) return { label: "Questionnaire d'adéquation MiFID II", icon: 'clipboard', tone: 'bronze' };
    return { label: title, icon: 'file', tone: 'ink' };
  };

  const fmtSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const fmtDate = (iso) => iso
    ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  const openInSfdc = (contentDocumentId) => {
    // URL pattern Lightning : /lightning/r/ContentDocument/<id>/view
    // Fonctionne uniquement si l'utilisateur est aussi loggué dans SFDC.
    window.open(`https://orgfarm-1ab2feb35a-dev-ed.develop.lightning.force.com/lightning/r/ContentDocument/${contentDocumentId}/view`, '_blank');
  };

  return (
    <Card className="overflow-hidden">
      <div className="px-7 py-5 border-b border-[#E7E7E7] flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-eyebrow">Documents signés</p>
          <h3 className="text-[15px] font-medium text-[#0A0A0A] tracking-[-0.015em] mt-1.5">
            Pièces <span className="font-display italic text-[#7C5E3C]">conformité</span>
          </h3>
          <p className="text-[12.5px] text-[#5D5D5D] mt-1 tracking-[-0.003em]">
            Versés automatiquement dans le dossier Salesforce du client · archivage 5 ans
          </p>
        </div>
        <span className="text-[11px] text-[#8A8278] font-medium uppercase tracking-[0.08em] tabular-nums">
          {files.length} document{files.length > 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div className="px-7 py-8 flex items-center gap-2 text-[13px] text-[#5D5D5D]">
          <Spinner /> Chargement des documents…
        </div>
      ) : error ? (
        <div className="px-7 py-5 text-[13px] text-[#991B1B]">{error}</div>
      ) : files.length === 0 ? (
        <div className="px-7 py-6 text-[13px] text-[#5D5D5D]">
          Aucun document trouvé. Les PDFs apparaissent ici dès qu'un contrat ou un questionnaire est signé.
        </div>
      ) : (
        <ul className="divide-y divide-[#E7E7E7]">
          {files.map(f => {
            const info = docType(f.title);
            const downloadUrl = `${API_BASE}/api/sf-files/download/${f.versionId}`;
            return (
              <li key={f.id} className="px-7 py-5 flex items-center gap-5 flex-wrap">
                <div
                  className={`flex-shrink-0 w-11 h-11 rounded-[10px] flex items-center justify-center border ${
                    info.tone === 'bronze'
                      ? 'bg-[#F5EEE0] border-[rgba(124,94,60,0.22)] text-[#7C5E3C]'
                      : 'bg-[#F5F3EE] border-[rgba(10,10,10,0.06)] text-[#0A0A0A]'
                  }`}
                >
                  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-[#0A0A0A] tracking-[-0.01em] truncate">{info.label}</p>
                  <p className="text-[12px] text-[#8A8278] mt-0.5 tracking-[-0.003em]">
                    <span className="font-mono">{f.title}</span>
                    <span className="mx-2">·</span>
                    <span>{fmtDate(f.createdDate)}</span>
                    <span className="mx-2">·</span>
                    <span className="tabular-nums">{fmtSize(f.size)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center h-8 px-3 rounded-[6px] text-[12.5px] font-semibold text-[#5D5D5D] hover:text-[#1E1E1E] hover:bg-[#FDFBF6] transition-colors"
                    title="Prévisualiser le PDF"
                  >
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Prévisualiser
                  </a>
                  <a
                    href={downloadUrl}
                    download={f.title}
                    className="inline-flex items-center h-8 px-3 rounded-[6px] bg-[#1E1E1E] text-white text-[12.5px] font-semibold hover:bg-[#000] transition-colors"
                    title="Télécharger le PDF"
                  >
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                    </svg>
                    Télécharger
                  </a>
                  <button
                    onClick={() => openInSfdc(f.id)}
                    className="inline-flex items-center h-8 w-8 justify-center rounded-[6px] text-[#5D5D5D] hover:text-[#1E1E1E] hover:bg-[#FDFBF6] transition-colors"
                    title="Ouvrir dans Salesforce"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
