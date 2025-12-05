import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import emsoLogo from '../../assets/ems_logo_new.png';
import almoayyedLogo from '../../assets/almoayyed-logo.png';
import ChangePasswordModal from '../Modals/ChangePasswordModal';

const Header = () => {
  // Logo imports only


  return (
    <>
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

            {/* Right: ACG Logo */}
            <div className="d-flex flex-column align-items-end">
              {/* ACG Logo (Reduced to 25% + 15% increase) */}
              <img
                src={almoayyedLogo}
                alt="Almoayyed Contracting Group"
                style={{ height: '29px', width: 'auto', objectFit: 'contain', marginBottom: '2px' }}
              />
            </div>
          </div>
        </div>
      </nav>
    </>
  );
};

export default Header;
