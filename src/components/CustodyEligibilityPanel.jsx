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
      // Salesforce is patched server-side — refresh the parent so badges update
      if (onUpdate) await onUpdate();
    } catch (err) {
      setScreeningError(err.message || 'Echec du screening');
    } finally {
      setScreening(false);
    }
  };

  const openInSalesforce = () => {
    if (!salesforceDeepLink) return;
    window.open(salesforceDeepLink, '_blank', 'noopener,noreferrer');
  };

  const allAdequacyOui = adequacy.q1 === 'Oui' && adequacy.q2 === 'Oui' && adequacy.q3 === 'Oui' && adequacy.q4 === 'Oui';

  const submitAdequacy = async () => {
    if (!allAdequacyOui) return;
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
          assessment: adequacy,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur génération du lien');
      }
      const json = await res.json();
      setAdequacyLink(`${window.location.origin}/sign/adequacy/${json.token}`);
      setShowAdequacy(false);
      setAdequacy({ q1: null, q2: null, q3: null, q4: null, notes: '' });
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
    {
      key: 'sanctions',
      idx: 2,
      title: 'Screening AML',
      caption: 'Listes OFAC, EU, ONU, UK HMT · PEP · adverse media — via ComplyCube',
      done: client.Custody_Sanctions_Clear__c === true,
      action: (
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Badge
            variant={
              screening ? 'warning' :
              client.Custody_Sanctions_Clear__c ? 'success' :
              screeningResult && screeningResult.status === 'failed' ? 'error' : 'default'
            }
            dot
          >
            {screening ? 'Analyse…' :
              client.Custody_Sanctions_Clear__c ? 'Clear' :
              screeningResult && screeningResult.status === 'failed' ? 'Alerte' : 'Non vérifié'}
          </Badge>
          {isAdmin && (
            <Button
              size="sm"
              variant="secondary"
              onClick={runScreening}
              disabled={screening}
            >
              {screening && <Spinner />}
              {client.Custody_Sanctions_Clear__c ? 'Relancer' : 'Lancer le screening'}
            </Button>
          )}
        </div>
      ),
      meta: (screeningResult || screeningError) && (
        <ScreeningReport check={screeningResult} error={screeningError} />
      ),
    },
    {
      key: 'adequacy',
      idx: 3,
      title: "Évaluation d'adéquation",
      caption: 'Questionnaire MiCA Art. 66 · signé par le client',
      done: client.Custody_Adequacy_Done__c === true,
      action: (
        <div className="flex items-center gap-2">
          <Badge variant={client.Custody_Adequacy_Done__c ? 'success' : 'default'} dot>
            {client.Custody_Adequacy_Done__c ? 'Complétée' : 'Non réalisée'}
          </Badge>
          {!client.Custody_Adequacy_Done__c && (
            <Button size="sm" variant="secondary" onClick={() => setShowAdequacy(true)}>
              Lancer
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

      {/* ── Checklist card ──────────────────────────────── */}
      <Card>
        <div className="px-7 py-5 border-b border-[#E9E4D9] flex items-center justify-between">
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
              className={`px-7 py-5 ${i < items.length - 1 ? 'border-b border-[#E9E4D9]' : ''}`}
            >
              <div className="flex items-start justify-between gap-6">
                <div className="flex items-start gap-5 min-w-0 flex-1">
                  {/* Check indicator */}
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

      {/* ── Adequacy Modal ──────────────────────────────── */}
      <Modal
        isOpen={showAdequacy}
        onClose={() => setShowAdequacy(false)}
        title="Questionnaire d'adéquation"
        subtitle="Article 66 du règlement MiCA. Préparez le questionnaire ; le client le signera via un lien dédié et horodaté."
        maxWidth="max-w-xl"
      >
        <div className="space-y-6">
          <AdequacyQuestion
            n={1}
            question="Le client comprend-il la nature volatile des actifs numériques ?"
            value={adequacy.q1}
            onChange={(v) => setAdequacy(p => ({ ...p, q1: v }))}
          />
          <AdequacyQuestion
            n={2}
            question="A-t-il une expérience préalable avec les cryptomonnaies ?"
            value={adequacy.q2}
            onChange={(v) => setAdequacy(p => ({ ...p, q2: v }))}
          />
          <AdequacyQuestion
            n={3}
            question="L'allocation envisagée est-elle cohérente avec son profil de risque ?"
            value={adequacy.q3}
            onChange={(v) => setAdequacy(p => ({ ...p, q3: v }))}
          />
          <AdequacyQuestion
            n={4}
            question="A-t-il été informé des risques de perte en capital ?"
            value={adequacy.q4}
            onChange={(v) => setAdequacy(p => ({ ...p, q4: v }))}
          />

          <div>
            <label className={labelCls}>Notes complémentaires</label>
            <textarea
              className={textareaCls + ' min-h-[70px]'}
              placeholder="Observations, remarques…"
              value={adequacy.notes}
              onChange={(e) => setAdequacy(p => ({ ...p, notes: e.target.value }))}
            />
          </div>

          {!allAdequacyOui && adequacy.q1 !== null && (
            <div className="px-4 py-3.5 bg-white border border-[rgba(220,38,38,0.2)] rounded-[10px]">
              <p className="text-[12.5px] text-[#991B1B] leading-relaxed tracking-[-0.003em]">
                Toutes les réponses doivent être « Oui » pour proposer la conservation. Si le client ne remplit pas les conditions, le service ne peut pas lui être offert.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-5 border-t border-[#E9E4D9]">
            <Button variant="ghost" onClick={() => setShowAdequacy(false)}>Annuler</Button>
            <Button
              variant="primary"
              onClick={submitAdequacy}
              disabled={!allAdequacyOui || submittingAdequacy}
            >
              {submittingAdequacy && <Spinner />}
              {submittingAdequacy ? 'Génération…' : 'Générer le lien client'}
            </Button>
          </div>
        </div>
      </Modal>

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
          <div className="w-10 h-10 rounded-full bg-[#F5F3EE] border border-[#E9E4D9] flex items-center justify-center text-[#0A0A0A] flex-shrink-0">
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
      <div className="flex items-center gap-2 p-2 bg-white border border-[#E9E4D9] rounded-[10px]">
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
          ? 'border-[#E9E4D9] bg-white'
          : 'border-[rgba(220,38,38,0.22)] bg-white'
      }`}
    >
      <div className="px-5 py-4 border-b border-[#E9E4D9] flex items-center justify-between gap-4">
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
                    : 'bg-white border-[#E9E4D9]'
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
          <div className="flex items-center justify-between pt-3 border-t border-[#E9E4D9]">
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
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#F5F3EE] border border-[#E9E4D9] text-[11px] font-medium text-[#1E1E1E] flex items-center justify-center tabular-nums mt-0.5">
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
