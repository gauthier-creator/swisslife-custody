import { API_BASE } from '../config/constants';

// Document type labels (FR) — used to categorize SF files by their Description tag
export const DOCUMENT_TYPES = {
  passport: { label: 'Passeport', category: 'kyc' },
  id_card: { label: "Carte d'identite", category: 'kyc' },
  proof_of_address: { label: 'Justificatif de domicile', category: 'kyc' },
  bank_reference: { label: 'Reference bancaire', category: 'kyc' },
  company_registration: { label: 'Extrait RC / K-bis', category: 'kyb' },
  articles_of_association: { label: 'Statuts de la societe', category: 'kyb' },
  tax_certificate: { label: 'Attestation fiscale', category: 'kyc' },
  risk_assessment: { label: 'Evaluation du risque', category: 'onboarding' },
  onboarding_form: { label: "Formulaire d'entree en relation", category: 'onboarding' },
  mandate_agreement: { label: 'Convention de mandat', category: 'onboarding' },
  beneficial_owner_declaration: { label: 'Declaration ayant droit economique', category: 'kyc' },
  source_of_funds: { label: 'Origine des fonds', category: 'kyc' },
  other: { label: 'Autre document', category: 'other' },
};

export const DOCUMENT_CATEGORIES = {
  kyc: { label: 'KYC / Identite', color: '#6366F1' },
  kyb: { label: 'KYB / Entreprise', color: '#0EA5E9' },
  onboarding: { label: 'Entree en relation', color: '#8B5CF6' },
  other: { label: 'Autres', color: '#787881' },
};

// Try to detect document type from title/description
function detectDocumentType(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes('passeport') || text.includes('passport')) return 'passport';
  if (text.includes('carte') && text.includes('ident')) return 'id_card';
  if (text.includes('domicile') || text.includes('proof of address') || text.includes('justificatif')) return 'proof_of_address';
  if (text.includes('reference bancaire') || text.includes('bank ref')) return 'bank_reference';
  if (text.includes('k-bis') || text.includes('kbis') || text.includes('extrait rc') || text.includes('company reg') || text.includes('registration')) return 'company_registration';
  if (text.includes('statut') || text.includes('articles')) return 'articles_of_association';
  if (text.includes('fiscal') || text.includes('tax')) return 'tax_certificate';
  if (text.includes('risque') || text.includes('risk')) return 'risk_assessment';
  if (text.includes('entree en relation') || text.includes('onboarding')) return 'onboarding_form';
  if (text.includes('mandat') || text.includes('mandate')) return 'mandate_agreement';
  if (text.includes('ayant droit') || text.includes('beneficial')) return 'beneficial_owner_declaration';
  if (text.includes('origine') || text.includes('source of funds')) return 'source_of_funds';
  if (text.includes('piece') && text.includes('ident')) return 'id_card';
  return 'other';
}

// Fetch all documents for a Salesforce account (from SF Files)
export async function fetchDocuments(salesforceAccountId) {
  const res = await fetch(`${API_BASE}/api/sf-files/${salesforceAccountId}`);
  if (!res.ok) throw new Error('Failed to fetch documents');
  const files = await res.json();

  // Map SF file structure to our document model
  return files.map(f => {
    const docType = detectDocumentType(f.title, f.description || '');
    return {
      id: f.id,                        // ContentDocument ID
      document_name: f.title,
      document_type: docType,
      file_type: f.fileType,           // PDF, JPG, PNG...
      file_size: f.size,
      created_at: f.createdDate,
      description: f.description,
      versionId: f.versionId,          // for download
      // SF files don't have status — we'll use description tags
      status: parseStatusFromDescription(f.description),
    };
  });
}

// Parse status from description (convention: [VERIFIED], [PENDING], [REJECTED], [EXPIRED])
function parseStatusFromDescription(desc) {
  if (!desc) return 'pending';
  const d = desc.toUpperCase();
  if (d.includes('[VERIFIED]') || d.includes('[VALIDE]')) return 'verified';
  if (d.includes('[REJECTED]') || d.includes('[REJETE]')) return 'rejected';
  if (d.includes('[EXPIRED]') || d.includes('[EXPIRE]')) return 'expired';
  return 'pending';
}

export const STATUS_CONFIG = {
  pending: { label: 'En attente', color: '#F59E0B', bg: '#FFFBEB' },
  verified: { label: 'Verifie', color: '#059669', bg: '#ECFDF5' },
  rejected: { label: 'Rejete', color: '#DC2626', bg: '#FEF2F2' },
  expired: { label: 'Expire', color: '#9333EA', bg: '#FAF5FF' },
};

// Upload a document to Salesforce
export async function uploadDocument({ salesforceAccountId, documentType, file, description }) {
  const typeLabel = DOCUMENT_TYPES[documentType]?.label || documentType;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', `${typeLabel} - ${file.name}`);
  formData.append('description', `${typeLabel}. ${description || ''}`);

  const res = await fetch(`${API_BASE}/api/sf-files/upload/${salesforceAccountId}`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

// Get preview URL for a file (proxied through our server)
export function getDocumentPreviewUrl(versionId) {
  return `${API_BASE}/api/sf-files/download/${versionId}`;
}

// Update document status (update description in Salesforce)
export async function updateDocumentStatus(contentDocumentId, versionId, newStatus, currentDescription) {
  // We update the ContentVersion description to include the status tag
  const cleanDesc = (currentDescription || '').replace(/\[(VERIFIED|VALIDE|REJECTED|REJETE|EXPIRED|EXPIRE|PENDING)\]/gi, '').trim();
  const statusTag = newStatus === 'verified' ? '[VERIFIED]' : newStatus === 'rejected' ? '[REJECTED]' : newStatus === 'expired' ? '[EXPIRED]' : '';
  const newDesc = `${cleanDesc} ${statusTag}`.trim();

  const res = await fetch(`${API_BASE}/api/salesforce/services/data/v59.0/sobjects/ContentVersion/${versionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Description: newDesc }),
  });

  if (!res.ok && res.status !== 204) {
    throw new Error('Failed to update status');
  }
}

// Delete a document from Salesforce
export async function deleteDocument(contentDocumentId) {
  const res = await fetch(`${API_BASE}/api/sf-files/${contentDocumentId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Delete failed');
  }
}

// Format file size
export function formatFileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
