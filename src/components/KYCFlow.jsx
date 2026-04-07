import { useState, useEffect, useRef, useCallback } from 'react';
import { uploadKycDocument, runAmlScreening, getKycStatus, validateKyc, KYC_DOCUMENT_TYPES, KYC_STATUS } from '../services/kycService';
import { useAuth } from '../context/AuthContext';
import { Badge, Spinner, Modal } from './shared';

const STEPS = [
  { id: 'identity', label: "Piece d'identite", desc: 'Passeport ou carte d\'identite nationale' },
  { id: 'address', label: 'Justificatif domicile', desc: 'Facture < 3 mois ou attestation bancaire' },
  { id: 'funds', label: 'Origine des fonds', desc: 'Justificatif de l\'origine des fonds' },
  { id: 'aml', label: 'Screening AML', desc: 'Verification anti-blanchiment automatique' },
  { id: 'result', label: 'Resultat', desc: 'Statut final de la verification' },
];

const COMPANY_STEPS = [
  { id: 'company_docs', label: 'Documents societe', desc: 'K-bis / extrait RC et statuts' },
];

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

  const isCompany = client.type === 'Other'; // Institutionnel
  const allSteps = isCompany ? [...STEPS.slice(0, 3), ...COMPANY_STEPS, ...STEPS.slice(3)] : STEPS;

  // Load KYC status on mount
  const loadStatus = useCallback(async () => {
    try {
      const data = await getKycStatus(client.id);
      setKycStatus(data);
      setChecks(data.checks || []);
      // Auto-advance to correct step based on existing checks
      autoAdvanceStep(data.checks || []);
    } catch (err) {
      console.error('KYC status load error:', err);
    }
    setLoading(false);
  }, [client.id]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const autoAdvanceStep = (existingChecks) => {
    const hasIdentity = existingChecks.some(c => ['passport', 'id_card'].includes(c.document_type) && c.status !== 'failed');
    const hasAddress = existingChecks.some(c => c.document_type === 'proof_of_address' && c.status !== 'failed');
    const hasFunds = existingChecks.some(c => c.document_type === 'source_of_funds' && c.status !== 'failed');
    const hasCompanyDocs = existingChecks.some(c => ['company_registration', 'articles_of_association'].includes(c.document_type) && c.status !== 'failed');
    const hasAml = existingChecks.some(c => c.check_type === 'screening_check' && c.status !== 'failed');

    if (isCompany) {
      if (!hasIdentity) setCurrentStep(0);
      else if (!hasAddress) setCurrentStep(1);
      else if (!hasFunds) setCurrentStep(2);
      else if (!hasCompanyDocs) setCurrentStep(3);
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

  // Handle file upload for a step
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
      // Advance to next step
      setCurrentStep(prev => Math.min(prev + 1, allSteps.length - 1));
    } catch (err) {
      setError(err.message);
    }
    setUploading(false);
  };

  // Handle AML screening
  const handleAmlScreening = async () => {
    setScreening(true);
    setError(null);
    try {
      const result = await runAmlScreening({
        salesforceAccountId: client.id,
        clientName: client.name,
        initiatedByEmail: user?.email,
      });
      // Poll for result
      startPolling();
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
        const amlCheck = (data.checks || []).find(c => c.check_type === 'screening_check');
        if (amlCheck && amlCheck.status !== 'pending' && amlCheck.status !== 'processing') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setScreening(false);
          setCurrentStep(allSteps.length - 1); // Go to result
        }
      } catch {
        // continue polling
      }
      if (attempts >= 20) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setScreening(false);
        setCurrentStep(allSteps.length - 1);
      }
    }, 3000);
  };

  // Admin validate KYC
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

  // Determine document type for current step
  const getDocTypeForStep = (stepId) => {
    switch (stepId) {
      case 'identity': return 'passport';
      case 'address': return 'proof_of_address';
      case 'funds': return 'source_of_funds';
      case 'company_docs': return 'company_registration';
      default: return null;
    }
  };

  // Check if a step is complete
  const isStepComplete = (stepId) => {
    if (stepId === 'identity') return checks.some(c => ['passport', 'id_card'].includes(c.document_type) && c.status === 'complete');
    if (stepId === 'address') return checks.some(c => c.document_type === 'proof_of_address' && c.status === 'complete');
    if (stepId === 'funds') return checks.some(c => c.document_type === 'source_of_funds' && c.status === 'complete');
    if (stepId === 'company_docs') return checks.some(c => ['company_registration', 'articles_of_association'].includes(c.document_type) && c.status === 'complete');
    if (stepId === 'aml') return checks.some(c => c.check_type === 'screening_check' && c.status === 'complete');
    if (stepId === 'result') return kycStatus?.overallStatus === 'validated';
    return false;
  };

  const isStepPending = (stepId) => {
    if (stepId === 'identity') return checks.some(c => ['passport', 'id_card'].includes(c.document_type) && (c.status === 'pending' || c.status === 'processing'));
    if (stepId === 'address') return checks.some(c => c.document_type === 'proof_of_address' && (c.status === 'pending' || c.status === 'processing'));
    if (stepId === 'funds') return checks.some(c => c.document_type === 'source_of_funds' && (c.status === 'pending' || c.status === 'processing'));
    if (stepId === 'company_docs') return checks.some(c => ['company_registration', 'articles_of_association'].includes(c.document_type) && (c.status === 'pending' || c.status === 'processing'));
    if (stepId === 'aml') return checks.some(c => c.check_type === 'screening_check' && (c.status === 'pending' || c.status === 'processing'));
    return false;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="w-6 h-6" />
        <span className="ml-3 text-[13px] text-[#787881]">Chargement du statut KYC...</span>
      </div>
    );
  }

  const currentStepData = allSteps[currentStep];
  const overallComplete = kycStatus?.overallStatus === 'validated';

  return (
    <div className="space-y-6">
      {/* Overall Status Banner */}
      {overallComplete && (
        <div className="bg-[#ECFDF5] border border-[rgba(5,150,105,0.15)] rounded-xl px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#059669] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[#065F46]">KYC Valide</p>
            <p className="text-[12px] text-[#047857]">Toutes les verifications ont ete completees avec succes. Le client est habilite.</p>
          </div>
        </div>
      )}

      {/* Step Progress */}
      <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
        <h3 className="text-[15px] font-semibold text-[#0F0F10] mb-5">Verification KYC / KYB</h3>

        {/* Steps indicator */}
        <div className="flex items-center gap-1 mb-8">
          {allSteps.map((step, i) => {
            const complete = isStepComplete(step.id);
            const pending = isStepPending(step.id);
            const active = i === currentStep;
            return (
              <div key={step.id} className="flex-1 flex items-center">
                <button
                  onClick={() => setCurrentStep(i)}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg transition-all text-left ${
                    active ? 'bg-[#0F0F10] text-white' :
                    complete ? 'bg-[#ECFDF5] text-[#059669]' :
                    pending ? 'bg-[#EFF6FF] text-[#3B82F6]' :
                    'bg-[rgba(0,0,23,0.03)] text-[#787881] hover:bg-[rgba(0,0,23,0.06)]'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                    active ? 'bg-white text-[#0F0F10]' :
                    complete ? 'bg-[#059669] text-white' :
                    pending ? 'bg-[#3B82F6] text-white' :
                    'bg-[rgba(0,0,23,0.08)] text-[#A8A29E]'
                  }`}>
                    {complete ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : pending ? (
                      <Spinner size="w-3 h-3" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className="text-[11px] font-medium truncate hidden lg:block">{step.label}</span>
                </button>
                {i < allSteps.length - 1 && (
                  <div className={`w-4 h-0.5 flex-shrink-0 mx-0.5 ${complete ? 'bg-[#059669]' : 'bg-[rgba(0,0,23,0.08)]'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-[#FEF2F2] border border-[rgba(220,38,38,0.15)] rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
            <svg className="w-4 h-4 text-[#DC2626] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[12px] text-[#991B1B] flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-[#DC2626]">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* Step Content */}
        <div className="min-h-[240px]">
          {/* Document Upload Steps */}
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
              isCompany={isCompany}
            />
          )}

          {/* AML Screening Step */}
          {currentStepData?.id === 'aml' && (
            <AmlScreeningStep
              checks={checks}
              screening={screening}
              onStartScreening={handleAmlScreening}
              clientName={client.name}
            />
          )}

          {/* Result Step */}
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

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-[rgba(0,0,29,0.06)]">
          <button
            onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
            disabled={currentStep === 0}
            className="px-4 py-2 text-[13px] font-medium text-[#787881] hover:text-[#0F0F10] transition-colors disabled:opacity-30"
          >
            Precedent
          </button>
          <span className="text-[12px] text-[#A8A29E]">
            Etape {currentStep + 1} / {allSteps.length}
          </span>
          <button
            onClick={() => setCurrentStep(prev => Math.min(allSteps.length - 1, prev + 1))}
            disabled={currentStep === allSteps.length - 1}
            className="px-4 py-2 text-[13px] font-medium text-[#0F0F10] hover:bg-[rgba(0,0,23,0.05)] rounded-lg transition-colors disabled:opacity-30"
          >
            Suivant
          </button>
        </div>
      </div>

      {/* Checks History */}
      {checks.length > 0 && (
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
          <h4 className="text-[14px] font-semibold text-[#0F0F10] mb-4">Historique des verifications</h4>
          <div className="space-y-2">
            {checks.map(check => {
              const statusCfg = KYC_STATUS[check.status] || KYC_STATUS.pending;
              return (
                <div key={check.id} className="flex items-center justify-between py-3 px-4 bg-[rgba(0,0,23,0.02)] rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: statusCfg.bg }}>
                      {check.status === 'complete' ? (
                        <svg className="w-4 h-4" style={{ color: statusCfg.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : check.status === 'failed' ? (
                        <svg className="w-4 h-4" style={{ color: statusCfg.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" style={{ color: statusCfg.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#0F0F10]">
                        {check.check_type === 'screening_check' ? 'Screening AML' :
                         KYC_DOCUMENT_TYPES[check.document_type]?.label || check.document_type || check.check_type}
                      </p>
                      {check.file_name && (
                        <p className="text-[11px] text-[#A8A29E]">{check.file_name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-[#A8A29E]">
                      {check.created_at ? new Date(check.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: statusCfg.bg, color: statusCfg.color }}>
                      {statusCfg.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// Sub-components
// ==========================================

function DocumentUploadStep({ step, docType, checks, uploading, dragOver, onDragOver, onDragLeave, onDrop, onFileSelect, fileInputRef, isCompany }) {
  const existingCheck = checks.find(c => {
    if (step.id === 'identity') return ['passport', 'id_card'].includes(c.document_type);
    if (step.id === 'company_docs') return ['company_registration', 'articles_of_association'].includes(c.document_type);
    return c.document_type === docType;
  });

  const isComplete = existingCheck?.status === 'complete';
  const isPending = existingCheck?.status === 'pending' || existingCheck?.status === 'processing';

  return (
    <div>
      <div className="mb-4">
        <h4 className="text-[16px] font-semibold text-[#0F0F10]">{step.label}</h4>
        <p className="text-[13px] text-[#787881] mt-1">{step.desc}</p>
      </div>

      {isComplete && (
        <div className="bg-[#ECFDF5] border border-[rgba(5,150,105,0.15)] rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-[#059669]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-[13px] font-medium text-[#065F46]">Document verifie</p>
            <p className="text-[12px] text-[#047857]">{existingCheck.file_name || 'Document accepte'}</p>
          </div>
        </div>
      )}

      {isPending && (
        <div className="bg-[#EFF6FF] border border-[rgba(59,130,246,0.15)] rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
          <Spinner size="w-4 h-4" />
          <div>
            <p className="text-[13px] font-medium text-[#1E40AF]">Verification en cours</p>
            <p className="text-[12px] text-[#1D4ED8]">{existingCheck.file_name || 'Analyse du document...'}</p>
          </div>
        </div>
      )}

      {!isComplete && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={(e) => onDrop(e)}
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
            dragOver ? 'border-[#6366F1] bg-[#EEF2FF]' :
            'border-[rgba(0,0,29,0.12)] hover:border-[rgba(0,0,29,0.25)] bg-[rgba(0,0,23,0.015)]'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => onFileSelect(e)}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Spinner size="w-8 h-8" />
              <p className="text-[13px] text-[#787881]">Upload et verification en cours...</p>
            </div>
          ) : (
            <>
              <div className="w-14 h-14 mx-auto mb-4 bg-[rgba(0,0,23,0.04)] rounded-2xl flex items-center justify-center">
                <svg className="w-7 h-7 text-[#A8A29E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-[14px] font-medium text-[#0F0F10] mb-1">
                Glissez votre fichier ici
              </p>
              <p className="text-[12px] text-[#A8A29E]">
                ou cliquez pour parcourir — PDF, JPG, PNG (max 50 Mo)
              </p>
              {step.id === 'identity' && (
                <div className="flex items-center justify-center gap-3 mt-4">
                  <span className="px-3 py-1 rounded-full bg-[rgba(0,0,23,0.04)] text-[11px] text-[#787881]">Passeport</span>
                  <span className="px-3 py-1 rounded-full bg-[rgba(0,0,23,0.04)] text-[11px] text-[#787881]">Carte d'identite</span>
                  <span className="px-3 py-1 rounded-full bg-[rgba(0,0,23,0.04)] text-[11px] text-[#787881]">Permis de conduire</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Required documents info for company step */}
      {step.id === 'company_docs' && (
        <div className="mt-4 bg-[rgba(0,0,23,0.02)] rounded-xl p-4">
          <p className="text-[12px] font-medium text-[#0F0F10] mb-2">Documents requis pour les personnes morales :</p>
          <ul className="space-y-1.5">
            <li className="flex items-center gap-2 text-[12px] text-[#787881]">
              <svg className="w-3 h-3 text-[#A8A29E]" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>
              Extrait du registre du commerce (RC) ou K-bis {'<'} 3 mois
            </li>
            <li className="flex items-center gap-2 text-[12px] text-[#787881]">
              <svg className="w-3 h-3 text-[#A8A29E]" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>
              Statuts de la societe a jour
            </li>
            <li className="flex items-center gap-2 text-[12px] text-[#787881]">
              <svg className="w-3 h-3 text-[#A8A29E]" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>
              Liste des ayants droit economiques
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

function AmlScreeningStep({ checks, screening, onStartScreening, clientName }) {
  const amlCheck = checks.find(c => c.check_type === 'screening_check');
  const isComplete = amlCheck?.status === 'complete';
  const isFailed = amlCheck?.status === 'failed';

  return (
    <div>
      <div className="mb-4">
        <h4 className="text-[16px] font-semibold text-[#0F0F10]">Screening AML / LCB-FT</h4>
        <p className="text-[13px] text-[#787881] mt-1">
          Verification automatique contre les listes de sanctions, PEP et media defavorables.
        </p>
      </div>

      {isComplete && (
        <div className="bg-[#ECFDF5] border border-[rgba(5,150,105,0.15)] rounded-xl px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#059669] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[#065F46]">Screening clean</p>
            <p className="text-[12px] text-[#047857]">Aucune correspondance trouvee dans les listes de sanctions, PEP ou media defavorables.</p>
          </div>
        </div>
      )}

      {isFailed && (
        <div className="bg-[#FEF2F2] border border-[rgba(220,38,38,0.15)] rounded-xl px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#DC2626] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
            </svg>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[#991B1B]">Alerte AML</p>
            <p className="text-[12px] text-[#B91C1C]">Des correspondances potentielles ont ete detectees. Une revue manuelle est requise.</p>
          </div>
        </div>
      )}

      {!isComplete && !isFailed && (
        <div className="text-center py-6">
          {screening ? (
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-[rgba(0,0,23,0.06)] flex items-center justify-center">
                  <Spinner size="w-8 h-8" />
                </div>
              </div>
              <div>
                <p className="text-[14px] font-medium text-[#0F0F10]">Analyse en cours...</p>
                <p className="text-[12px] text-[#787881] mt-1">Verification de {clientName} contre les bases de donnees internationales</p>
              </div>
              <div className="flex items-center gap-4 mt-2">
                {['Sanctions', 'PEP', 'Media'].map((item, i) => (
                  <div key={item} className="flex items-center gap-1.5">
                    <Spinner size="w-3 h-3" />
                    <span className="text-[11px] text-[#787881]">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="w-14 h-14 mx-auto mb-4 bg-[rgba(0,0,23,0.04)] rounded-2xl flex items-center justify-center">
                <svg className="w-7 h-7 text-[#A8A29E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <p className="text-[14px] font-medium text-[#0F0F10] mb-2">Lancer le screening AML</p>
              <p className="text-[12px] text-[#787881] mb-6">
                Verification contre les listes OFAC, UE, ONU, UK HMT, et les bases PEP/media.
              </p>
              <button
                onClick={onStartScreening}
                className="px-6 py-2.5 bg-[#0F0F10] text-white text-[13px] font-medium rounded-xl hover:bg-[#1a1a1a] transition-colors"
              >
                Demarrer le screening
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ResultStep({ kycStatus, checks, isAdmin, onValidate, overallComplete }) {
  const allDocChecksComplete = checks
    .filter(c => c.check_type === 'document_check')
    .every(c => c.status === 'complete');
  const amlComplete = checks.some(c => c.check_type === 'screening_check' && c.status === 'complete');
  const hasDocChecks = checks.filter(c => c.check_type === 'document_check').length >= 2; // at least ID + address

  const canValidate = allDocChecksComplete && amlComplete && hasDocChecks && !overallComplete;

  return (
    <div>
      <div className="mb-6">
        <h4 className="text-[16px] font-semibold text-[#0F0F10]">Resultat de la verification</h4>
        <p className="text-[13px] text-[#787881] mt-1">Synthese des verifications KYC effectuees.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <SummaryCard
          label="Documents"
          value={`${checks.filter(c => c.check_type === 'document_check' && c.status === 'complete').length} / ${checks.filter(c => c.check_type === 'document_check').length}`}
          ok={allDocChecksComplete && hasDocChecks}
        />
        <SummaryCard
          label="Screening AML"
          value={amlComplete ? 'Clean' : 'En attente'}
          ok={amlComplete}
        />
      </div>

      {overallComplete ? (
        <div className="bg-[#ECFDF5] border border-[rgba(5,150,105,0.15)] rounded-xl px-5 py-4 text-center">
          <p className="text-[14px] font-semibold text-[#065F46]">KYC entierement valide</p>
          <p className="text-[12px] text-[#047857] mt-1">
            {kycStatus?.validatedAt ? `Valide le ${new Date(kycStatus.validatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}` : 'Validation confirmee'}
            {kycStatus?.validatedBy ? ` par ${kycStatus.validatedBy}` : ''}
          </p>
        </div>
      ) : canValidate ? (
        <div className="text-center">
          {isAdmin ? (
            <>
              <p className="text-[13px] text-[#787881] mb-4">
                Toutes les verifications sont completees. En tant qu'administrateur, vous pouvez valider le KYC.
              </p>
              <button
                onClick={onValidate}
                className="px-6 py-2.5 bg-[#059669] text-white text-[13px] font-medium rounded-xl hover:bg-[#047857] transition-colors"
              >
                Valider le KYC
              </button>
            </>
          ) : (
            <p className="text-[13px] text-[#787881]">
              Toutes les verifications sont completees. Un administrateur doit valider le KYC pour habiliter le client.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-[#FFFBEB] border border-[rgba(217,119,6,0.15)] rounded-xl px-4 py-3 text-center">
          <p className="text-[13px] font-medium text-[#92400E]">Verifications incompletes</p>
          <p className="text-[12px] text-[#B45309] mt-1">
            Completez toutes les etapes (documents + screening AML) avant la validation finale.
          </p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, ok }) {
  return (
    <div className={`rounded-xl p-4 border ${ok ? 'bg-[#ECFDF5] border-[rgba(5,150,105,0.15)]' : 'bg-[rgba(0,0,23,0.02)] border-[rgba(0,0,29,0.08)]'}`}>
      <p className="text-[11px] text-[#A8A29E] font-medium uppercase tracking-wider mb-1">{label}</p>
      <div className="flex items-center gap-2">
        {ok && (
          <svg className="w-4 h-4 text-[#059669]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        <p className={`text-[14px] font-semibold ${ok ? 'text-[#059669]' : 'text-[#0F0F10]'}`}>{value}</p>
      </div>
    </div>
  );
}
