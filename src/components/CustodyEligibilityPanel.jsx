import { useState } from 'react';
import { Badge, Card, Modal, Spinner, Button, inputCls, textareaCls, labelCls, selectCls } from './shared';
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
              className="h-7 text-[12px] bg-white border border-[rgba(9,9,11,0.1)] rounded-md px-2 outline-none focus:border-[rgba(9,9,11,0.3)] focus:ring-2 focus:ring-[rgba(9,9,11,0.06)] cursor-pointer"
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
    <div className="space-y-4">
      {/* ── Header card ─────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-[15px] font-semibold text-[#09090B] tracking-tight">Éligibilité conservation</h2>
              <Badge variant={isEligible ? 'success' : 'default'} dot>
                {isEligible ? 'Éligible' : 'En attente'}
              </Badge>
            </div>
            <p className="text-[12px] text-[#71717A]">
              Conformité MiCA Art. 60 · quatre conditions doivent être satisfaites avant l'ouverture d'un portefeuille de conservation.
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[11px] font-medium text-[#71717A] uppercase tracking-wider">Progression</p>
            <p className="text-[22px] font-semibold text-[#09090B] tabular-nums leading-none mt-1">
              {completedCount}<span className="text-[#A1A1AA]">/{items.length}</span>
            </p>
          </div>
        </div>

        {client.Custody_Risk_Level__c && (
          <div className="mt-4 pt-4 border-t border-[rgba(9,9,11,0.06)] flex items-center gap-2">
            <p className="text-[11px] font-medium text-[#71717A] uppercase tracking-wider">Niveau de risque</p>
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
        <div className="px-5 py-3 border-b border-[rgba(9,9,11,0.06)] bg-[#FAFAFA]">
          <p className="text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">
            Conditions
          </p>
        </div>
        <ul>
          {items.map((item, i) => (
            <li
              key={item.key}
              className={`px-5 py-4 flex items-start justify-between gap-4 ${i < items.length - 1 ? 'border-b border-[rgba(9,9,11,0.06)]' : ''}`}
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                {/* Check indicator */}
                <div className="flex-shrink-0 mt-0.5">
                  {item.done ? (
                    <div className="w-5 h-5 rounded-full bg-[#10B981] flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-[rgba(9,9,11,0.15)] bg-white flex items-center justify-center">
                      <span className="text-[10px] font-semibold text-[#A1A1AA] tabular-nums">{item.idx}</span>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[13px] font-medium text-[#09090B]">{item.title}</h3>
                  <p className="text-[12px] text-[#71717A] mt-0.5">{item.caption}</p>
                </div>
              </div>
              <div className="flex-shrink-0">{item.action}</div>
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
            <div className="px-3 py-2.5 bg-[#FEF2F2] border border-[rgba(239,68,68,0.2)] rounded-md">
              <p className="text-[12px] text-[#B91C1C] leading-relaxed">
                Toutes les réponses doivent être « Oui » pour proposer la conservation. Si le client ne remplit pas les conditions, le service ne peut pas lui être offert.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-[rgba(9,9,11,0.06)]">
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
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="text-[13px] font-semibold text-[#09090B]">{title}</h3>
          <p className="text-[12px] text-[#71717A] mt-1 max-w-xl leading-relaxed">{caption}</p>
        </div>
        <Badge variant="success" dot>Prêt</Badge>
      </div>
      <div className="flex items-center gap-2 mt-3 p-2 bg-[#FAFAFA] border border-[rgba(9,9,11,0.06)] rounded-md">
        <div className="flex-1 min-w-0 text-[12px] text-[#09090B] font-mono truncate px-2">
          {link}
        </div>
        <Button size="sm" variant={copied ? 'primary' : 'secondary'} onClick={onCopy}>
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
      <div className="flex items-start gap-3 mb-2">
        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#F4F4F5] text-[11px] font-semibold text-[#52525B] flex items-center justify-center tabular-nums mt-0.5">
          {n}
        </span>
        <p className="flex-1 text-[13px] text-[#09090B] leading-relaxed">{question}</p>
      </div>
      <div className="ml-8 flex gap-2">
        {['Oui', 'Non'].map(opt => {
          const active = value === opt;
          const isOui = opt === 'Oui';
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`h-7 px-3 text-[12px] font-medium rounded-md border transition-colors ${
                active
                  ? isOui
                    ? 'bg-[#ECFDF5] text-[#047857] border-[rgba(16,185,129,0.3)]'
                    : 'bg-[#FEF2F2] text-[#B91C1C] border-[rgba(239,68,68,0.3)]'
                  : 'bg-white text-[#52525B] border-[rgba(9,9,11,0.1)] hover:bg-[#FAFAFA]'
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
