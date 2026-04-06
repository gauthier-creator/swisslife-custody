import { createContext, useContext, useState, useCallback } from 'react';
import { STORAGE_KEYS } from '../config/constants';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [configured, setConfigured] = useState(() => {
    return !!(localStorage.getItem(STORAGE_KEYS.SF_ACCESS_TOKEN) && localStorage.getItem(STORAGE_KEYS.DFNS_TOKEN));
  });

  const saveConfig = useCallback(({ sfInstanceUrl, sfAccessToken, dfnsToken, dfnsAppId }) => {
    if (sfInstanceUrl) localStorage.setItem(STORAGE_KEYS.SF_INSTANCE_URL, sfInstanceUrl);
    if (sfAccessToken) localStorage.setItem(STORAGE_KEYS.SF_ACCESS_TOKEN, sfAccessToken);
    if (dfnsToken) localStorage.setItem(STORAGE_KEYS.DFNS_TOKEN, dfnsToken);
    if (dfnsAppId) localStorage.setItem(STORAGE_KEYS.DFNS_APP_ID, dfnsAppId);
    setConfigured(true);
  }, []);

  const clearConfig = useCallback(() => {
    Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
    setConfigured(false);
  }, []);

  const sfConfig = {
    instanceUrl: localStorage.getItem(STORAGE_KEYS.SF_INSTANCE_URL) || '',
    accessToken: localStorage.getItem(STORAGE_KEYS.SF_ACCESS_TOKEN) || '',
  };

  const dfnsConfig = {
    token: localStorage.getItem(STORAGE_KEYS.DFNS_TOKEN) || '',
    appId: localStorage.getItem(STORAGE_KEYS.DFNS_APP_ID) || '',
  };

  return (
    <AuthContext.Provider value={{ configured, saveConfig, clearConfig, sfConfig, dfnsConfig }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
