import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { testDfnsConnection } from '../services/dfnsApi';
import { getSalesforceStatus } from '../services/salesforceApi';
import { API_BASE } from '../config/constants';
import { Spinner } from './shared';

export default function ConfigPage({ onConfigured }) {
  const { isAdmin } = useAuth();
  const [testingDfns, setTestingDfns] = useState(false);
  const [dfnsStatus, setDfnsStatus] = useState(null);
  const [sfStatus, setSfStatus] = useState(null);
  const [loadingSf, setLoadingSf] = useState(true);

  useEffect(() => {
    getSalesforceStatus().then(s => { setSfStatus(s); setLoadingSf(false); });
  }, []);

  if (!isAdmin) return null;

  const handleTestDfns = async () => {
    setTestingDfns(true);
    try {
      const ok = await testDfnsConnection();
      setDfnsStatus(ok);
    } catch { setDfnsStatus(false); }
    setTestingDfns(false);
  };

  const handleTestSf = async () => {
    setLoadingSf(true);
    const s = await getSalesforceStatus();
    setSfStatus(s);
    setLoadingSf(false);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[20px] font-semibold text-[#0F0F10]">Configuration</h2>
        <p className="text-[13px] text-[#787881] mt-1">Statut des integrations — Admin uniquement</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Salesforce */}
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-[#00A1E0] rounded-xl flex items-center justify-center">
              <span className="text-white text-[14px] font-bold">SF</span>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-[#0F0F10]">Salesforce CRM</h3>
              <p className="text-[12px] text-[#787881]">Connexion OAuth server-side</p>
            </div>
          </div>

          {loadingSf ? (
            <div className="py-4 text-center"><Spinner size="w-5 h-5" /></div>
          ) : sfStatus?.configured ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#059669]" />
                <span className="text-[13px] text-[#059669] font-medium">Connecte</span>
              </div>
              {sfStatus.instanceUrl && (
                <p className="text-[12px] text-[#787881] font-mono bg-[rgba(0,0,23,0.03)] rounded-lg px-3 py-2">
                  {sfStatus.instanceUrl}
                </p>
              )}
              <button onClick={handleTestSf}
                className="px-4 py-2 text-[12px] font-medium rounded-xl border border-[rgba(0,0,29,0.08)] hover:bg-[#FAFAF9] transition-colors">
                Rafraichir le statut
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                <span className="text-[13px] text-[#F59E0B] font-medium">Non connecte</span>
              </div>
              <div className="bg-[rgba(0,0,23,0.025)] rounded-xl p-4 text-[12px] text-[#787881] space-y-2">
                <p className="font-semibold text-[#0F0F10]">Pour connecter Salesforce, ajoutez ces variables d'environnement au serveur :</p>
                <div className="font-mono text-[11px] bg-white rounded-lg p-3 space-y-1 border border-[rgba(0,0,29,0.06)]">
                  <p>SF_LOGIN_URL=https://login.salesforce.com</p>
                  <p>SF_CLIENT_ID=votre_connected_app_id</p>
                  <p>SF_CLIENT_SECRET=votre_secret</p>
                  <p>SF_USERNAME=votre_user@org.com</p>
                  <p>SF_PASSWORD=votre_password</p>
                  <p>SF_SECURITY_TOKEN=votre_token</p>
                </div>
                <p>Creez une <strong>Connected App</strong> dans Salesforce Setup → App Manager → New Connected App, activez OAuth et cochez "Full access".</p>
              </div>
            </div>
          )}
        </div>

        {/* Dfns */}
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-[#0F0F10] rounded-xl flex items-center justify-center">
              <span className="text-white text-[14px] font-bold">Df</span>
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-[#0F0F10]">Dfns Custody</h3>
              <p className="text-[12px] text-[#787881]">API PAT + User Action Signing</p>
            </div>
          </div>

          <div className="space-y-3">
            {dfnsStatus !== null && (
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${dfnsStatus ? 'bg-[#059669]' : 'bg-[#DC2626]'}`} />
                <span className={`text-[13px] font-medium ${dfnsStatus ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                  {dfnsStatus ? 'API connectee' : 'Connexion echouee'}
                </span>
              </div>
            )}
            <button
              onClick={handleTestDfns}
              disabled={testingDfns}
              className="px-4 py-2 text-[12px] font-medium rounded-xl border border-[rgba(0,0,29,0.08)] hover:bg-[#FAFAF9] transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {testingDfns ? <><Spinner size="w-4 h-4" /> Test...</> : 'Tester la connexion'}
            </button>
            <div className="bg-[rgba(0,0,23,0.025)] rounded-xl p-4 text-[12px] text-[#787881]">
              <p>Configure via variables d'environnement : <code className="text-[#6366F1]">DFNS_API_TOKEN</code>, <code className="text-[#6366F1]">DFNS_APP_ID</code>, <code className="text-[#6366F1]">DFNS_CRED_ID</code>, <code className="text-[#6366F1]">DFNS_PRIVATE_KEY</code></p>
            </div>
          </div>
        </div>
      </div>

      {/* Compliance settings */}
      <ComplianceSettings />

      {/* Users management */}
      <UserManagement />
    </div>
  );
}

function ComplianceSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/settings`)
      .then(r => r.json())
      .then(data => { setSettings(data); setLoading(false); })
      .catch(() => { setSettings({ kyc_module_enabled: false, filing_authority: 'tracfin' }); setLoading(false); });
  }, []);

  const save = async (updates) => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const hdrs = { 'Content-Type': 'application/json' };
      if (session?.access_token) hdrs.Authorization = `Bearer ${session.access_token}`;
      const url = `${API_BASE}/api/admin/settings`;
      console.log('[ConfigPage] save:', { url, updates, hasToken: !!session?.access_token });
      const res = await fetch(url, {
        method: 'PUT', headers: hdrs, body: JSON.stringify(updates),
      });
      console.log('[ConfigPage] response:', res.status);
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      } else {
        const errText = await res.text();
        console.error('[ConfigPage] save error:', res.status, errText.slice(0, 200));
      }
    } catch (err) { console.error('[ConfigPage] save exception:', err); }
    setSaving(false);
  };

  if (loading) return <div className="mt-8 text-center"><Spinner size="w-5 h-5" /></div>;

  return (
    <div className="mt-8">
      <h3 className="text-[16px] font-semibold text-[#0F0F10] mb-4">Parametres compliance</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* KYC Module toggle */}
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-[14px] font-semibold text-[#0F0F10]">Module KYC integre</h4>
              <p className="text-[12px] text-[#787881] mt-0.5">Verification d'identite via ComplyCube (en complement du KYC bancaire)</p>
            </div>
            <button
              onClick={() => save({ kyc_module_enabled: !settings?.kyc_module_enabled })}
              disabled={saving}
              className={`relative w-12 h-6 rounded-full transition-colors ${settings?.kyc_module_enabled ? 'bg-[#059669]' : 'bg-[rgba(0,0,29,0.15)]'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings?.kyc_module_enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <div className={`text-[12px] px-3 py-2 rounded-lg ${settings?.kyc_module_enabled ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[rgba(0,0,23,0.03)] text-[#787881]'}`}>
            {settings?.kyc_module_enabled
              ? 'Active — L\'onglet KYC/KYB est visible dans les fiches clients'
              : 'Desactive — Le KYC est gere par les outils existants de la banque'}
          </div>
          <p className="text-[11px] text-[#A8A29E] mt-2">
            Le screening crypto (Chainalysis KYT) est gere directement par DFNS sur chaque transfert.
          </p>
        </div>

        {/* Filing authority */}
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
          <h4 className="text-[14px] font-semibold text-[#0F0F10] mb-1">Autorite de declaration</h4>
          <p className="text-[12px] text-[#787881] mb-4">Destination des declarations d'activite suspecte (SAR/STR)</p>
          <div className="space-y-2">
            {[
              { value: 'tracfin', label: 'Tracfin (France)', desc: 'Cellule de renseignement financier — art. L.561-15 CMF' },
              { value: 'mros', label: 'MROS (Suisse)', desc: 'Money Laundering Reporting Office — LBA art. 9' },
              { value: 'both', label: 'Les deux', desc: 'Declaration croisee France + Suisse' },
            ].map(opt => (
              <div
                key={opt.value}
                onClick={() => save({ filing_authority: opt.value })}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  settings?.filing_authority === opt.value
                    ? 'border-[#6366F1] bg-[#EEF2FF]'
                    : 'border-[rgba(0,0,29,0.08)] hover:border-[rgba(0,0,29,0.15)]'
                }`}
              >
                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  settings?.filing_authority === opt.value ? 'border-[#6366F1]' : 'border-[#A8A29E]'
                }`}>
                  {settings?.filing_authority === opt.value && (
                    <div className="w-2 h-2 rounded-full bg-[#6366F1]" />
                  )}
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[#0F0F10]">{opt.label}</p>
                  <p className="text-[11px] text-[#787881]">{opt.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
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
