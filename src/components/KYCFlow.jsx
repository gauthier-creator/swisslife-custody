import { useState, useEffect, useRef, useCallback } from 'react';
import {
  uploadKycDocument, runAmlScreening, getKycStatus, validateKyc,
  KYC_DOCUMENT_TYPES, KYC_STATUS,
} from '../services/kycService';
import { useAuth } from '../context/AuthContext';
import {
  Badge, Spinner, Card, Button, SectionCard, StatusDot, Illustration,
} from './shared';

/* ─────────────────────────────────────────────────────────
   KYCFlow — Éditorial · Vérification d'identité & AML
   Parcours multi-étapes avec indicateur de progression,
   zone de dépôt minimaliste, résultats synthétiques.
   ───────────────────────────────────────────────────────── */

const STEPS = [
  { id: 'identity', label: "Pièce d'identité",   desc: "Passeport ou carte d'identité nationale" },
  { id: 'address',  label: 'Justificatif domicile', desc: 'Facture < 3 mois ou attestation bancaire' },
  { id: 'funds',    label: 'Origine des fonds',     desc: "Justificatif de l'origine des fonds" },
  { id: 'aml',      label: 'Screening AML',         desc: 'Vérification anti-blanchiment automatique' },
  { id: 'result',   label: 'Résultat',              desc: 'Statut final de la vérification' },
];

const COMPANY_STEP = { id: 'company_docs', label: 'Documents société', desc: 'K-bis / extrait RC et statuts' };

export default function KYCFlow({ client, onComplete }) {
  const { user, isAdmin } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [kycStatus, setKycStatus] = useState(null);
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [screening, setScreening] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  const isCompany = client.type === 'Other';
  const allSteps = isCompany
    ? [...STEPS.slice(0, 3), COMPANY_STEP, ...STEPS.slice(3)]
    : STEPS;

  const loadStatus = useCallback(async () => {
    try {
      const data = await getKycStatus(client.id);
      setKycStatus(data);
      setChecks(data.checks || []);
      autoAdvance(data.checks || []);
    } catch (err) {
      console.error('KYC status load error:', err);
      setError(err.message);
    }
    setLoading(false);
  }, [client.id]);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const autoAdvance = (existing) => {
    const has = (pred) => existing.some(c => pred(c) && c.status !== 'failed');
    const hasIdentity = has(c => ['passport', 'id_card'].includes(c.document_type));
    const hasAddress  = has(c => c.document_type === 'proof_of_address');
    const hasFunds    = has(c => c.document_type === 'source_of_funds');
    const hasCompany  = has(c => ['company_registration', 'articles_of_association'].includes(c.document_type));
    const hasAml      = has(c => c.check_type === 'screening_check');

    if (isCompany) {
      if (!hasIdentity) setCurrentStep(0);
      else if (!hasAddress) setCurrentStep(1);
      else if (!hasFunds) setCurrentStep(2);
      else if (!hasCompany) setCurrentStep(3);
      else if (!hasAml) setCurrentStep(4);
      else setCurrentStep(5);
    } else {
      if (!hasIdentity) setCurrentStep(0);
      else if (!hasAddress) setCurrentStep(1);
      else if (!hasFunds) setCurrentStep(2);
      else if (!hasAml) setCurrentStep(3);
      else setCurrentStep(4);
    }
  };

  // ── Upload handler ──
  const handleUpload = async (file, docType) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadKycDocument({
        salesforceAccountId: client.id,
        clientName: client.name,
        documentType: docType,
        file,
        initiatedByEmail: user?.email,
      });
      await loadStatus();
      setCurrentStep(prev => Math.min(prev + 1, allSteps.length - 1));
    } catch (err) {
      setError(err.message);
    }
    setUploading(false);
  };

  // ── AML ──
  const handleAmlScreening = async () => {
    setScreening(true);
    setError(null);
    try {
      await runAmlScreening({
        salesforceAccountId: client.id,
        clientName: client.name,
        initiatedByEmail: user?.email,
      });
      // Reload immediately — demo mode returns terminal state synchronously.
      await loadStatus();
      // If still processing (live mode), poll for a minute.
      const s = await getKycStatus(client.id);
      const aml = (s.checks || []).find(c => c.check_type === 'screening_check');
      if (aml && (aml.status === 'pending' || aml.status === 'processing')) {
        startPolling();
      } else {
        setScreening(false);
        setCurrentStep(allSteps.length - 1);
      }
    } catch (err) {
      setError(err.message);
      setScreening(false);
    }
  };

  const startPolling = () => {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const data = await getKycStatus(client.id);
        setKycStatus(data);
        setChecks(data.checks || []);
        const aml = (data.checks || []).find(c => c.check_type === 'screening_check');
        if (aml && aml.status !== 'pending' && aml.status !== 'processing') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setScreening(false);
          setCurrentStep(allSteps.length - 1);
        }
      } catch { /* continue */ }
      if (attempts >= 20) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setScreening(false);
        setCurrentStep(allSteps.length - 1);
      }
    }, 3000);
  };

  // ── Validate ──
  const handleValidate = async () => {
    try {
      await validateKyc({
        salesforceAccountId: client.id,
        validatedByEmail: user?.email,
      });
      await loadStatus();
      if (onComplete) onComplete();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDrop = (e, docType) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleUpload(file, docType);
  };

  const handleFileSelect = (e, docType) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file, docType);
  };

  const getDocTypeForStep = (stepId) => ({
    identity: 'passport',
    address: 'proof_of_address',
    funds: 'source_of_funds',
    company_docs: 'company_registration',
  }[stepId] || null);

  const isStepComplete = (stepId) => {
    const pred = {
      identity: c => ['passport', 'id_card'].includes(c.document_type),
      address:  c => c.document_type === 'proof_of_address',
      funds:    c => c.document_type === 'source_of_funds',
      company_docs: c => ['company_registration', 'articles_of_association'].includes(c.document_type),
      aml:      c => c.check_type === 'screening_check',
      result:   () => kycStatus?.overallStatus === 'validated',
    }[stepId];
    if (!pred) return false;
    if (stepId === 'result') return pred();
    return checks.some(c => pred(c) && c.status === 'complete');
  };

  const isStepPending = (stepId) => {
    const pred = {
      identity: c => ['passport', 'id_card'].includes(c.document_type),
      address:  c => c.document_type === 'proof_of_address',
      funds:    c => c.document_type === 'source_of_funds',
      company_docs: c => ['company_registration', 'articles_of_association'].includes(c.document_type),
      aml:      c => c.check_type === 'screening_check',
    }[stepId];
    if (!pred) return false;
    return checks.some(c => pred(c) && (c.status === 'pending' || c.status === 'processing'));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="w-5 h-5" />
        <span className="ml-3 text-[13px] text-[#5D5D5D] tracking-[-0.006em]">Chargement du statut KYC…</span>
      </div>
    );
  }

  const currentStepData = allSteps[currentStep];
  const overallComplete = kycStatus?.overallStatus === 'validated';
  const attentionRequired = kycStatus?.overallStatus === 'attention_required';

  return (
    <div className="space-y-6">
      {/* ── Editorial header ── */}
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <p className="text-eyebrow">Compliance · KYC / KYB</p>
          <h2 className="display-sm text-[#0A0A0A] mt-2">
            Vérification <span className="font-display italic text-[#7C5E3C]">d'identité</span>
          </h2>
          <p className="text-[13.5px] text-[#5D5D5D] mt-2 tracking-[-0.006em] max-w-xl leading-relaxed">
            Parcours conforme AMLD5 · Tracfin. Documents, screening sanctions/PEP/média, puis validation finale
            par un administrateur habilité.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {overallComplete
            ? <StatusDot tone="success" label="KYC validé" />
            : attentionRequired
              ? <StatusDot tone="error" label="Attention requise" />
              : <StatusDot tone="bronze" label="Vérification en cours" />}
        </div>
      </div>

      {/* ── Validated banner ── */}
      {overallComplete && (
        <Card className="p-5 flex items-center gap-4 relative overflow-hidden accent-ruler-left animate-slide-up">
          <div className="flex-shrink-0 w-11 h-11 rounded-[10px] bg-white border border-[rgba(10,10,10,0.1)] flex items-center justify-center shadow-crisp">
            <svg className="w-[18px] h-[18px] text-[#16A34A]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-[#0A0A0A] tracking-[-0.01em]">KYC validé</p>
            <p className="text-[12.5px] text-[#5D5D5D] mt-0.5 tracking-[-0.003em]">
              Toutes les vérifications ont été complétées avec succès. Le client est habilité à la conservation.
            </p>
          </div>
        </Card>
      )}

      {/* ── Step rail ── */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[13px] font-medium text-[#0A0A0A] tracking-[-0.01em]">Parcours de vérification</h3>
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#8A8278] tabular-nums">
            Étape {currentStep + 1} / {allSteps.length}
          </span>
        </div>

        <StepRail
          steps={allSteps}
          currentStep={currentStep}
          onSelect={setCurrentStep}
          isComplete={isStepComplete}
          isPending={isStepPending}
        />

        {/* ── Error banner ── */}
        {error && (
          <div className="mt-5 mb-4 px-4 py-3 rounded-[10px] bg-white border border-[rgba(220,38,38,0.2)] flex items-center gap-3">
            <svg className="w-4 h-4 text-[#DC2626] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[12.5px] text-[#991B1B] flex-1 tracking-[-0.003em]">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-[#5D5D5D] hover:text-[#0A0A0A] transition-colors"
              aria-label="Dismiss"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* ── Step content ── */}
        <div className="mt-6 min-h-[260px] animate-fade">
          {['identity', 'address', 'funds', 'company_docs'].includes(currentStepData?.id) && (
            <DocumentUploadStep
              step={currentStepData}
              docType={getDocTypeForStep(currentStepData.id)}
              checks={checks}
              uploading={uploading}
              dragOver={dragOver}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => handleDrop(e, getDocTypeForStep(currentStepData.id))}
              onFileSelect={(e) => handleFileSelect(e, getDocTypeForStep(currentStepData.id))}
              fileInputRef={fileInputRef}
            />
          )}

          {currentStepData?.id === 'aml' && (
            <AmlScreeningStep
              checks={checks}
              screening={screening}
              onStartScreening={handleAmlScreening}
              clientName={client.name}
            />
          )}

          {currentStepData?.id === 'result' && (
            <ResultStep
              kycStatus={kycStatus}
              checks={checks}
              isAdmin={isAdmin}
              onValidate={handleValidate}
              overallComplete={overallComplete}
            />
          )}
        </div>

        {/* ── Navigation ── */}
        <div className="flex items-center justify-between mt-6 pt-5 border-t border-[#E9E4D9]">
          <Button
            variant="ghost"
            onClick={() => setCurrentStep(p => Math.max(0, p - 1))}
            disabled={currentStep === 0}
          >
            ← Précédent
          </Button>
          <Button
            variant="ghost"
            onClick={() => setCurrentStep(p => Math.min(allSteps.length - 1, p + 1))}
            disabled={currentStep === allSteps.length - 1}
          >
            Suivant →
          </Button>
        </div>
      </Card>

      {/* ── Check history ── */}
      {checks.length > 0 && (
        <SectionCard
          title="Historique des vérifications"
          caption={`${checks.length} entrée${checks.length > 1 ? 's' : ''} · horodaté`}
          noBodyPadding
        >
          <div className="divide-y divide-[rgba(10,10,10,0.06)]">
            {checks.map(check => <CheckRow key={check.id} check={check} />)}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   StepRail — minimal numbered dots + hairline connectors
   ───────────────────────────────────────────────────────── */
function StepRail({ steps, currentStep, onSelect, isComplete, isPending }) {
  return (
    <div className="mt-4 flex items-center gap-1">
      {steps.map((step, i) => {
        const complete = isComplete(step.id);
        const pending = isPending(step.id);
        const active = i === currentStep;
        return (
          <div key={step.id} className="flex-1 flex items-center min-w-0">
            <button
              onClick={() => onSelect(i)}
              className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-[10px] text-left transition-all group ${
                active
                  ? 'bg-[#0A0A0A] text-white shadow-crisp'
                  : 'text-[#5D5D5D] hover:bg-white'
              }`}
            >
              <span
                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10.5px] font-medium tabular-nums transition-all ${
                  active
                    ? 'bg-white text-[#0A0A0A]'
                    : complete
                      ? 'bg-white border border-[rgba(22,163,74,0.35)] text-[#16A34A]'
                      : pending
                        ? 'bg-white border border-[rgba(124,94,60,0.35)] text-[#7C5E3C]'
                        : 'bg-[#F5F3EE] border border-[#E9E4D9] text-[#8A8278]'
                }`}
              >
                {complete ? (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : pending ? (
                  <Spinner size="w-2.5 h-2.5" />
                ) : (
                  i + 1
                )}
              </span>
              <span className="text-[11.5px] font-medium truncate hidden lg:block tracking-[-0.003em]">
                {step.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <div className={`w-3 h-px flex-shrink-0 mx-0.5 transition-colors ${
                complete ? 'bg-[rgba(22,163,74,0.4)]' : 'bg-[rgba(10,10,10,0.08)]'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   DocumentUploadStep
   ───────────────────────────────────────────────────────── */
function DocumentUploadStep({
  step, docType, checks, uploading,
  dragOver, onDragOver, onDragLeave, onDrop, onFileSelect, fileInputRef,
}) {
  const existing = checks.find(c => {
    if (step.id === 'identity') return ['passport', 'id_card'].includes(c.document_type);
    if (step.id === 'company_docs') return ['company_registration', 'articles_of_association'].includes(c.document_type);
    return c.document_type === docType;
  });

  const isComplete = existing?.status === 'complete';
  const isPending  = existing?.status === 'pending' || existing?.status === 'processing';
  const isFailed   = existing?.status === 'failed';

  return (
    <div>
      <div className="mb-5">
        <h4 className="text-[17px] font-medium text-[#0A0A0A] tracking-[-0.015em]">{step.label}</h4>
        <p className="text-[13px] text-[#5D5D5D] mt-1 tracking-[-0.006em]">{step.desc}</p>
      </div>

      {isComplete && (
        <div className="mb-4 px-4 py-3 rounded-[10px] bg-white border border-[rgba(22,163,74,0.22)] flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white border border-[#E9E4D9] flex items-center justify-center shadow-crisp">
            <svg className="w-4 h-4 text-[#16A34A]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[#0A0A0A] tracking-[-0.006em]">Document vérifié</p>
            <p className="text-[12px] text-[#5D5D5D] mt-0.5 tracking-[-0.003em] truncate">{existing.file_name || 'Document accepté'}</p>
          </div>
        </div>
      )}

      {isPending && (
        <div className="mb-4 px-4 py-3 rounded-[10px] bg-white border border-[#E9E4D9] flex items-center gap-3">
          <Spinner size="w-4 h-4" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[#0A0A0A] tracking-[-0.006em]">Vérification en cours</p>
            <p className="text-[12px] text-[#5D5D5D] mt-0.5 tracking-[-0.003em] truncate">{existing.file_name || 'Analyse du document…'}</p>
          </div>
        </div>
      )}

      {isFailed && (
        <div className="mb-4 px-4 py-3 rounded-[10px] bg-white border border-[rgba(220,38,38,0.22)] flex items-center gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white border border-[#E9E4D9] flex items-center justify-center shadow-crisp">
            <svg className="w-4 h-4 text-[#DC2626]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[#0A0A0A] tracking-[-0.006em]">Document refusé</p>
            <p className="text-[12px] text-[#5D5D5D] mt-0.5 tracking-[-0.003em]">Reprenez l'envoi avec un document plus lisible.</p>
          </div>
        </div>
      )}

      {/* Drop zone (always available — allows re-upload after rejection) */}
      {!isComplete && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative rounded-[8px] p-10 text-center cursor-pointer transition-all overflow-hidden ${
            dragOver
              ? 'bg-white border-[1.5px] border-[#7C5E3C] shadow-bronze'
              : 'bg-white border border-dashed border-[rgba(10,10,10,0.18)] hover:border-[rgba(124,94,60,0.5)] hover:bg-white'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={onFileSelect}
          />

          {/* Faint dot grid background for crafted feel */}
          <div className="absolute inset-0 bg-dotgrid opacity-[0.4] pointer-events-none" />

          {uploading ? (
            <div className="relative flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-white border border-[#E9E4D9] flex items-center justify-center shadow-crisp">
                <Spinner size="w-5 h-5" />
              </div>
              <p className="text-[13px] text-[#5D5D5D] tracking-[-0.006em]">Envoi et analyse du document…</p>
            </div>
          ) : (
            <div className="relative">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-[12px] bg-white border border-[rgba(10,10,10,0.1)] shadow-crisp mb-4">
                <svg className="w-6 h-6 text-[#7C5E3C]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-[14px] font-medium text-[#0A0A0A] mb-1 tracking-[-0.01em]">
                Glissez votre fichier ici
              </p>
              <p className="text-[12px] text-[#8A8278] tracking-[-0.003em]">
                ou cliquez pour parcourir — PDF, JPG, PNG · max 50 Mo
              </p>

              {step.id === 'identity' && (
                <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
                  {['Passeport', "Carte d'identité", 'Permis de conduire'].map(t => (
                    <span
                      key={t}
                      className="px-2.5 py-1 rounded-full bg-white border border-[#E9E4D9] text-[10.5px] font-medium text-[#5D5D5D] tracking-[-0.003em]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Company requirements reminder */}
      {step.id === 'company_docs' && (
        <div className="mt-4 rounded-[10px] bg-white border border-[#E9E4D9] p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#8A8278] mb-2">
            Documents requis · Personne morale
          </p>
          <ul className="space-y-1.5">
            {[
              'Extrait du registre du commerce (RC) ou K-bis < 3 mois',
              'Statuts de la société à jour',
              'Liste des ayants droit économiques',
            ].map((t, i) => (
              <li key={i} className="flex items-center gap-2 text-[12px] text-[#1E1E1E] tracking-[-0.003em]">
                <span className="w-1 h-1 rounded-full bg-[#7C5E3C] flex-shrink-0" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   AmlScreeningStep
   ───────────────────────────────────────────────────────── */
function AmlScreeningStep({ checks, screening, onStartScreening, clientName }) {
  const aml = checks.find(c => c.check_type === 'screening_check');
  const isComplete = aml?.status === 'complete';
  const isFailed   = aml?.status === 'failed';

  return (
    <div>
      <div className="mb-5">
        <h4 className="text-[17px] font-medium text-[#0A0A0A] tracking-[-0.015em]">Screening AML / LCB-FT</h4>
        <p className="text-[13px] text-[#5D5D5D] mt-1 tracking-[-0.006em]">
          Vérification automatique contre les listes de sanctions (OFAC, UE, ONU, UK HMT), PEP et média défavorables.
        </p>
      </div>

      {isComplete && (
        <Card className="p-5 flex items-center gap-4 relative overflow-hidden accent-ruler-left">
          <div className="flex-shrink-0 w-11 h-11 rounded-[10px] bg-white border border-[rgba(10,10,10,0.1)] flex items-center justify-center shadow-crisp">
            <svg className="w-[18px] h-[18px] text-[#16A34A]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-[#0A0A0A] tracking-[-0.01em]">Screening clean</p>
            <p className="text-[12.5px] text-[#5D5D5D] mt-0.5 tracking-[-0.003em]">
              Aucune correspondance trouvée dans les listes de sanctions, PEP ou média défavorables.
            </p>
          </div>
        </Card>
      )}

      {isFailed && (
        <Card className="p-5 flex items-center gap-4 relative overflow-hidden accent-ruler-left">
          <div className="flex-shrink-0 w-11 h-11 rounded-[10px] bg-white border border-[rgba(10,10,10,0.1)] flex items-center justify-center shadow-crisp">
            <svg className="w-[18px] h-[18px] text-[#DC2626]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-[#0A0A0A] tracking-[-0.01em]">Alerte AML — revue manuelle</p>
            <p className="text-[12.5px] text-[#5D5D5D] mt-0.5 tracking-[-0.003em]">
              Des correspondances potentielles ont été détectées. Une alerte compliance a été créée automatiquement.
            </p>
          </div>
        </Card>
      )}

      {!isComplete && !isFailed && (
        <div className="text-center py-6">
          {screening ? (
            <div className="flex flex-col items-center gap-5">
              <div className="relative w-16 h-16 rounded-full bg-white border border-[#E9E4D9] shadow-crisp flex items-center justify-center">
                <Spinner size="w-6 h-6" />
                <div className="absolute inset-0 rounded-full border-2 border-[#E9E4D9]" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-[#0A0A0A] tracking-[-0.01em]">Analyse en cours…</p>
                <p className="text-[12.5px] text-[#5D5D5D] mt-1 tracking-[-0.003em]">
                  Vérification de {clientName} contre les bases internationales
                </p>
              </div>
              <div className="flex items-center gap-3 mt-1">
                {['Sanctions', 'PEP', 'Média défavorable'].map((item) => (
                  <span
                    key={item}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-[#E9E4D9] shadow-crisp"
                  >
                    <Spinner size="w-2.5 h-2.5" />
                    <span className="text-[10.5px] text-[#5D5D5D] tracking-[-0.003em]">{item}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-[12px] bg-white border border-[rgba(10,10,10,0.1)] shadow-crisp mb-4">
                <svg className="w-6 h-6 text-[#7C5E3C]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <p className="text-[14px] font-medium text-[#0A0A0A] mb-2 tracking-[-0.01em]">Lancer le screening AML</p>
              <p className="text-[12.5px] text-[#5D5D5D] mb-6 max-w-sm mx-auto tracking-[-0.003em] leading-relaxed">
                Vérification contre les listes OFAC, UE, ONU, UK HMT et les bases PEP / média défavorables.
              </p>
              <Button variant="primary" onClick={onStartScreening}>
                Démarrer le screening
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   ResultStep
   ───────────────────────────────────────────────────────── */
function ResultStep({ kycStatus, checks, isAdmin, onValidate, overallComplete }) {
  const docChecks = checks.filter(c => c.check_type === 'document_check');
  const allDocsComplete = docChecks.length >= 2 && docChecks.every(c => c.status === 'complete');
  const amlComplete = checks.some(c => c.check_type === 'screening_check' && c.status === 'complete');
  const canValidate = allDocsComplete && amlComplete && !overallComplete;

  return (
    <div>
      <div className="mb-5">
        <h4 className="text-[17px] font-medium text-[#0A0A0A] tracking-[-0.015em]">Résultat de la vérification</h4>
        <p className="text-[13px] text-[#5D5D5D] mt-1 tracking-[-0.006em]">Synthèse des contrôles KYC effectués.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <SummaryCard
          label="Documents"
          value={`${docChecks.filter(c => c.status === 'complete').length} / ${Math.max(docChecks.length, 2)}`}
          ok={allDocsComplete}
          hint={allDocsComplete ? 'Tous vérifiés' : 'Au moins 2 requis'}
        />
        <SummaryCard
          label="Screening AML"
          value={amlComplete ? 'Clean' : checks.some(c => c.check_type === 'screening_check' && c.status === 'failed') ? 'Attention' : 'En attente'}
          ok={amlComplete}
          hint={amlComplete ? 'Aucune correspondance' : 'Lancer le screening'}
        />
      </div>

      {overallComplete ? (
        <Card className="p-5 text-center relative overflow-hidden watermark-sl">
          <p className="text-[14px] font-medium text-[#0A0A0A] tracking-[-0.01em]">KYC entièrement validé</p>
          <p className="text-[12.5px] text-[#5D5D5D] mt-1.5 tracking-[-0.003em]">
            {kycStatus?.validatedAt
              ? `Validé le ${new Date(kycStatus.validatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`
              : 'Validation confirmée'}
            {kycStatus?.validatedBy ? ` par ${kycStatus.validatedBy}` : ''}
          </p>
        </Card>
      ) : canValidate ? (
        <div className="text-center">
          {isAdmin ? (
            <>
              <p className="text-[13px] text-[#5D5D5D] mb-4 tracking-[-0.006em]">
                Toutes les vérifications sont complétées. En tant qu'administrateur, vous pouvez valider le KYC.
              </p>
              <Button variant="primary" onClick={onValidate}>
                Valider le KYC
              </Button>
            </>
          ) : (
            <p className="text-[13px] text-[#5D5D5D] tracking-[-0.006em]">
              Toutes les vérifications sont complétées. Un administrateur doit valider le KYC pour habiliter le client.
            </p>
          )}
        </div>
      ) : (
        <Card className="p-4 text-center bg-white">
          <p className="text-[13px] font-medium text-[#0A0A0A] tracking-[-0.006em]">Vérifications incomplètes</p>
          <p className="text-[12px] text-[#5D5D5D] mt-1 tracking-[-0.003em]">
            Complétez toutes les étapes (documents + screening AML) avant la validation finale.
          </p>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({ label, value, ok, hint }) {
  return (
    <div className={`rounded-[12px] p-4 bg-white border ${
      ok ? 'border-[rgba(22,163,74,0.22)] shadow-crisp' : 'border-[#E9E4D9]'
    }`}>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: ok ? '#16A34A' : '#9B9B9B' }} />
        <p className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#8A8278]">{label}</p>
      </div>
      <p className={`mt-2.5 text-[22px] font-medium tracking-[-0.02em] tabular-nums ${ok ? 'text-[#0A0A0A]' : 'text-[#1E1E1E]'}`}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-[#8A8278] mt-0.5 tracking-[-0.003em]">{hint}</p>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   CheckRow — row in the audit-style history list
   ───────────────────────────────────────────────────────── */
function CheckRow({ check }) {
  const statusCfg = KYC_STATUS[check.status] || KYC_STATUS.pending;
  const label = check.check_type === 'screening_check'
    ? 'Screening AML'
    : check.check_type === 'manual_validation'
      ? 'Validation administrateur'
      : KYC_DOCUMENT_TYPES[check.document_type]?.label || check.document_type || 'Document';

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-white transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white border border-[#E9E4D9] flex items-center justify-center shadow-crisp">
          {check.status === 'complete' ? (
            <svg className="w-4 h-4" style={{ color: statusCfg.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : check.status === 'failed' ? (
            <svg className="w-4 h-4" style={{ color: statusCfg.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <Spinner size="w-3.5 h-3.5" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[#0A0A0A] tracking-[-0.006em] truncate">{label}</p>
          {check.file_name && (
            <p className="text-[11.5px] text-[#8A8278] mt-0.5 tracking-[-0.003em] truncate">{check.file_name}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-[11px] text-[#8A8278] tabular-nums tracking-[-0.003em] hidden sm:inline">
          {check.created_at
            ? new Date(check.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
            : ''}
        </span>
        <Badge
          variant={
            check.status === 'complete' ? 'success' :
            check.status === 'failed' ? 'error' :
            'warning'
          }
          dot
        >
          {statusCfg.label}
        </Badge>
      </div>
    </div>
  );
}
