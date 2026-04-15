import { useState } from 'react';
import { Badge, Card, Modal, Spinner, Button, textareaCls, labelCls } from './shared';
import { updateAccountFields } from '../services/salesforceApi';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/constants';
import { supabase } from '../lib/supabase';
import CustodyContractModal from './CustodyContractModal';

/* ─────────────────────────────────────────────────────────
   CustodyEligibilityPanel — Editorial MiCA compliance dossier
   Hairline checklist · monochrome · bronze accent
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
              className="h-9 text-[13px] font-medium bg-white border border-[rgba(10,10,10,0.1)] rounded-[10px] px-3 outline-none focus:border-[rgba(10,10,10,0.35)] focus:ring-4 focus:ring-[rgba(10,10,10,0.04)] cursor-pointer tracking-[-0.006em]"
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
            <p className="mt-3 text-[14px] text-[#4A4A4A] leading-relaxed tracking-[-0.006em]">
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
          <div className="mt-3 flex items-center justify-between text-[11px] text-[#9B9B9B] tracking-[0.02em] uppercase font-medium">
            <span>{Math.round(progressPct)}% complété</span>
            <span>Audit temps-réel · Salesforce Cloud</span>
          </div>
        </div>
      </Card>

      {/* ── Checklist card ──────────────────────────────── */}
      <Card>
        <div className="px-7 py-5 border-b border-[rgba(10,10,10,0.06)] flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-medium text-[#0A0A0A] tracking-[-0.015em]">Conditions réglementaires</h3>
            <p className="text-[12.5px] text-[#6B6B6B] mt-0.5 tracking-[-0.003em]">
              Checklist MiCA Art. 60 · chaque étape est horodatée et auditée
            </p>
          </div>
          <span className="text-[11px] text-[#9B9B9B] tracking-[0.04em] uppercase font-medium hidden md:block">
            {items.length} conditions
          </span>
        </div>
        <ul>
          {items.map((item, i) => (
            <li
              key={item.key}
              className={`px-7 py-5 flex items-start justify-between gap-6 ${i < items.length - 1 ? 'border-b border-[rgba(10,10,10,0.06)]' : ''}`}
            >
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
                  <p className="text-[13px] text-[#6B6B6B] mt-1 tracking-[-0.003em]">{item.caption}</p>
                </div>
              </div>
              <div className="flex-shrink-0 pt-0.5">{item.action}</div>
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

          <div className="flex justify-end gap-2 pt-5 border-t border-[rgba(10,10,10,0.06)]">
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
          <div className="w-10 h-10 rounded-full bg-[#F5F3EE] border border-[rgba(10,10,10,0.06)] flex items-center justify-center text-[#0A0A0A] flex-shrink-0">
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-medium text-[#0A0A0A] tracking-[-0.015em]">{title}</h3>
            <p className="text-[12.5px] text-[#6B6B6B] mt-1 max-w-xl leading-relaxed tracking-[-0.003em]">{caption}</p>
          </div>
        </div>
        <Badge variant="success" dot>Prêt</Badge>
      </div>
      <div className="flex items-center gap-2 p-2 bg-[#FBFAF7] border border-[rgba(10,10,10,0.06)] rounded-[10px]">
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

/* ─── Sub · adequacy question ─── */
function AdequacyQuestion({ n, question, value, onChange }) {
  return (
    <div>
      <div className="flex items-start gap-3 mb-3">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#F5F3EE] border border-[rgba(10,10,10,0.06)] text-[11px] font-medium text-[#4A4A4A] flex items-center justify-center tabular-nums mt-0.5">
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
                  : 'bg-white text-[#6B6B6B] border-[rgba(10,10,10,0.1)] hover:bg-[#FBFAF7] hover:text-[#0A0A0A] hover:border-[rgba(10,10,10,0.2)]'
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
