// ============================================================
// MiFID II · Questionnaire d'adéquation — SwissLife Custody
// ============================================================
// Test d'adéquation pour la conservation d'actifs numériques.
// Conforme MiFID II Art. 25(2) — "connaissances et expérience",
// "situation financière", "objectifs d'investissement".
// AMF RGP Art. 325-7 + MiCA Art. 66 (évaluation préalable aux
// services de conservation d'actifs numériques).
//
// Chaque question est typée :
//   · radio   — une seule option parmi N (la plupart des questions)
//   · textarea — zone libre (dernière question facultative)
//
// Chaque option a un poids (weight). Le score total est la somme des
// weights. Le verdict dépend du score :
//   score ≥ 14  → eligible       (client averti, service complet)
//   score ≥ 8   → eligible_with_caveats (service limité, plafonds réduits)
//   score < 8   → not_eligible   (profil inadéquat, refus du service)
//
// Le scoring est volontairement simple pour la démo. En prod on aurait :
//   - pondération par section (MiFID II exige équilibre connaissances/exp/finances)
//   - disqualification automatique sur certaines réponses (ex. "paniquer")
//   - lien avec le profil de risque saisi dans RiskConfigPanel
// ============================================================

export const ADEQUACY_SECTIONS = [
  {
    id: 'knowledge',
    label: 'Connaissances',
    description: 'Ce que vous savez des actifs numériques et de leur conservation.',
    order: 1,
  },
  {
    id: 'experience',
    label: 'Expérience',
    description: 'Votre historique d\'investissement crypto.',
    order: 2,
  },
  {
    id: 'financial',
    label: 'Situation financière',
    description: 'Votre capacité à supporter un risque de perte.',
    order: 3,
  },
  {
    id: 'objectives',
    label: 'Objectifs & horizon',
    description: 'Ce que vous attendez de la conservation crypto.',
    order: 4,
  },
  {
    id: 'risk_tolerance',
    label: 'Tolérance au risque',
    description: 'Votre réaction face à la volatilité.',
    order: 5,
  },
];

export const ADEQUACY_QUESTIONS = [
  // ── Section 1 : Connaissances ────────────────────────────
  {
    id: 'knowledge_assets',
    section: 'knowledge',
    label: 'Quels actifs numériques connaissez-vous ?',
    type: 'radio',
    options: [
      { value: 'none',     label: 'Aucun',                                            weight: 0 },
      { value: 'btc_only', label: 'Bitcoin uniquement',                                weight: 1 },
      { value: 'btc_eth',  label: 'Bitcoin et Ethereum',                               weight: 2 },
      { value: 'advanced', label: 'Bitcoin, Ethereum, stablecoins et autres tokens',   weight: 3 },
    ],
  },
  {
    id: 'knowledge_volatility',
    section: 'knowledge',
    label: 'Comprenez-vous que les actifs numériques peuvent perdre jusqu\'à 100% de leur valeur en peu de temps ?',
    type: 'radio',
    options: [
      { value: 'no',        label: 'Non, je découvre',               weight: 0 },
      { value: 'partially', label: 'En partie',                      weight: 1 },
      { value: 'yes',       label: 'Oui, parfaitement',              weight: 2 },
    ],
  },
  {
    id: 'knowledge_custody_risks',
    section: 'knowledge',
    label: 'Êtes-vous informé des risques spécifiques à la conservation (perte de clé privée, hack, irréversibilité des transactions) ?',
    type: 'radio',
    options: [
      { value: 'no',        label: 'Non',                             weight: 0 },
      { value: 'partially', label: 'J\'en ai entendu parler',         weight: 1 },
      { value: 'yes',       label: 'Oui, en détail',                  weight: 2 },
    ],
  },

  // ── Section 2 : Expérience ───────────────────────────────
  {
    id: 'experience_duration',
    section: 'experience',
    label: 'Depuis combien de temps investissez-vous dans des actifs numériques ?',
    type: 'radio',
    options: [
      { value: 'never',      label: 'Jamais',                 weight: 0 },
      { value: 'less_1y',    label: 'Moins d\'un an',         weight: 1 },
      { value: '1_3y',       label: 'Entre 1 et 3 ans',       weight: 2 },
      { value: 'more_3y',    label: 'Plus de 3 ans',          weight: 3 },
    ],
  },
  {
    id: 'experience_amount',
    section: 'experience',
    label: 'Quel montant cumulé avez-vous déjà investi en actifs numériques ?',
    type: 'radio',
    options: [
      { value: 'none',        label: 'Aucun',                  weight: 0 },
      { value: 'lt_10k',      label: 'Moins de 10 000 €',      weight: 1 },
      { value: '10_100k',     label: '10 000 € à 100 000 €',   weight: 2 },
      { value: '100k_1m',     label: '100 000 € à 1 000 000 €', weight: 3 },
      { value: 'gt_1m',       label: 'Plus d\'1 M€',           weight: 3 },
    ],
  },

  // ── Section 3 : Situation financière ─────────────────────
  {
    id: 'financial_allocation',
    section: 'financial',
    label: 'Quelle part de votre patrimoine total prévoyez-vous d\'allouer aux actifs numériques ?',
    type: 'radio',
    options: [
      { value: 'lt_5',    label: 'Moins de 5%',            weight: 2 },
      { value: '5_15',    label: 'Entre 5% et 15%',        weight: 2 },
      { value: '15_30',   label: 'Entre 15% et 30%',       weight: 1 },
      { value: 'gt_30',   label: 'Plus de 30%',            weight: 0 },
    ],
  },
  {
    id: 'financial_loss_tolerance',
    section: 'financial',
    label: 'Une perte totale de votre allocation crypto impacterait-elle votre niveau de vie ?',
    type: 'radio',
    options: [
      { value: 'strongly', label: 'Oui, fortement',        weight: 0 },
      { value: 'somewhat', label: 'Un peu',                 weight: 1 },
      { value: 'no',       label: 'Non, je peux l\'absorber', weight: 2 },
    ],
  },

  // ── Section 4 : Objectifs & horizon ──────────────────────
  {
    id: 'objectives_horizon',
    section: 'objectives',
    label: 'Quel est votre horizon d\'investissement pour cette allocation crypto ?',
    type: 'radio',
    options: [
      { value: 'lt_1y',   label: 'Moins d\'un an',         weight: 0 },
      { value: '1_3y',    label: '1 à 3 ans',              weight: 1 },
      { value: '3_5y',    label: '3 à 5 ans',              weight: 2 },
      { value: 'gt_5y',   label: 'Plus de 5 ans',          weight: 2 },
    ],
  },
  {
    id: 'objectives_goal',
    section: 'objectives',
    label: 'Quel est votre objectif principal ?',
    type: 'radio',
    options: [
      { value: 'speculation',    label: 'Spéculation court terme',               weight: 0 },
      { value: 'diversification', label: 'Diversification patrimoniale',          weight: 2 },
      { value: 'long_term',      label: 'Détention long terme (hodl)',           weight: 2 },
      { value: 'transmission',   label: 'Transmission patrimoniale',             weight: 2 },
    ],
  },

  // ── Section 5 : Tolérance au risque ──────────────────────
  {
    id: 'risk_reaction',
    section: 'risk_tolerance',
    label: 'Comment réagiriez-vous si votre allocation crypto perdait 50% en 3 mois ?',
    type: 'radio',
    options: [
      { value: 'panic_sell',   label: 'Je vendrais immédiatement pour limiter les pertes', weight: 0 },
      { value: 'wait',         label: 'J\'attendrais que ça remonte',                       weight: 1 },
      { value: 'buy_more',     label: 'Je renforcerais ma position à prix bas',             weight: 2 },
      { value: 'rebalance',    label: 'Je rééquilibrerais selon mon plan initial',          weight: 2 },
    ],
  },
  {
    id: 'risk_profile',
    section: 'risk_tolerance',
    label: 'Quel profil de risque décrit le mieux votre approche globale ?',
    type: 'radio',
    options: [
      { value: 'conservative', label: 'Prudent (préservation du capital)',      weight: 0 },
      { value: 'balanced',     label: 'Équilibré (rendement modéré)',           weight: 1 },
      { value: 'dynamic',      label: 'Dynamique (rendement supérieur)',        weight: 2 },
      { value: 'aggressive',   label: 'Offensif (rendement max, risque élevé)', weight: 2 },
    ],
  },

  // ── Commentaires libres (non scorés) ─────────────────────
  {
    id: 'notes',
    section: 'risk_tolerance',
    label: 'Commentaires complémentaires (facultatif)',
    type: 'textarea',
    optional: true,
  },
];

// Nombre de questions notées (pour affichage progression)
export const SCORED_QUESTION_COUNT = ADEQUACY_QUESTIONS.filter(q => q.type === 'radio').length;

// Score maximum atteignable (somme des max(weights) de chaque question notée)
export const ADEQUACY_MAX_SCORE = ADEQUACY_QUESTIONS
  .filter(q => q.type === 'radio')
  .reduce((sum, q) => sum + Math.max(...q.options.map(o => o.weight)), 0);

// ============================================================
// computeAdequacyScore — scoring déterministe
// ============================================================
// Prend un objet { questionId: value } et retourne :
//   { score, max, pct, verdict, breakdown: { section: { score, max } } }
export function computeAdequacyScore(answers = {}) {
  const breakdown = {};
  let score = 0;
  const max = ADEQUACY_MAX_SCORE;

  for (const q of ADEQUACY_QUESTIONS) {
    if (q.type !== 'radio') continue;
    const answerValue = answers[q.id];
    const option = q.options.find(o => o.value === answerValue);
    const weight = option?.weight ?? 0;
    score += weight;
    const qMax = Math.max(...q.options.map(o => o.weight));
    breakdown[q.section] = breakdown[q.section] || { score: 0, max: 0 };
    breakdown[q.section].score += weight;
    breakdown[q.section].max += qMax;
  }

  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  let verdict;
  if (score >= 14)     verdict = 'eligible';
  else if (score >= 8) verdict = 'eligible_with_caveats';
  else                 verdict = 'not_eligible';

  return { score, max, pct, verdict, breakdown };
}

export const VERDICT_LABELS = {
  eligible:              { label: 'Éligible',               description: 'Profil investisseur averti · service custody complet', tone: 'success' },
  eligible_with_caveats: { label: 'Éligible avec réserves', description: 'Profil standard · plafonds réduits recommandés',       tone: 'warning' },
  not_eligible:          { label: 'Non éligible',           description: 'Profil inadéquat · service custody non proposé',       tone: 'error'   },
};

// Helper pour retrouver le label d'une réponse (utile côté PDF + banquier)
export function getAnswerLabel(questionId, value) {
  const q = ADEQUACY_QUESTIONS.find(x => x.id === questionId);
  if (!q) return value;
  if (q.type === 'textarea') return value || '';
  const opt = q.options.find(o => o.value === value);
  return opt?.label || value || '—';
}
