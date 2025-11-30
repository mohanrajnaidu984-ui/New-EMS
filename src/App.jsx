import React, { useState } from 'react';
import { DataProvider } from './context/DataContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import MainLayout from './components/Layout/MainLayout';
import Login from './components/Auth/Login';
import Signup from './components/Auth/Signup';
import Main from './components/Main';

function AppContent() {
  const { isAuthenticated } = useAuth();
  const [showSignup, setShowSignup] = useState(false);
  const [activeTab, setActiveTab] = useState('Dashboard'); // Lifted state

  if (!isAuthenticated) {
    return showSignup ? (
      <Signup onSwitchToLogin={() => setShowSignup(false)} />
    ) : (
      <Login onSwitchToSignup={() => setShowSignup(true)} />
    );
  }

  return (
    <MainLayout activeTab={activeTab} onTabChange={setActiveTab}>
      <Main activeTab={activeTab} onTabChange={setActiveTab} />
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
