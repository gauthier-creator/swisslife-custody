import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { testConnection as testSfConnection } from '../services/salesforceApi';
import { testDfnsConnection } from '../services/dfnsApi';
import { STORAGE_KEYS } from '../config/constants';
import { inputCls, labelCls, Spinner } from './shared';

export default function ConfigPage() {
  const { saveConfig } = useAuth();
  const [sfUrl, setSfUrl] = useState('');
  const [sfToken, setSfToken] = useState('');
  const [dfnsToken, setDfnsToken] = useState('');
  const [dfnsAppId, setDfnsAppId] = useState('');
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState({ sf: null, dfns: null });
  const [useMock, setUseMock] = useState(false);

  const handleConnect = async () => {
    setTesting(true);
    setStatus({ sf: null, dfns: null });

    // Save first so API calls can read from localStorage
    localStorage.setItem(STORAGE_KEYS.SF_INSTANCE_URL, sfUrl);
    localStorage.setItem(STORAGE_KEYS.SF_ACCESS_TOKEN, sfToken);
    localStorage.setItem(STORAGE_KEYS.DFNS_TOKEN, dfnsToken);
    localStorage.setItem(STORAGE_KEYS.DFNS_APP_ID, dfnsAppId);

    let sfOk = false, dfnsOk = false;

    if (useMock) {
      sfOk = true;
    } else {
      try { sfOk = await testSfConnection(); } catch { sfOk = false; }
    }

    try { dfnsOk = await testDfnsConnection(); } catch { dfnsOk = false; }

    setStatus({ sf: sfOk, dfns: dfnsOk });

    if ((sfOk || useMock) && dfnsOk) {
      saveConfig({ sfInstanceUrl: useMock ? 'mock' : sfUrl, sfAccessToken: useMock ? 'mock' : sfToken, dfnsToken, dfnsAppId });
    } else if (useMock) {
      // Salesforce mock + Dfns token (may or may not have been tested)
      saveConfig({ sfInstanceUrl: 'mock', sfAccessToken: 'mock', dfnsToken: dfnsToken || 'demo', dfnsAppId: dfnsAppId || 'demo' });
    }
    setTesting(false);
  };

  const handleDemoMode = () => {
    saveConfig({ sfInstanceUrl: 'mock', sfAccessToken: 'mock', dfnsToken: 'demo', dfnsAppId: 'demo' });
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[#0F0F10] rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-[16px] font-bold">SL</span>
          </div>
          <h1 className="text-[24px] font-semibold text-[#0F0F10] tracking-tight">SwissLife Custody</h1>
          <p className="text-[14px] text-[#787881] mt-1">Connectez vos services pour commencer</p>
        </div>

        <div className="bg-white border border-[rgba(0,0,29,0.08)] rounded-2xl p-6 space-y-6">
          {/* Salesforce */}
          <div>
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
                  <input type="password" value={sfToken} onChange={e => setSfToken(e.target.value)} placeholder="Bearer token from Salesforce" className={inputCls} />
                </div>
              </div>
            )}
            {status.sf !== null && (
              <p className={`text-[12px] mt-2 font-medium ${status.sf ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                {status.sf ? '✓ Salesforce connected' : '✗ Connection failed'}
              </p>
            )}
          </div>

          <div className="border-t border-[rgba(0,0,29,0.06)]" />

          {/* Dfns */}
          <div>
            <h3 className="text-[14px] font-semibold text-[#0F0F10] mb-4">Dfns Custody</h3>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>API Token</label>
                <input type="password" value={dfnsToken} onChange={e => setDfnsToken(e.target.value)} placeholder="Service account token" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>App ID</label>
                <input type="text" value={dfnsAppId} onChange={e => setDfnsAppId(e.target.value)} placeholder="ap-xxxxx" className={inputCls} />
              </div>
            </div>
            {status.dfns !== null && (
              <p className={`text-[12px] mt-2 font-medium ${status.dfns ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                {status.dfns ? '✓ Dfns connected' : '✗ Connection failed'}
              </p>
            )}
          </div>

          <button
            onClick={handleConnect}
            disabled={testing}
            className="w-full py-2.5 bg-[#0F0F10] text-white rounded-xl text-[14px] font-medium hover:bg-[#292524] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {testing ? <><Spinner size="w-4 h-4" /> Testing...</> : 'Connect & Continue'}
          </button>

          <button
            onClick={handleDemoMode}
            className="w-full py-2 text-[13px] text-[#787881] hover:text-[#0F0F10] transition-colors font-medium"
          >
            Acceder en mode demo →
          </button>
        </div>
      </div>
    </div>
  );
}
