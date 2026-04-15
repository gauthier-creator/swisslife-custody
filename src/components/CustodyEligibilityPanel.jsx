import { useState } from 'react';
import { Badge, Card, Modal, Spinner, Button, IconPill, inputCls, textareaCls, labelCls, selectCls } from './shared';
import { updateAccountFields } from '../services/salesforceApi';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/constants';
import { supabase } from '../lib/supabase';
import CustodyContractModal from './CustodyContractModal';

/* ─────────────────────────────────────────────────────────
   CustodyEligibilityPanel — Linear-style checklist card
   Four conditions, one verdict, tight density.
   ───────────────────────────────────────────────────────── */

const KYC_STATUSES = ['Valide', 'En cours', 'Non verifie', 'Expire'];

const kycVariant = (s) => {
  if (!s) return 'default';
  const k = s.toLowerCase();
  if (k === 'valide') return 'success';
  if (k === 'en cours') return 'warning';
  return 'error';
};

export default function CustodyEligibilityPanel({ client, onUpdate }) {
  const { isAdmin } = useAuth();
  const [updating, setUpdating] = useState(null);
  const [showAdequacy, setShowAdequacy] = useState(false);
  const [showContract, setShowContract] = useState(false);
  const [adequacy, setAdequacy] = useState({ q1: null, q2: null, q3: null, q4: null, notes: '' });
  const [submittingAdequacy, setSubmittingAdequacy] = useState(false);
  const [signingLink, setSigningLink] = useState(null);
  const [adequacyLink, setAdequacyLink] = useState(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [adequacyLinkCopied, setAdequacyLinkCopied] = useState(false);

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

  const updateField = async (fields) => {
    const fieldName = Object.keys(fields)[0];
    setUpdating(fieldName);
    try {
      await updateAccountFields(client.id, fields);
      if (onUpdate) await onUpdate();
    } catch (err) {
      alert('Erreur Salesforce : ' + err.message);
    }
    setUpdating(null);
  };

  const toggleSanctions = () => updateField({ Custody_Sanctions_Clear__c: !client.Custody_Sanctions_Clear__c });
  const changeKycStatus = (newStatus) => updateField({ Custody_KYC_Status__c: newStatus });

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
      caption: 'Identité, domicile, origine des fonds',
      done: client.Custody_KYC_Status__c === 'Valide',
      action: (
        <div className="flex items-center gap-2">
          <Badge variant={kycVariant(client.Custody_KYC_Status__c)} dot>
            {client.Custody_KYC_Status__c || 'Non renseigné'}
          </Badge>
          {isAdmin && (
            <select
              className="h-8 text-[13px] font-medium bg-white border border-[rgba(25,28,31,0.1)] rounded-lg px-2.5 outline-none focus:border-[#0666EB] focus:ring-4 focus:ring-[rgba(6,102,235,0.1)] cursor-pointer"
              value={client.Custody_KYC_Status__c || ''}
              onChange={(e) => changeKycStatus(e.target.value)}
              disabled={updating === 'Custody_KYC_Status__c'}
            >
              <option value="" disabled>Modifier…</option>
              {KYC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {updating === 'Custody_KYC_Status__c' && <Spinner />}
        </div>
      ),
    },
    {
      key: 'sanctions',
      idx: 2,
      title: 'Screening sanctions',
      caption: 'Listes EU, ONU, OFAC · adverse media',
      done: client.Custody_Sanctions_Clear__c === true,
      action: (
        <div className="flex items-center gap-2">
          <Badge variant={client.Custody_Sanctions_Clear__c ? 'success' : 'error'} dot>
            {client.Custody_Sanctions_Clear__c ? 'Clear' : 'Non vérifié'}
          </Badge>
          {isAdmin && (
            <Button
              size="sm"
              variant={client.Custody_Sanctions_Clear__c ? 'ghost' : 'secondary'}
              onClick={toggleSanctions}
              disabled={updating === 'Custody_Sanctions_Clear__c'}
            >
              {updating === 'Custody_Sanctions_Clear__c' && <Spinner />}
              {client.Custody_Sanctions_Clear__c ? 'Révoquer' : 'Valider'}
            </Button>
          )}
        </div>
      ),
    },
    {
      key: 'adequacy',
      idx: 3,
      title: 'Évaluation d\'adéquation',
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

  return (
    <div className="space-y-5">
      {/* ── Header card ─────────────────────────────────── */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex items-start gap-4">
            <IconPill tone={isEligible ? 'green' : 'amber'} size={48}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </IconPill>
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 className="text-[20px] font-semibold text-[#191C1F] tracking-[-0.3px]">Éligibilité conservation</h2>
                <Badge variant={isEligible ? 'success' : 'default'} dot>
                  {isEligible ? 'Éligible' : 'En attente'}
                </Badge>
              </div>
              <p className="text-[13px] text-[#75808A] max-w-xl leading-relaxed">
                Conformité MiCA Art. 60 · quatre conditions doivent être satisfaites avant l'ouverture d'un portefeuille de conservation.
              </p>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[12px] font-medium text-[#75808A] uppercase tracking-wider">Progression</p>
            <p className="text-[32px] font-semibold text-[#191C1F] tabular-nums leading-none mt-1 tracking-[-0.6px]">
              {completedCount}<span className="text-[#A5ADB6]">/{items.length}</span>
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-5 h-2 bg-[#F1F3F6] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${(completedCount / items.length) * 100}%`,
              background: isEligible ? '#00BE90' : 'linear-gradient(90deg, #0666EB 0%, #4F56F1 100%)',
            }}
          />
        </div>

        {client.Custody_Risk_Level__c && (
          <div className="mt-5 pt-5 border-t border-[rgba(25,28,31,0.06)] flex items-center gap-2">
            <p className="text-[11px] font-semibold text-[#75808A] uppercase tracking-wider">Niveau de risque</p>
            <Badge variant={
              client.Custody_Risk_Level__c === 'Faible' ? 'success' :
              client.Custody_Risk_Level__c === 'Moyen' ? 'warning' : 'error'
            } dot>
              {client.Custody_Risk_Level__c}
            </Badge>
          </div>
        )}
      </Card>

      {/* ── Checklist card ──────────────────────────────── */}
      <Card>
        <div className="px-5 py-4 border-b border-[rgba(25,28,31,0.06)]">
          <h3 className="text-[15px] font-semibold text-[#191C1F] tracking-[-0.15px]">Conditions</h3>
          <p className="text-[13px] text-[#75808A] mt-0.5">Checklist MiCA Art. 60 — chaque étape est auditée</p>
        </div>
        <ul>
          {items.map((item, i) => (
            <li
              key={item.key}
              className={`px-5 py-4 flex items-start justify-between gap-4 ${i < items.length - 1 ? 'border-b border-[rgba(25,28,31,0.06)]' : ''}`}
            >
              <div className="flex items-start gap-4 min-w-0 flex-1">
                {/* Check indicator */}
                {item.done ? (
                  <IconPill tone="green" size={36}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </IconPill>
                ) : (
                  <IconPill tone="gray" size={36}>
                    <span className="text-[13px] font-bold tabular-nums">{item.idx}</span>
                  </IconPill>
                )}
                <div className="min-w-0 flex-1 pt-1">
                  <h4 className="text-[14px] font-semibold text-[#191C1F] tracking-[-0.1px]">{item.title}</h4>
                  <p className="text-[13px] text-[#75808A] mt-0.5">{item.caption}</p>
                </div>
              </div>
              <div className="flex-shrink-0 pt-1">{item.action}</div>
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
        subtitle="Article 66 du règlement MiCA. Préparez le questionnaire ; le client le signera via un lien dédié."
        maxWidth="max-w-xl"
      >
        <div className="space-y-5">
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
            <div className="px-4 py-3 bg-[#FDECEE] border border-[rgba(236,76,90,0.2)] rounded-xl">
              <p className="text-[13px] text-[#C93545] leading-relaxed">
                Toutes les réponses doivent être « Oui » pour proposer la conservation. Si le client ne remplit pas les conditions, le service ne peut pas lui être offert.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-[rgba(25,28,31,0.06)]">
            <Button variant="ghost" onClick={() => setShowAdequacy(false)}>Annuler</Button>
            <Button
              variant="accent"
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
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3">
          <IconPill tone="green" size={40}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </IconPill>
          <div>
            <h3 className="text-[15px] font-semibold text-[#191C1F] tracking-[-0.15px]">{title}</h3>
            <p className="text-[13px] text-[#75808A] mt-1 max-w-xl leading-relaxed">{caption}</p>
          </div>
        </div>
        <Badge variant="success" dot>Prêt</Badge>
      </div>
      <div className="flex items-center gap-2 mt-3 p-2 bg-[#F7F8FA] border border-[rgba(25,28,31,0.06)] rounded-xl">
        <div className="flex-1 min-w-0 text-[12px] text-[#191C1F] font-mono truncate px-3">
          {link}
        </div>
        <Button size="sm" variant={copied ? 'accent' : 'secondary'} onClick={onCopy}>
          {copied ? 'Copié ✓' : 'Copier'}
        </Button>
      </div>
    </Card>
  );
}

/* ─── Sub · adequacy question ─── */
function AdequacyQuestion({ n, question, value, onChange }) {
  return (
    <div>
      <div className="flex items-start gap-3 mb-3">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#F1F3F6] text-[12px] font-bold text-[#52585F] flex items-center justify-center tabular-nums mt-0.5">
          {n}
        </span>
        <p className="flex-1 text-[14px] text-[#191C1F] leading-relaxed">{question}</p>
      </div>
      <div className="ml-9 flex gap-2">
        {['Oui', 'Non'].map(opt => {
          const active = value === opt;
          const isOui = opt === 'Oui';
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`h-9 px-4 text-[13px] font-semibold rounded-xl border transition-all tracking-[-0.1px] ${
                active
                  ? isOui
                    ? 'bg-[#E6F9F2] text-[#008266] border-[rgba(0,190,144,0.3)]'
                    : 'bg-[#FDECEE] text-[#C93545] border-[rgba(236,76,90,0.3)]'
                  : 'bg-white text-[#75808A] border-[rgba(25,28,31,0.1)] hover:bg-[#F7F8FA] hover:text-[#191C1F]'
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
