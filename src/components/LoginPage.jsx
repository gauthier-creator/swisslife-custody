import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { inputCls, labelCls, Spinner } from './shared';

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('login'); // login | register
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
    setError('');
    setSuccess('');

    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        await signUp(email, password, fullName, role);
        setSuccess('Compte cree. Verifiez votre email pour confirmer.');
        setMode('login');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[#0F0F10] rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-[16px] font-bold">SL</span>
          </div>
          <h1 className="text-[24px] font-semibold text-[#0F0F10] tracking-tight">SwissLife Custody</h1>
          <p className="text-[14px] text-[#787881] mt-1">
            {mode === 'login' ? 'Connectez-vous a votre espace' : 'Creer un nouveau compte'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6 space-y-4">
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
            <label className={labelCls}>Email</label>
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
              <label className={labelCls}>Role</label>
              <div className="flex gap-3 mt-1">
                {[
                  { id: 'banquier', label: 'Banquier', desc: 'Gestion clients & wallets' },
                  { id: 'admin', label: 'Admin', desc: 'Configuration & gestion totale' },
                ].map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRole(r.id)}
                    className={`flex-1 p-3 rounded-xl border text-left transition-all ${
                      role === r.id
                        ? 'border-[#0F0F10] bg-[#0F0F10]/[0.02]'
                        : 'border-[rgba(0,0,29,0.08)] hover:border-[rgba(0,0,29,0.15)]'
                    }`}
                  >
                    <span className={`text-[13px] font-semibold ${role === r.id ? 'text-[#0F0F10]' : 'text-[#787881]'}`}>
                      {r.label}
                    </span>
                    <p className="text-[11px] text-[#A8A29E] mt-0.5">{r.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-[12px] text-[#DC2626] font-medium bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          {success && (
            <p className="text-[12px] text-[#059669] font-medium bg-emerald-50 rounded-lg px-3 py-2">{success}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[#0F0F10] text-white rounded-xl text-[14px] font-medium hover:bg-[#292524] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <><Spinner size="w-4 h-4" /> Chargement...</> : mode === 'login' ? 'Se connecter' : 'Creer le compte'}
          </button>

          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setSuccess(''); }}
            className="w-full py-2 text-[13px] text-[#787881] hover:text-[#0F0F10] transition-colors font-medium"
          >
            {mode === 'login' ? 'Creer un compte →' : '← Retour a la connexion'}
          </button>
        </form>
      </div>
    </div>
  );
}
