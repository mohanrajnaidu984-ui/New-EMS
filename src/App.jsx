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
    // Auth state logging removed for performance
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

// Import ChatWidget
import ChatWidget from './components/Chat/ChatWidget'; // Ensure path is correct

function MainLayoutWrapper() {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('activeTab') || 'Enquiry';
  });
  const [enquiryToOpen, setEnquiryToOpen] = useState(() => {
    return localStorage.getItem('enquiryToOpen') || null;
  });

  const handleOpenEnquiry = (requestNo) => {
    setEnquiryToOpen(requestNo);
    localStorage.setItem('enquiryToOpen', requestNo);
    setActiveTab('Enquiry');
    localStorage.setItem('activeTab', 'Enquiry');
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    localStorage.setItem('activeTab', tab);
    if (tab !== 'Enquiry') {
      setEnquiryToOpen(null);
      localStorage.removeItem('enquiryToOpen');
    }
  };

  return (
    <MainLayout activeTab={activeTab} onNavigate={handleTabChange} onOpenEnquiry={handleOpenEnquiry}>
      <Main
        activeTab={activeTab}
        onNavigate={handleTabChange}
        enquiryToOpen={enquiryToOpen}
        onOpenEnquiry={handleOpenEnquiry}
      />
      <ChatWidget onOpenEnquiry={handleOpenEnquiry} />
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
