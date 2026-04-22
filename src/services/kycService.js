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

// Run AML screening for a client — serveur auto-détecte person vs company
// depuis accountType. Pour une personne morale, screene automatiquement
// la raison sociale + tous les contacts SFDC (représentants légaux / UBO).
export function runAmlScreening({ salesforceAccountId, clientName, accountType, initiatedByEmail }) {
  return jsonPost('/api/kyc/aml-screen', { salesforceAccountId, clientName, accountType, initiatedByEmail });
}

// Screen a single Salesforce Contact as person — utilisé par le bouton
// "Screener" sur chaque ligne de l'onglet Contacts.
export function screenContact({ salesforceAccountId, contactId, firstName, lastName, email, role, initiatedByEmail }) {
  return jsonPost('/api/kyc/screen-contact', { salesforceAccountId, contactId, firstName, lastName, email, role, initiatedByEmail });
}

// ─── Screening progressif (plan + entité-par-entité + finalize) ──────
// L'UI appelle screenPlan() pour récupérer la liste des entités à contrôler,
// puis screenEntity() dans une boucle pour avoir un feedback live par entité,
// puis screenFinalize() pour agréger le verdict et patcher SFDC.

// Récupère le plan (liste des entités à screener) — ne consomme AUCUN
// appel ComplyCube, c'est juste une préparation.
export function screenPlan({ salesforceAccountId, clientName, accountType }) {
  return jsonPost('/api/kyc/screen-plan', { salesforceAccountId, clientName, accountType });
}

// Screene UNE entité du plan. Retourne le kyc_check persisté.
export function screenEntity(entity, { salesforceAccountId, clientName, initiatedByEmail }) {
  return jsonPost('/api/kyc/screen-entity', {
    salesforceAccountId,
    clientName,
    kind: entity.kind,
    entityId: entity.entityId,
    displayName: entity.displayName,
    firstName: entity.firstName,
    lastName: entity.lastName,
    email: entity.email,
    role: entity.role,
    initiatedByEmail,
  });
}

// Agrège les verdicts et patche SFDC Custody_Sanctions_Clear__c.
export function screenFinalize({ salesforceAccountId, checkIds, initiatedByEmail }) {
  return jsonPost('/api/kyc/screen-finalize', { salesforceAccountId, checkIds, initiatedByEmail });
}

// Get full KYC status for a client (all checks + overall status)
export function getKycStatus(salesforceAccountId) {
  return jsonGet(`/api/kyc/status/${salesforceAccountId}`);
}

// Validate KYC (admin action). Double-écriture :
//   · Supabase kyc_checks (historique)
//   · Salesforce Account (Custody_KYC_* fields → visible dans le CRM)
export function validateKyc({ salesforceAccountId, validatedByEmail, notes, providerRef }) {
  return jsonPost('/api/kyc/validate', { salesforceAccountId, validatedByEmail, notes, providerRef });
}

// Reject KYC — miroir de validateKyc, pour refuser un dossier incomplet ou
// suspect. Marque Custody_KYC_Status__c = 'Rejeté' dans SFDC.
export function rejectKyc({ salesforceAccountId, rejectedByEmail, reason }) {
  return jsonPost('/api/kyc/reject', { salesforceAccountId, rejectedByEmail, reason });
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
