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
import ComplianceDashboard from './components/ComplianceDashboard';
import ContractSigningPage from './components/ContractSigningPage';
import AdequacySigningPage from './components/AdequacySigningPage';

// Check if current URL is a public signing page
function getSigningToken() {
  const match = window.location.pathname.match(/^\/sign\/([a-f0-9-]+)$/i);
  return match ? match[1] : null;
}

function getAdequacyToken() {
  const match = window.location.pathname.match(/^\/sign\/adequacy\/([a-f0-9-]+)$/i);
  return match ? match[1] : null;
}

function AppInner() {
  const { session, profile, loading, isAdmin } = useAuth();
  const { toasts, toast } = useToast();
  const [section, setSection] = useState('clients');
  const [selectedClient, setSelectedClient] = useState(null);

  // Public signing pages — no auth needed
  const adequacyToken = getAdequacyToken();
  if (adequacyToken) {
    return <AdequacySigningPage token={adequacyToken} />;
  }

  const signingToken = getSigningToken();
  if (signingToken) {
    return <ContractSigningPage token={signingToken} />;
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center animate-fade">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white border border-[rgba(10,10,10,0.08)] shadow-crisp mb-4">
            <Spinner size="w-5 h-5" />
          </div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#9B9B9B]">Chargement</p>
          <p className="text-[13px] text-[#6B6B6B] mt-1 tracking-[-0.006em]">Initialisation de la session…</p>
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
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center animate-fade">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white border border-[rgba(10,10,10,0.08)] shadow-crisp mb-4">
            <Spinner size="w-5 h-5" />
          </div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#9B9B9B]">Profil</p>
          <p className="text-[13px] text-[#6B6B6B] mt-1 tracking-[-0.006em]">Chargement des habilitations…</p>
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
        {section === 'compliance' && <ComplianceDashboard />}
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
