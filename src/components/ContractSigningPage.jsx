import { useState, useEffect, useRef } from 'react';

const fmtDateFR = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export default function ContractSigningPage({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signerName, setSignerName] = useState('');
  const contractRef = useRef(null);

  useEffect(() => {
    fetchContract();
  }, [token]);

  const fetchContract = async () => {
    try {
      const res = await fetch(`/api/signing/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lien invalide ou expire');
      }
      const json = await res.json();
      setData(json);
      if (json.status === 'signed') setSigned(true);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleSign = async () => {
    if (!signerName.trim()) return alert('Veuillez saisir votre nom complet pour signer.');
    setSigning(true);
    try {
      const res = await fetch(`/api/signing/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signerName: signerName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de la signature');
      }
      setSigned(true);
    } catch (err) {
      alert(err.message);
    }
    setSigning(false);
  };

  const handlePrint = () => {
    const content = contractRef.current;
    if (!content) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Contrat Custody - ${data.client_name}</title>
      <style>body{font-family:Georgia,'Times New Roman',serif;max-width:700px;margin:40px auto;padding:40px;color:#1a1a1a;line-height:1.7;font-size:13px}h1{font-size:18px;text-align:center;margin-bottom:32px;letter-spacing:1px;text-transform:uppercase}h2{font-size:14px;margin-top:24px;margin-bottom:8px}p{margin:8px 0;text-align:justify}.signature{margin-top:48px;display:flex;justify-content:space-between}.signature div{width:45%;border-top:1px solid #333;padding-top:8px}@media print{body{margin:0;padding:20px}}</style>
      </head><body>${content.innerHTML}</body></html>`);
    w.document.close();
    w.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#E7E5E4] border-t-[#0F0F10] rounded-full animate-spin mx-auto" />
          <p className="text-[13px] text-[#787881] mt-3">Chargement du contrat...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center px-4">
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-[#FEF2F2] flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-[#DC2626]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-[18px] font-semibold text-[#0F0F10] mb-2">Lien invalide</h1>
          <p className="text-[14px] text-[#787881]">{error}</p>
          <p className="text-[13px] text-[#A8A29E] mt-4">Si vous pensez qu'il s'agit d'une erreur, contactez votre banquier prive.</p>
        </div>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center px-4">
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-[#ECFDF5] flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-[#059669]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-[18px] font-semibold text-[#0F0F10] mb-2">Contrat signe avec succes</h1>
          <p className="text-[14px] text-[#787881]">
            Merci {data.client_name}. Votre contrat de conservation d'actifs numeriques a ete enregistre.
          </p>
          <p className="text-[13px] text-[#A8A29E] mt-4">Votre banquier prive vous contactera pour les prochaines etapes.</p>
          <div className="mt-6 pt-4 border-t border-[rgba(0,0,29,0.06)]">
            <img src="/swisslife-logo.svg" alt="SwissLife" className="h-6 mx-auto opacity-40" onError={(e) => e.target.style.display='none'} />
            <p className="text-[11px] text-[#A8A29E] mt-2">SwissLife Banque Privee — Conservation d'Actifs Numeriques</p>
          </div>
        </div>
      </div>
    );
  }

  const clientName = data.client_name || '';
  const clientAddress = [data.client_street, data.client_postal_code, data.client_city, data.client_country].filter(Boolean).join(', ') || 'Adresse non renseignee';
  const clientPhone = data.client_phone || 'Non renseigne';
  const currentDate = fmtDateFR();

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,29,0.08)] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-[16px] font-semibold text-[#0F0F10]">SwissLife Banque Privee</h1>
            <p className="text-[12px] text-[#A8A29E]">Signature de contrat de conservation d'actifs numeriques</p>
          </div>
          <button
            onClick={handlePrint}
            className="px-4 py-2 text-[13px] font-medium text-[#0F0F10] bg-white border border-[rgba(0,0,29,0.12)] rounded-xl hover:bg-[rgba(0,0,23,0.04)] transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Telecharger PDF
          </button>
        </div>
      </div>

      {/* Contract */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div
          ref={contractRef}
          className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-10 mb-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          <h1 style={{ fontSize: '17px', textAlign: 'center', marginBottom: '28px', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 700, color: '#0F0F10' }}>
            Contrat de Conservation d'Actifs Numeriques
          </h1>

          <div style={{ margin: '24px 0', lineHeight: '1.8', fontSize: '13px', color: '#333' }}>
            <p style={{ marginBottom: '16px' }}><strong>Entre :</strong></p>
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
            Fait a Paris, le {currentDate}
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

        {/* Signing area */}
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="text-[15px] font-semibold text-[#0F0F10] mb-4">Signature electronique</h3>
          <p className="text-[13px] text-[#787881] mb-4">
            En signant ce contrat, vous acceptez les conditions de conservation d'actifs numeriques decrites ci-dessus.
            Cette signature a valeur contractuelle conformement a l'article 1367 du Code Civil.
          </p>

          <div className="mb-4">
            <label className="block text-[12px] font-medium text-[#787881] uppercase tracking-wide mb-1.5">
              Votre nom complet (signature)
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder={clientName}
              className="w-full px-4 py-3 text-[14px] bg-white border border-[rgba(0,0,29,0.12)] rounded-xl outline-none focus:border-[rgba(0,0,29,0.3)] transition-colors"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic' }}
            />
          </div>

          <button
            onClick={handleSign}
            disabled={signing || !signerName.trim()}
            className="w-full py-3 text-[14px] font-semibold text-white bg-[#0F0F10] rounded-xl hover:bg-[#1a1a1a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {signing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signature en cours...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Je signe le contrat de custody
              </>
            )}
          </button>

          <p className="text-[11px] text-[#A8A29E] text-center mt-3">
            Signature securisee — Horodatage et adresse IP enregistres pour conformite reglementaire
          </p>
        </div>

        {/* Footer */}
        <div className="text-center py-8">
          <p className="text-[11px] text-[#A8A29E]">
            SwissLife Banque Privee — 7 rue Belgrand, 92300 Levallois-Perret — Conservation d'Actifs Numeriques
          </p>
        </div>
      </div>
    </div>
  );
}
