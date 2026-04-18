import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { inputCls, labelCls, Button, Spinner } from './shared';

/* ─────────────────────────────────────────────────────────
   LoginPage — Sober private-banking tech entry
   Ramify-aligned: left brand column with tiny compliance strip,
   right form. No hero illustration, no italic accent, no metrics.
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
    <div className="min-h-screen bg-[#FAFAFA] text-[#1E1E1E] flex flex-col">
      {/* ── Top nav — tiny brand only, no trust badges ── */}
      <header className="border-b border-[#E9E4D9]">
        <div className="max-w-[1240px] mx-auto px-10 h-[60px] flex items-center">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-[6px] bg-[#1E1E1E] text-white flex items-center justify-center">
              <span className="font-display text-[13px] leading-none" style={{ letterSpacing: '-0.04em' }}>Sℓ</span>
            </span>
            <span className="font-display text-[19px] text-[#1E1E1E] leading-none" style={{ letterSpacing: '-0.01em' }}>
              swisslife
            </span>
          </div>
        </div>
      </header>

      {/* ── Main split ─────────────────────────────────── */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 max-w-[1240px] mx-auto w-full">

        {/* Left — sober statement + compliance strip */}
        <section className="relative hidden lg:flex flex-col justify-between px-12 py-16 border-r border-[#E9E4D9]">
          <div className="animate-fade">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A8278] mb-6">
              SwissLife Banque Privée · Custody
            </p>
            <h1 className="font-display text-[44px] leading-[1.08] text-[#1E1E1E] max-w-[460px]"
                style={{ letterSpacing: '-0.015em', fontWeight: 400 }}>
              Conservation institutionnelle d'actifs numériques.
            </h1>
            <p className="mt-6 text-[15px] text-[#5D5D5D] leading-relaxed max-w-[440px]">
              Registre sécurisé par cryptographie à seuil, ségrégation stricte des actifs
              clients et audit temps-réel — conforme MiCA Art. 60.
            </p>
          </div>

          {/* Trust strip — quiet hairline row, no big numbers */}
          <div className="animate-fade">
            <div className="grid grid-cols-4 gap-6 py-5 border-y border-[#E9E4D9]">
              {[
                { k: 'AMF',    v: 'Régulé' },
                { k: 'ACPR',   v: 'n° 17328' },
                { k: 'MiCA',   v: 'Art. 60' },
                { k: 'Tracfin', v: 'Déclarant' },
              ].map(({ k, v }) => (
                <div key={k}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8A8278]">{k}</p>
                  <p className="mt-1 text-[13px] text-[#1E1E1E] font-medium">{v}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[11.5px] text-[#8A8278] leading-relaxed max-w-[440px]">
              SwissLife Banque Privée · 11 Quai André Citroën, Paris — Services de conservation
              et d'administration d'actifs numériques pour le compte de tiers, conformément au
              règlement (UE) 2023/1114.
            </p>
          </div>
        </section>

        {/* Right — form */}
        <section className="flex items-center justify-center px-6 py-16 lg:py-12 lg:px-16">
          <div className="w-full max-w-[380px] animate-fade">

            <div className="mb-8">
              <h2 className="font-display text-[28px] text-[#1E1E1E] leading-[1.15]"
                  style={{ letterSpacing: '-0.012em', fontWeight: 400 }}>
                {mode === 'login' ? 'Connexion' : 'Créer un compte'}
              </h2>
              <p className="mt-2 text-[13.5px] text-[#5D5D5D]">
                {mode === 'login'
                  ? 'Accédez au registre de conservation et à vos mandats clients.'
                  : "Rejoignez l'équipe de gestion et d'administration SwissLife Custody."}
              </p>
            </div>

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
                          className={`h-10 text-[13px] font-semibold rounded-[6px] border transition-colors ${
                            active
                              ? 'bg-[#1E1E1E] text-white border-[#1E1E1E]'
                              : 'bg-white text-[#5D5D5D] border-[#E9E4D9] hover:text-[#1E1E1E] hover:border-[#C8BEA4]'
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
                <div className="px-3.5 py-2.5 bg-[#FEF2F2] border border-[rgba(220,38,38,0.18)] rounded-[6px]">
                  <p className="text-[12.5px] font-medium text-[#991B1B]">{error}</p>
                </div>
              )}
              {success && (
                <div className="px-3.5 py-2.5 bg-[#ECFAF0] border border-[rgba(22,163,74,0.18)] rounded-[6px]">
                  <p className="text-[12.5px] font-medium text-[#166534]">{success}</p>
                </div>
              )}

              <Button variant="primary" size="lg" className="w-full mt-2" disabled={loading}>
                {loading && <Spinner />}
                {loading ? 'Authentification…' : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
              </Button>
            </form>

            <div className="mt-6 pt-5 border-t border-[#E9E4D9] text-center">
              <button
                type="button"
                onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setSuccess(''); }}
                className="text-[13px] text-[#5D5D5D] hover:text-[#1E1E1E] transition-colors"
              >
                {mode === 'login'
                  ? <>Pas encore de compte ? <span className="font-semibold text-[#1E1E1E] underline underline-offset-[3px] decoration-[#C8BEA4] hover:decoration-[#1E1E1E]">Créer un compte</span></>
                  : <>Déjà inscrit ? <span className="font-semibold text-[#1E1E1E] underline underline-offset-[3px] decoration-[#C8BEA4] hover:decoration-[#1E1E1E]">Se connecter</span></>}
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Minimal footer */}
      <footer className="border-t border-[#E9E4D9]">
        <div className="max-w-[1240px] mx-auto px-10 h-12 flex items-center justify-between text-[11px] text-[#8A8278]">
          <span>© 2026 SwissLife Banque Privée</span>
          <span>support@swisslife-custody.com</span>
        </div>
      </footer>
    </div>
  );
}
