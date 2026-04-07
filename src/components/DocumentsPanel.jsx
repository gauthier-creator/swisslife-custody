import { useState, useEffect, useRef } from 'react';
import {
  fetchDocuments, uploadDocument, getDocumentUrl, updateDocumentStatus, deleteDocument,
  DOCUMENT_TYPES, DOCUMENT_CATEGORIES, STATUS_CONFIG, formatFileSize
} from '../services/documentService';
import { useAuth } from '../context/AuthContext';
import { Badge, Modal, Spinner, EmptyState, inputCls, selectCls, labelCls } from './shared';

export default function DocumentsPanel({ client }) {
  const { user, isAdmin } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewName, setPreviewName] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => { loadDocs(); }, [client.id]);

  const loadDocs = async () => {
    setLoading(true);
    try {
      const docs = await fetchDocuments(client.id);
      setDocuments(docs);
    } catch (err) {
      console.error('Error loading documents:', err);
      setDocuments([]);
    }
    setLoading(false);
  };

  const handlePreview = async (doc) => {
    try {
      const url = await getDocumentUrl(doc.file_path);
      setPreviewUrl(url);
      setPreviewName(doc.document_name);
    } catch (err) {
      alert('Impossible de charger le document: ' + err.message);
    }
  };

  const handleStatusChange = async (doc, newStatus) => {
    try {
      await updateDocumentStatus(doc.id, newStatus, user?.email || 'admin');
      await loadDocs();
    } catch (err) {
      alert('Erreur: ' + err.message);
    }
  };

  const handleDelete = async (doc) => {
    if (!confirm(`Supprimer "${doc.document_name}" ?`)) return;
    try {
      await deleteDocument(doc.id, doc.file_path);
      await loadDocs();
    } catch (err) {
      alert('Erreur: ' + err.message);
    }
  };

  // Group documents by category
  const grouped = {};
  documents.forEach(doc => {
    const typeInfo = DOCUMENT_TYPES[doc.document_type] || DOCUMENT_TYPES.other;
    const cat = typeInfo.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(doc);
  });

  const filteredDocs = filter === 'all' ? documents : documents.filter(d => {
    const typeInfo = DOCUMENT_TYPES[d.document_type] || DOCUMENT_TYPES.other;
    return typeInfo.category === filter;
  });

  // Stats
  const stats = {
    total: documents.length,
    verified: documents.filter(d => d.status === 'verified').length,
    pending: documents.filter(d => d.status === 'pending').length,
    rejected: documents.filter(d => d.status === 'rejected').length,
    expired: documents.filter(d => d.status === 'expired').length,
  };

  return (
    <div className="space-y-6">
      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total" value={stats.total} color="#0F0F10" />
        <StatCard label="Verifies" value={stats.verified} color="#059669" />
        <StatCard label="En attente" value={stats.pending} color="#F59E0B" />
        <StatCard label="Rejetes" value={stats.rejected} color="#DC2626" />
        <StatCard label="Expires" value={stats.expired} color="#9333EA" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FilterButton label="Tous" active={filter === 'all'} onClick={() => setFilter('all')} count={documents.length} />
          {Object.entries(DOCUMENT_CATEGORIES).map(([key, cat]) => {
            const count = (grouped[key] || []).length;
            return (
              <FilterButton key={key} label={cat.label} active={filter === key} onClick={() => setFilter(key)} count={count} />
            );
          })}
        </div>
        <button onClick={() => setShowUpload(true)}
          className="px-4 py-2 bg-[#0F0F10] text-white text-[13px] font-medium rounded-xl hover:bg-[#1a1a1a] transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m6-6H6" /></svg>
          Ajouter un document
        </button>
      </div>

      {/* Documents list */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : filteredDocs.length === 0 ? (
        <EmptyState
          title="Aucun document"
          description="Ajoutez les pieces justificatives du client pour completer le dossier KYC"
          icon={<svg className="w-6 h-6 text-[#A8A29E]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
        />
      ) : (
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(0,0,29,0.06)] bg-[rgba(0,0,23,0.02)]">
                <th className="px-5 py-3 text-[11px] text-[#A8A29E] font-medium text-left uppercase tracking-wider">Document</th>
                <th className="px-5 py-3 text-[11px] text-[#A8A29E] font-medium text-left uppercase tracking-wider">Type</th>
                <th className="px-5 py-3 text-[11px] text-[#A8A29E] font-medium text-left uppercase tracking-wider">Statut</th>
                <th className="px-5 py-3 text-[11px] text-[#A8A29E] font-medium text-left uppercase tracking-wider">Taille</th>
                <th className="px-5 py-3 text-[11px] text-[#A8A29E] font-medium text-left uppercase tracking-wider">Date</th>
                <th className="px-5 py-3 text-[11px] text-[#A8A29E] font-medium text-left uppercase tracking-wider">Expiration</th>
                <th className="px-5 py-3 text-[11px] text-[#A8A29E] font-medium text-right uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map(doc => {
                const typeInfo = DOCUMENT_TYPES[doc.document_type] || DOCUMENT_TYPES.other;
                const statusInfo = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
                const catInfo = DOCUMENT_CATEGORIES[typeInfo.category] || DOCUMENT_CATEGORIES.other;
                return (
                  <tr key={doc.id} className="border-b border-[rgba(0,0,29,0.04)] hover:bg-[rgba(0,0,23,0.015)] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[rgba(0,0,23,0.03)] rounded-lg flex items-center justify-center text-[16px]">
                          {doc.mime_type?.includes('pdf') ? (
                            <svg className="w-5 h-5 text-[#DC2626]" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/><path d="M8 12h1.5c.83 0 1.5.67 1.5 1.5S10.33 15 9.5 15H9v1.5H8V12zm1 2h.5c.28 0 .5-.22.5-.5s-.22-.5-.5-.5H9v1zm3-2h1.5c.83 0 1.5.67 1.5 1.5v1c0 .83-.67 1.5-1.5 1.5H12V12zm1 3h.5c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5H13v2zm3-3h2v1h-1v.5h1v1h-1V16h-1v-4z"/></svg>
                          ) : (
                            <span>{typeInfo.icon}</span>
                          )}
                        </div>
                        <div>
                          <p className="text-[13px] font-medium text-[#0F0F10] max-w-[200px] truncate">{doc.document_name}</p>
                          {doc.notes && <p className="text-[11px] text-[#A8A29E] max-w-[200px] truncate">{doc.notes}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div>
                        <span className="text-[12px] font-medium text-[#0F0F10]">{typeInfo.label}</span>
                        <p className="text-[10px] mt-0.5" style={{ color: catInfo.color }}>{catInfo.label}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium"
                        style={{ backgroundColor: statusInfo.bg, color: statusInfo.color }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusInfo.color }} />
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#787881] tabular-nums">
                      {formatFileSize(doc.file_size)}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#787881]">
                      {new Date(doc.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-[#787881]">
                      {doc.expiry_date ? (
                        <span className={new Date(doc.expiry_date) < new Date() ? 'text-[#DC2626] font-medium' : ''}>
                          {new Date(doc.expiry_date).toLocaleDateString('fr-FR')}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <ActionBtn icon="eye" title="Voir" onClick={() => handlePreview(doc)} />
                        {isAdmin && doc.status === 'pending' && (
                          <>
                            <ActionBtn icon="check" title="Valider" onClick={() => handleStatusChange(doc, 'verified')} variant="success" />
                            <ActionBtn icon="x" title="Rejeter" onClick={() => handleStatusChange(doc, 'rejected')} variant="error" />
                          </>
                        )}
                        {isAdmin && (
                          <ActionBtn icon="trash" title="Supprimer" onClick={() => handleDelete(doc)} variant="error" />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Checklist - Required documents */}
      <RequiredDocsChecklist documents={documents} clientType={client.type} />

      {/* Upload Modal */}
      <UploadModal
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        clientId={client.id}
        clientName={client.name}
        onUploaded={loadDocs}
      />

      {/* Preview Modal */}
      <Modal isOpen={!!previewUrl} onClose={() => { setPreviewUrl(null); setPreviewName(''); }} title={previewName} maxWidth="max-w-4xl">
        <div className="w-full" style={{ height: '75vh' }}>
          <iframe src={previewUrl} className="w-full h-full rounded-lg border border-[rgba(0,0,29,0.08)]" title={previewName} />
        </div>
      </Modal>
    </div>
  );
}

// ==========================================
// Upload Modal
// ==========================================
function UploadModal({ isOpen, onClose, clientId, clientName, onUploaded }) {
  const [docType, setDocType] = useState('passport');
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef(null);

  const reset = () => {
    setDocType('passport');
    setFile(null);
    setNotes('');
    setExpiryDate('');
    setUploading(false);
    setDragActive(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadDocument({
        salesforceAccountId: clientId,
        documentType: docType,
        file,
        notes: notes || null,
        expiryDate: expiryDate || null,
      });
      await onUploaded();
      handleClose();
    } catch (err) {
      alert('Erreur upload: ' + err.message);
    }
    setUploading(false);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Ajouter un document" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="bg-[rgba(0,0,23,0.02)] rounded-xl px-4 py-3 text-[12px] text-[#787881]">
          Client: <strong className="text-[#0F0F10]">{clientName}</strong>
        </div>

        {/* Document type */}
        <div>
          <label className={labelCls}>Type de document</label>
          <select className={selectCls} value={docType} onChange={e => setDocType(e.target.value)}>
            {Object.entries(DOCUMENT_CATEGORIES).map(([catKey, cat]) => (
              <optgroup key={catKey} label={cat.label}>
                {Object.entries(DOCUMENT_TYPES)
                  .filter(([, v]) => v.category === catKey)
                  .map(([key, v]) => (
                    <option key={key} value={key}>{v.icon} {v.label}</option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Drag & Drop zone */}
        <div>
          <label className={labelCls}>Fichier</label>
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              dragActive ? 'border-[#6366F1] bg-[#EEF2FF]' :
              file ? 'border-[#059669] bg-[#ECFDF5]' :
              'border-[rgba(0,0,29,0.12)] hover:border-[rgba(0,0,29,0.25)] bg-[rgba(0,0,23,0.015)]'
            }`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <svg className="w-8 h-8 text-[#059669]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-left">
                  <p className="text-[13px] font-medium text-[#0F0F10]">{file.name}</p>
                  <p className="text-[11px] text-[#787881]">{formatFileSize(file.size)}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="ml-2 text-[#A8A29E] hover:text-[#DC2626] transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <>
                <svg className="w-8 h-8 text-[#A8A29E] mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-[13px] text-[#787881]">Glissez un fichier ici ou <span className="text-[#6366F1] font-medium">parcourir</span></p>
                <p className="text-[11px] text-[#A8A29E] mt-1">PDF, JPEG, PNG — Max 50 Mo</p>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={e => { if (e.target.files[0]) setFile(e.target.files[0]); }} />
        </div>

        {/* Expiry date */}
        <div>
          <label className={labelCls}>Date d'expiration (optionnel)</label>
          <input type="date" className={inputCls} value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
        </div>

        {/* Notes */}
        <div>
          <label className={labelCls}>Notes (optionnel)</label>
          <input className={inputCls} placeholder="Ex: Copie certifiee conforme" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <button onClick={handleUpload} disabled={uploading || !file}
          className="w-full py-2.5 bg-[#0F0F10] text-white text-[14px] font-medium rounded-xl hover:bg-[#1a1a1a] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
          {uploading ? <><Spinner size="w-4 h-4" /> Upload en cours...</> : 'Ajouter le document'}
        </button>
      </div>
    </Modal>
  );
}

// ==========================================
// Required Documents Checklist
// ==========================================
function RequiredDocsChecklist({ documents, clientType }) {
  const isInstitutional = clientType === 'Other' || clientType === 'Institutional';

  const required = [
    { type: 'passport', alt: 'id_card', label: 'Piece d\'identite (passeport ou CI)' },
    { type: 'proof_of_address', label: 'Justificatif de domicile' },
    { type: 'source_of_funds', label: 'Origine des fonds' },
    { type: 'beneficial_owner_declaration', label: 'Declaration ayant droit economique' },
    { type: 'onboarding_form', label: 'Formulaire d\'entree en relation' },
    { type: 'mandate_agreement', label: 'Convention de mandat' },
    ...(isInstitutional ? [
      { type: 'company_registration', label: 'Extrait RC / K-bis' },
      { type: 'articles_of_association', label: 'Statuts de la societe' },
    ] : []),
    { type: 'tax_certificate', label: 'Attestation fiscale' },
  ];

  const getDocStatus = (req) => {
    const match = documents.find(d => d.document_type === req.type || (req.alt && d.document_type === req.alt));
    if (!match) return 'missing';
    return match.status;
  };

  const completed = required.filter(r => getDocStatus(r) === 'verified').length;

  return (
    <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-semibold text-[#0F0F10]">Checklist documentaire</h3>
        <span className="text-[12px] font-medium text-[#787881]">
          {completed}/{required.length} valides
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-[rgba(0,0,23,0.04)] rounded-full mb-4 overflow-hidden">
        <div className="h-full bg-[#059669] rounded-full transition-all duration-500"
          style={{ width: `${(completed / required.length) * 100}%` }} />
      </div>

      <div className="space-y-2">
        {required.map((req, i) => {
          const status = getDocStatus(req);
          return (
            <div key={i} className="flex items-center gap-3 py-1.5">
              {status === 'verified' ? (
                <svg className="w-5 h-5 text-[#059669] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : status === 'pending' ? (
                <svg className="w-5 h-5 text-[#F59E0B] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : status === 'rejected' ? (
                <svg className="w-5 h-5 text-[#DC2626] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-[rgba(0,0,29,0.1)] flex-shrink-0" />
              )}
              <span className={`text-[13px] ${status === 'verified' ? 'text-[#059669]' : status === 'missing' ? 'text-[#A8A29E]' : 'text-[#0F0F10]'}`}>
                {req.label}
              </span>
              {status === 'pending' && (
                <span className="text-[10px] font-medium text-[#F59E0B] bg-[#FFFBEB] px-1.5 py-0.5 rounded">En attente de validation</span>
              )}
              {status === 'rejected' && (
                <span className="text-[10px] font-medium text-[#DC2626] bg-[#FEF2F2] px-1.5 py-0.5 rounded">Rejete — a renvoyer</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================
// Small UI helpers
// ==========================================
function StatCard({ label, value, color }) {
  return (
    <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-xl px-4 py-3 text-center">
      <p className="text-[22px] font-bold tabular-nums" style={{ color }}>{value}</p>
      <p className="text-[11px] text-[#A8A29E] font-medium mt-0.5">{label}</p>
    </div>
  );
}

function FilterButton({ label, active, onClick, count }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all ${
        active ? 'bg-[#0F0F10] text-white' : 'text-[#787881] hover:bg-[rgba(0,0,23,0.04)]'
      }`}>
      {label} {count > 0 && <span className={`ml-1 ${active ? 'text-white/60' : 'text-[#A8A29E]'}`}>({count})</span>}
    </button>
  );
}

function ActionBtn({ icon, title, onClick, variant = 'default' }) {
  const colors = {
    default: 'text-[#787881] hover:text-[#0F0F10] hover:bg-[rgba(0,0,23,0.04)]',
    success: 'text-[#059669] hover:text-[#047857] hover:bg-[#ECFDF5]',
    error: 'text-[#DC2626] hover:text-[#B91C1C] hover:bg-[#FEF2F2]',
  };

  const icons = {
    eye: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />,
    check: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />,
    x: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />,
    trash: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />,
  };

  return (
    <button onClick={onClick} title={title}
      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${colors[variant]}`}>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {icons[icon]}
        {icon === 'eye' && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />}
      </svg>
    </button>
  );
}
