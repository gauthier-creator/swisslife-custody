import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { testDfnsConnection } from '../services/dfnsApi';
import { inputCls, labelCls, Spinner } from './shared';

export default function ConfigPage({ onConfigured }) {
  const { isAdmin, profile } = useAuth();
  const [sfUrl, setSfUrl] = useState('');
  const [sfToken, setSfToken] = useState('');
  const [useMock, setUseMock] = useState(true);
  const [testing, setTesting] = useState(false);
  const [dfnsStatus, setDfnsStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);

  // Load existing config
  useEffect(() => {
    supabase.from('custody_api_config').select('*').limit(1).single().then(({ data }) => {
      if (data) {
        setConfig(data);
        setSfUrl(data.sf_instance_url === 'mock' ? '' : (data.sf_instance_url || ''));
        setSfToken(data.sf_access_token === 'mock' ? '' : (data.sf_access_token || ''));
        setUseMock(data.sf_instance_url === 'mock');
      }
    });
  }, []);

  if (!isAdmin) return null;

  const handleTestDfns = async () => {
    setTesting(true);
    try {
      const ok = await testDfnsConnection();
      setDfnsStatus(ok);
    } catch {
      setDfnsStatus(false);
    }
    setTesting(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const updates = {
      sf_instance_url: useMock ? 'mock' : sfUrl,
      sf_access_token: useMock ? 'mock' : sfToken,
      dfns_configured: true,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    };

    if (config?.id) {
      await supabase.from('custody_api_config').update(updates).eq('id', config.id);
    } else {
      await supabase.from('custody_api_config').insert(updates);
    }

    setSaving(false);
    onConfigured?.();
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[20px] font-semibold text-[#0F0F10]">Configuration</h2>
        <p className="text-[13px] text-[#787881] mt-1">Parametres d'integration API — Admin uniquement</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Salesforce */}
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-semibold text-[#0F0F10]">Salesforce CRM</h3>
            <label className="flex items-center gap-2 text-[12px] text-[#787881] cursor-pointer">
              <input type="checkbox" checked={useMock} onChange={(e) => setUseMock(e.target.checked)} className="rounded" />
              Mode demo
            </label>
          </div>
          {!useMock && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Instance URL</label>
                <input type="url" value={sfUrl} onChange={e => setSfUrl(e.target.value)} placeholder="https://yourorg.salesforce.com" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Access Token</label>
                <input type="password" value={sfToken} onChange={e => setSfToken(e.target.value)} placeholder="Bearer token" className={inputCls} />
              </div>
            </div>
          )}
          {useMock && (
            <p className="text-[12px] text-[#059669] font-medium mt-2">Donnees de demonstration actives</p>
          )}
        </div>

        {/* Dfns */}
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
          <h3 className="text-[14px] font-semibold text-[#0F0F10] mb-4">Dfns Custody</h3>
          <p className="text-[12px] text-[#787881] mb-4">
            L'API Dfns est configuree cote serveur via les variables d'environnement (.env). Le token PAT et la cle privee sont securises sur le backend.
          </p>
          <button
            onClick={handleTestDfns}
            disabled={testing}
            className="px-4 py-2 text-[13px] font-medium rounded-xl border border-[rgba(0,0,29,0.08)] hover:bg-[#FAFAF9] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {testing ? <><Spinner size="w-4 h-4" /> Test en cours...</> : 'Tester la connexion Dfns'}
          </button>
          {dfnsStatus !== null && (
            <p className={`text-[12px] mt-3 font-medium ${dfnsStatus ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
              {dfnsStatus ? 'Dfns connecte — API fonctionnelle' : 'Connexion echouee — verifiez le .env du serveur'}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-[#0F0F10] text-white rounded-xl text-[14px] font-medium hover:bg-[#292524] transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <><Spinner size="w-4 h-4" /> Sauvegarde...</> : 'Sauvegarder la configuration'}
        </button>
      </div>

      {/* Users management section */}
      <UserManagement />
    </div>
  );
}

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('custody_profiles').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      setUsers(data || []);
      setLoading(false);
    });
  }, []);

  const toggleRole = async (userId, currentRole) => {
    const newRole = currentRole === 'admin' ? 'banquier' : 'admin';
    await supabase.from('custody_profiles').update({ role: newRole }).eq('id', userId);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
  };

  return (
    <div className="mt-8">
      <h3 className="text-[16px] font-semibold text-[#0F0F10] mb-4">Utilisateurs</h3>
      <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><Spinner size="w-5 h-5" /></div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-[#787881]">Aucun utilisateur</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[rgba(0,0,29,0.06)]">
                <th className="text-left text-[11px] font-medium text-[#787881] uppercase tracking-wider px-6 py-3">Utilisateur</th>
                <th className="text-left text-[11px] font-medium text-[#787881] uppercase tracking-wider px-6 py-3">Email</th>
                <th className="text-left text-[11px] font-medium text-[#787881] uppercase tracking-wider px-6 py-3">Role</th>
                <th className="text-left text-[11px] font-medium text-[#787881] uppercase tracking-wider px-6 py-3">Inscrit le</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-[rgba(0,0,29,0.04)] hover:bg-[#FAFAF9]">
                  <td className="px-6 py-3 text-[13px] font-medium text-[#0F0F10]">{u.full_name || '—'}</td>
                  <td className="px-6 py-3 text-[13px] text-[#787881]">{u.email}</td>
                  <td className="px-6 py-3">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${
                      u.role === 'admin'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      {u.role === 'admin' ? 'Admin' : 'Banquier'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-[13px] text-[#787881]">
                    {new Date(u.created_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => toggleRole(u.id, u.role)}
                      className="text-[11px] text-[#787881] hover:text-[#0F0F10] transition-colors"
                    >
                      {u.role === 'admin' ? 'Passer banquier' : 'Passer admin'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
