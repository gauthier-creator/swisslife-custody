import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { inputCls, labelCls, Button, Spinner, Logo } from './shared';

/* ─────────────────────────────────────────────────────────
   LoginPage — Editorial private banking entry
   Split hero · warm paper mesh · SVG vault illustration
   ───────────────────────────────────────────────────────── */

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('banquier');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(''); setSuccess('');
    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        await signUp(email, password, fullName, role);
        setSuccess('Compte créé. Vérifiez votre email pour confirmer.');
        setMode('login');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper text-[#0A0A0A] flex flex-col">
      {/* ── Top nav ─────────────────────────────────────── */}
      <header className="relative z-10 border-b border-[rgba(10,10,10,0.06)] bg-[rgba(251,250,247,0.8)] backdrop-blur-xl">
        <div className="max-w-[1240px] mx-auto px-8 h-[68px] flex items-center justify-between">
          <Logo size="md" />
          <div className="hidden md:flex items-center gap-6 text-[11px] font-medium text-[#6B6B6B] tracking-[0.04em] uppercase">
            <span>AMF</span>
            <span className="w-px h-3 bg-[rgba(10,10,10,0.12)]" />
            <span>ACPR</span>
            <span className="w-px h-3 bg-[rgba(10,10,10,0.12)]" />
            <span>Tracfin</span>
            <span className="w-px h-3 bg-[rgba(10,10,10,0.12)]" />
            <span>MiCA · Art. 60</span>
          </div>
        </div>
      </header>

      {/* ── Main split layout ───────────────────────────── */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] max-w-[1240px] mx-auto w-full">

        {/* ── Left: editorial hero ──────────────────────── */}
        <section className="relative hidden lg:flex flex-col justify-between px-12 py-16 border-r border-[rgba(10,10,10,0.06)] overflow-hidden">
          {/* Warm gradient mesh behind */}
          <div aria-hidden className="absolute inset-0 -z-10 mesh-warm" />

          {/* Top — eyebrow + display title */}
          <div className="relative animate-slide-up">
            <p className="text-eyebrow">Portail · Conservation d'actifs numériques</p>
            <h1 className="display-lg text-[#0A0A0A] mt-5 max-w-[520px]">
              La <span className="font-display italic text-[#7C5E3C]">conservation</span><br />
              redéfinie pour la<br />
              banque privée.
            </h1>
            <p className="mt-7 text-[15px] text-[#4A4A4A] leading-relaxed max-w-[460px] tracking-[-0.006em]">
              Custody institutionnelle conforme au règlement{' '}
              <span className="text-[#0A0A0A] font-medium">MiCA Art. 60</span>, avec
              cryptographie à seuil, ségrégation des actifs et audit temps-réel.
            </p>
          </div>

          {/* Vault illustration — abstract SVG */}
          <div className="relative my-12 animate-slide-up stagger-2">
            <svg
              viewBox="0 0 520 320"
              className="w-full max-w-[520px] h-auto"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="vault-bronze" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#C9A876" />
                  <stop offset="50%" stopColor="#9A7A51" />
                  <stop offset="100%" stopColor="#7C5E3C" />
                </linearGradient>
                <linearGradient id="vault-ink" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2A2A2A" />
                  <stop offset="100%" stopColor="#0A0A0A" />
                </linearGradient>
                <radialGradient id="vault-glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#C9A876" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#C9A876" stopOpacity="0" />
                </radialGradient>
                <filter id="soft-shadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="12" stdDeviation="18" floodColor="#0A0A0A" floodOpacity="0.1" />
                </filter>
              </defs>

              {/* Ambient glow */}
              <ellipse cx="260" cy="170" rx="240" ry="140" fill="url(#vault-glow)" />

              {/* Horizontal guideline grid — editorial */}
              <g stroke="rgba(10,10,10,0.06)" strokeWidth="1">
                <line x1="20" y1="60" x2="500" y2="60" />
                <line x1="20" y1="120" x2="500" y2="120" />
                <line x1="20" y1="180" x2="500" y2="180" />
                <line x1="20" y1="240" x2="500" y2="240" />
                <line x1="20" y1="300" x2="500" y2="300" />
              </g>

              {/* Main vault — concentric geometric hexagon */}
              <g filter="url(#soft-shadow)">
                {/* Outer hex */}
                <polygon
                  points="260,50 410,135 410,255 260,340 110,255 110,135"
                  fill="#FFFFFF"
                  stroke="rgba(10,10,10,0.14)"
                  strokeWidth="1"
                />
                {/* Inner hex — dark vault body */}
                <polygon
                  points="260,90 370,153 370,237 260,300 150,237 150,153"
                  fill="url(#vault-ink)"
                />
                {/* Bronze ring */}
                <polygon
                  points="260,115 345,164 345,226 260,275 175,226 175,164"
                  fill="none"
                  stroke="url(#vault-bronze)"
                  strokeWidth="2"
                />
                <polygon
                  points="260,135 325,173 325,217 260,255 195,217 195,173"
                  fill="none"
                  stroke="url(#vault-bronze)"
                  strokeWidth="1"
                  strokeDasharray="2 4"
                />
                {/* Center monogram */}
                <text
                  x="260"
                  y="210"
                  textAnchor="middle"
                  fontFamily="Fraunces, ui-serif, Georgia, serif"
                  fontSize="46"
                  fontWeight="500"
                  fill="#C9A876"
                  letterSpacing="-0.04em"
                >
                  Sℓ
                </text>
              </g>

              {/* Floating particles — bronze dots */}
              <g fill="#7C5E3C">
                <circle cx="70" cy="90" r="2" opacity="0.4" />
                <circle cx="90" cy="260" r="1.5" opacity="0.3" />
                <circle cx="450" cy="80" r="2" opacity="0.5" />
                <circle cx="470" cy="220" r="1.5" opacity="0.35" />
                <circle cx="40" cy="180" r="1" opacity="0.3" />
                <circle cx="490" cy="170" r="1" opacity="0.3" />
              </g>

              {/* Thin connecting lines — diagonal */}
              <g stroke="rgba(124,94,60,0.15)" strokeWidth="1" strokeLinecap="round">
                <line x1="60" y1="100" x2="150" y2="140" />
                <line x1="460" y1="100" x2="370" y2="140" />
                <line x1="60" y1="250" x2="150" y2="225" />
                <line x1="460" y1="250" x2="370" y2="225" />
              </g>
            </svg>
          </div>

          {/* Bottom — trust strip */}
          <div className="relative animate-slide-up stagger-3 space-y-6">
            <div className="grid grid-cols-3 gap-6 pb-6 border-b border-[rgba(10,10,10,0.06)]">
              <div>
                <p className="text-[24px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.025em]">€18.9B</p>
                <p className="text-[11px] text-[#6B6B6B] mt-1 tracking-[0.01em] uppercase font-medium">Sous conservation</p>
              </div>
              <div>
                <p className="text-[24px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.025em]">2/3</p>
                <p className="text-[11px] text-[#6B6B6B] mt-1 tracking-[0.01em] uppercase font-medium">Threshold MPC</p>
              </div>
              <div>
                <p className="text-[24px] font-medium text-[#0A0A0A] tabular-nums tracking-[-0.025em]">24/7</p>
                <p className="text-[11px] text-[#6B6B6B] mt-1 tracking-[0.01em] uppercase font-medium">Surveillance AML</p>
              </div>
            </div>
            <p className="text-[11px] text-[#9B9B9B] tracking-[-0.003em] leading-relaxed max-w-[460px]">
              SwissLife Banque Privée · Paris — Prestataire agréé ACPR n° 17328. Services de conservation
              et d'administration d'actifs numériques pour le compte de tiers, conformément au règlement
              (UE) 2023/1114.
            </p>
          </div>
        </section>

        {/* ── Right: auth card ──────────────────────────── */}
        <section className="flex items-center justify-center px-6 py-16 lg:py-12 lg:px-14">
          <div className="w-full max-w-[420px] animate-slide-up stagger-1">

            {/* Header */}
            <div className="mb-10">
              <p className="text-eyebrow">
                {mode === 'login' ? 'Espace professionnel' : 'Nouvelle inscription'}
              </p>
              <h2 className="display-sm text-[#0A0A0A] mt-4">
                {mode === 'login' ? 'Connexion' : 'Créer un compte'}
              </h2>
              <p className="mt-3 text-[14px] text-[#6B6B6B] leading-relaxed tracking-[-0.006em]">
                {mode === 'login'
                  ? 'Accédez au registre de conservation et à vos mandats clients.'
                  : "Rejoignez l'équipe de gestion et d'administration SwissLife Custody."}
              </p>
            </div>

            {/* Form — card-less, editorial */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === 'register' && (
                <div>
                  <label className={labelCls}>Nom complet</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Jean Dupont"
                    className={inputCls}
                    required
                  />
                </div>
              )}

              <div>
                <label className={labelCls}>Email professionnel</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="vous@swisslife.fr"
                  className={inputCls}
                  required
                />
              </div>

              <div>
                <label className={labelCls}>Mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputCls}
                  required
                  minLength={6}
                />
              </div>

              {mode === 'register' && (
                <div>
                  <label className={labelCls}>Rôle</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'banquier', label: 'Banquier' },
                      { id: 'admin', label: 'Administrateur' },
                    ].map(r => {
                      const active = role === r.id;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setRole(r.id)}
                          className={`h-11 text-[13px] font-medium rounded-[10px] border transition-all tracking-[-0.01em] ${
                            active
                              ? 'bg-[#0A0A0A] text-white border-[#0A0A0A]'
                              : 'bg-white text-[#6B6B6B] border-[rgba(10,10,10,0.1)] hover:bg-[#FBFAF7] hover:text-[#0A0A0A] hover:border-[rgba(10,10,10,0.2)]'
                          }`}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {error && (
                <div className="px-4 py-3 bg-white border border-[rgba(220,38,38,0.2)] rounded-[10px]">
                  <p className="text-[12.5px] font-medium text-[#991B1B] tracking-[-0.003em]">{error}</p>
                </div>
              )}
              {success && (
                <div className="px-4 py-3 bg-white border border-[rgba(22,163,74,0.2)] rounded-[10px]">
                  <p className="text-[12.5px] font-medium text-[#166534] tracking-[-0.003em]">{success}</p>
                </div>
              )}

              <Button variant="primary" size="lg" className="w-full mt-2" disabled={loading}>
                {loading && <Spinner />}
                {loading ? 'Authentification…' : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
                {!loading && (
                  <svg className="w-4 h-4 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                )}
              </Button>
            </form>

            {/* Mode toggle */}
            <div className="mt-8 pt-6 border-t border-[rgba(10,10,10,0.06)] text-center">
              <button
                type="button"
                onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setSuccess(''); }}
                className="text-[13px] text-[#6B6B6B] hover:text-[#0A0A0A] transition-colors tracking-[-0.006em]"
              >
                {mode === 'login'
                  ? <>Pas encore de compte ? <span className="font-medium text-[#0A0A0A] underline underline-offset-4 decoration-[rgba(10,10,10,0.2)] hover:decoration-[#0A0A0A]">Créer un compte</span></>
                  : <>Déjà inscrit ? <span className="font-medium text-[#0A0A0A] underline underline-offset-4 decoration-[rgba(10,10,10,0.2)] hover:decoration-[#0A0A0A]">Se connecter</span></>}
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-[rgba(10,10,10,0.06)]">
        <div className="max-w-[1240px] mx-auto px-8 h-14 flex items-center justify-between text-[11px] text-[#9B9B9B] tracking-[0.02em] uppercase font-medium">
          <span>SwissLife Banque Privée · 11 Quai André Citroën, Paris</span>
          <span>© 2026 · Tous droits réservés</span>
        </div>
      </footer>
    </div>
  );
}
