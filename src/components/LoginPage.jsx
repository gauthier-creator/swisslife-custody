import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { inputCls, labelCls, Button, Spinner } from './shared';

/* ─────────────────────────────────────────────────────────
   Login — the first impression
   One door, set with typographic care.
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
    <div className="min-h-screen bg-[#FAFAF7] text-[#0B0B0C] flex">
      {/* ── Left — editorial panel ─────────────────────── */}
      <aside className="hidden lg:flex lg:w-1/2 relative border-r border-[rgba(11,11,12,0.08)]">
        <div className="absolute top-10 left-10">
          <p className="eyebrow text-[#8A6F3D]">SwissLife · Conservation</p>
        </div>
        <div className="flex-1 flex items-center px-16">
          <div className="max-w-lg animate-whisper">
            <p className="eyebrow mb-6">Depuis 1857 · Paris</p>
            <h1 className="font-display-tight text-[80px] leading-[0.92] text-[#0B0B0C]">
              La patience
              <br />
              et la précision
              <br />
              d'un coffre-fort.
            </h1>
            <p className="mt-10 text-[15px] text-[#6B6B70] leading-[1.8] font-light max-w-md">
              Un outil pour les banquiers privés : gérer la conservation
              d'actifs numériques avec la même rigueur qu'un dossier de valeurs,
              conformément au règlement MiCA et à l'ordonnance de l'ACPR.
            </p>
          </div>
        </div>
        <div className="absolute bottom-10 left-10 right-10 flex items-center justify-between">
          <p className="eyebrow">AMF · ACPR · Tracfin · MiCA Art. 60</p>
          <p className="eyebrow text-[#A8A8AD]">7 rue Belgrand · Levallois</p>
        </div>
      </aside>

      {/* ── Right — the door ───────────────────────────── */}
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-12">
            <p className="eyebrow mb-4">
              {mode === 'login' ? 'Connexion' : 'Nouveau compte'}
            </p>
            <h2 className="font-display text-[44px] leading-[1.05] text-[#0B0B0C]">
              {mode === 'login' ? 'Bonsoir.' : 'Bienvenue.'}
            </h2>
            <p className="mt-4 text-[14px] text-[#6B6B70] font-light leading-relaxed">
              {mode === 'login'
                ? 'Accédez à votre espace de conservation.'
                : 'Créez votre compte pour rejoindre l\'équipe.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
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
              <label className={labelCls}>Adresse email</label>
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
                <div className="mt-3 flex gap-6">
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
                        className="relative py-2 text-[13px] tracking-tight transition-colors"
                        style={{ color: active ? '#0B0B0C' : '#6B6B70' }}
                      >
                        {r.label}
                        {active && <span className="absolute left-0 right-0 -bottom-px h-px bg-[#0B0B0C]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {error && (
              <div className="py-3 px-4 border-l-2 border-[#7A2424] bg-[rgba(122,36,36,0.04)]">
                <p className="text-[13px] text-[#7A2424]">{error}</p>
              </div>
            )}
            {success && (
              <div className="py-3 px-4 border-l-2 border-[#2E5D4F] bg-[rgba(46,93,79,0.04)]">
                <p className="text-[13px] text-[#2E5D4F]">{success}</p>
              </div>
            )}

            <div className="pt-4">
              <Button variant="primary" className="w-full" disabled={loading}>
                {loading ? <><Spinner size="w-3 h-3" /> Chargement…</> : mode === 'login' ? 'Entrer' : 'Créer le compte'}
              </Button>
            </div>

            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setSuccess(''); }}
              className="w-full text-center eyebrow text-[#6B6B70] hover:text-[#0B0B0C] transition-colors"
            >
              {mode === 'login' ? 'Créer un compte →' : '← Retour à la connexion'}
            </button>
          </form>

          <div className="mt-16 pt-8 border-t border-[rgba(11,11,12,0.08)] flex items-center justify-between">
            <p className="eyebrow">SwissLife Banque Privée</p>
            <p className="eyebrow text-[#A8A8AD]">Paris · 2026</p>
          </div>
        </div>
      </main>
    </div>
  );
}
