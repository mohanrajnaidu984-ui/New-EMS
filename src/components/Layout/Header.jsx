import React from 'react';
import { useAuth } from '../../context/AuthContext';

const Header = () => {
  const { currentUser, logout } = useAuth();

  return (
    <nav className="navbar navbar-dark" style={{
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
      padding: '10px 20px'
    }}>
      <div className="container-fluid">
        <span className="navbar-brand mb-0 h1 fw-bold">
          <i className="bi bi-building me-2"></i>
          Enquiry Management System
        </span>
        <div className="d-flex align-items-center gap-3">
          <div className="d-flex align-items-center text-white bg-white bg-opacity-10 px-3 py-1 rounded-pill">
            <i className="bi bi-person-circle me-2"></i>
            <span className="fw-medium">{currentUser?.name || 'User'}</span>
          </div>
          <button
            className="btn btn-light btn-sm fw-medium text-primary"
            onClick={logout}
            title="Logout"
            style={{ padding: '6px 16px' }}
          >
            <i className="bi bi-box-arrow-right me-1"></i>
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Header;
