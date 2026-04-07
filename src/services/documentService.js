import { supabase } from '../lib/supabase';

// Document type labels (FR)
export const DOCUMENT_TYPES = {
  passport: { label: 'Passeport', category: 'kyc', icon: '🪪' },
  id_card: { label: "Carte d'identite", category: 'kyc', icon: '🪪' },
  proof_of_address: { label: 'Justificatif de domicile', category: 'kyc', icon: '🏠' },
  bank_reference: { label: 'Reference bancaire', category: 'kyc', icon: '🏦' },
  company_registration: { label: 'Extrait RC / K-bis', category: 'kyb', icon: '🏢' },
  articles_of_association: { label: 'Statuts de la societe', category: 'kyb', icon: '📜' },
  tax_certificate: { label: 'Attestation fiscale', category: 'kyc', icon: '📋' },
  risk_assessment: { label: 'Evaluation du risque', category: 'onboarding', icon: '⚖️' },
  onboarding_form: { label: "Formulaire d'entree en relation", category: 'onboarding', icon: '📝' },
  mandate_agreement: { label: 'Convention de mandat', category: 'onboarding', icon: '✍️' },
  beneficial_owner_declaration: { label: 'Declaration ayant droit economique', category: 'kyc', icon: '👤' },
  source_of_funds: { label: 'Origine des fonds', category: 'kyc', icon: '💰' },
  other: { label: 'Autre document', category: 'other', icon: '📎' },
};

export const DOCUMENT_CATEGORIES = {
  kyc: { label: 'KYC / Identite', color: '#6366F1' },
  kyb: { label: 'KYB / Entreprise', color: '#0EA5E9' },
  onboarding: { label: 'Entree en relation', color: '#8B5CF6' },
  other: { label: 'Autres', color: '#787881' },
};

export const STATUS_CONFIG = {
  pending: { label: 'En attente', color: '#F59E0B', bg: '#FFFBEB' },
  verified: { label: 'Verifie', color: '#059669', bg: '#ECFDF5' },
  rejected: { label: 'Rejete', color: '#DC2626', bg: '#FEF2F2' },
  expired: { label: 'Expire', color: '#9333EA', bg: '#FAF5FF' },
};

// Fetch all documents for a Salesforce account
export async function fetchDocuments(salesforceAccountId) {
  const { data, error } = await supabase
    .from('client_documents')
    .select('*')
    .eq('salesforce_account_id', salesforceAccountId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// Upload a document
export async function uploadDocument({ salesforceAccountId, documentType, file, notes, expiryDate }) {
  // 1. Upload file to storage
  const fileExt = file.name.split('.').pop();
  const filePath = `${salesforceAccountId}/${Date.now()}_${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from('client-documents')
    .upload(filePath, file, { contentType: file.type });

  if (uploadError) throw uploadError;

  // 2. Create document record
  const { data, error } = await supabase
    .from('client_documents')
    .insert({
      salesforce_account_id: salesforceAccountId,
      document_type: documentType,
      document_name: file.name,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type,
      status: 'pending',
      notes: notes || null,
      expiry_date: expiryDate || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get signed URL for viewing/downloading a document
export async function getDocumentUrl(filePath) {
  const { data, error } = await supabase.storage
    .from('client-documents')
    .createSignedUrl(filePath, 3600); // 1h

  if (error) throw error;
  return data.signedUrl;
}

// Update document status (verify, reject, etc.)
export async function updateDocumentStatus(docId, status, verifiedBy) {
  const updates = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'verified') {
    updates.verified_by = verifiedBy;
    updates.verified_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('client_documents')
    .update(updates)
    .eq('id', docId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Delete a document
export async function deleteDocument(docId, filePath) {
  // Delete file from storage
  if (filePath) {
    await supabase.storage.from('client-documents').remove([filePath]);
  }
  // Delete record
  const { error } = await supabase
    .from('client_documents')
    .delete()
    .eq('id', docId);

  if (error) throw error;
}

// Format file size
export function formatFileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
