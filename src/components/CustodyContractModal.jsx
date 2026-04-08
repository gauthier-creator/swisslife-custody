import { useState, useRef } from 'react';
import { Modal } from './shared';
import { updateAccountFields } from '../services/salesforceApi';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/constants';
import { supabase } from '../lib/supabase';

const fmtDateFR = () => {
  return new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export default function CustodyContractModal({ isOpen, onClose, client, onSigned }) {
  const { user } = useAuth();
  const [signing, setSigning] = useState(false);
  const contractRef = useRef(null);

  if (!isOpen) return null;

  const clientName = client.name || '—';
  const clientAddress = [client.street, client.postalCode, client.city, client.country].filter(Boolean).join(', ') || 'Adresse non renseignee';
  const clientPhone = client.phone || 'Non renseigne';
  const currentDate = fmtDateFR();

  const handleSign = async () => {
    setSigning(true);
    try {
      // 1. Update Salesforce
      await updateAccountFields(client.id, { Custody_Contract_Signed__c: true });

      // 2. Store in audit_log
      const { data: { session } } = await supabase.auth.getSession();
      const authHeaders = session?.access_token
        ? { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
        : { 'Content-Type': 'application/json' };

      await fetch(`${API_BASE}/api/audit-log`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action: 'custody_contract_signed',
          category: 'custody',
          entityType: 'Account',
          entityId: client.id,
          clientName: client.name,
          salesforceAccountId: client.id,
          details: {
            signedBy: user?.email,
            signedAt: new Date().toISOString(),
            clientName,
            clientAddress,
            contractType: 'Conservation Actifs Numeriques',
          },
        }),
      }).catch(() => {});

      if (onSigned) await onSigned();
      onClose();
    } catch (err) {
      alert('Erreur signature contrat: ' + err.message);
    }
    setSigning(false);
  };

  const handlePrint = () => {
    const printContent = contractRef.current;
    if (!printContent) return;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Contrat Custody - ${clientName}</title>
          <style>
            body { font-family: Georgia, 'Times New Roman', serif; max-width: 700px; margin: 40px auto; padding: 40px; color: #1a1a1a; line-height: 1.7; font-size: 13px; }
            h1 { font-size: 18px; text-align: center; margin-bottom: 32px; letter-spacing: 1px; text-transform: uppercase; }
            h2 { font-size: 14px; margin-top: 24px; margin-bottom: 8px; }
            p { margin: 8px 0; text-align: justify; }
            .parties { margin: 24px 0; }
            .signature { margin-top: 48px; display: flex; justify-content: space-between; }
            .signature div { width: 45%; border-top: 1px solid #333; padding-top: 8px; }
            @media print { body { margin: 0; padding: 20px; } }
          </style>
        </head>
        <body>${printContent.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Contrat de Conservation d'Actifs Numeriques" maxWidth="max-w-3xl">
      <div className="p-2">
        {/* Contract document */}
        <div
          ref={contractRef}
          className="bg-white border border-[rgba(0,0,29,0.1)] rounded-xl p-8 mb-6 max-h-[55vh] overflow-y-auto"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          <h1 style={{ fontSize: '17px', textAlign: 'center', marginBottom: '28px', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 700, color: '#0F0F10' }}>
            Contrat de Conservation d'Actifs Numeriques
          </h1>

          <div style={{ margin: '24px 0', lineHeight: '1.8', fontSize: '13px', color: '#333' }}>
            <p style={{ marginBottom: '16px' }}>
              <strong>Entre :</strong>
            </p>
            <p style={{ marginBottom: '4px' }}>
              <strong>SwissLife Banque Privee</strong><br />
              Societe Anonyme au capital de XXX euros<br />
              Siege social : 7 rue Belgrand, 92300 Levallois-Perret<br />
              RCS Nanterre XXX<br />
              Agreee en qualite de Prestataire de Services sur Actifs Numeriques (CASP)<br />
              ci-apres denominee <em>"La Banque"</em>
            </p>

            <p style={{ margin: '16px 0' }}><strong>Et :</strong></p>

            <p style={{ marginBottom: '4px' }}>
              <strong>{clientName}</strong><br />
              {clientAddress}<br />
              Tel. : {clientPhone}<br />
              ci-apres denomme(e) <em>"Le Client"</em>
            </p>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #e5e5e5', margin: '24px 0' }} />

          <div style={{ fontSize: '13px', color: '#333', lineHeight: '1.8' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, marginTop: '20px', marginBottom: '8px' }}>Article 1 — Objet</h2>
            <p style={{ textAlign: 'justify' }}>
              Le present contrat a pour objet de definir les conditions dans lesquelles La Banque assure, pour le compte du Client,
              la conservation d'actifs numeriques au sens de l'article L.54-10-1 du Code Monetaire et Financier et du reglement (UE) 2023/1114 (MiCA).
            </p>

            <h2 style={{ fontSize: '14px', fontWeight: 700, marginTop: '20px', marginBottom: '8px' }}>Article 2 — Services de conservation</h2>
            <p style={{ textAlign: 'justify' }}>
              La Banque assure la garde des cles cryptographiques privees necessaires a la detention et au transfert des actifs numeriques du Client,
              au moyen d'une infrastructure de type MPC (Multi-Party Computation) conforme aux standards de securite de l'industrie.
            </p>

            <h2 style={{ fontSize: '14px', fontWeight: 700, marginTop: '20px', marginBottom: '8px' }}>Article 3 — Segregation des actifs</h2>
            <p style={{ textAlign: 'justify' }}>
              Conformement a l'article 75(7) du reglement MiCA, les actifs numeriques du Client sont conserves sur des adresses blockchain
              distinctes de celles de La Banque et des autres clients. Les actifs du Client ne font pas partie du bilan de La Banque.
            </p>

            <h2 style={{ fontSize: '14px', fontWeight: 700, marginTop: '20px', marginBottom: '8px' }}>Article 4 — Responsabilite</h2>
            <p style={{ textAlign: 'justify' }}>
              La Banque est responsable de la perte d'actifs numeriques resultant d'un incident imputable a La Banque ou a ses prestataires techniques,
              conformement a l'article 75(8) du reglement MiCA. La valeur de restitution correspond a la valeur de marche des actifs au moment de la perte.
            </p>

            <h2 style={{ fontSize: '14px', fontWeight: 700, marginTop: '20px', marginBottom: '8px' }}>Article 5 — Restitution</h2>
            <p style={{ textAlign: 'justify' }}>
              Le Client peut demander la restitution de tout ou partie de ses actifs numeriques a tout moment.
              La Banque s'engage a executer la restitution dans un delai raisonnable ne pouvant exceder 5 jours ouvrables.
            </p>

            <h2 style={{ fontSize: '14px', fontWeight: 700, marginTop: '20px', marginBottom: '8px' }}>Article 6 — Frais</h2>
            <p style={{ textAlign: 'justify' }}>
              Les frais de conservation sont de [X] points de base par an, calcules sur la valeur de marche moyenne des actifs conserves.
              Les frais de transaction sont factures separement selon le bareme en vigueur.
            </p>

            <h2 style={{ fontSize: '14px', fontWeight: 700, marginTop: '20px', marginBottom: '8px' }}>Article 7 — Lutte contre le blanchiment</h2>
            <p style={{ textAlign: 'justify' }}>
              Le Client s'engage a respecter l'ensemble des obligations relatives a la lutte contre le blanchiment et le financement du terrorisme.
              La Banque se reserve le droit de geler les actifs du Client sur instruction de Tracfin ou de toute autorite competente (art. L.562-4 CMF).
            </p>

            <h2 style={{ fontSize: '14px', fontWeight: 700, marginTop: '20px', marginBottom: '8px' }}>Article 8 — Duree et resiliation</h2>
            <p style={{ textAlign: 'justify' }}>
              Le present contrat est conclu pour une duree indeterminee. Chaque partie peut le resilier moyennant un preavis de 30 jours.
              En cas de resiliation, les actifs sont restitues au Client conformement a l'article 5.
            </p>

            <h2 style={{ fontSize: '14px', fontWeight: 700, marginTop: '20px', marginBottom: '8px' }}>Article 9 — Droit applicable</h2>
            <p style={{ textAlign: 'justify' }}>
              Le present contrat est soumis au droit francais. Tout litige sera soumis aux tribunaux competents de Paris.
            </p>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #e5e5e5', margin: '28px 0' }} />

          <p style={{ fontSize: '13px', color: '#333', marginBottom: '32px' }}>
            Fait a _____________, le {currentDate}
          </p>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
            <div style={{ width: '45%' }}>
              <p style={{ fontSize: '12px', color: '#666', marginBottom: '40px' }}>Le Client :</p>
              <div style={{ borderTop: '1px solid #333', paddingTop: '8px', fontSize: '13px' }}>
                {clientName}
              </div>
            </div>
            <div style={{ width: '45%' }}>
              <p style={{ fontSize: '12px', color: '#666', marginBottom: '40px' }}>La Banque :</p>
              <div style={{ borderTop: '1px solid #333', paddingTop: '8px', fontSize: '13px' }}>
                SwissLife Banque Privee
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-[14px] font-medium text-[#787881] bg-[rgba(0,0,23,0.04)] rounded-xl hover:bg-[rgba(0,0,23,0.08)] transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2.5 text-[14px] font-medium text-[#0F0F10] bg-white border border-[rgba(0,0,29,0.12)] rounded-xl hover:bg-[rgba(0,0,23,0.04)] transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Telecharger PDF
          </button>
          <button
            onClick={handleSign}
            disabled={signing}
            className="flex-1 py-2.5 text-[14px] font-medium text-white bg-[#059669] rounded-xl hover:bg-[#047857] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {signing ? (
              'Signature en cours...'
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Signer et valider
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
