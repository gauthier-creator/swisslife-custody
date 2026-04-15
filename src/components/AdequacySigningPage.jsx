import { useState, useEffect } from 'react';

/* ─────────────────────────────────────────────────────────
   Adequacy signing — the client verifies and countersigns
   the assessment prepared by their banker.
   ───────────────────────────────────────────────────────── */

const fmtDateFR = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

const QUESTIONS = [
  'Comprenez-vous la nature volatile des actifs numériques et les risques de perte en capital associés ?',
  'Avez-vous une expérience préalable avec les cryptomonnaies ou actifs numériques ?',
  'L\'allocation crypto envisagée est-elle cohérente avec votre profil de risque global ?',
  'Avez-vous été informé(e) des risques spécifiques liés à la conservation (clés privées, irréversibilité des transactions, risque de piratage) ?',
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
        throw new Error(err.error || 'Lien invalide ou expiré');
      }
      const json = await res.json();
      setData(json);
      if (json.status === 'signed') setSigned(true);
    } catch (err) { setError(err.message); }
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
    } catch (err) { alert(err.message); }
    setSigning(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="text-center animate-fade">
          <div className="w-5 h-5 border border-[rgba(11,11,12,0.12)] border-t-[#0B0B0C] rounded-full animate-spin mx-auto" style={{ animationDuration: '1.1s' }} />
          <p className="eyebrow mt-6">Chargement</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center animate-rise">
          <p className="eyebrow text-[#7A2424] mb-4">Lien invalide</p>
          <h1 className="font-display text-[34px] text-[#0B0B0C] leading-tight">
            Ce lien n'est plus valide.
          </h1>
          <p className="text-[14px] text-[#6B6B70] mt-5 font-light leading-relaxed">{error}</p>
          <div className="mt-10 pt-8 border-t border-[rgba(11,11,12,0.08)]">
            <p className="eyebrow">SwissLife Banque Privée · Paris</p>
          </div>
        </div>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center px-6">
        <div className="max-w-lg w-full text-center animate-whisper">
          <p className="eyebrow text-[#2E5D4F] mb-6">Questionnaire signé</p>
          <h1 className="font-display-tight text-[56px] leading-[0.96] text-[#0B0B0C]">
            Merci, {data.client_name.split(' ')[0]}.
          </h1>
          <p className="mt-8 text-[15px] text-[#2C2C2E] leading-[1.7] font-light max-w-md mx-auto">
            Votre questionnaire d'adéquation a été enregistré et versé à votre dossier.
          </p>
          <div className="mt-16 pt-10 border-t border-[rgba(11,11,12,0.08)]">
            <p className="eyebrow">SwissLife Banque Privée · Paris</p>
            <p className="eyebrow text-[#A8A8AD] mt-1">MiCA Art. 66 · Signature électronique</p>
          </div>
        </div>
      </div>
    );
  }

  const assessment = data.assessment || {};
  const answers = [assessment.q1, assessment.q2, assessment.q3, assessment.q4];

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#0B0B0C]">
      {/* ── Masthead ──────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-[rgba(250,250,247,0.85)] border-b border-[rgba(11,11,12,0.08)]"
              style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
        <div className="max-w-[760px] mx-auto px-8 h-16 flex items-center">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[20px] text-[#0B0B0C] tracking-[-0.03em]">SwissLife</span>
            <span className="eyebrow text-[#8A6F3D]">Conservation</span>
          </div>
        </div>
      </header>

      <div className="max-w-[760px] mx-auto px-8 py-16">
        {/* ── Preface ────────────────────────────────── */}
        <div className="mb-16 animate-rise">
          <p className="eyebrow mb-4">MiCA Art. 66 · {fmtDateFR()}</p>
          <h1 className="font-display-tight text-[54px] leading-[0.96] text-[#0B0B0C] max-w-xl">
            Questionnaire d'adéquation
          </h1>
          <p className="mt-8 text-[15px] text-[#6B6B70] leading-[1.8] font-light max-w-xl">
            Votre banquier privé a préparé cette évaluation d'adéquation préalable
            aux services de conservation d'actifs numériques. Veuillez vérifier les
            réponses et apposer votre signature.
          </p>
        </div>

        {/* ── Client identification ──────────────────── */}
        <div className="py-8 border-t border-b border-[rgba(11,11,12,0.16)] grid grid-cols-2 gap-12">
          <div>
            <p className="eyebrow mb-2">Client</p>
            <p className="font-display text-[22px] text-[#0B0B0C] leading-tight">
              {data.client_name}
            </p>
          </div>
          <div>
            <p className="eyebrow mb-2">Date</p>
            <p className="font-display text-[22px] text-[#0B0B0C] leading-tight">
              {fmtDateFR()}
            </p>
          </div>
        </div>

        {/* ── Questions ──────────────────────────────── */}
        <div className="mt-16 animate-fade">
          <p className="eyebrow mb-8">Évaluation</p>
          <ol>
            {QUESTIONS.map((q, i) => {
              const answer = answers[i];
              return (
                <li key={i} className="py-8 border-t border-[rgba(11,11,12,0.08)] grid grid-cols-12 gap-6 items-baseline">
                  <div className="col-span-1">
                    <span className="eyebrow text-[#A8A8AD] tabular">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="col-span-8">
                    <p className="text-[15px] text-[#0B0B0C] leading-[1.7]">{q}</p>
                  </div>
                  <div className="col-span-3 text-right">
                    <p className="font-display text-[22px] leading-none"
                       style={{ color: answer === 'Oui' ? '#2E5D4F' : '#7A2424' }}>
                      {answer || '—'}
                    </p>
                    <p className="eyebrow mt-1">Réponse</p>
                  </div>
                </li>
              );
            })}
          </ol>

          {assessment.notes && (
            <div className="mt-8 py-8 border-t border-[rgba(11,11,12,0.08)]">
              <p className="eyebrow mb-4">Notes du banquier</p>
              <p className="text-[14px] text-[#2C2C2E] leading-[1.8] font-light italic max-w-xl">
                « {assessment.notes} »
              </p>
            </div>
          )}
        </div>

        {/* ── Signature panel ─────────────────────────── */}
        <div className="mt-16 pt-12 border-t border-[rgba(11,11,12,0.16)]">
          <p className="eyebrow mb-4">Signature électronique</p>
          <h3 className="font-display text-[32px] text-[#0B0B0C] leading-tight">
            Confirmez vos réponses
          </h3>
          <p className="mt-4 text-[14px] text-[#6B6B70] leading-relaxed font-light max-w-xl">
            En signant, vous confirmez avoir pris connaissance des réponses ci-dessus.
            Cette signature électronique est enregistrée avec horodatage et adresse IP
            pour la conformité réglementaire, conformément à l'article 1367 du Code civil.
          </p>

          <div className="mt-10 max-w-lg">
            <label className="eyebrow block mb-3">Votre nom complet</label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder={data.client_name}
              className="w-full px-0 py-3 text-[24px] text-[#0B0B0C] bg-transparent border-0 border-b border-[rgba(11,11,12,0.16)] outline-none focus:border-[#0B0B0C] transition-colors placeholder:text-[#CFCFD1] placeholder:font-light"
              style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontWeight: 400 }}
            />
          </div>

          <div className="mt-10">
            <button
              onClick={handleSign}
              disabled={signing || !signerName.trim()}
              className="inline-flex items-center gap-3 px-8 py-4 bg-[#0B0B0C] text-[#FAFAF7] text-[13px] font-medium tracking-tight hover:bg-[#2C2C2E] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ borderRadius: '2px' }}
            >
              {signing ? (
                <>
                  <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" style={{ animationDuration: '1.1s' }} />
                  Signature en cours
                </>
              ) : (
                <>
                  Signer le questionnaire
                  <span aria-hidden>→</span>
                </>
              )}
            </button>
          </div>
        </div>

        <footer className="mt-20 pt-10 border-t border-[rgba(11,11,12,0.08)]">
          <div className="flex items-center justify-between">
            <p className="eyebrow">SwissLife Banque Privée · Paris</p>
            <p className="eyebrow text-[#A8A8AD]">AMF · ACPR · MiCA Art. 60</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
