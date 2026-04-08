import { useState, useEffect } from 'react';

const fmtDateFR = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

const QUESTIONS = [
  'Comprenez-vous la nature volatile des actifs numeriques et les risques de perte en capital associes ?',
  'Avez-vous une experience prealable avec les cryptomonnaies ou actifs numeriques ?',
  'L\'allocation crypto envisagee est-elle coherente avec votre profil de risque global ?',
  'Avez-vous ete informe(e) des risques specifiques lies a la conservation d\'actifs numeriques (cles privees, irreversibilite des transactions, risque de piratage) ?',
];

export default function AdequacySigningPage({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signerName, setSignerName] = useState('');

  useEffect(() => { fetchData(); }, [token]);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/signing/adequacy/${token}`);
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
    if (!signerName.trim()) return alert('Veuillez saisir votre nom complet.');
    setSigning(true);
    try {
      const res = await fetch(`/api/signing/adequacy/${token}/sign`, {
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#E7E5E4] border-t-[#0F0F10] rounded-full animate-spin mx-auto" />
          <p className="text-[13px] text-[#787881] mt-3">Chargement...</p>
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
          <h1 className="text-[18px] font-semibold text-[#0F0F10] mb-2">Questionnaire signe</h1>
          <p className="text-[14px] text-[#787881]">
            Merci {data.client_name}. Votre questionnaire d'adequation a ete enregistre et signe.
          </p>
          <p className="text-[13px] text-[#A8A29E] mt-4">Un PDF sera conserve dans votre dossier client.</p>
          <div className="mt-6 pt-4 border-t border-[rgba(0,0,29,0.06)]">
            <p className="text-[11px] text-[#A8A29E]">SwissLife Banque Privee — Conservation d'Actifs Numeriques</p>
          </div>
        </div>
      </div>
    );
  }

  const assessment = data.assessment || {};
  const answers = [assessment.q1, assessment.q2, assessment.q3, assessment.q4];

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Header */}
      <div className="bg-white border-b border-[rgba(0,0,29,0.08)] px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-[16px] font-semibold text-[#0F0F10]">SwissLife Banque Privee</h1>
          <p className="text-[12px] text-[#A8A29E]">Questionnaire d'adequation — Conservation d'actifs numeriques</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Info card */}
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6 mb-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-[13px] text-[#787881] mb-4">
            Conformement a l'article 66 du reglement (UE) 2023/1114 (MiCA), votre banquier a realise une evaluation
            d'adequation pour les services de conservation d'actifs numeriques. Veuillez verifier les reponses ci-dessous
            et signer pour confirmer.
          </p>

          <div className="bg-[rgba(0,0,23,0.02)] rounded-xl px-4 py-3 mb-2">
            <p className="text-[13px]"><strong>Client :</strong> {data.client_name}</p>
            <p className="text-[13px] text-[#787881]">Date : {fmtDateFR()}</p>
          </div>
        </div>

        {/* Questions */}
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6 mb-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="text-[15px] font-semibold text-[#0F0F10] mb-4">Evaluation d'adequation</h3>
          <div className="space-y-4">
            {QUESTIONS.map((q, i) => {
              const answer = answers[i];
              return (
                <div key={i} className="bg-[rgba(0,0,23,0.02)] rounded-xl px-4 py-3">
                  <p className="text-[13px] font-medium text-[#0F0F10] mb-2">{i + 1}. {q}</p>
                  <div className={`inline-flex px-3 py-1 rounded-lg text-[13px] font-semibold ${
                    answer === 'Oui'
                      ? 'bg-[#ECFDF5] text-[#059669]'
                      : 'bg-[#FEF2F2] text-[#DC2626]'
                  }`}>
                    {answer || 'Non renseigne'}
                  </div>
                </div>
              );
            })}
          </div>

          {assessment.notes && (
            <div className="mt-4 bg-[rgba(0,0,23,0.02)] rounded-xl px-4 py-3">
              <p className="text-[12px] font-medium text-[#787881] uppercase tracking-wide mb-1">Notes</p>
              <p className="text-[13px] text-[#0F0F10]">{assessment.notes}</p>
            </div>
          )}
        </div>

        {/* Signing area */}
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <h3 className="text-[15px] font-semibold text-[#0F0F10] mb-2">Signature</h3>
          <p className="text-[13px] text-[#787881] mb-4">
            En signant, vous confirmez avoir pris connaissance des reponses ci-dessus et de l'evaluation
            d'adequation realisee par votre banquier.
          </p>

          <div className="mb-4">
            <label className="block text-[12px] font-medium text-[#787881] uppercase tracking-wide mb-1.5">
              Votre nom complet
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder={data.client_name}
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
                Je confirme et signe le questionnaire
              </>
            )}
          </button>

          <p className="text-[11px] text-[#A8A29E] text-center mt-3">
            Signature securisee — Horodatage et adresse IP enregistres
          </p>
        </div>

        <div className="text-center py-8">
          <p className="text-[11px] text-[#A8A29E]">SwissLife Banque Privee — Conservation d'Actifs Numeriques</p>
        </div>
      </div>
    </div>
  );
}
