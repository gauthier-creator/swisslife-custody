import { useState } from 'react';
import { Badge, Modal, Spinner, Button, Rule, inputCls, labelCls } from './shared';
import { updateAccountFields } from '../services/salesforceApi';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/constants';
import { supabase } from '../lib/supabase';
import CustodyContractModal from './CustodyContractModal';

/* ─────────────────────────────────────────────────────────
   Eligibility — the critical workflow, set as a ledger
   Four conditions. One verdict. Patiently laid out.
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
  const { user, isAdmin } = useAuth();
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
      roman: 'I',
      title: 'Vérification KYC',
      caption: 'Identité, domicile, origine des fonds.',
      done: client.Custody_KYC_Status__c === 'Valide',
      action: (
        <div className="flex items-center gap-3">
          <Badge variant={kycVariant(client.Custody_KYC_Status__c)}>
            {client.Custody_KYC_Status__c || 'Non renseigné'}
          </Badge>
          {isAdmin && (
            <select
              className="text-[12px] bg-transparent border-0 border-b border-[rgba(11,11,12,0.16)] focus:border-[#0B0B0C] py-1 outline-none cursor-pointer"
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
      roman: 'II',
      title: 'Screening sanctions',
      caption: 'Listes EU, ONU, OFAC. Screening adverse media.',
      done: client.Custody_Sanctions_Clear__c === true,
      action: (
        <div className="flex items-center gap-3">
          <Badge variant={client.Custody_Sanctions_Clear__c ? 'success' : 'error'}>
            {client.Custody_Sanctions_Clear__c ? 'Clear' : 'Non vérifié'}
          </Badge>
          {isAdmin && (
            <button
              onClick={toggleSanctions}
              disabled={updating === 'Custody_Sanctions_Clear__c'}
              className="eyebrow text-[#8A6F3D] hover:text-[#0B0B0C] transition-colors"
            >
              {client.Custody_Sanctions_Clear__c ? 'Révoquer' : 'Valider'}
            </button>
          )}
          {updating === 'Custody_Sanctions_Clear__c' && <Spinner />}
        </div>
      ),
    },
    {
      key: 'adequacy',
      roman: 'III',
      title: 'Évaluation d\'adéquation',
      caption: 'Questionnaire MiCA Art. 66 · signé par le client.',
      done: client.Custody_Adequacy_Done__c === true,
      action: (
        <div className="flex items-center gap-4">
          <Badge variant={client.Custody_Adequacy_Done__c ? 'success' : 'default'}>
            {client.Custody_Adequacy_Done__c ? 'Complétée' : 'Non réalisée'}
          </Badge>
          {!client.Custody_Adequacy_Done__c && (
            <button
              onClick={() => setShowAdequacy(true)}
              className="eyebrow text-[#8A6F3D] hover:text-[#0B0B0C] transition-colors"
            >
              Lancer →
            </button>
          )}
        </div>
      ),
    },
    {
      key: 'contract',
      roman: 'IV',
      title: 'Contrat de conservation',
      caption: 'Convention signée par le client · Art. 1367 C. civ.',
      done: client.Custody_Contract_Signed__c === true,
      action: (
        <div className="flex items-center gap-4 flex-wrap">
          <Badge variant={client.Custody_Contract_Signed__c ? 'success' : 'default'}>
            {client.Custody_Contract_Signed__c ? 'Signé' : 'Non signé'}
          </Badge>
          {!client.Custody_Contract_Signed__c && (
            <>
              <button
                onClick={() => setShowContract(true)}
                className="eyebrow text-[#8A6F3D] hover:text-[#0B0B0C] transition-colors"
              >
                Signer ici
              </button>
              <span className="eyebrow text-[#CFCFD1]">·</span>
              <button
                onClick={generateSigningLink}
                disabled={generatingLink}
                className="eyebrow text-[#8A6F3D] hover:text-[#0B0B0C] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {generatingLink && <Spinner size="w-3 h-3" />}
                Envoyer au client →
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const completedCount = items.filter(i => i.done).length;

  return (
    <div>
      {/* ── Editorial header ─────────────────────────────── */}
      <header className="mb-12">
        <p className="eyebrow mb-3">Conformité · MiCA Art. 60</p>
        <div className="flex items-baseline justify-between gap-8">
          <h2 className="font-display-tight text-[56px] leading-[0.96] text-[#0B0B0C]">
            Éligibilité
          </h2>
          <div className="text-right flex-shrink-0">
            <p className="eyebrow mb-2">Statut</p>
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: isEligible ? '#2E5D4F' : '#A8A8AD' }}
              />
              <p className="font-display text-[28px] leading-none text-[#0B0B0C]">
                {isEligible ? 'Éligible' : 'En attente'}
              </p>
            </div>
            <p className="eyebrow mt-2 text-[#A8A8AD]">
              {completedCount} / {items.length} condition{items.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <p className="mt-6 text-[14px] text-[#6B6B70] leading-relaxed max-w-2xl font-light">
          Quatre conditions doivent être satisfaites avant qu'un portefeuille de conservation
          puisse être ouvert pour ce client. Chaque étape génère une trace auditable.
        </p>

        {client.Custody_Risk_Level__c && (
          <div className="mt-8 pt-6 border-t border-[rgba(11,11,12,0.08)] flex items-baseline gap-6">
            <p className="eyebrow">Niveau de risque</p>
            <Badge variant={
              client.Custody_Risk_Level__c === 'Faible' ? 'success' :
              client.Custody_Risk_Level__c === 'Moyen' ? 'warning' : 'error'
            }>
              {client.Custody_Risk_Level__c}
            </Badge>
          </div>
        )}
      </header>

      {/* ── Ledger of conditions ────────────────────────── */}
      <ol className="border-t border-[rgba(11,11,12,0.08)]">
        {items.map(item => (
          <li
            key={item.key}
            className="py-8 border-b border-[rgba(11,11,12,0.08)] grid grid-cols-12 gap-6 items-baseline"
          >
            {/* Numeral + check */}
            <div className="col-span-1 flex items-baseline gap-3">
              <span className="eyebrow text-[#A8A8AD] tabular">{item.roman}</span>
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: item.done ? '#2E5D4F' : '#CFCFD1' }}
              />
            </div>

            {/* Title + caption */}
            <div className="col-span-6">
              <h3 className="font-display text-[24px] leading-tight text-[#0B0B0C]">
                {item.title}
              </h3>
              <p className="mt-1 text-[13px] text-[#6B6B70] font-light">
                {item.caption}
              </p>
            </div>

            {/* Action / state */}
            <div className="col-span-5 flex justify-end">
              {item.action}
            </div>
          </li>
        ))}
      </ol>

      {/* ── Signing link — contract ─────────────────────── */}
      {signingLink && (
        <SigningLinkCard
          title="Lien de signature du contrat"
          caption="Envoyez ce lien au client. Expiration dans sept jours. Le PDF signé est automatiquement versé au dossier Salesforce."
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
        maxWidth="max-w-2xl"
      >
        <div className="space-y-8">
          <AdequacyQuestion
            n="01"
            question="Le client comprend-il la nature volatile des actifs numériques ?"
            value={adequacy.q1}
            onChange={(v) => setAdequacy(p => ({ ...p, q1: v }))}
          />
          <AdequacyQuestion
            n="02"
            question="A-t-il une expérience préalable avec les cryptomonnaies ?"
            value={adequacy.q2}
            onChange={(v) => setAdequacy(p => ({ ...p, q2: v }))}
          />
          <AdequacyQuestion
            n="03"
            question="L'allocation envisagée est-elle cohérente avec son profil de risque ?"
            value={adequacy.q3}
            onChange={(v) => setAdequacy(p => ({ ...p, q3: v }))}
          />
          <AdequacyQuestion
            n="04"
            question="A-t-il été informé des risques de perte en capital ?"
            value={adequacy.q4}
            onChange={(v) => setAdequacy(p => ({ ...p, q4: v }))}
          />

          <div>
            <label className={labelCls}>Notes complémentaires</label>
            <textarea
              className={inputCls + ' min-h-[80px] resize-none'}
              placeholder="Observations, remarques…"
              value={adequacy.notes}
              onChange={(e) => setAdequacy(p => ({ ...p, notes: e.target.value }))}
            />
          </div>

          {!allAdequacyOui && adequacy.q1 !== null && (
            <div className="py-4 px-5 border-l-2 border-[#7A2424] bg-[rgba(122,36,36,0.04)]">
              <p className="text-[13px] text-[#7A2424] font-light leading-relaxed">
                Toutes les réponses doivent être « Oui » pour proposer la conservation.
                Si le client ne remplit pas les conditions, le service ne peut pas lui être offert.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => setShowAdequacy(false)}>Annuler</Button>
            <Button
              variant="primary"
              onClick={submitAdequacy}
              disabled={!allAdequacyOui || submittingAdequacy}
            >
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
    <div className="mt-12 py-8 px-8 border border-[rgba(11,11,12,0.08)]" style={{ borderRadius: '2px' }}>
      <p className="eyebrow text-[#8A6F3D] mb-3">Lien prêt</p>
      <h3 className="font-display text-[24px] leading-tight text-[#0B0B0C]">{title}</h3>
      <p className="mt-2 text-[13px] text-[#6B6B70] max-w-xl font-light leading-relaxed">
        {caption}
      </p>
      <div className="mt-6 flex items-center gap-3 pt-5 border-t border-[rgba(11,11,12,0.08)]">
        <div className="flex-1 min-w-0 text-[12px] text-[#0B0B0C] font-mono truncate">
          {link}
        </div>
        <Button variant={copied ? 'primary' : 'outline'} onClick={onCopy}>
          {copied ? 'Copié' : 'Copier le lien'}
        </Button>
      </div>
    </div>
  );
}

/* ─── Sub · adequacy question ─── */
function AdequacyQuestion({ n, question, value, onChange }) {
  return (
    <div className="border-b border-[rgba(11,11,12,0.08)] pb-6">
      <div className="flex items-baseline gap-4">
        <span className="eyebrow text-[#A8A8AD] tabular">{n}</span>
        <p className="flex-1 text-[15px] text-[#0B0B0C] leading-relaxed">{question}</p>
      </div>
      <div className="mt-4 ml-10 flex gap-6">
        {['Oui', 'Non'].map(opt => {
          const active = value === opt;
          return (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className="relative py-2 text-[13px] tracking-tight transition-colors"
              style={{ color: active ? '#0B0B0C' : '#6B6B70' }}
            >
              {opt}
              {active && <span className="absolute left-0 right-0 -bottom-px h-px bg-[#0B0B0C]" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
