import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { inputCls, labelCls, Button, Card, Spinner } from './shared';

/* ─────────────────────────────────────────────────────────
   LoginPage — Linear-style centered auth card
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
    <div className="min-h-screen bg-[#FAFAFA] text-[#09090B] flex flex-col">
      {/* ── Top brand bar ───────────────────────────────── */}
      <header className="border-b border-[rgba(9,9,11,0.08)] bg-white">
        <div className="max-w-[1280px] mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-[#09090B] rounded-md flex items-center justify-center">
              <span className="text-white text-[10px] font-bold tracking-tight">SL</span>
            </div>
            <span className="text-[13px] font-semibold text-[#09090B] tracking-tight">SwissLife Custody</span>
            <span className="hidden md:inline text-[11px] text-[#A1A1AA] font-medium ml-1">Banque Privée</span>
          </div>
          <p className="text-[11px] text-[#A1A1AA] font-medium uppercase tracking-wider">
            AMF · ACPR · MiCA
          </p>
        </div>
      </header>

      {/* ── Center card ─────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px] animate-fade">
          <div className="mb-6 text-center">
            <h1 className="text-[22px] font-semibold text-[#09090B] tracking-tight">
              {mode === 'login' ? 'Connexion' : 'Créer un compte'}
            </h1>
            <p className="mt-1.5 text-[13px] text-[#71717A]">
              {mode === 'login'
                ? 'Accédez à votre espace de conservation.'
                : 'Rejoignez l\'équipe SwissLife Custody.'}
            </p>
          </div>

          <Card className="p-6">
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
                          className={`h-9 text-[13px] font-medium rounded-md border transition-colors ${
                            active
                              ? 'bg-[#F4F4F5] text-[#09090B] border-[rgba(9,9,11,0.15)]'
                              : 'bg-white text-[#71717A] border-[rgba(9,9,11,0.1)] hover:bg-[#FAFAFA]'
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
                <div className="px-3 py-2 bg-[#FEF2F2] border border-[rgba(239,68,68,0.2)] rounded-md">
                  <p className="text-[12px] text-[#B91C1C]">{error}</p>
                </div>
              )}
              {success && (
                <div className="px-3 py-2 bg-[#ECFDF5] border border-[rgba(16,185,129,0.2)] rounded-md">
                  <p className="text-[12px] text-[#047857]">{success}</p>
                </div>
              )}

              <Button variant="primary" size="lg" className="w-full" disabled={loading}>
                {loading && <Spinner />}
                {loading ? 'Chargement…' : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
              </Button>
            </form>
          </Card>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setSuccess(''); }}
              className="text-[12px] text-[#71717A] hover:text-[#09090B] transition-colors"
            >
              {mode === 'login' ? "Pas encore de compte ? Créer un compte" : "Déjà inscrit ? Se connecter"}
            </button>
          </div>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-[rgba(9,9,11,0.08)]">
        <div className="max-w-[1280px] mx-auto px-6 h-10 flex items-center justify-between">
          <p className="text-[11px] text-[#A1A1AA]">SwissLife Banque Privée · Paris</p>
          <p className="text-[11px] text-[#A1A1AA]">© 2026</p>
        </div>
      </footer>
    </div>
  );
}
