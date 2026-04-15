import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchACPRReport, getACPRExportUrl } from '../services/complianceApi';

// ── Helpers ──────────────────────────────────────────────────────────
const fmtNum = (n) => (n ?? 0).toLocaleString('fr-FR');
const pct = (part, total) => total > 0 ? Math.round((part / total) * 100) : 0;

const PERIODS = [
  { id: 'monthly', label: 'Mensuel' },
  { id: 'quarterly', label: 'Trimestriel' },
  { id: 'yearly', label: 'Annuel' },
];

function getCurrentMonthDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

// ── KPI Card ─────────────────────────────────────────────────────────
function KPICard({ title, value, subtitle, color = 'indigo', children }) {
  const colorMap = {
    indigo: { bg: 'bg-[#FBF6EC]', text: 'text-[#7C5E3C]', ring: 'ring-[#7C5E3C]/10' },
    green: { bg: 'bg-[#ECFDF5]', text: 'text-[#059669]', ring: 'ring-[#059669]/10' },
    red: { bg: 'bg-[#FEF2F2]', text: 'text-[#EF4444]', ring: 'ring-[#EF4444]/10' },
    amber: { bg: 'bg-[#FFFBEB]', text: 'text-[#D97706]', ring: 'ring-[#D97706]/10' },
  };
  const c = colorMap[color] || colorMap.indigo;

  return (
    <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-[#787881]">{title}</p>
        <div className={`w-8 h-8 rounded-lg ${c.bg} ${c.text} flex items-center justify-center ring-1 ${c.ring}`}>
          <span className="text-[14px] font-bold">{String(value).charAt(0)}</span>
        </div>
      </div>
      <p className={`text-[32px] font-bold ${c.text} tabular-nums leading-none`}>{fmtNum(value)}</p>
      {subtitle && <p className="text-[12px] text-[#787881]">{subtitle}</p>}
      {children}
    </div>
  );
}

// ── Progress Bar ─────────────────────────────────────────────────────
function ProgressBar({ label, value, total, color = '#7C5E3C' }) {
  const percent = pct(value, total);
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] text-[#787881] w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2.5 bg-[rgba(0,0,29,0.04)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[12px] font-medium text-[#0F0F10] tabular-nums w-16 text-right">
        {fmtNum(value)} ({percent}%)
      </span>
    </div>
  );
}

// ── Horizontal Bar ───────────────────────────────────────────────────
function HBar({ items, total }) {
  if (total === 0) return <div className="text-[12px] text-[#787881]">Aucune donnee</div>;
  return (
    <div className="space-y-2">
      {items.map(({ label, value, color }) => (
        <div key={label} className="flex items-center gap-3">
          <span className="text-[12px] text-[#787881] w-20 shrink-0">{label}</span>
          <div className="flex-1 h-6 bg-[rgba(0,0,29,0.04)] rounded-lg overflow-hidden relative">
            <div
              className="h-full rounded-lg transition-all duration-500 flex items-center pl-2"
              style={{ width: `${Math.max(pct(value, total), 2)}%`, backgroundColor: color }}
            >
              {pct(value, total) > 8 && (
                <span className="text-[11px] font-medium text-white">{fmtNum(value)}</span>
              )}
            </div>
          </div>
          <span className="text-[12px] font-medium text-[#0F0F10] tabular-nums w-14 text-right">
            {pct(value, total)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Badge ────────────────────────────────────────────────────────────
function RiskBadge({ label, count, color }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ backgroundColor: `${color}10` }}>
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[13px] font-medium text-[#0F0F10]">{label}</span>
      </div>
      <span className="text-[14px] font-bold tabular-nums" style={{ color }}>{fmtNum(count)}</span>
    </div>
  );
}

// ── Section Card ─────────────────────────────────────────────────────
function Section({ title, icon, children }) {
  return (
    <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-[16px]">{icon}</span>
        <h3 className="text-[15px] font-semibold text-[#0F0F10]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────
export default function ACPRReportingDashboard() {
  const { isAdmin } = useAuth();
  const [period, setPeriod] = useState('monthly');
  const [date, setDate] = useState(getCurrentMonthDate());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchACPRReport(period, date);
      setReport(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [period, date]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleExportCSV = () => {
    const url = getACPRExportUrl(period, date);
    window.open(url, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  const dateLabel = (() => {
    if (!report?.period) return '';
    return `du ${new Date(report.period.from).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} au ${new Date(report.period.to).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  })();

  if (!isAdmin) {
    return (
      <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-12 text-center">
        <p className="text-[15px] text-[#787881]">Acces reserve aux administrateurs compliance.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 acpr-report">
      {/* ── Print Styles ───────────────────────────────────────── */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .acpr-report, .acpr-report * { visibility: visible; }
          .acpr-report { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .bg-white { box-shadow: none !important; }
        }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-[22px] font-bold text-[#0F0F10]">Reporting ACPR</h2>
            <p className="text-[13px] text-[#787881] mt-1">
              Rapport reglementaire — Autorite de Controle Prudentiel et de Resolution
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 no-print">
            {/* Period selector */}
            <div className="flex bg-[rgba(0,0,23,0.03)] rounded-xl p-1">
              {PERIODS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                    period === p.id
                      ? 'bg-white text-[#0F0F10] shadow-sm'
                      : 'text-[#787881] hover:text-[#0F0F10]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Date picker */}
            <input
              type="month"
              value={date.slice(0, 7)}
              onChange={(e) => setDate(e.target.value + '-01')}
              className="border border-[rgba(0,0,29,0.08)] rounded-xl px-3 py-1.5 text-[12px] text-[#0F0F10] bg-white focus:outline-none focus:ring-2 focus:ring-[#7C5E3C]/20"
            />

            {/* Actions */}
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-4 py-2 border border-[rgba(0,0,29,0.08)] rounded-xl text-[12px] font-medium text-[#0F0F10] hover:bg-[rgba(0,0,23,0.03)] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Exporter CSV
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#7C5E3C] text-white rounded-xl text-[12px] font-medium hover:bg-[#6A4F30] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2z" />
              </svg>
              Generer PDF
            </button>
          </div>
        </div>

        {report?.period && (
          <p className="text-[11px] text-[#787881] mt-3 pt-3 border-t border-[rgba(0,0,29,0.06)]">
            Rapport genere le {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} — Periode : {dateLabel}
          </p>
        )}
      </div>

      {/* ── Loading State ────────────────────────────────────────── */}
      {loading && (
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-16 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-[#7C5E3C] border-t-transparent rounded-full animate-spin" />
          <p className="text-[13px] text-[#787881]">Chargement du rapport...</p>
        </div>
      )}

      {/* ── Error State ──────────────────────────────────────────── */}
      {error && !loading && (
        <div className="bg-white border border-[#EF4444]/20 rounded-2xl p-8 text-center">
          <p className="text-[14px] text-[#EF4444] font-medium">Erreur: {error}</p>
          <button
            onClick={loadReport}
            className="mt-3 px-4 py-2 bg-[#7C5E3C] text-white rounded-xl text-[12px] font-medium hover:bg-[#6A4F30] transition-colors"
          >
            Reessayer
          </button>
        </div>
      )}

      {/* ── Report Content ───────────────────────────────────────── */}
      {report && !loading && (
        <>
          {/* ── KPI Cards ──────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="Transferts traites"
              value={report.transfers.total}
              color="indigo"
              subtitle={`${fmtNum(report.transfers.approved)} approuves / ${fmtNum(report.transfers.rejected)} rejetes / ${fmtNum(report.transfers.pending)} en attente`}
            />
            <KPICard
              title="Declarations de soupcon"
              value={report.compliance.sarFiled}
              color="red"
              subtitle={`Tracfin: ${report.compliance.sarByAuthority.tracfin} / MROS: ${report.compliance.sarByAuthority.mros}`}
            />
            <KPICard
              title="Alertes compliance"
              value={report.compliance.alertsTotal}
              color="amber"
              subtitle={`${fmtNum(report.compliance.alertsResolved)} resolues / ${fmtNum(report.compliance.alertsPending)} en attente`}
            />
            <KPICard
              title="Wallets geles"
              value={report.compliance.activeFreeze}
              color="red"
              subtitle={`${fmtNum(report.compliance.frozenWallets)} gels sur la periode`}
            />
          </div>

          {/* ── Detailed Sections ──────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Section 1 - Activite de transfert */}
            <Section title="Activite de transfert" icon="">
              <div className="space-y-4">
                <HBar
                  total={report.transfers.total}
                  items={[
                    { label: 'Approuves', value: report.transfers.approved, color: '#059669' },
                    { label: 'Rejetes', value: report.transfers.rejected, color: '#EF4444' },
                    { label: 'En attente', value: report.transfers.pending, color: '#D97706' },
                  ]}
                />
                <div className="pt-3 border-t border-[rgba(0,0,29,0.06)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#787881]">Volume total</span>
                    <span className="text-[16px] font-bold text-[#0F0F10] tabular-nums">
                      {parseFloat(report.transfers.totalVolume).toLocaleString('fr-FR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                {report.transfers.byStatus && Object.keys(report.transfers.byStatus).length > 0 && (
                  <div className="pt-3 border-t border-[rgba(0,0,29,0.06)]">
                    <p className="text-[11px] text-[#787881] mb-2 font-medium uppercase tracking-wider">Detail par statut</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(report.transfers.byStatus).map(([status, count]) => (
                        <div key={status} className="flex items-center justify-between bg-[rgba(0,0,23,0.02)] rounded-lg px-3 py-1.5">
                          <span className="text-[11px] text-[#787881] capitalize">{status}</span>
                          <span className="text-[12px] font-medium text-[#0F0F10] tabular-nums">{fmtNum(count)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>

            {/* Section 2 - Conformite LCB-FT */}
            <Section title="Conformite LCB-FT" icon="">
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] text-[#787881] mb-2 font-medium uppercase tracking-wider">Declarations par autorite</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#FEF2F2] rounded-xl p-4 text-center">
                      <p className="text-[24px] font-bold text-[#EF4444] tabular-nums">{fmtNum(report.compliance.sarByAuthority.tracfin)}</p>
                      <p className="text-[11px] text-[#EF4444]/70 font-medium mt-1">Tracfin</p>
                    </div>
                    <div className="bg-[#FEF2F2] rounded-xl p-4 text-center">
                      <p className="text-[24px] font-bold text-[#EF4444] tabular-nums">{fmtNum(report.compliance.sarByAuthority.mros)}</p>
                      <p className="text-[11px] text-[#EF4444]/70 font-medium mt-1">MROS</p>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-[rgba(0,0,29,0.06)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] text-[#787881]">Actions de gel sur la periode</span>
                    <span className="text-[14px] font-bold text-[#0F0F10] tabular-nums">{fmtNum(report.compliance.frozenWallets)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-[#787881]">Taux de resolution alertes</span>
                    <span className="text-[14px] font-bold text-[#059669] tabular-nums">
                      {pct(report.compliance.alertsResolved, report.compliance.alertsTotal)}%
                    </span>
                  </div>
                </div>
              </div>
            </Section>

            {/* Section 3 - KYC & Due Diligence */}
            <Section title="KYC & Due Diligence" icon="">
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] text-[#787881] mb-3 font-medium uppercase tracking-wider">Verifications KYC</p>
                  <div className="space-y-2.5">
                    <ProgressBar label="Verifies" value={report.kyc.verified} total={report.kyc.totalChecks} color="#059669" />
                    <ProgressBar label="En attente" value={report.kyc.pending} total={report.kyc.totalChecks} color="#D97706" />
                    <ProgressBar label="Rejetes" value={report.kyc.rejected} total={report.kyc.totalChecks} color="#EF4444" />
                  </div>
                </div>
                <div className="pt-3 border-t border-[rgba(0,0,29,0.06)]">
                  <p className="text-[11px] text-[#787881] mb-3 font-medium uppercase tracking-wider">Registre UBO</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-[#FBF6EC] rounded-xl p-3 text-center">
                      <p className="text-[18px] font-bold text-[#7C5E3C] tabular-nums">{fmtNum(report.ubos.totalRegistered)}</p>
                      <p className="text-[10px] text-[#7C5E3C]/70 mt-0.5">Total</p>
                    </div>
                    <div className="bg-[#ECFDF5] rounded-xl p-3 text-center">
                      <p className="text-[18px] font-bold text-[#059669] tabular-nums">{fmtNum(report.ubos.verified)}</p>
                      <p className="text-[10px] text-[#059669]/70 mt-0.5">Verifies</p>
                    </div>
                    <div className="bg-[#FFFBEB] rounded-xl p-3 text-center">
                      <p className="text-[18px] font-bold text-[#D97706] tabular-nums">{fmtNum(report.ubos.unverified)}</p>
                      <p className="text-[10px] text-[#D97706]/70 mt-0.5">Non verifies</p>
                    </div>
                  </div>
                </div>
              </div>
            </Section>

            {/* Section 4 - Gestion des risques */}
            <Section title="Gestion des risques" icon="">
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] text-[#787881] mb-3 font-medium uppercase tracking-wider">Distribution des risques</p>
                  <div className="space-y-2">
                    <RiskBadge label="Haut risque" count={report.risk.highRiskClients} color="#EF4444" />
                    <RiskBadge label="Risque moyen" count={report.risk.mediumRiskClients} color="#D97706" />
                    <RiskBadge label="Risque faible" count={report.risk.lowRiskClients} color="#059669" />
                  </div>
                </div>
                <div className="pt-3 border-t border-[rgba(0,0,29,0.06)]">
                  <p className="text-[11px] text-[#787881] mb-3 font-medium uppercase tracking-wider">Adresses whitelist</p>
                  <div className="space-y-2.5">
                    <ProgressBar label="Approuvees" value={report.whitelist.approved} total={report.whitelist.totalAddresses} color="#059669" />
                    <ProgressBar label="En attente" value={report.whitelist.pending} total={report.whitelist.totalAddresses} color="#D97706" />
                    <ProgressBar label="Revoquees" value={report.whitelist.revoked} total={report.whitelist.totalAddresses} color="#EF4444" />
                  </div>
                </div>
              </div>
            </Section>
          </div>

          {/* Section 5 - Journal d'audit (full width) */}
          <Section title="Journal d'audit" icon="">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="bg-[#FBF6EC] rounded-xl p-4 text-center">
                <p className="text-[28px] font-bold text-[#7C5E3C] tabular-nums">{fmtNum(report.audit.totalActions)}</p>
                <p className="text-[11px] text-[#7C5E3C]/70 font-medium mt-1">Actions totales</p>
              </div>
              <div className="bg-[#FEF2F2] rounded-xl p-4 text-center">
                <p className="text-[28px] font-bold text-[#EF4444] tabular-nums">{fmtNum(report.audit.highSeverity)}</p>
                <p className="text-[11px] text-[#EF4444]/70 font-medium mt-1">Severite haute/critique</p>
              </div>
              <div className="bg-[rgba(0,0,23,0.02)] rounded-xl p-4 text-center">
                <p className="text-[28px] font-bold text-[#0F0F10] tabular-nums">
                  {Object.keys(report.audit.byCategory).length}
                </p>
                <p className="text-[11px] text-[#787881] font-medium mt-1">Categories</p>
              </div>
            </div>

            {Object.keys(report.audit.byCategory).length > 0 && (
              <div>
                <p className="text-[11px] text-[#787881] mb-3 font-medium uppercase tracking-wider">Repartition par categorie</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {Object.entries(report.audit.byCategory)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, count]) => (
                      <div
                        key={cat}
                        className="flex items-center justify-between bg-[rgba(0,0,23,0.02)] border border-[rgba(0,0,29,0.06)] rounded-xl px-3 py-2"
                      >
                        <span className="text-[11px] text-[#787881] capitalize">{cat}</span>
                        <span className="text-[13px] font-semibold text-[#0F0F10] tabular-nums">{fmtNum(count)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </Section>

          {/* ── Footer ──────────────────────────────────────────── */}
          <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-5">
            <p className="text-[11px] text-[#787881] leading-relaxed">
              Ce rapport est etabli conformement aux obligations de reporting reglementaire prevues par le Code Monetaire et Financier (art. L.561-32 et suivants) et le reglement MiCA (UE) 2023/1114.
            </p>
            <p className="text-[11px] font-semibold text-[#787881] mt-2">
              Confidentiel — Usage interne uniquement
            </p>
          </div>
        </>
      )}
    </div>
  );
}
