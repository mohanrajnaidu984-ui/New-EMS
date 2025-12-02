import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import emsoLogo from '../../assets/ems_logo_new.png';
import almoayyedLogo from '../../assets/almoayyed-logo.png';

const Header = () => {
  const { currentUser, logout } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <nav className="navbar navbar-light" style={{
      backgroundColor: '#ffffff',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
      padding: '0px 20px',
      borderBottom: '1px solid #e0e0e0',
      position: 'sticky',
      top: 0,
      zIndex: 1020
    }}>
      <div className="container-fluid">
        <div className="d-flex align-items-end justify-content-between w-100">
          {/* Left: EMSO Logo */}
          <div className="d-flex align-items-center mb-2">
            <img
              src={emsoLogo}
              alt="EMSO - Enquiry Management System"
              style={{ height: '94px', width: 'auto', objectFit: 'contain' }}
            />
          </div>

          {/* Right: ACG Logo and User Details */}
          <div className="d-flex flex-column align-items-end">
            {/* ACG Logo (Reduced to 25% + 15% increase) */}
            <img
              src={almoayyedLogo}
              alt="Almoayyed Contracting Group"
              style={{ height: '29px', width: 'auto', objectFit: 'contain', marginBottom: '2px' }}
            />

            {/* User Info Dropdown */}
            <div className="position-relative">
              <div
                className="d-flex align-items-center text-secondary"
                style={{ cursor: 'pointer', userSelect: 'none', fontSize: '0.8rem' }}
                onClick={() => setShowDropdown(!showDropdown)}
              >
                <i className="bi bi-person-circle me-2"></i>
                <span className="fw-medium">{currentUser?.name || 'User'}</span>
                <i className="bi bi-chevron-down ms-1" style={{ fontSize: '0.7rem' }}></i>
              </div>

              {/* Dropdown Menu */}
              {showDropdown && (
                <div
                  className="position-absolute bg-white shadow rounded py-2 mt-1"
                  style={{
                    top: '100%',
                    right: '0',
                    minWidth: '140px',
                    zIndex: 1000,
                    border: '1px solid #e0e0e0'
                  }}
                >
                  <button
                    className="dropdown-item d-flex align-items-center px-3 py-2 w-100 text-start text-danger"
                    onClick={() => {
                      setShowDropdown(false);
                      logout();
                    }}
                    style={{ background: 'transparent', border: 'none', fontSize: '0.9rem' }}
                  >
                    <i className="bi bi-box-arrow-right me-2"></i>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Header;
