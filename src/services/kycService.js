import { API_BASE } from '../config/constants';

const headers = { 'Content-Type': 'application/json' };

/**
 * KYC Service — calls server-side /api/kyc/* endpoints
 * Server proxies to ComplyCube API (or runs in demo mode)
 */

// Create a ComplyCube client for a Salesforce account
export async function createKycClient({ salesforceAccountId, clientName, email, personType }) {
  const res = await fetch(`${API_BASE}/api/kyc/create-client`, {
    method: 'POST', headers,
    body: JSON.stringify({ salesforceAccountId, clientName, email, personType }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Echec creation client KYC'); }
  return res.json();
}

// Upload a document for KYC verification
export async function uploadKycDocument({ salesforceAccountId, clientName, documentType, file, initiatedByEmail }) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('salesforceAccountId', salesforceAccountId);
  formData.append('clientName', clientName || '');
  formData.append('documentType', documentType);
  formData.append('initiatedByEmail', initiatedByEmail || '');

  const res = await fetch(`${API_BASE}/api/kyc/upload-document`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Echec upload document KYC'); }
  return res.json();
}

// Create a verification check on an uploaded document
export async function createKycCheck({ salesforceAccountId, checkId }) {
  const res = await fetch(`${API_BASE}/api/kyc/create-check`, {
    method: 'POST', headers,
    body: JSON.stringify({ salesforceAccountId, checkId }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Echec verification KYC'); }
  return res.json();
}

// Get check result / status
export async function getKycCheckResult(checkId) {
  const res = await fetch(`${API_BASE}/api/kyc/check/${checkId}`, { headers });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Echec lecture resultat KYC'); }
  return res.json();
}

// Run AML screening for a client
export async function runAmlScreening({ salesforceAccountId, clientName, initiatedByEmail }) {
  const res = await fetch(`${API_BASE}/api/kyc/aml-screen`, {
    method: 'POST', headers,
    body: JSON.stringify({ salesforceAccountId, clientName, initiatedByEmail }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Echec screening AML'); }
  return res.json();
}

// Get full KYC status for a client (all checks + overall status)
export async function getKycStatus(salesforceAccountId) {
  const res = await fetch(`${API_BASE}/api/kyc/status/${salesforceAccountId}`, { headers });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Echec lecture statut KYC'); }
  return res.json();
}

// Validate KYC (admin action — marks all checks as reviewed)
export async function validateKyc({ salesforceAccountId, validatedByEmail }) {
  const res = await fetch(`${API_BASE}/api/kyc/validate`, {
    method: 'POST', headers,
    body: JSON.stringify({ salesforceAccountId, validatedByEmail }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Echec validation KYC'); }
  return res.json();
}

// KYC document types with labels
export const KYC_DOCUMENT_TYPES = {
  passport: { label: 'Passeport', required: true, category: 'identity' },
  id_card: { label: "Carte d'identite", required: true, category: 'identity' },
  proof_of_address: { label: 'Justificatif de domicile', required: true, category: 'address' },
  bank_reference: { label: 'Reference bancaire', required: false, category: 'financial' },
  company_registration: { label: 'Extrait RC / K-bis', required: false, category: 'company' },
  articles_of_association: { label: 'Statuts de la societe', required: false, category: 'company' },
  source_of_funds: { label: 'Origine des fonds', required: true, category: 'financial' },
  beneficial_owner: { label: 'Declaration ayant droit economique', required: false, category: 'identity' },
};

// Check status labels
export const KYC_STATUS = {
  pending: { label: 'En attente', color: '#F59E0B', bg: '#FFFBEB' },
  processing: { label: 'En cours', color: '#3B82F6', bg: '#EFF6FF' },
  complete: { label: 'Valide', color: '#059669', bg: '#ECFDF5' },
  failed: { label: 'Echec', color: '#DC2626', bg: '#FEF2F2' },
};

// ============ PERIODIC REVIEW ============

// Get KYC review schedule for all clients
export async function fetchKycReviewSchedule() {
  const res = await fetch(`${API_BASE}/api/kyc/review-schedule`, { headers });
  if (!res.ok) throw new Error('Echec lecture planning revue KYC');
  return res.json();
}

// Trigger re-screening for a specific client
export async function triggerRescreening(salesforceAccountId, email) {
  const res = await fetch(`${API_BASE}/api/kyc/trigger-rescreening`, {
    method: 'POST', headers,
    body: JSON.stringify({ salesforceAccountId, initiatedByEmail: email }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Echec re-screening'); }
  return res.json();
}

// Batch check all clients for expired KYC
export async function batchReviewCheck() {
  const res = await fetch(`${API_BASE}/api/kyc/batch-review-check`, {
    method: 'POST', headers,
  });
  if (!res.ok) throw new Error('Echec verification batch KYC');
  return res.json();
}

// ============ MONITORING ============

export async function analyzeTransfer(data) {
  const res = await fetch(`${API_BASE}/api/compliance/monitoring/analyze-transfer`, {
    method: 'POST', headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Echec analyse monitoring');
  return res.json();
}

export async function fetchClientMonitoringProfile(accountId) {
  const res = await fetch(`${API_BASE}/api/compliance/monitoring/client-profile/${accountId}`, { headers });
  if (!res.ok) throw new Error('Echec lecture profil monitoring');
  return res.json();
}

export async function runBatchMonitoring() {
  const res = await fetch(`${API_BASE}/api/compliance/monitoring/run-batch`, {
    method: 'POST', headers,
  });
  if (!res.ok) throw new Error('Echec monitoring batch');
  return res.json();
}
