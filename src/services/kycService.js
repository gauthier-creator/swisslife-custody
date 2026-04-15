import { API_BASE } from '../config/constants';
import { supabase } from '../lib/supabase';

/**
 * KYC Service — calls server-side /api/kyc/* endpoints.
 * Server proxies to ComplyCube (or runs a sandbox demo fallback).
 *
 * Every call passes the Supabase Bearer token so `requireAdmin` / `requireAuth`
 * middlewares can identify the user — required for /validate in particular.
 */

async function authHeaders(extra = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const h = { ...extra };
  if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
  return h;
}

async function jsonPost(path, body) {
  const h = await authHeaders({ 'Content-Type': 'application/json' });
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `${path} failed (${res.status})`);
  }
  return res.json();
}

async function jsonGet(path) {
  const h = await authHeaders();
  const res = await fetch(`${API_BASE}${path}`, { headers: h });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `${path} failed (${res.status})`);
  }
  return res.json();
}

// Create a ComplyCube client for a Salesforce account
export function createKycClient({ salesforceAccountId, clientName, email, personType }) {
  return jsonPost('/api/kyc/create-client', { salesforceAccountId, clientName, email, personType });
}

// Upload a document for KYC verification
export async function uploadKycDocument({ salesforceAccountId, clientName, documentType, file, initiatedByEmail }) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('salesforceAccountId', salesforceAccountId);
  formData.append('clientName', clientName || '');
  formData.append('documentType', documentType);
  formData.append('initiatedByEmail', initiatedByEmail || '');

  // For multipart/form-data we must NOT set Content-Type — the browser sets
  // it with the correct boundary. We still pass the Bearer token though.
  const h = await authHeaders();

  const res = await fetch(`${API_BASE}/api/kyc/upload-document`, {
    method: 'POST',
    headers: h,
    body: formData,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || 'Echec upload document KYC');
  }
  return res.json();
}

// Create a verification check on an uploaded document
export function createKycCheck({ salesforceAccountId, checkId }) {
  return jsonPost('/api/kyc/create-check', { salesforceAccountId, checkId });
}

// Get check result / status
export function getKycCheckResult(checkId) {
  return jsonGet(`/api/kyc/check/${checkId}`);
}

// Run AML screening for a client
export function runAmlScreening({ salesforceAccountId, clientName, initiatedByEmail }) {
  return jsonPost('/api/kyc/aml-screen', { salesforceAccountId, clientName, initiatedByEmail });
}

// Get full KYC status for a client (all checks + overall status)
export function getKycStatus(salesforceAccountId) {
  return jsonGet(`/api/kyc/status/${salesforceAccountId}`);
}

// Validate KYC (admin action — marks all checks as reviewed)
export function validateKyc({ salesforceAccountId, validatedByEmail }) {
  return jsonPost('/api/kyc/validate', { salesforceAccountId, validatedByEmail });
}

// KYC document types with labels
export const KYC_DOCUMENT_TYPES = {
  passport:                 { label: 'Passeport',                           required: true,  category: 'identity' },
  id_card:                  { label: "Carte d'identité",                    required: true,  category: 'identity' },
  proof_of_address:         { label: 'Justificatif de domicile',            required: true,  category: 'address' },
  bank_reference:           { label: 'Référence bancaire',                  required: false, category: 'financial' },
  company_registration:     { label: 'Extrait RC / K-bis',                  required: false, category: 'company' },
  articles_of_association:  { label: 'Statuts de la société',               required: false, category: 'company' },
  source_of_funds:          { label: 'Origine des fonds',                   required: true,  category: 'financial' },
  beneficial_owner:         { label: 'Déclaration ayant droit économique',  required: false, category: 'identity' },
};

// Check status labels (aligned with editorial palette — ink/paper/bronze)
export const KYC_STATUS = {
  pending:    { label: 'En attente', color: '#CA8A04', bg: '#FBFAF7' },
  processing: { label: 'En cours',   color: '#0A0A0A', bg: '#FBFAF7' },
  complete:   { label: 'Validé',     color: '#16A34A', bg: '#FBFAF7' },
  failed:     { label: 'Échec',      color: '#DC2626', bg: '#FBFAF7' },
};
