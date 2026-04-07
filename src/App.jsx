import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastContainer, useToast, Spinner } from './components/shared';
import Layout from './components/Layout';
import LoginPage from './components/LoginPage';
import ConfigPage from './components/ConfigPage';
import ClientList from './components/ClientList';
import ClientDetail from './components/ClientDetail';
import WalletList from './components/WalletList';
import PolicyList from './components/PolicyList';

function AppInner() {
  const { session, profile, loading, isAdmin } = useAuth();
  const { toasts, toast } = useToast();
  const [section, setSection] = useState('clients');
  const [selectedClient, setSelectedClient] = useState(null);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="w-8 h-8" />
          <p className="text-[13px] text-[#787881] mt-3">Chargement...</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!session) {
    return (
      <>
        <LoginPage />
        <ToastContainer toasts={toasts} />
      </>
    );
  }

  // Waiting for profile to load
  if (!profile) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
        <div className="text-center">
          <Spinner size="w-8 h-8" />
          <p className="text-[13px] text-[#787881] mt-3">Chargement du profil...</p>
        </div>
      </div>
    );
  }

  const handleNavigate = (s) => {
    setSection(s);
    setSelectedClient(null);
  };

  return (
    <>
      <Layout section={section} onNavigate={handleNavigate}>
        {section === 'clients' && !selectedClient && (
          <ClientList onSelectClient={(c) => setSelectedClient(c)} />
        )}
        {section === 'clients' && selectedClient && (
          <ClientDetail client={selectedClient} onBack={() => setSelectedClient(null)} />
        )}
        {section === 'wallets' && <WalletList />}
        {section === 'policies' && <PolicyList />}
        {section === 'config' && isAdmin && (
          <ConfigPage onConfigured={() => toast('Configuration sauvegardee', 'success')} />
        )}
      </Layout>
      <ToastContainer toasts={toasts} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
