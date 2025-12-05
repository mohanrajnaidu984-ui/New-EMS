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
        <MainLayout>
          <Main />
        </MainLayout>
      )}
      <div style={{ position: 'fixed', bottom: 10, right: 10, background: 'rgba(255,0,0,0.9)', color: 'white', padding: '15px', zIndex: 9999, fontSize: '14px', border: '2px solid white' }}>
        <strong>Debug Info:</strong><br />
        Auth: {isAuthenticated ? 'TRUE' : 'FALSE'}<br />
        User: {currentUser ? currentUser.email : 'null'}
      </div>
    </>
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
