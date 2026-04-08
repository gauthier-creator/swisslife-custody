import { useState, useEffect, useCallback } from 'react';
import { fetchKycReviewSchedule, triggerRescreening, batchReviewCheck } from '../services/kycService';
import { useAuth } from '../context/AuthContext';
import { Badge, Spinner } from './shared';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const statusConfig = {
  valid:    { label: 'Valide',    variant: 'success', color: '#059669' },
  expiring: { label: 'Expire bientot', variant: 'warning', color: '#D97706' },
  expired:  { label: 'Expire',    variant: 'error',   color: '#DC2626' },
  missing:  { label: 'Non verifie', variant: 'default', color: '#787881' },
};

export default function KYCReviewDashboard() {
  const { user, isAdmin } = useAuth();
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [batchRunning, setBatchRunning] = useState(false);
  const [rescreeningId, setRescreeningId] = useState(null);
  const [batchResult, setBatchResult] = useState(null);
  const [error, setError] = useState(null);

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchKycReviewSchedule();
      setSchedule(data.clients || data || []);
    } catch (err) {
      console.error('KYC review schedule error:', err);
      setSchedule([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSchedule(); }, [loadSchedule]);

  const handleBatchCheck = async () => {
    setBatchRunning(true);
    setError(null);
    setBatchResult(null);
    try {
      const result = await batchReviewCheck();
      setBatchResult(result);
      await loadSchedule();
    } catch (err) {
      setError(err.message);
    }
    setBatchRunning(false);
  };

  const handleRescreening = async (accountId) => {
    setRescreeningId(accountId);
    setError(null);
    try {
      await triggerRescreening(accountId, user?.email);
      await loadSchedule();
    } catch (err) {
      setError(err.message);
    }
    setRescreeningId(null);
  };

  // Stats
  const validCount = schedule.filter(c => c.status === 'valid').length;
  const expiringCount = schedule.filter(c => c.status === 'expiring').length;
  const expiredCount = schedule.filter(c => c.status === 'expired').length;
  const missingCount = schedule.filter(c => c.status === 'missing').length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="KYC valides" value={validCount} color="#059669" bg="#ECFDF5" />
        <StatCard label="Expiration proche" value={expiringCount} color="#D97706" bg="#FFFBEB" />
        <StatCard label="Expires" value={expiredCount} color="#DC2626" bg="#FEF2F2" />
        <StatCard label="Non verifies" value={missingCount} color="#787881" bg="rgba(0,0,23,0.03)" />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-[#0F0F10]">Planning des revues KYC</h3>
        <div className="flex items-center gap-3">
          {batchResult && (
            <span className="text-[12px] text-[#059669] bg-[#ECFDF5] px-3 py-1 rounded-full">
              {batchResult.checked} verifies, {batchResult.alertsCreated} alertes
            </span>
          )}
          {isAdmin && (
            <button
              onClick={handleBatchCheck}
              disabled={batchRunning}
              className="px-4 py-2 bg-[#0F0F10] text-white text-[12px] font-medium rounded-lg hover:bg-[#1a1a1a] transition-colors disabled:opacity-40"
            >
              {batchRunning ? 'Verification...' : 'Lancer la revue batch'}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-[#FEF2F2] border border-[rgba(220,38,38,0.15)] rounded-xl px-4 py-3 flex items-center gap-3">
          <p className="text-[12px] text-[#991B1B] flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-[#DC2626] text-[12px]">Fermer</button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : schedule.length === 0 ? (
        <div className="text-center py-12 bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl">
          <p className="text-[13px] text-[#A8A29E]">Aucun client avec verification KYC</p>
        </div>
      ) : (
        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[rgba(0,0,29,0.06)] bg-[rgba(0,0,23,0.02)]">
                <th className="px-5 py-3 text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider">Client</th>
                <th className="px-5 py-3 text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider">Risque</th>
                <th className="px-5 py-3 text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider">Derniere validation</th>
                <th className="px-5 py-3 text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider">Prochaine revue</th>
                <th className="px-5 py-3 text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider text-right">Jours restants</th>
                <th className="px-5 py-3 text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider">Statut</th>
                {isAdmin && <th className="px-5 py-3 text-[11px] font-medium text-[#A8A29E] uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {schedule
                .sort((a, b) => (a.daysUntilExpiry ?? 9999) - (b.daysUntilExpiry ?? 9999))
                .map(client => {
                  const st = statusConfig[client.status] || statusConfig.missing;
                  const daysColor = client.daysUntilExpiry == null ? 'text-[#A8A29E]'
                    : client.daysUntilExpiry < 0 ? 'text-[#DC2626]'
                    : client.daysUntilExpiry < 30 ? 'text-[#D97706]'
                    : client.daysUntilExpiry < 90 ? 'text-[#F59E0B]'
                    : 'text-[#059669]';

                  return (
                    <tr key={client.salesforceAccountId} className="border-b border-[rgba(0,0,29,0.04)] hover:bg-[rgba(0,0,23,0.015)]">
                      <td className="px-5 py-3">
                        <p className="text-[13px] font-medium text-[#0F0F10]">{client.clientName || client.salesforceAccountId}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-[12px] font-medium ${
                          client.riskLevel === 'critical' ? 'text-[#DC2626]' :
                          client.riskLevel === 'high' ? 'text-[#D97706]' :
                          client.riskLevel === 'low' ? 'text-[#059669]' : 'text-[#787881]'
                        }`}>{client.riskLevel || 'standard'}</span>
                      </td>
                      <td className="px-5 py-3 text-[12px] text-[#787881]">{fmtDate(client.lastValidation)}</td>
                      <td className="px-5 py-3 text-[12px] text-[#787881]">{fmtDate(client.nextReview)}</td>
                      <td className={`px-5 py-3 text-right text-[13px] font-semibold tabular-nums ${daysColor}`}>
                        {client.daysUntilExpiry != null ? (client.daysUntilExpiry < 0 ? `${Math.abs(client.daysUntilExpiry)}j en retard` : `${client.daysUntilExpiry}j`) : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-3">
                          <button
                            onClick={() => handleRescreening(client.salesforceAccountId)}
                            disabled={rescreeningId === client.salesforceAccountId}
                            className="px-2.5 py-1 bg-[#EEF2FF] text-[#6366F1] text-[11px] font-medium rounded-md hover:bg-[#E0E7FF] transition-colors disabled:opacity-40"
                          >
                            {rescreeningId === client.salesforceAccountId ? '...' : 'Re-screening'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, bg }) {
  return (
    <div className="rounded-xl p-4 border border-[rgba(0,0,29,0.08)]" style={{ backgroundColor: bg }}>
      <p className="text-[28px] font-bold tabular-nums" style={{ color }}>{value}</p>
      <p className="text-[12px] text-[#787881] mt-0.5">{label}</p>
    </div>
  );
}
