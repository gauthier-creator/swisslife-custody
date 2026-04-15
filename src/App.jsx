import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastContainer, useToast, Drawer } from './components/shared';
import { BrandMark, GradientRule } from './components/brand';
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
        <div className="text-center animate-fade flex flex-col items-center">
          <BrandMark size={72} label="Chargement" />
          <GradientRule className="mt-6 w-40" />
          <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#7C5E3C] mt-4">Initialisation</p>
          <p className="text-[13px] text-[#6B6B6B] mt-1 tracking-[-0.006em] font-display italic">Ouverture de la session sécurisée…</p>
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
        <div className="text-center animate-fade flex flex-col items-center">
          <BrandMark size={72} label="Profil" />
          <GradientRule className="mt-6 w-40" />
          <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-[#7C5E3C] mt-4">Habilitations</p>
          <p className="text-[13px] text-[#6B6B6B] mt-1 tracking-[-0.006em] font-display italic">Vérification du mandat banquier…</p>
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
        {section === 'clients' && (
          <ClientList onSelectClient={(c) => setSelectedClient(c)} />
        )}
        {section === 'wallets' && <WalletList />}
        {section === 'compliance' && <ComplianceDashboard />}
        {section === 'policies' && <PolicyList />}
        {section === 'config' && isAdmin && (
          <ConfigPage onConfigured={() => toast('Configuration sauvegardee', 'success')} />
        )}
      </Layout>

      {/* ── Client dossier drawer — slides in over the list ── */}
      <Drawer
        isOpen={section === 'clients' && !!selectedClient}
        onClose={() => setSelectedClient(null)}
        size="xl"
      >
        {selectedClient && (
          <ClientDetail
            client={selectedClient}
            onBack={() => setSelectedClient(null)}
            embedded
          />
        )}
      </Drawer>

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
