import { useState, useEffect } from 'react';
import { Badge, Button, Card, Spinner, inputCls, labelCls } from './shared';

/* ─────────────────────────────────────────────────────────
   AdequacySigningPage — Linear-style client countersign view
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

  // ── Loading ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBFAF7] flex items-center justify-center">
        <div className="flex items-center gap-2 text-[#6B6B6B]">
          <Spinner />
          <span className="text-[13px]">Chargement…</span>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-[#FBFAF7] flex items-center justify-center px-6">
        <Card className="max-w-md w-full p-8 text-center">
          <div className="w-10 h-10 rounded-full bg-[#FEF2F2] flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-[#B91C1C]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-[15px] font-semibold text-[#0A0A0A]">Lien invalide</h1>
          <p className="text-[13px] text-[#6B6B6B] mt-2 leading-relaxed">{error}</p>
          <p className="mt-6 pt-4 border-t border-[rgba(10,10,10,0.06)] text-[11px] text-[#9B9B9B] font-medium uppercase tracking-wider">
            SwissLife Banque Privée
          </p>
        </Card>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────
  if (signed) {
    return (
      <div className="min-h-screen bg-[#FBFAF7] flex items-center justify-center px-6">
        <Card className="max-w-lg w-full p-10 text-center animate-fade">
          <div className="w-12 h-12 rounded-full bg-[#ECFDF5] flex items-center justify-center mx-auto mb-5">
            <svg className="w-6 h-6 text-[#10B981]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-[22px] font-semibold text-[#0A0A0A] tracking-tight">
            Merci, {data.client_name.split(' ')[0]}.
          </h1>
          <p className="mt-2 text-[13px] text-[#6B6B6B] leading-relaxed max-w-sm mx-auto">
            Votre questionnaire d'adéquation a été enregistré et versé à votre dossier.
          </p>
          <div className="mt-8 pt-5 border-t border-[rgba(10,10,10,0.06)]">
            <p className="text-[11px] text-[#9B9B9B] font-medium uppercase tracking-wider">
              SwissLife Banque Privée · Paris
            </p>
            <p className="text-[11px] text-[#9B9B9B] mt-1">MiCA Art. 66 · Signature électronique</p>
          </div>
        </Card>
      </div>
    );
  }

  const assessment = data.assessment || {};
  const answers = [assessment.q1, assessment.q2, assessment.q3, assessment.q4];

  return (
    <div className="min-h-screen bg-[#FBFAF7] text-[#0A0A0A]">
      {/* ── Top nav ─────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-[rgba(10,10,10,0.08)]">
        <div className="max-w-[760px] mx-auto px-6 h-12 flex items-center gap-3">
          <div className="w-6 h-6 bg-[#0A0A0A] rounded-md flex items-center justify-center">
            <span className="text-white text-[10px] font-bold tracking-tight">SL</span>
          </div>
          <span className="text-[13px] font-semibold text-[#0A0A0A] tracking-tight">SwissLife Custody</span>
          <Badge variant="info">MiCA Art. 66</Badge>
        </div>
      </header>

      <div className="max-w-[760px] mx-auto px-6 py-8">
        {/* ── Header ─────────────────────────────────── */}
        <div className="mb-5">
          <p className="text-[11px] font-medium text-[#6B6B6B] uppercase tracking-wider mb-2">
            Évaluation d'adéquation · {fmtDateFR()}
          </p>
          <h1 className="text-[26px] font-semibold text-[#0A0A0A] tracking-tight leading-tight">
            Questionnaire d'adéquation
          </h1>
          <p className="mt-3 text-[13px] text-[#6B6B6B] leading-relaxed max-w-xl">
            Votre banquier privé a préparé cette évaluation préalable aux services de conservation d'actifs numériques. Veuillez vérifier les réponses ci-dessous et apposer votre signature.
          </p>
        </div>

        {/* ── Client identification card ─────────────── */}
        <Card className="p-5 mb-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wider mb-1">Client</p>
              <p className="text-[14px] font-semibold text-[#0A0A0A]">{data.client_name}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wider mb-1">Date</p>
              <p className="text-[14px] font-semibold text-[#0A0A0A]">{fmtDateFR()}</p>
            </div>
          </div>
        </Card>

        {/* ── Questions card ─────────────────────────── */}
        <Card className="mb-4">
          <div className="px-5 py-3 border-b border-[rgba(10,10,10,0.06)] bg-[#FBFAF7]">
            <p className="text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wider">
              Évaluation — réponses préparées
            </p>
          </div>
          <ul>
            {QUESTIONS.map((q, i) => {
              const answer = answers[i];
              const isOui = answer === 'Oui';
              return (
                <li
                  key={i}
                  className={`px-5 py-4 flex items-start justify-between gap-4 ${i < QUESTIONS.length - 1 ? 'border-b border-[rgba(10,10,10,0.06)]' : ''}`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#F5F3EE] text-[11px] font-semibold text-[#4A4A4A] flex items-center justify-center tabular-nums mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-[13px] text-[#0A0A0A] leading-relaxed">{q}</p>
                  </div>
                  <div className="flex-shrink-0">
                    <Badge variant={isOui ? 'success' : 'error'} dot>
                      {answer || '—'}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
          {assessment.notes && (
            <div className="px-5 py-4 border-t border-[rgba(10,10,10,0.06)] bg-[#FBFAF7]">
              <p className="text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wider mb-1.5">
                Notes du banquier
              </p>
              <p className="text-[13px] text-[#4A4A4A] leading-relaxed">« {assessment.notes} »</p>
            </div>
          )}
        </Card>

        {/* ── Signature card ──────────────────────────── */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-[15px] font-semibold text-[#0A0A0A] tracking-tight">Signature électronique</h3>
            <Badge variant="default">Art. 1367 C. civ.</Badge>
          </div>
          <p className="text-[12px] text-[#6B6B6B] leading-relaxed max-w-xl">
            En signant, vous confirmez avoir pris connaissance des réponses ci-dessus. Cette signature électronique est enregistrée avec horodatage et adresse IP pour la conformité réglementaire.
          </p>

          <div className="mt-5 max-w-md">
            <label className={labelCls}>Votre nom complet</label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder={data.client_name}
              className={inputCls}
            />
          </div>

          <div className="mt-5 flex items-center gap-2">
            <Button
              variant="primary"
              size="lg"
              onClick={handleSign}
              disabled={signing || !signerName.trim()}
            >
              {signing && <Spinner />}
              {signing ? 'Signature en cours…' : 'Signer le questionnaire'}
            </Button>
            <span className="text-[11px] text-[#9B9B9B]">Horodatage & IP enregistrés</span>
          </div>
        </Card>

        {/* ── Footer ──────────────────────────────────── */}
        <footer className="mt-8 pt-4 border-t border-[rgba(10,10,10,0.08)] flex items-center justify-between">
          <p className="text-[11px] text-[#9B9B9B] font-medium uppercase tracking-wider">
            SwissLife Banque Privée · Paris
          </p>
          <p className="text-[11px] text-[#9B9B9B] font-medium uppercase tracking-wider">
            AMF · ACPR · MiCA Art. 60
          </p>
        </footer>
      </div>
    </div>
  );
}
