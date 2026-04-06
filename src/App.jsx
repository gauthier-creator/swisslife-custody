import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastContainer, useToast } from './components/shared';
import Layout from './components/Layout';
import ConfigPage from './components/ConfigPage';
import ClientList from './components/ClientList';
import ClientDetail from './components/ClientDetail';
import WalletList from './components/WalletList';
import PolicyList from './components/PolicyList';

function AppInner() {
  const { configured } = useAuth();
  const { toasts, toast } = useToast();
  const [section, setSection] = useState('clients');
  const [selectedClient, setSelectedClient] = useState(null);

  if (!configured) {
    return (
      <>
        <ConfigPage onConfigured={() => toast('Configuration sauvegardee', 'success')} />
        <ToastContainer toasts={toasts} />
      </>
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
