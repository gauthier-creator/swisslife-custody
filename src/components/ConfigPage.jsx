import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { testDfnsConnection } from '../services/dfnsApi';
import { getSalesforceStatus } from '../services/salesforceApi';
import { API_BASE } from '../config/constants';
import {
  Spinner, Badge, Card, Button, PageHeader, SectionCard, StatusDot,
  Metric, MetricRow, Table, tdCls, tdMuted, trCls, FooterDisclosure,
} from './shared';

/* ─────────────────────────────────────────────────────────
   ConfigPage — Système · Intégrations & Gouvernance
   Editorial header · refined integration cards · hairline tables
   ───────────────────────────────────────────────────────── */

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
    <div className="space-y-10">
      {/* ── Editorial header ──────────────────────────── */}
      <PageHeader
        icon={
          <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.7}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
        title="Configuration"
        trailing={<StatusDot tone="bronze" label="Admin · Accès restreint" />}
      />

      {/* ── Integration cards ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-slide-up stagger-2">
        {/* Salesforce */}
        <Card className="p-6 relative overflow-hidden accent-ruler-left">
          <div className="flex items-start gap-4 mb-5">
            <div
              className="flex-shrink-0 w-11 h-11 rounded-[10px] flex items-center justify-center shadow-crisp"
              style={{ backgroundColor: '#00A1E0', boxShadow: '0 1px 2px rgba(0,161,224,0.25), 0 4px 12px -6px rgba(0,161,224,0.3)' }}
            >
              <span className="text-white text-[13px] font-bold tracking-tight">SF</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-medium text-[#0A0A0A] tracking-[-0.015em]">Salesforce CRM</h3>
                {!loadingSf && (
                  <Badge variant={sfStatus?.configured ? 'success' : 'warning'} dot>
                    {sfStatus?.configured ? 'Connecté' : 'Non connecté'}
                  </Badge>
                )}
              </div>
              <p className="text-[12.5px] text-[#5D5D5D] mt-1 tracking-[-0.003em]">Connexion OAuth server-side · Sync comptes & opportunités</p>
            </div>
          </div>

          {loadingSf ? (
            <div className="py-4 text-center"><Spinner size="w-5 h-5" /></div>
          ) : sfStatus?.configured ? (
            <div className="space-y-3">
              {sfStatus.instanceUrl && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-white border border-[#E9E4D9] rounded-[10px]">
                  <svg className="w-3.5 h-3.5 text-[#8A8278] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <p className="text-[11.5px] text-[#1E1E1E] font-mono truncate tracking-[-0.003em]">{sfStatus.instanceUrl}</p>
                </div>
              )}
              <Button variant="ghost" onClick={handleTestSf}>Rafraîchir le statut</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-white border border-[#E9E4D9] rounded-[10px] p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#8A8278] mb-2">Variables d'environnement requises</p>
                <div className="font-mono text-[11px] text-[#1E1E1E] space-y-1 leading-relaxed">
                  <p><span className="text-[#7C5E3C]">SF_LOGIN_URL</span>=https://login.salesforce.com</p>
                  <p><span className="text-[#7C5E3C]">SF_CLIENT_ID</span>=…</p>
                  <p><span className="text-[#7C5E3C]">SF_CLIENT_SECRET</span>=…</p>
                  <p><span className="text-[#7C5E3C]">SF_USERNAME</span>=…</p>
                  <p><span className="text-[#7C5E3C]">SF_PASSWORD</span>=…</p>
                  <p><span className="text-[#7C5E3C]">SF_SECURITY_TOKEN</span>=…</p>
                </div>
              </div>
              <p className="text-[11.5px] text-[#5D5D5D] leading-relaxed tracking-[-0.003em]">
                Créez une <span className="font-medium text-[#0A0A0A]">Connected App</span> dans Salesforce Setup → App Manager, activez OAuth et cochez "Full access".
              </p>
            </div>
          )}
        </Card>

        {/* DFNS */}
        <Card className="p-6 relative overflow-hidden accent-ruler-left">
          <div className="flex items-start gap-4 mb-5">
            <div className="flex-shrink-0 w-11 h-11 rounded-[10px] bg-[#0A0A0A] flex items-center justify-center shadow-crisp">
              <span className="text-white text-[13px] font-bold tracking-tight">Df</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-medium text-[#0A0A0A] tracking-[-0.015em]">DFNS Custody</h3>
                {dfnsStatus !== null && (
                  <Badge variant={dfnsStatus ? 'success' : 'error'} dot>
                    {dfnsStatus ? 'Connectée' : 'Échec'}
                  </Badge>
                )}
              </div>
              <p className="text-[12.5px] text-[#5D5D5D] mt-1 tracking-[-0.003em]">API PAT + User Action Signing · MPC 2/3 threshold</p>
            </div>
          </div>

          <div className="space-y-3">
            <Button variant="ghost" onClick={handleTestDfns} disabled={testingDfns}>
              {testingDfns && <Spinner size="w-3.5 h-3.5" />}
              {testingDfns ? 'Test en cours…' : 'Tester la connexion'}
            </Button>
            <div className="bg-white border border-[#E9E4D9] rounded-[10px] p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#8A8278] mb-2">Variables d'environnement</p>
              <div className="font-mono text-[11px] text-[#1E1E1E] space-y-1 leading-relaxed">
                <p><span className="text-[#7C5E3C]">DFNS_API_TOKEN</span>=…</p>
                <p><span className="text-[#7C5E3C]">DFNS_APP_ID</span>=…</p>
                <p><span className="text-[#7C5E3C]">DFNS_CRED_ID</span>=…</p>
                <p><span className="text-[#7C5E3C]">DFNS_PRIVATE_KEY</span>=…</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Compliance settings ───────────────────────── */}
      <ComplianceSettings />

      {/* ── Users management ──────────────────────────── */}
      <UserManagement />

      <FooterDisclosure right="Admin · Habilitation AMF/ACPR · Journal d'audit immuable" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   ComplianceSettings — KYC toggle + Filing authority
   ───────────────────────────────────────────────────────── */
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
      const res = await fetch(`${API_BASE}/api/admin/settings`, {
        method: 'PUT', headers: hdrs, body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) { console.error('[ConfigPage] save exception:', err); }
    setSaving(false);
  };

  if (loading) return <div className="text-center py-8"><Spinner size="w-5 h-5" /></div>;

  return (
    <div className="animate-slide-up stagger-3">
      <div className="flex items-baseline gap-3 mb-5">
        <h2 className="display-sm text-[#0A0A0A]">Paramètres <span className="font-display italic text-[#7C5E3C]">compliance</span></h2>
        <span className="text-eyebrow">AMLD5 · Tracfin · LBA</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* KYC Module toggle */}
        <Card className="p-6 relative overflow-hidden accent-ruler-left">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="min-w-0">
              <h3 className="text-[15px] font-medium text-[#0A0A0A] tracking-[-0.015em]">Module KYC intégré</h3>
              <p className="text-[12.5px] text-[#5D5D5D] mt-1 tracking-[-0.003em] leading-relaxed">
                Vérification d'identité via ComplyCube — en complément du KYC bancaire existant.
              </p>
            </div>
            <button
              onClick={() => save({ kyc_module_enabled: !settings?.kyc_module_enabled })}
              disabled={saving}
              className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-all shadow-crisp ${
                settings?.kyc_module_enabled ? 'bg-[#0A0A0A]' : 'bg-[rgba(10,10,10,0.14)]'
              }`}
              aria-label="Toggle KYC module"
            >
              <span
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings?.kyc_module_enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-[10px] border ${
            settings?.kyc_module_enabled
              ? 'bg-white border-[rgba(22,163,74,0.18)]'
              : 'bg-white border-[#E9E4D9]'
          }`}>
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${settings?.kyc_module_enabled ? 'status-pulse' : ''}`}
              style={{ background: settings?.kyc_module_enabled ? '#16A34A' : '#9B9B9B' }}
            />
            <p className="text-[12px] text-[#1E1E1E] tracking-[-0.003em]">
              {settings?.kyc_module_enabled
                ? "Actif — onglet KYC/KYB visible dans les fiches clients"
                : "Inactif — KYC géré par les outils existants de la banque"}
            </p>
          </div>
          <p className="text-[11px] text-[#8A8278] mt-3 tracking-[-0.003em]">
            Le screening crypto (Chainalysis KYT) est géré directement par DFNS sur chaque transfert.
          </p>
        </Card>

        {/* Filing authority */}
        <Card className="p-6 relative overflow-hidden accent-ruler-left">
          <div className="mb-4">
            <h3 className="text-[15px] font-medium text-[#0A0A0A] tracking-[-0.015em]">Autorité de déclaration</h3>
            <p className="text-[12.5px] text-[#5D5D5D] mt-1 tracking-[-0.003em]">
              Destination des déclarations d'activité suspecte (SAR/STR).
            </p>
          </div>
          <div className="space-y-2">
            {[
              { value: 'tracfin', label: 'Tracfin (France)', desc: 'Cellule de renseignement financier · art. L.561-15 CMF' },
              { value: 'mros', label: 'MROS (Suisse)', desc: 'Money Laundering Reporting Office · LBA art. 9' },
              { value: 'both', label: 'Les deux', desc: 'Déclaration croisée France + Suisse' },
            ].map(opt => {
              const selected = settings?.filing_authority === opt.value;
              return (
                <div
                  key={opt.value}
                  onClick={() => save({ filing_authority: opt.value })}
                  className={`flex items-start gap-3 p-3 rounded-[10px] border cursor-pointer transition-all ${
                    selected
                      ? 'border-[#0A0A0A] bg-white shadow-crisp'
                      : 'border-[#E9E4D9] hover:border-[rgba(10,10,10,0.14)]'
                  }`}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    selected ? 'border-[#0A0A0A]' : 'border-[#BFBFBF]'
                  }`}>
                    {selected && <div className="w-1.5 h-1.5 rounded-full bg-[#0A0A0A]" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[#0A0A0A] tracking-[-0.006em]">{opt.label}</p>
                    <p className="text-[11.5px] text-[#5D5D5D] mt-0.5 tracking-[-0.003em]">{opt.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   UserManagement — Hairline editorial table
   ───────────────────────────────────────────────────────── */
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

  const adminCount = users.filter(u => u.role === 'admin').length;
  const banquierCount = users.filter(u => u.role !== 'admin').length;

  return (
    <div className="animate-slide-up stagger-4">
      <div className="flex items-baseline gap-3 mb-5">
        <h2 className="display-sm text-[#0A0A0A]">Utilisateurs <span className="font-display italic text-[#7C5E3C]">habilités</span></h2>
        <span className="text-eyebrow">Habilitation · Accès</span>
      </div>

      {!loading && users.length > 0 && (
        <div className="mb-5">
          <MetricRow>
            <Metric label="Utilisateurs" value={users.length} caption="Total comptes actifs" />
            <Metric label="Administrateurs" value={adminCount} caption="Supervision globale" />
            <Metric label="Banquiers" value={banquierCount} caption="Gestion portefeuille" />
            <Metric label="Quorum MPC" value="2 / 3" caption="Threshold signing" />
          </MetricRow>
        </div>
      )}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-10 text-center"><Spinner size="w-5 h-5" /></div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-[#5D5D5D]">Aucun utilisateur</div>
        ) : (
          <Table headers={['Utilisateur', 'Email', 'Rôle', 'Inscrit le', { label: '', right: true }]}>
            {users.map(u => (
              <tr key={u.id} className={trCls}>
                <td className={tdCls + ' font-medium'}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#F5F3EE] border border-[#E9E4D9] flex items-center justify-center flex-shrink-0">
                      <span className="text-[11px] font-medium text-[#1E1E1E] tracking-tight">
                        {(u.full_name || u.email || '?').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <span className="truncate">{u.full_name || '—'}</span>
                  </div>
                </td>
                <td className={tdMuted + ' font-mono text-[12px]'}>{u.email}</td>
                <td className="px-6 py-4">
                  <Badge variant={u.role === 'admin' ? 'warning' : 'default'} dot>
                    {u.role === 'admin' ? 'Admin' : 'Banquier'}
                  </Badge>
                </td>
                <td className={tdMuted + ' tabular-nums'}>
                  {u.created_at
                    ? new Date(u.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—'}
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => toggleRole(u.id, u.role)}
                    className="text-[11px] font-medium text-[#5D5D5D] hover:text-[#0A0A0A] tracking-[-0.003em] transition-colors"
                  >
                    {u.role === 'admin' ? 'Passer banquier' : 'Passer admin'}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
