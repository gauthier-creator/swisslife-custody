import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { inputCls, labelCls, Button, Card, Spinner, Badge } from './shared';

/* ─────────────────────────────────────────────────────────
   LoginPage — Revolut-inspired centered auth card
   Elevated surface · colorful gradients · rounded pills
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
    <div className="min-h-screen bg-[#F7F8FA] text-[#191C1F] flex flex-col relative overflow-hidden">
      {/* Ambient gradient orbs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-20 w-[420px] h-[420px] rounded-full opacity-[0.18] blur-3xl" style={{ background: 'radial-gradient(circle, #0666EB 0%, transparent 70%)' }} />
        <div className="absolute top-40 -right-32 w-[460px] h-[460px] rounded-full opacity-[0.15] blur-3xl" style={{ background: 'radial-gradient(circle, #E950A4 0%, transparent 70%)' }} />
        <div className="absolute -bottom-40 left-1/3 w-[380px] h-[380px] rounded-full opacity-[0.12] blur-3xl" style={{ background: 'radial-gradient(circle, #00BE90 0%, transparent 70%)' }} />
      </div>

      {/* ── Top brand bar ───────────────────────────────── */}
      <header className="relative z-10 bg-[rgba(247,248,250,0.85)] backdrop-blur-xl border-b border-[rgba(25,28,31,0.06)]">
        <div className="max-w-[1320px] mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#191C1F] rounded-xl flex items-center justify-center shadow-[0_4px_16px_-4px_rgba(25,28,31,0.4)]">
              <span className="text-white text-[13px] font-bold tracking-tight">SL</span>
            </div>
            <div className="flex flex-col items-start leading-none">
              <span className="text-[15px] font-semibold text-[#191C1F] tracking-[-0.2px]">
                SwissLife Custody
              </span>
              <span className="text-[11px] text-[#75808A] font-medium mt-0.5">
                Banque Privée · Paris
              </span>
            </div>
          </div>
          <div className="hidden sm:block">
            <Badge variant="info" dot>AMF · ACPR · MiCA</Badge>
          </div>
        </div>
      </header>

      {/* ── Center card ─────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-6 py-12 relative z-10">
        <div className="w-full max-w-[420px] animate-fade">
          <div className="mb-7 text-center">
            <p className="text-[13px] font-medium text-[#75808A]">
              {mode === 'login' ? 'Espace professionnel' : 'Inscription'}
            </p>
            <h1 className="text-[32px] font-semibold text-[#191C1F] tracking-[-0.6px] leading-[1.1] mt-1">
              {mode === 'login' ? 'Connexion' : 'Créer un compte'}
            </h1>
            <p className="mt-2 text-[14px] text-[#75808A]">
              {mode === 'login'
                ? 'Accédez à votre espace de conservation.'
                : 'Rejoignez l\'équipe SwissLife Custody.'}
            </p>
          </div>

          <Card className="p-7">
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  placeholder="vous@swisslife.com"
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
                          className={`h-11 text-[14px] font-semibold rounded-xl border transition-all tracking-[-0.1px] ${
                            active
                              ? 'bg-[#191C1F] text-white border-[#191C1F] shadow-[0_4px_16px_-4px_rgba(25,28,31,0.3)]'
                              : 'bg-white text-[#75808A] border-[rgba(25,28,31,0.1)] hover:bg-[#F7F8FA] hover:text-[#191C1F]'
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
                <div className="px-4 py-3 bg-[#FDECEE] border border-[rgba(236,76,90,0.2)] rounded-xl">
                  <p className="text-[13px] font-medium text-[#C93545]">{error}</p>
                </div>
              )}
              {success && (
                <div className="px-4 py-3 bg-[#E6F9F2] border border-[rgba(0,190,144,0.2)] rounded-xl">
                  <p className="text-[13px] font-medium text-[#008266]">{success}</p>
                </div>
              )}

              <Button variant="accent" size="lg" className="w-full mt-2" disabled={loading}>
                {loading && <Spinner />}
                {loading ? 'Chargement…' : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
              </Button>
            </form>
          </Card>

          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setSuccess(''); }}
              className="text-[13px] font-medium text-[#75808A] hover:text-[#191C1F] transition-colors"
            >
              {mode === 'login' ? "Pas encore de compte ? Créer un compte" : "Déjà inscrit ? Se connecter"}
            </button>
          </div>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-[rgba(25,28,31,0.06)] bg-[rgba(247,248,250,0.85)] backdrop-blur-xl">
        <div className="max-w-[1320px] mx-auto px-8 h-12 flex items-center justify-between">
          <p className="text-[11px] text-[#75808A] font-medium uppercase tracking-wider">SwissLife Banque Privée · Paris</p>
          <p className="text-[11px] text-[#75808A] font-medium">© 2026</p>
        </div>
      </footer>
    </div>
  );
}
