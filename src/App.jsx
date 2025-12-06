import React, { useState } from 'react';
import { DataProvider } from './context/DataContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import MainLayout from './components/Layout/MainLayout';
import Login from './components/Auth/Login';
import Signup from './components/Auth/Signup';
import Main from './components/Main';

function AppContent() {
  const { isAuthenticated, currentUser } = useAuth();
  const [showSignup, setShowSignup] = useState(false);

  React.useEffect(() => {
    console.log('AppContent Re-render: Auth=', isAuthenticated, 'User=', currentUser);
  }, [isAuthenticated, currentUser]);

  return (
    <>
      {!isAuthenticated ? (
        showSignup ? (
          <Signup onSwitchToLogin={() => setShowSignup(false)} />
        ) : (
          <Login onSwitchToSignup={() => setShowSignup(true)} />
        )
      ) : (
        <MainLayoutWrapper />
      )}
    </>
  );
}

function MainLayoutWrapper() {
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [enquiryToOpen, setEnquiryToOpen] = useState(null);

  const handleOpenEnquiry = (requestNo) => {
    setEnquiryToOpen(requestNo);
    setActiveTab('Enquiry');
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab !== 'Enquiry') {
      setEnquiryToOpen(null);
    }
  };

  return (
    <MainLayout activeTab={activeTab} onNavigate={handleTabChange}>
      <Main
        activeTab={activeTab}
        onNavigate={handleTabChange}
        enquiryToOpen={enquiryToOpen}
        onOpenEnquiry={handleOpenEnquiry}
      />
    </MainLayout>
  );
}



function App() {
  return (
    <DataProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </DataProvider>
  );
}

export default App;
