import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Badge, Modal, Spinner, EmptyState, useToast, ToastContainer,
  inputCls, selectCls, labelCls,
  PageHeader, Metric, MetricRow, UnderlineTabs, Card, Button,
  FooterDisclosure, useCountUp, Skeleton, SkeletonRow,
} from './shared';
import { HeroMesh, VerifiedBadge, GradientRule, LiveIndicator } from './brand';
import {
  fetchApprovals, approveTransfer, rejectTransfer, executeTransfer,
  fetchAlerts, fetchAlertStats, acknowledgeAlert, resolveAlert,
  fetchAuditLog, fetchAuditStats,
  fetchWhitelist, approveWhitelistAddress, revokeWhitelistAddress,
  fetchSARs, createSAR, submitSAR, reviewSAR, fileSAR, closeSAR, fetchSARStats,
} from '../services/complianceApi';
import ComplianceReports from './ComplianceReports';
import ACPRReportingDashboard from './ACPRReportingDashboard';

// ── Helpers ──────────────────────────────────────────────────────────
const truncAddr = (a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const statusBadge = (s) => {
  const map = {
    pending: { label: 'En attente', variant: 'warning' },
    approved: { label: 'Approuve', variant: 'success' },
    rejected: { label: 'Rejete', variant: 'error' },
    executed: { label: 'Execute', variant: 'info' },
    open: { label: 'Ouvert', variant: 'error' },
    acknowledged: { label: 'Pris en charge', variant: 'warning' },
    resolved: { label: 'Resolu', variant: 'success' },
    active: { label: 'Actif', variant: 'success' },
    revoked: { label: 'Revoque', variant: 'error' },
    pending_approval: { label: 'En attente', variant: 'warning' },
  };
  const m = map[s] || { label: s || '—', variant: 'default' };
  return <Badge variant={m.variant}>{m.label}</Badge>;
};

const severityBadge = (s) => {
  const map = { low: 'default', medium: 'warning', high: 'error', critical: 'error' };
  return <Badge variant={map[s] || 'default'}>{s || '—'}</Badge>;
};

const categoryBadge = (c) => {
  const map = { wallet: 'info', transfer: 'warning', whitelist: 'success', risk: 'error', auth: 'default' };
  return <Badge variant={map[c] || 'default'}>{c || '—'}</Badge>;
};

const TABS = [
  { id: 'approvals', label: 'Approbations' },
  { id: 'alerts', label: 'Alertes' },
  { id: 'audit', label: "Journal d'audit" },
  { id: 'whitelist', label: 'Whitelist' },
  { id: 'declarations', label: 'Declarations' },
  { id: 'reports', label: 'Rapports' },
  { id: 'acpr', label: 'Reporting ACPR' },
];

const sarStatusBadge = (s) => {
  const map = {
    draft: { label: 'Brouillon', variant: 'default' },
    submitted: { label: 'Soumis', variant: 'warning' },
    under_review: { label: 'En revue', variant: 'info' },
    filed_with_mros: { label: 'Depose MROS', variant: 'error' },
    filed_with_tracfin: { label: 'Depose Tracfin', variant: 'error' },
    closed: { label: 'Cloture', variant: 'success' },
  };
  const m = map[s] || { label: s || '—', variant: 'default' };
  return <Badge variant={m.variant}>{m.label}</Badge>;
};

const priorityBadge = (p) => {
  const map = { low: 'default', medium: 'warning', high: 'error', critical: 'error' };
  return <Badge variant={map[p] || 'default'}>{p || '—'}</Badge>;
};

// ── Stat Card — refined Metric tile ────────────────────────────────
function StatCard({ label, value, tone = 'default', hint }) {
  const tones = {
    orange: { dot: '#CA8A04', text: '#92400E' },
    red:    { dot: '#DC2626', text: '#991B1B' },
    blue:   { dot: '#0A0A0A', text: '#0A0A0A' },
    green:  { dot: '#16A34A', text: '#166534' },
    default:{ dot: '#9B9B9B', text: '#6B6B6B' },
  };
  const t = tones[tone] || tones.default;
  const numericValue = typeof value === 'number' ? value : null;
  const animated = useCountUp(numericValue ?? 0);
  const displayValue = numericValue != null ? animated : (value ?? '—');
  return (
    <div className="group bg-white border border-[rgba(10,10,10,0.08)] rounded-[14px] p-5 shadow-crisp relative overflow-hidden transition-[border-color,box-shadow] duration-200 hover:border-[rgba(10,10,10,0.14)] hover:shadow-[0_4px_16px_-8px_rgba(10,10,10,0.12)]">
      <div className="absolute inset-x-5 top-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `linear-gradient(90deg, transparent, ${t.dot}, transparent)` }} />
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.dot }} />
        <span className="text-[10.5px] font-medium uppercase tracking-[0.06em]" style={{ color: t.text }}>{label}</span>
      </div>
      <p className="mt-3 text-[30px] font-medium text-[#0A0A0A] tabular-nums leading-[1.05] tracking-[-0.03em]">
        {displayValue}
      </p>
      {hint && <p className="text-[11.5px] text-[#9B9B9B] mt-1 tracking-[-0.003em]">{hint}</p>}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────
export default function ComplianceDashboard() {
  const { isAdmin, profile } = useAuth();
  const { toasts, toast } = useToast();

  const [tab, setTab] = useState('approvals');
  const [loading, setLoading] = useState(true);

  // Stats
  const [stats, setStats] = useState({ pendingApprovals: 0, openAlerts: 0, activeClients: 0, totalWallets: 0 });

  // Approvals
  const [approvals, setApprovals] = useState([]);
  const [approvalFilter, setApprovalFilter] = useState('');

  // Alerts
  const [alerts, setAlerts] = useState([]);
  const [alertSevFilter, setAlertSevFilter] = useState('');
  const [alertStatusFilter, setAlertStatusFilter] = useState('');

  // Audit
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditCategory, setAuditCategory] = useState('');
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditTotal, setAuditTotal] = useState(0);
  const [expandedAudit, setExpandedAudit] = useState(null);
  const AUDIT_LIMIT = 25;

  // Whitelist
  const [whitelistEntries, setWhitelistEntries] = useState([]);

  // SARs
  const [sars, setSars] = useState([]);
  const [sarFilter, setSarFilter] = useState('');
  const [sarStats, setSarStats] = useState({});
  const [sarCreateModal, setSarCreateModal] = useState(false);
  const [sarCloseModal, setSarCloseModal] = useState(null);
  const [sarCloseResolution, setSarCloseResolution] = useState('dismissed');
  const [sarCloseNotes, setSarCloseNotes] = useState('');
  const [sarFileModal, setSarFileModal] = useState(null);
  const [sarMrosRef, setSarMrosRef] = useState('');
  const [sarFilingAuthority, setSarFilingAuthority] = useState('tracfin');
  const [sarForm, setSarForm] = useState({
    clientName: '', salesforceAccountId: '', reportType: 'SAR',
    suspicionType: 'unusual_pattern', description: '', priority: 'medium',
    totalAmountInvolved: '', currency: 'CHF',
  });

  // Modals
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [resolveModal, setResolveModal] = useState(null);
  const [resolveNotes, setResolveNotes] = useState('');

  // ── Loaders ──────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const [auditSt, alertSt, approvalsRaw] = await Promise.all([
        fetchAuditStats().catch(() => ({})),
        fetchAlertStats().catch(() => ({})),
        fetchApprovals().catch(() => ({ data: [] })),
      ]);
      const approvalsArr = approvalsRaw?.data || (Array.isArray(approvalsRaw) ? approvalsRaw : []);
      setStats({
        pendingApprovals: Array.isArray(approvalsArr) ? approvalsArr.filter(a => a.status === 'pending').length : 0,
        openAlerts: alertSt?.totalOpen || alertSt?.open || 0,
        activeClients: auditSt?.activeClients || 0,
        totalWallets: auditSt?.totalWallets || 0,
      });
    } catch { /* silent */ }
  }, []);

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await fetchApprovals(approvalFilter);
      const data = raw?.data || raw;
      setApprovals(Array.isArray(data) ? data : []);
    } catch (err) { toast(err.message, 'error'); }
    setLoading(false);
  }, [approvalFilter]);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await fetchAlerts({ status: alertStatusFilter, severity: alertSevFilter });
      const data = raw?.data || raw;
      setAlerts(Array.isArray(data) ? data : []);
    } catch (err) { toast(err.message, 'error'); }
    setLoading(false);
  }, [alertSevFilter, alertStatusFilter]);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await fetchAuditLog({ category: auditCategory, limit: AUDIT_LIMIT, offset: auditOffset });
      const entries = raw?.data || raw?.entries || raw?.rows || (Array.isArray(raw) ? raw : []);
      setAuditEntries(Array.isArray(entries) ? entries : []);
      setAuditTotal(raw?.count || raw?.total || 0);
    } catch (err) { toast(err.message, 'error'); }
    setLoading(false);
  }, [auditCategory, auditOffset]);

  const loadWhitelist = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await fetchWhitelist('all');
      const data = raw?.data || raw;
      setWhitelistEntries(Array.isArray(data) ? data : []);
    } catch (err) { console.error('Whitelist load error:', err); }
    setLoading(false);
  }, []);

  const loadSARs = useCallback(async () => {
    setLoading(true);
    try {
      const [rawList, rawStats] = await Promise.all([
        fetchSARs(sarFilter),
        fetchSARStats().catch(() => ({ byStatus: {} })),
      ]);
      const data = rawList?.data || rawList;
      setSars(Array.isArray(data) ? data : []);
      setSarStats(rawStats?.byStatus || {});
    } catch (err) { toast(err.message, 'error'); }
    setLoading(false);
  }, [sarFilter]);

  // Load on tab change
  useEffect(() => {
    loadStats();
    if (tab === 'approvals') loadApprovals();
    else if (tab === 'alerts') loadAlerts();
    else if (tab === 'audit') loadAudit();
    else if (tab === 'whitelist') loadWhitelist();
    else if (tab === 'declarations') loadSARs();
  }, [tab, loadStats, loadApprovals, loadAlerts, loadAudit, loadWhitelist, loadSARs]);

  // ── Actions ──────────────────────────────────────────────────────
  const handleApprove = async (id) => {
    try {
      await approveTransfer(id, profile?.email);
      toast('Transfert approuve');
      loadApprovals();
      loadStats();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    try {
      await rejectTransfer(rejectModal, profile?.email, rejectReason);
      toast('Transfert rejete');
      setRejectModal(null);
      setRejectReason('');
      loadApprovals();
      loadStats();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleExecute = async (id) => {
    try {
      await executeTransfer(id);
      toast('Transfert execute');
      loadApprovals();
      loadStats();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleAcknowledge = async (id) => {
    try {
      await acknowledgeAlert(id);
      toast('Alerte prise en charge');
      loadAlerts();
      loadStats();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleResolve = async () => {
    if (!resolveModal) return;
    try {
      await resolveAlert(resolveModal, resolveNotes);
      toast('Alerte resolue');
      setResolveModal(null);
      setResolveNotes('');
      loadAlerts();
      loadStats();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleApproveWhitelist = async (id) => {
    try {
      await approveWhitelistAddress(id, profile?.email);
      toast('Adresse approuvee');
      loadWhitelist();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleRevokeWhitelist = async (id) => {
    try {
      await revokeWhitelistAddress(id);
      toast('Adresse revoquee');
      loadWhitelist();
    } catch (err) { toast(err.message, 'error'); }
  };

  // SAR actions
  const handleCreateSAR = async () => {
    try {
      await createSAR({
        ...sarForm,
        totalAmountInvolved: sarForm.totalAmountInvolved ? Number(sarForm.totalAmountInvolved) : null,
        createdByEmail: profile?.email,
      });
      toast('Declaration creee');
      setSarCreateModal(false);
      setSarForm({ clientName: '', salesforceAccountId: '', reportType: 'SAR', suspicionType: 'unusual_pattern', description: '', priority: 'medium', totalAmountInvolved: '', currency: 'CHF' });
      loadSARs();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleSubmitSAR = async (id) => {
    try {
      await submitSAR(id, profile?.email);
      toast('Declaration soumise');
      loadSARs();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleReviewSAR = async (id) => {
    try {
      await reviewSAR(id, profile?.email);
      toast('Declaration en revue');
      loadSARs();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleFileSAR = async () => {
    if (!sarFileModal) return;
    try {
      await fileSAR(sarFileModal, profile?.email, sarMrosRef, sarFilingAuthority);
      const dest = sarFilingAuthority === 'mros' ? 'MROS' : 'Tracfin';
      toast(`Declaration deposee aupres de ${dest}`);
      setSarFileModal(null);
      setSarMrosRef('');
      setSarFilingAuthority('tracfin');
      loadSARs();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleCloseSAR = async () => {
    if (!sarCloseModal) return;
    try {
      await closeSAR(sarCloseModal, profile?.email, sarCloseResolution, sarCloseNotes);
      toast('Declaration cloturee');
      setSarCloseModal(null);
      setSarCloseResolution('dismissed');
      setSarCloseNotes('');
      loadSARs();
    } catch (err) { toast(err.message, 'error'); }
  };

  // ── Table wrapper — hairline editorial style ───────────────────
  const Table = ({ headers, children }) => (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="border-b border-[rgba(10,10,10,0.08)]">
              {headers.map((h, i) => (
                <th
                  key={i}
                  className={`px-6 py-3.5 text-[10.5px] text-[#9B9B9B] font-medium tracking-[0.06em] uppercase ${h.right ? 'text-right' : ''}`}
                >
                  {h.label || h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </Card>
  );

  const tdCls = 'px-6 py-4 text-[13.5px] text-[#0A0A0A] tracking-[-0.006em]';
  const tdMuted = 'px-6 py-4 text-[12.5px] text-[#6B6B6B] tracking-[-0.003em]';
  const rowCls = 'border-b border-[rgba(10,10,10,0.06)] last:border-0 hover:bg-[#FBFAF7] transition-colors';

  const actionBtn = (label, onClick, variant = 'default') => {
    const styles = {
      default: 'text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-[#F5F3EE]',
      success: 'text-[#0A0A0A] hover:bg-[#F5F3EE] border border-transparent hover:border-[rgba(10,10,10,0.1)]',
      error: 'text-[#991B1B] hover:bg-white hover:border-[rgba(220,38,38,0.25)] border border-transparent',
      info: 'text-[#0A0A0A] hover:bg-[#F5F3EE] border border-transparent hover:border-[rgba(10,10,10,0.1)]',
    };
    return (
      <button onClick={onClick} className={`px-3 py-1 rounded-full text-[12px] font-medium transition-all tracking-[-0.01em] ${styles[variant]}`}>
        {label}
      </button>
    );
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-10">
      {/* ── Editorial header ─────────────────────────── */}
      <div className="relative">
        <HeroMesh
          size={460}
          className="absolute -right-16 -top-28 hidden md:block"
        />
        <PageHeader
          eyebrow="Supervision · Compliance Cloud"
          title="Compliance"
          accent="cockpit"
          description="Supervision temps-réel des approbations à quatre yeux, alertes AML, journal d'audit horodaté et déclarations Tracfin. Chaque action est cryptographiquement signée et auditable."
          trailing={
            <div className="flex items-center gap-5">
              <LiveIndicator tone="success" label="Flux temps-réel" />
              {stats.openAlerts === 0 && stats.pendingApprovals === 0 && (
                <div className="hidden lg:block">
                  <VerifiedBadge size={60} label="Cockpit clear" />
                </div>
              )}
            </div>
          }
        />
      </div>

      {/* ── Gradient break ───────────────────────────── */}
      <GradientRule className="max-w-[520px] mx-auto animate-fade" />

      {/* ── Stat tiles ───────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5 animate-slide-up stagger-2">
        <StatCard label="Approbations" value={stats.pendingApprovals} tone="orange" hint="En attente · quatre yeux" />
        <StatCard label="Alertes" value={stats.openAlerts} tone="red" hint="Ouvertes · AML screening" />
        <StatCard label="Clients" value={stats.activeClients} tone="blue" hint="Actifs sous mandat" />
        <StatCard label="Wallets" value={stats.totalWallets} tone="green" hint="Provisionnés DFNS" />
      </div>

      {/* ── Tabs ─────────────────────────────────────── */}
      <div className="animate-slide-up stagger-3">
        <UnderlineTabs
          tabs={TABS.map(t => ({
            ...t,
            count: t.id === 'approvals' ? stats.pendingApprovals || undefined
                 : t.id === 'alerts' ? stats.openAlerts || undefined
                 : undefined,
          }))}
          active={tab}
          onChange={setTab}
          className="mb-8"
        />
      </div>

      {/* Loading */}
      {loading && (
        <Card className="animate-slide-up stagger-4">
          <div className="px-6 py-4 border-b border-[rgba(10,10,10,0.06)] flex items-center justify-between">
            <Skeleton className="h-[14px]" style={{ width: 160 }} />
            <Skeleton className="h-[11px]" style={{ width: 90 }} />
          </div>
          <table className="w-full">
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[rgba(10,10,10,0.06)] row-stagger" style={{ '--i': i }}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-6 py-4">
                      <Skeleton className="h-[13px]" style={{ width: `${55 + ((i * 11 + j * 7) % 35)}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* ── Approbations Tab ──────────────────────────────────────── */}
      {!loading && tab === 'approvals' && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <label className={labelCls}>Statut</label>
            <select
              value={approvalFilter}
              onChange={e => setApprovalFilter(e.target.value)}
              className={`${selectCls} w-48`}
            >
              <option value="">Tous</option>
              <option value="pending">En attente</option>
              <option value="approved">Approuve</option>
              <option value="rejected">Rejete</option>
              <option value="executed">Execute</option>
            </select>
          </div>

          {approvals.length === 0 ? (
            <EmptyState title="Aucune approbation" description="Aucun transfert en attente de validation" />
          ) : (
            <Table headers={['Date', 'Client', 'Wallet', 'Destination', { label: 'Montant', right: true }, 'Risque', 'Statut', 'Actions']}>
              {approvals.map(a => (
                <tr key={a.id} className={rowCls}>
                  <td className={tdMuted}>{fmtDate(a.created_at)}</td>
                  <td className={tdCls}>{a.client_name || '—'}</td>
                  <td className={tdMuted}>{a.wallet_id ? truncAddr(a.wallet_id) : '—'}</td>
                  <td className={tdMuted}>
                    <span className="font-mono text-[11px]">{truncAddr(a.to_address || a.destination_address)}</span>
                  </td>
                  <td className={`${tdCls} text-right tabular-nums font-medium`}>
                    {a.amount != null ? Number(a.amount).toLocaleString('fr-FR') : '—'} {a.asset_symbol || a.asset_type || ''}
                  </td>
                  <td className={tdMuted}>
                    {a.risk_score != null ? (
                      <span className={`font-medium ${a.risk_score >= 70 ? 'text-[#991B1B]' : a.risk_score >= 40 ? 'text-[#92400E]' : 'text-[#166534]'}`}>
                        {a.risk_score}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3.5">{statusBadge(a.status)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1">
                      {a.status === 'pending' && isAdmin && (
                        <>
                          {actionBtn('Approuver', () => handleApprove(a.id), 'success')}
                          {actionBtn('Rejeter', () => { setRejectModal(a.id); setRejectReason(''); }, 'error')}
                        </>
                      )}
                      {a.status === 'approved' && isAdmin && (
                        actionBtn('Executer', () => handleExecute(a.id), 'info')
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}

      {/* ── Alertes Tab ───────────────────────────────────────────── */}
      {!loading && tab === 'alerts' && (
        <>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <label className={labelCls}>Severite</label>
              <select value={alertSevFilter} onChange={e => setAlertSevFilter(e.target.value)} className={`${selectCls} w-40`}>
                <option value="">Toutes</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className={labelCls}>Statut</label>
              <select value={alertStatusFilter} onChange={e => setAlertStatusFilter(e.target.value)} className={`${selectCls} w-40`}>
                <option value="">Tous</option>
                <option value="open">Ouvert</option>
                <option value="acknowledged">Pris en charge</option>
                <option value="resolved">Resolu</option>
              </select>
            </div>
          </div>

          {alerts.length === 0 ? (
            <EmptyState title="Aucune alerte" description="Aucune alerte de compliance" />
          ) : (
            <Table headers={['Date', 'Type', 'Severite', 'Client', 'Message', 'Statut', 'Actions']}>
              {alerts.map(a => (
                <tr key={a.id} className={rowCls}>
                  <td className={tdMuted}>{fmtDate(a.created_at)}</td>
                  <td className={tdCls}>{a.alert_type || '—'}</td>
                  <td className="px-5 py-3.5">{severityBadge(a.severity)}</td>
                  <td className={tdCls}>{a.client_name || '—'}</td>
                  <td className={`${tdMuted} max-w-[260px] truncate`}>{a.message || '—'}</td>
                  <td className="px-5 py-3.5">{statusBadge(a.status)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1">
                      {a.status === 'open' && (
                        actionBtn('Prendre en charge', () => handleAcknowledge(a.id), 'info')
                      )}
                      {(a.status === 'open' || a.status === 'acknowledged') && (
                        actionBtn('Resoudre', () => { setResolveModal(a.id); setResolveNotes(''); }, 'success')
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}

      {/* ── Journal d'audit Tab ───────────────────────────────────── */}
      {!loading && tab === 'audit' && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <label className={labelCls}>Categorie</label>
            <select
              value={auditCategory}
              onChange={e => { setAuditCategory(e.target.value); setAuditOffset(0); }}
              className={`${selectCls} w-48`}
            >
              <option value="">Toutes</option>
              <option value="wallet">Wallet</option>
              <option value="transfer">Transfert</option>
              <option value="whitelist">Whitelist</option>
              <option value="risk">Risque</option>
              <option value="auth">Authentification</option>
            </select>
          </div>

          {auditEntries.length === 0 ? (
            <EmptyState title="Aucune entree" description="Le journal d'audit est vide" />
          ) : (
            <>
              <Table headers={['Horodatage', 'Utilisateur', 'Action', 'Categorie', 'Entite', 'Details', 'Severite']}>
                {auditEntries.map(e => (
                  <tr key={e.id} className={rowCls}>
                    <td className={tdMuted}>{fmtDate(e.created_at)}</td>
                    <td className={tdCls}>{e.user_email || '—'}</td>
                    <td className={tdCls}>{e.action || '—'}</td>
                    <td className="px-5 py-3.5">{categoryBadge(e.category)}</td>
                    <td className={`${tdMuted} font-mono text-[11px]`}>{e.entity_type ? `${e.entity_type}:${truncAddr(e.entity_id || '')}` : '—'}</td>
                    <td className="px-5 py-3.5">
                      {e.details ? (
                        <button
                          onClick={() => setExpandedAudit(expandedAudit === e.id ? null : e.id)}
                          className="text-[12px] text-[#0A0A0A] hover:underline"
                        >
                          {expandedAudit === e.id ? 'Masquer' : 'Voir'}
                        </button>
                      ) : (
                        <span className="text-[12px] text-[#9B9B9B]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">{severityBadge(e.severity)}</td>
                  </tr>
                ))}
              </Table>

              {/* Expanded details */}
              {expandedAudit && (() => {
                const entry = auditEntries.find(e => e.id === expandedAudit);
                if (!entry?.details) return null;
                return (
                  <div className="mt-2 bg-[rgba(10,10,10,0.02)] border border-[rgba(10,10,10,0.06)] rounded-xl p-4">
                    <pre className="text-[12px] text-[#0A0A0A] whitespace-pre-wrap font-mono leading-relaxed">
                      {typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details, null, 2)}
                    </pre>
                  </div>
                );
              })()}

              {/* Pagination */}
              {auditTotal > AUDIT_LIMIT && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-[12px] text-[#6B6B6B]">
                    {auditOffset + 1}–{Math.min(auditOffset + AUDIT_LIMIT, auditTotal)} sur {auditTotal}
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={auditOffset === 0}
                      onClick={() => setAuditOffset(Math.max(0, auditOffset - AUDIT_LIMIT))}
                      className="px-3 py-1.5 text-[12px] font-medium rounded-lg border border-[rgba(10,10,10,0.1)] text-[#6B6B6B] hover:text-[#0A0A0A] disabled:opacity-40 transition-all"
                    >
                      Precedent
                    </button>
                    <button
                      disabled={auditOffset + AUDIT_LIMIT >= auditTotal}
                      onClick={() => setAuditOffset(auditOffset + AUDIT_LIMIT)}
                      className="px-3 py-1.5 text-[12px] font-medium rounded-lg border border-[rgba(10,10,10,0.1)] text-[#6B6B6B] hover:text-[#0A0A0A] disabled:opacity-40 transition-all"
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Whitelist Tab ─────────────────────────────────────────── */}
      {!loading && tab === 'whitelist' && (
        <>
          {whitelistEntries.length === 0 ? (
            <EmptyState title="Aucune adresse" description="Aucune adresse dans la whitelist" />
          ) : (
            <Table headers={['Client', 'Adresse', 'Reseau', 'Label', 'Statut', 'Approuve par', 'Actions']}>
              {whitelistEntries.map(w => (
                <tr key={w.id} className={rowCls}>
                  <td className={tdCls}>{w.client_name || '—'}</td>
                  <td className={tdMuted}>
                    <span className="font-mono text-[11px]">{truncAddr(w.address)}</span>
                  </td>
                  <td className={tdMuted}>{w.network || '—'}</td>
                  <td className={tdCls}>{w.label || '—'}</td>
                  <td className="px-5 py-3.5">{statusBadge(w.status)}</td>
                  <td className={tdMuted}>{w.approved_by_email || '—'}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1">
                      {w.status === 'pending_approval' && isAdmin && (
                        actionBtn('Approuver', () => handleApproveWhitelist(w.id), 'success')
                      )}
                      {w.status === 'active' && isAdmin && (
                        actionBtn('Revoquer', () => handleRevokeWhitelist(w.id), 'error')
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}

      {/* ── Declarations (SAR/STR) Tab ─────────────────────────── */}
      {!loading && tab === 'declarations' && (
        <>
          {/* Stats bar */}
          <div className="grid grid-cols-4 gap-4 mb-5">
            <StatCard label="Brouillons" value={sarStats.draft || 0} tone="blue" hint="À compléter" />
            <StatCard label="Soumises" value={sarStats.submitted || 0} tone="orange" hint="File d'attente" />
            <StatCard label="En revue" value={sarStats.under_review || 0} tone="red" hint="Analyse RCSI" />
            <StatCard label="Déposées" value={sarStats.filed_with_mros || 0} tone="green" hint="Tracfin / MROS" />
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <label className={labelCls}>Statut</label>
              <select
                value={sarFilter}
                onChange={e => setSarFilter(e.target.value)}
                className={`${selectCls} w-48`}
              >
                <option value="">Tous</option>
                <option value="draft">Brouillon</option>
                <option value="submitted">Soumis</option>
                <option value="under_review">En revue</option>
                <option value="filed_with_mros">Depose MROS</option>
                <option value="closed">Cloture</option>
              </select>
            </div>
            {isAdmin && (
              <Button variant="primary" onClick={() => setSarCreateModal(true)}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Nouvelle déclaration
              </Button>
            )}
          </div>

          {sars.length === 0 ? (
            <Card>
              <EmptyState illustration="ledger" title="Aucune déclaration" description="Aucun rapport d'activité suspecte à déclarer à Tracfin pour le moment." />
            </Card>
          ) : (
            <Table headers={['Reference', 'Client', 'Type', 'Suspicion', 'Priorite', 'Statut', 'Date', 'Actions']}>
              {sars.map(s => (
                <tr key={s.id} className={rowCls}>
                  <td className={`${tdCls} font-mono text-[12px] font-medium`}>{s.reference_number}</td>
                  <td className={tdCls}>{s.client_name || '—'}</td>
                  <td className={tdMuted}>{s.report_type}</td>
                  <td className={tdMuted}>{s.suspicion_type || '—'}</td>
                  <td className="px-5 py-3.5">{priorityBadge(s.priority)}</td>
                  <td className="px-5 py-3.5">{sarStatusBadge(s.status)}</td>
                  <td className={tdMuted}>{fmtDate(s.created_at)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1">
                      {s.status === 'draft' && isAdmin && (
                        actionBtn('Soumettre', () => handleSubmitSAR(s.id), 'info')
                      )}
                      {s.status === 'submitted' && isAdmin && (
                        actionBtn('Revue', () => handleReviewSAR(s.id), 'info')
                      )}
                      {s.status === 'under_review' && isAdmin && (
                        actionBtn('Deposer', () => { setSarFileModal(s.id); setSarMrosRef(''); setSarFilingAuthority('tracfin'); }, 'error')
                      )}
                      {s.status !== 'closed' && isAdmin && (
                        actionBtn('Cloturer', () => { setSarCloseModal(s.id); setSarCloseResolution('dismissed'); setSarCloseNotes(''); }, 'default')
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}

      {/* ── Reports Tab ──────────────────────────────────────────── */}
      {tab === 'reports' && (
        <ComplianceReports />
      )}

      {/* ── Reporting ACPR Tab ──────────────────────────────────── */}
      {tab === 'acpr' && (
        <ACPRReportingDashboard />
      )}

      {/* ── Create SAR Modal ─────────────────────────────────────── */}
      <Modal isOpen={sarCreateModal} onClose={() => setSarCreateModal(false)} title="Nouvelle declaration SAR/STR">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Nom du client</label>
            <input
              value={sarForm.clientName}
              onChange={e => setSarForm(f => ({ ...f, clientName: e.target.value }))}
              className={inputCls}
              placeholder="Nom du client..."
            />
          </div>
          <div>
            <label className={labelCls}>ID Salesforce</label>
            <input
              value={sarForm.salesforceAccountId}
              onChange={e => setSarForm(f => ({ ...f, salesforceAccountId: e.target.value }))}
              className={inputCls}
              placeholder="Account ID Salesforce..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <select
                value={sarForm.reportType}
                onChange={e => setSarForm(f => ({ ...f, reportType: e.target.value }))}
                className={selectCls}
              >
                <option value="SAR">SAR</option>
                <option value="STR">STR</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Priorite</label>
              <select
                value={sarForm.priority}
                onChange={e => setSarForm(f => ({ ...f, priority: e.target.value }))}
                className={selectCls}
              >
                <option value="low">Basse</option>
                <option value="medium">Moyenne</option>
                <option value="high">Haute</option>
                <option value="critical">Critique</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Type de suspicion</label>
            <select
              value={sarForm.suspicionType}
              onChange={e => setSarForm(f => ({ ...f, suspicionType: e.target.value }))}
              className={selectCls}
            >
              <option value="structuring">Structuration</option>
              <option value="unusual_pattern">Schema inhabituel</option>
              <option value="sanctions_match">Correspondance sanctions</option>
              <option value="pep_match">Correspondance PEP</option>
              <option value="source_of_funds">Origine des fonds</option>
              <option value="other">Autre</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Montant implique</label>
              <input
                type="number"
                value={sarForm.totalAmountInvolved}
                onChange={e => setSarForm(f => ({ ...f, totalAmountInvolved: e.target.value }))}
                className={inputCls}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className={labelCls}>Devise</label>
              <select
                value={sarForm.currency}
                onChange={e => setSarForm(f => ({ ...f, currency: e.target.value }))}
                className={selectCls}
              >
                <option value="CHF">CHF</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={sarForm.description}
              onChange={e => setSarForm(f => ({ ...f, description: e.target.value }))}
              rows={4}
              className={inputCls}
              placeholder="Decrivez l'activite suspecte..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-5 border-t border-[rgba(10,10,10,0.06)]">
            <Button variant="ghost" onClick={() => setSarCreateModal(false)}>Annuler</Button>
            <Button
              variant="primary"
              onClick={handleCreateSAR}
              disabled={!sarForm.description.trim() || !sarForm.salesforceAccountId.trim()}
            >
              Créer la déclaration
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── File with MROS Modal ─────────────────────────────────── */}
      <Modal isOpen={!!sarFileModal} onClose={() => setSarFileModal(null)} title="Deposer la declaration">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Autorite de declaration</label>
            <div className="flex gap-2 mt-1">
              {[
                { value: 'tracfin', label: 'Tracfin (France)' },
                { value: 'mros', label: 'MROS (Suisse)' },
              ].map(opt => (
                <div
                  key={opt.value}
                  onClick={() => setSarFilingAuthority(opt.value)}
                  className={`flex-1 flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all text-[13px] ${
                    sarFilingAuthority === opt.value
                      ? 'border-[#0A0A0A] bg-[#F5F3EE] font-medium'
                      : 'border-[rgba(10,10,10,0.08)]'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    sarFilingAuthority === opt.value ? 'border-[#0A0A0A]' : 'border-[#9B9B9B]'
                  }`}>
                    {sarFilingAuthority === opt.value && (
                      <div className="w-2 h-2 rounded-full bg-[#0A0A0A]" />
                    )}
                  </div>
                  {opt.label}
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Reference externe (optionnel)</label>
            <input
              value={sarMrosRef}
              onChange={e => setSarMrosRef(e.target.value)}
              className={inputCls}
              placeholder={sarFilingAuthority === 'mros' ? 'Reference MROS...' : 'Reference Tracfin...'}
            />
          </div>
          <div className="flex justify-end gap-2 pt-5 border-t border-[rgba(10,10,10,0.06)]">
            <Button variant="ghost" onClick={() => setSarFileModal(null)}>Annuler</Button>
            <Button variant="primary" onClick={handleFileSAR}>
              Confirmer le dépôt {sarFilingAuthority === 'mros' ? 'MROS' : 'Tracfin'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Close SAR Modal ──────────────────────────────────────── */}
      <Modal isOpen={!!sarCloseModal} onClose={() => setSarCloseModal(null)} title="Cloturer la declaration">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Resolution</label>
            <select
              value={sarCloseResolution}
              onChange={e => setSarCloseResolution(e.target.value)}
              className={selectCls}
            >
              <option value="dismissed">Classee sans suite</option>
              <option value="filed">Deposee</option>
              <option value="escalated">Escaladee</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Notes de cloture</label>
            <textarea
              value={sarCloseNotes}
              onChange={e => setSarCloseNotes(e.target.value)}
              rows={3}
              className={inputCls}
              placeholder="Raison de la cloture..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-5 border-t border-[rgba(10,10,10,0.06)]">
            <Button variant="ghost" onClick={() => setSarCloseModal(null)}>Annuler</Button>
            <Button variant="primary" onClick={handleCloseSAR}>Confirmer la clôture</Button>
          </div>
        </div>
      </Modal>

      {/* ── Reject Modal ──────────────────────────────────────────── */}
      <Modal isOpen={!!rejectModal} onClose={() => setRejectModal(null)} title="Rejeter le transfert">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Motif du rejet</label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              className={inputCls}
              placeholder="Indiquez la raison du rejet..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-5 border-t border-[rgba(10,10,10,0.06)]">
            <Button variant="ghost" onClick={() => setRejectModal(null)}>Annuler</Button>
            <Button variant="primary" onClick={handleReject} disabled={!rejectReason.trim()}>
              Confirmer le rejet
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Resolve Alert Modal ───────────────────────────────────── */}
      <Modal isOpen={!!resolveModal} onClose={() => setResolveModal(null)} title="Resoudre l'alerte">
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Notes de resolution</label>
            <textarea
              value={resolveNotes}
              onChange={e => setResolveNotes(e.target.value)}
              rows={3}
              className={inputCls}
              placeholder="Decrivez les actions entreprises..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-5 border-t border-[rgba(10,10,10,0.06)]">
            <Button variant="ghost" onClick={() => setResolveModal(null)}>Annuler</Button>
            <Button variant="primary" onClick={handleResolve}>Confirmer</Button>
          </div>
        </div>
      </Modal>

      <FooterDisclosure right="Tracfin · AMF · ACPR · MiCA Art. 66" />
      <ToastContainer toasts={toasts} />
    </div>
  );
}
