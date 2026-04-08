import { useState } from 'react';
import { Badge, Modal, Spinner, inputCls, labelCls } from './shared';
import { updateAccountFields } from '../services/salesforceApi';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/constants';
import { supabase } from '../lib/supabase';
import CustodyContractModal from './CustodyContractModal';

const KYC_STATUSES = ['Valide', 'En cours', 'Non verifie', 'Expire'];

function kycBadgeVariant(status) {
  if (!status) return 'default';
  const s = status.toLowerCase();
  if (s === 'valide') return 'success';
  if (s === 'en cours') return 'warning';
  return 'error';
}

function kycBadgeLabel(status) {
  return status || 'Non renseigne';
}

export default function CustodyEligibilityPanel({ client, onUpdate }) {
  const { user, isAdmin } = useAuth();
  const [updating, setUpdating] = useState(null); // which field is being updated
  const [showAdequacy, setShowAdequacy] = useState(false);
  const [showContract, setShowContract] = useState(false);
  const [adequacy, setAdequacy] = useState({
    q1: null, q2: null, q3: null, q4: null, notes: '',
  });
  const [submittingAdequacy, setSubmittingAdequacy] = useState(false);
  const [signingLink, setSigningLink] = useState(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const isEligible = client.Custody_Eligible__c === true;

  const generateSigningLink = async () => {
    setGeneratingLink(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeaders = session?.access_token
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
        : { 'Content-Type': 'application/json' };

      const res = await fetch(`${API_BASE}/api/signing/generate`, {
        method: 'POST',
        headers: authHeaders,
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
        throw new Error(err.error || 'Erreur generation lien');
      }
      const json = await res.json();
      const fullUrl = `${window.location.origin}/sign/${json.token}`;
      setSigningLink(fullUrl);
    } catch (err) {
      alert('Erreur: ' + err.message);
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

  const updateField = async (fields) => {
    const fieldName = Object.keys(fields)[0];
    setUpdating(fieldName);
    try {
      await updateAccountFields(client.id, fields);
      if (onUpdate) await onUpdate();
    } catch (err) {
      alert('Erreur mise a jour Salesforce: ' + err.message);
    }
    setUpdating(null);
  };

  const toggleSanctions = () => {
    updateField({ Custody_Sanctions_Clear__c: !client.Custody_Sanctions_Clear__c });
  };

  const changeKycStatus = (newStatus) => {
    updateField({ Custody_KYC_Status__c: newStatus });
  };

  const allAdequacyOui = adequacy.q1 === 'Oui' && adequacy.q2 === 'Oui' && adequacy.q3 === 'Oui' && adequacy.q4 === 'Oui';

  const submitAdequacy = async () => {
    if (!allAdequacyOui) return;
    setSubmittingAdequacy(true);
    try {
      await updateAccountFields(client.id, { Custody_Adequacy_Done__c: true });

      // Store assessment in audit_log via Supabase
      const { data: { session } } = await supabase.auth.getSession();
      const authHeaders = session?.access_token
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
        : { 'Content-Type': 'application/json' };

      await fetch(`${API_BASE}/api/audit-log`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action: 'adequacy_assessment_completed',
          category: 'custody',
          entityType: 'Account',
          entityId: client.id,
          clientName: client.name,
          salesforceAccountId: client.id,
          details: {
            assessment: {
              volatile_understanding: adequacy.q1,
              crypto_experience: adequacy.q2,
              allocation_coherence: adequacy.q3,
              risk_informed: adequacy.q4,
              notes: adequacy.notes,
            },
            assessedBy: user?.email,
            assessedAt: new Date().toISOString(),
          },
        }),
      }).catch(() => {});

      if (onUpdate) await onUpdate();
      setShowAdequacy(false);
      setAdequacy({ q1: null, q2: null, q3: null, q4: null, notes: '' });
    } catch (err) {
      alert('Erreur: ' + err.message);
    }
    setSubmittingAdequacy(false);
  };

  const checkItems = [
    {
      key: 'kyc',
      label: 'KYC Valide',
      done: client.Custody_KYC_Status__c === 'Valide',
      detail: (
        <div className="flex items-center gap-2">
          <Badge variant={kycBadgeVariant(client.Custody_KYC_Status__c)}>
            {kycBadgeLabel(client.Custody_KYC_Status__c)}
          </Badge>
          {isAdmin && (
            <select
              className="text-[12px] border border-[rgba(0,0,29,0.12)] rounded-lg px-2 py-1 bg-white outline-none cursor-pointer"
              value={client.Custody_KYC_Status__c || ''}
              onChange={(e) => changeKycStatus(e.target.value)}
              disabled={updating === 'Custody_KYC_Status__c'}
            >
              <option value="" disabled>Changer...</option>
              {KYC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {updating === 'Custody_KYC_Status__c' && <Spinner size="w-4 h-4" />}
        </div>
      ),
    },
    {
      key: 'sanctions',
      label: 'Screening Sanctions OK',
      done: client.Custody_Sanctions_Clear__c === true,
      detail: (
        <div className="flex items-center gap-2">
          <Badge variant={client.Custody_Sanctions_Clear__c ? 'success' : 'error'}>
            {client.Custody_Sanctions_Clear__c ? 'Clear' : 'Non verifie'}
          </Badge>
          {isAdmin && (
            <button
              onClick={toggleSanctions}
              disabled={updating === 'Custody_Sanctions_Clear__c'}
              className="text-[12px] font-medium text-[#6366F1] hover:text-[#5558E6] transition-colors disabled:opacity-50"
            >
              {client.Custody_Sanctions_Clear__c ? 'Revoquer' : 'Valider'}
            </button>
          )}
          {updating === 'Custody_Sanctions_Clear__c' && <Spinner size="w-4 h-4" />}
        </div>
      ),
    },
    {
      key: 'adequacy',
      label: 'Evaluation Adequation Crypto',
      done: client.Custody_Adequacy_Done__c === true,
      detail: (
        <div className="flex items-center gap-2">
          <Badge variant={client.Custody_Adequacy_Done__c ? 'success' : 'default'}>
            {client.Custody_Adequacy_Done__c ? 'Completee' : 'Non realisee'}
          </Badge>
          {!client.Custody_Adequacy_Done__c && (
            <button
              onClick={() => setShowAdequacy(true)}
              className="text-[12px] font-medium text-[#6366F1] hover:text-[#5558E6] transition-colors"
            >
              Lancer l'evaluation
            </button>
          )}
        </div>
      ),
    },
    {
      key: 'contract',
      label: 'Contrat Custody Signe',
      done: client.Custody_Contract_Signed__c === true,
      detail: (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={client.Custody_Contract_Signed__c ? 'success' : 'default'}>
            {client.Custody_Contract_Signed__c ? 'Signe' : 'Non signe'}
          </Badge>
          {!client.Custody_Contract_Signed__c && (
            <>
              <button
                onClick={() => setShowContract(true)}
                className="text-[12px] font-medium text-[#6366F1] hover:text-[#5558E6] transition-colors"
              >
                Signer ici
              </button>
              <span className="text-[11px] text-[#A8A29E]">ou</span>
              <button
                onClick={generateSigningLink}
                disabled={generatingLink}
                className="text-[12px] font-medium text-[#0891B2] hover:text-[#0E7490] transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {generatingLink ? (
                  <Spinner size="w-3 h-3" />
                ) : (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                )}
                Envoyer au client
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Main eligibility status */}
      <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-[16px] font-semibold text-[#0F0F10]">Eligibilite Custody</h3>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-[14px] ${
            isEligible
              ? 'bg-[#ECFDF5] text-[#059669] border border-[rgba(5,150,105,0.15)]'
              : 'bg-[#FEF2F2] text-[#DC2626] border border-[rgba(220,38,38,0.15)]'
          }`}>
            <div className={`w-2.5 h-2.5 rounded-full ${isEligible ? 'bg-[#059669]' : 'bg-[#DC2626]'}`} />
            {isEligible ? 'ELIGIBLE' : 'NON ELIGIBLE'}
          </div>
        </div>

        {/* Risk Level indicator */}
        {client.Custody_Risk_Level__c && (
          <div className="mb-6 bg-[rgba(0,0,23,0.02)] rounded-xl px-4 py-3 flex items-center gap-3">
            <svg className="w-4 h-4 text-[#787881]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className="text-[13px] text-[#787881]">Niveau de risque :</span>
            <Badge variant={
              client.Custody_Risk_Level__c === 'Faible' ? 'success' :
              client.Custody_Risk_Level__c === 'Moyen' ? 'warning' :
              'error'
            }>
              {client.Custody_Risk_Level__c}
            </Badge>
          </div>
        )}

        {/* Checklist */}
        <div className="space-y-0">
          {checkItems.map((item, idx) => (
            <div
              key={item.key}
              className={`flex items-center justify-between py-4 px-1 ${
                idx < checkItems.length - 1 ? 'border-b border-[rgba(0,0,29,0.06)]' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Checkbox icon */}
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  item.done
                    ? 'bg-[#059669] text-white'
                    : 'bg-[rgba(0,0,23,0.04)] text-[#A8A29E]'
                }`}>
                  {item.done ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <span className={`text-[14px] font-medium ${item.done ? 'text-[#0F0F10]' : 'text-[#787881]'}`}>
                  {item.label}
                </span>
              </div>
              <div>{item.detail}</div>
            </div>
          ))}
        </div>

        {/* Info box */}
        {!isEligible && (
          <div className="mt-6 bg-[#FFFBEB] border border-[rgba(217,119,6,0.12)] rounded-xl px-4 py-3">
            <p className="text-[13px] text-[#92400E]">
              <strong>Conditions requises :</strong> Le client doit avoir un KYC valide, un screening sanctions positif,
              une evaluation d'adequation completee et un contrat de custody signe pour etre eligible a la conservation d'actifs numeriques.
            </p>
          </div>
        )}
      </div>

      {/* Adequacy Assessment Modal */}
      <Modal isOpen={showAdequacy} onClose={() => setShowAdequacy(false)} title="Evaluation d'Adequation Crypto" maxWidth="max-w-xl">
        <div className="space-y-5 p-2">
          <p className="text-[13px] text-[#787881] mb-4">
            Conformement a l'article 66 du reglement MiCA et aux obligations AMF, evaluez l'adequation du client
            pour les services de conservation d'actifs numeriques.
          </p>

          <AdequacyQuestion
            question="Le client comprend-il la nature volatile des actifs numeriques ?"
            value={adequacy.q1}
            onChange={(v) => setAdequacy(p => ({ ...p, q1: v }))}
          />
          <AdequacyQuestion
            question="Le client a-t-il une experience prealable avec les cryptomonnaies ?"
            value={adequacy.q2}
            onChange={(v) => setAdequacy(p => ({ ...p, q2: v }))}
          />
          <AdequacyQuestion
            question="L'allocation crypto envisagee est-elle coherente avec le profil de risque du client ?"
            value={adequacy.q3}
            onChange={(v) => setAdequacy(p => ({ ...p, q3: v }))}
          />
          <AdequacyQuestion
            question="Le client a-t-il ete informe des risques de perte en capital ?"
            value={adequacy.q4}
            onChange={(v) => setAdequacy(p => ({ ...p, q4: v }))}
          />

          <div>
            <label className={labelCls}>Notes complementaires</label>
            <textarea
              className={inputCls + ' min-h-[80px] resize-none'}
              placeholder="Observations, remarques..."
              value={adequacy.notes}
              onChange={(e) => setAdequacy(p => ({ ...p, notes: e.target.value }))}
            />
          </div>

          {!allAdequacyOui && adequacy.q1 !== null && (
            <div className="bg-[#FEF2F2] border border-[rgba(220,38,38,0.12)] rounded-xl px-4 py-3">
              <p className="text-[13px] text-[#DC2626]">
                Toutes les reponses doivent etre "Oui" pour valider l'adequation. Si le client ne remplit pas
                les conditions, la conservation d'actifs numeriques ne peut pas etre proposee.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowAdequacy(false)}
              className="flex-1 py-2.5 text-[14px] font-medium text-[#787881] bg-[rgba(0,0,23,0.04)] rounded-xl hover:bg-[rgba(0,0,23,0.08)] transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={submitAdequacy}
              disabled={!allAdequacyOui || submittingAdequacy}
              className="flex-1 py-2.5 text-[14px] font-medium text-white bg-[#059669] rounded-xl hover:bg-[#047857] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submittingAdequacy ? 'Validation...' : 'Valider l\'adequation'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Signing Link Panel */}
      {signingLink && (
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ECFDF5] flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#059669]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-[14px] font-semibold text-[#0F0F10] mb-1">Lien de signature genere</h4>
              <p className="text-[13px] text-[#787881] mb-3">
                Envoyez ce lien au client pour qu'il signe le contrat de custody. Le lien expire dans 7 jours.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-[rgba(0,0,23,0.03)] border border-[rgba(0,0,29,0.08)] rounded-lg px-3 py-2 text-[12px] text-[#0F0F10] font-mono truncate">
                  {signingLink}
                </div>
                <button
                  onClick={copyLink}
                  className={`px-4 py-2 text-[12px] font-medium rounded-lg transition-all flex items-center gap-1.5 flex-shrink-0 ${
                    linkCopied
                      ? 'bg-[#059669] text-white'
                      : 'bg-[#0F0F10] text-white hover:bg-[#1a1a1a]'
                  }`}
                >
                  {linkCopied ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Copie !
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copier
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contract Modal */}
      <CustodyContractModal
        isOpen={showContract}
        onClose={() => setShowContract(false)}
        client={client}
        onSigned={async () => {
          if (onUpdate) await onUpdate();
        }}
      />
    </div>
  );
}

function AdequacyQuestion({ question, value, onChange }) {
  return (
    <div className="bg-[rgba(0,0,23,0.02)] rounded-xl px-4 py-3">
      <p className="text-[13px] font-medium text-[#0F0F10] mb-2">{question}</p>
      <div className="flex gap-2">
        {['Oui', 'Non'].map(opt => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-4 py-1.5 text-[13px] font-medium rounded-lg transition-all ${
              value === opt
                ? opt === 'Oui'
                  ? 'bg-[#059669] text-white'
                  : 'bg-[#DC2626] text-white'
                : 'bg-white border border-[rgba(0,0,29,0.12)] text-[#787881] hover:border-[rgba(0,0,29,0.25)]'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
