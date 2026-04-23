import { useState, useEffect, useMemo } from 'react';
import { Badge, Button, Card, Spinner, inputCls, labelCls } from './shared';

/* ─────────────────────────────────────────────────────────
   AdequacySigningPage — Test d'adéquation MiFID II
   Le client répond lui-même aux 12 questions réparties en 5
   sections (connaissances, expérience, finances, objectifs,
   tolérance au risque) puis signe électroniquement.
   Le score et le verdict sont calculés côté serveur.
   ───────────────────────────────────────────────────────── */

const fmtDateFR = (d) => (d ? new Date(d) : new Date())
  .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

const VERDICT_COLOR = {
  eligible:              { bg: '#ECFDF5', border: 'rgba(16,185,129,0.25)', fg: '#065F46' },
  eligible_with_caveats: { bg: '#FFFBEB', border: 'rgba(202,138,4,0.28)',  fg: '#92400E' },
  not_eligible:          { bg: '#FEF2F2', border: 'rgba(220,38,38,0.25)',  fg: '#991B1B' },
};

const VERDICT_LABEL = {
  eligible:              'Éligible',
  eligible_with_caveats: 'Éligible avec réserves',
  not_eligible:          'Non éligible',
};

export default function AdequacySigningPage({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [answers, setAnswers] = useState({});
  const [submitError, setSubmitError] = useState(null);

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
      if (json.status === 'signed') {
        setSigned(true);
        setAnswers(json.answers || {});
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  // Questions triées par section (ordre stable)
  const sectionsInOrder = useMemo(() => {
    if (!data?.sections) return [];
    return [...data.sections].sort((a, b) => a.order - b.order);
  }, [data]);

  // Compte les questions obligatoires répondues (hors textarea)
  const progress = useMemo(() => {
    if (!data?.questions) return { answered: 0, total: 0 };
    const required = data.questions.filter(q => q.type === 'radio' && !q.optional);
    const answered = required.filter(q => answers[q.id]).length;
    return { answered, total: required.length };
  }, [data, answers]);

  const allAnswered = progress.answered === progress.total && progress.total > 0;
  const canSubmit = allAnswered && signerName.trim().length >= 2;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/signing/adequacy/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signerName: signerName.trim(), answers }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de la signature');
      }
      const result = await res.json();
      setSigned(true);
      setData(prev => ({ ...prev, ...result, answers, status: 'signed' }));
    } catch (err) {
      setSubmitError(err.message);
    }
    setSubmitting(false);
  };

  // ── Loading ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex items-center gap-2 text-[#5D5D5D]">
          <Spinner />
          <span className="text-[13px]">Chargement du questionnaire…</span>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <Card className="max-w-md w-full p-8 text-center">
          <div className="w-10 h-10 rounded-full bg-[#FEF2F2] flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-[#B91C1C]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-[15px] font-semibold text-[#0A0A0A]">Lien invalide</h1>
          <p className="text-[13px] text-[#5D5D5D] mt-2 leading-relaxed">{error}</p>
          <p className="mt-6 pt-4 border-t border-[#E7E7E7] text-[11px] text-[#8A8278] font-medium uppercase tracking-wider">
            Demo Bank
          </p>
        </Card>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────
  if (signed) {
    const verdict = data.verdict || 'eligible_with_caveats';
    const color = VERDICT_COLOR[verdict];
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <Card className="max-w-lg w-full p-10 text-center animate-fade">
          <div className="w-12 h-12 rounded-full bg-[#ECFDF5] flex items-center justify-center mx-auto mb-5">
            <svg className="w-6 h-6 text-[#10B981]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-[22px] font-semibold text-[#0A0A0A] tracking-tight">
            Merci, {(data.client_name || '').split(' ')[0]}.
          </h1>
          <p className="mt-2 text-[13px] text-[#5D5D5D] leading-relaxed max-w-sm mx-auto">
            Votre questionnaire d'adéquation a été enregistré et versé à votre dossier.
          </p>
          {data.score != null && (
            <div
              className="mt-6 px-5 py-3 rounded-[8px] border inline-block"
              style={{ background: color.bg, borderColor: color.border, color: color.fg }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1">Résultat</p>
              <p className="text-[16px] font-semibold">
                {VERDICT_LABEL[verdict]} · {data.score}/{data.max_score}
              </p>
            </div>
          )}
          <div className="mt-8 pt-5 border-t border-[#E7E7E7]">
            <p className="text-[11px] text-[#8A8278] font-medium uppercase tracking-wider">
              Demo Bank · Paris
            </p>
            <p className="text-[11px] text-[#8A8278] mt-1">MiCA Art. 66 · MiFID II Art. 25 · Signature électronique</p>
          </div>
        </Card>
      </div>
    );
  }

  // ── Questionnaire form ───────────────────────────────
  const questions = data.questions || [];

  return (
    <div className="min-h-screen bg-white text-[#0A0A0A]">
      {/* ── Top nav ─────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-[#E7E7E7]">
        <div className="max-w-[760px] mx-auto px-6 h-12 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-[#0A0A0A] rounded-md flex items-center justify-center">
              <span className="text-white text-[10px] font-bold tracking-tight">SL</span>
            </div>
            <span className="text-[13px] font-semibold text-[#0A0A0A] tracking-tight">Demo Bank Custody</span>
            <Badge variant="info">MiFID II · MiCA 66</Badge>
          </div>
          <span className="text-[11.5px] font-medium text-[#5D5D5D] tabular-nums">
            {progress.answered}/{progress.total}
          </span>
        </div>
        {/* progress bar */}
        <div className="h-[2px] bg-[#F5F3EE]">
          <div
            className="h-full bg-[#7C5E3C] transition-all duration-300"
            style={{ width: progress.total ? `${(progress.answered / progress.total) * 100}%` : '0%' }}
          />
        </div>
      </header>

      <div className="max-w-[760px] mx-auto px-6 py-8 space-y-6">
        {/* ── Header ─────────────────────────────────── */}
        <div>
          <p className="text-[11px] font-medium text-[#5D5D5D] uppercase tracking-wider mb-2">
            Évaluation d'adéquation · {fmtDateFR()}
          </p>
          <h1 className="text-[26px] font-semibold text-[#0A0A0A] tracking-tight leading-tight">
            Questionnaire d'adéquation
          </h1>
          <p className="mt-3 text-[13px] text-[#5D5D5D] leading-relaxed max-w-xl">
            Cette évaluation préalable est obligatoire pour les services de conservation d'actifs
            numériques (MiFID II Art. 25 · MiCA Art. 66). Vos réponses déterminent l'éligibilité au
            service et sont conservées 5 ans dans votre dossier.
          </p>
        </div>

        {/* ── Client identification card ─────────────── */}
        <Card className="p-5">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-[11px] font-semibold text-[#5D5D5D] uppercase tracking-wider mb-1">Client</p>
              <p className="text-[14px] font-semibold text-[#0A0A0A]">{data.client_name}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-[#5D5D5D] uppercase tracking-wider mb-1">Date</p>
              <p className="text-[14px] font-semibold text-[#0A0A0A]">{fmtDateFR()}</p>
            </div>
          </div>
        </Card>

        {/* ── Questions par section ──────────────────── */}
        {sectionsInOrder.map(section => {
          const sectionQuestions = questions.filter(q => q.section === section.id);
          return (
            <Card key={section.id} className="overflow-hidden">
              <div className="px-6 py-4 bg-[#FAFAF8] border-b border-[#E7E7E7]">
                <div className="flex items-baseline gap-3">
                  <span className="text-[10.5px] font-semibold text-[#7C5E3C] uppercase tracking-wider tabular-nums">
                    § {section.order}
                  </span>
                  <h2 className="text-[15px] font-semibold text-[#0A0A0A] tracking-tight">{section.label}</h2>
                </div>
                {section.description && (
                  <p className="text-[12px] text-[#5D5D5D] mt-1 leading-relaxed">{section.description}</p>
                )}
              </div>
              <div className="divide-y divide-[#E7E7E7]">
                {sectionQuestions.map((q, qIdx) => (
                  <QuestionBlock
                    key={q.id}
                    q={q}
                    value={answers[q.id]}
                    onChange={(v) => setAnswers(prev => ({ ...prev, [q.id]: v }))}
                    index={qIdx + 1}
                  />
                ))}
              </div>
            </Card>
          );
        })}

        {/* ── Signature ──────────────────────────────── */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-[15px] font-semibold text-[#0A0A0A] tracking-tight">Signature électronique</h3>
            <Badge variant="default">Art. 1367 C. civ.</Badge>
          </div>
          <p className="text-[12px] text-[#5D5D5D] leading-relaxed max-w-xl">
            En signant, vous certifiez sur l'honneur l'exactitude de vos réponses. Cette signature est
            enregistrée avec horodatage et adresse IP pour la conformité réglementaire ACPR.
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

          {!allAnswered && (
            <div className="mt-4 px-4 py-3 bg-[#FFFBEB] border border-[rgba(202,138,4,0.25)] rounded-[8px]">
              <p className="text-[12px] text-[#92400E] tracking-[-0.003em]">
                Veuillez répondre à toutes les questions obligatoires ({progress.answered}/{progress.total}) avant de signer.
              </p>
            </div>
          )}

          {submitError && (
            <div className="mt-4 px-4 py-3 bg-[#FEF2F2] border border-[rgba(220,38,38,0.25)] rounded-[8px]">
              <p className="text-[12px] text-[#991B1B] tracking-[-0.003em]">{submitError}</p>
            </div>
          )}

          <div className="mt-5 flex items-center gap-2 flex-wrap">
            <Button
              variant="primary"
              size="lg"
              onClick={handleSubmit}
              disabled={submitting || !canSubmit}
            >
              {submitting && <Spinner />}
              {submitting ? 'Signature en cours…' : 'Signer le questionnaire'}
            </Button>
            <span className="text-[11px] text-[#8A8278]">Horodatage & IP enregistrés</span>
          </div>
        </Card>

        {/* ── Footer ──────────────────────────────────── */}
        <footer className="pt-4 border-t border-[#E7E7E7] flex items-center justify-between">
          <p className="text-[11px] text-[#8A8278] font-medium uppercase tracking-wider">
            Demo Bank · Paris
          </p>
          <p className="text-[11px] text-[#8A8278] font-medium uppercase tracking-wider">
            AMF · ACPR · MiCA Art. 66
          </p>
        </footer>
      </div>
    </div>
  );
}

/* ─── Sub · QuestionBlock ───────────────────────────── */
function QuestionBlock({ q, value, onChange, index }) {
  if (q.type === 'textarea') {
    return (
      <div className="px-6 py-4">
        <label className="block text-[13px] font-medium text-[#0A0A0A] mb-2 leading-relaxed">
          {q.label}
        </label>
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Observations, questions, remarques…"
          className="w-full min-h-[70px] px-3.5 py-3 text-[13px] text-[#1E1E1E] bg-white border border-[#E7E7E7] rounded-[8px] outline-none transition-[border-color,box-shadow] focus-visible:border-[#7C5E3C] focus-visible:ring-[3px] focus-visible:ring-[rgba(124,94,60,0.12)] resize-none"
        />
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      <label className="block text-[13px] font-medium text-[#0A0A0A] leading-relaxed mb-3">
        <span className="text-[#7C5E3C] font-semibold mr-2 tabular-nums">{index}.</span>
        {q.label}
      </label>
      <div className="space-y-1.5">
        {q.options.map(opt => {
          const selected = value === opt.value;
          return (
            <label
              key={opt.value}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-[8px] border cursor-pointer transition-colors ${
                selected
                  ? 'bg-[#F5EEE0] border-[rgba(124,94,60,0.3)]'
                  : 'bg-white border-[#E7E7E7] hover:border-[#D1D5DB] hover:bg-[#FDFBF6]'
              }`}
            >
              <span className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                selected ? 'border-[#7C5E3C]' : 'border-[#BFBFBF]'
              }`}>
                {selected && <span className="w-2 h-2 rounded-full bg-[#7C5E3C]" />}
              </span>
              <input
                type="radio"
                name={q.id}
                value={opt.value}
                checked={selected}
                onChange={() => onChange(opt.value)}
                className="sr-only"
              />
              <span className={`text-[13px] leading-snug ${selected ? 'text-[#0A0A0A] font-medium' : 'text-[#1E1E1E]'}`}>
                {opt.label}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
