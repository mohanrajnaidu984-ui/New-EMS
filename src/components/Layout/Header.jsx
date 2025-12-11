import React, { useState, useEffect } from 'react';
import emsoLogo from '../../assets/ems_logo_new.png';
import almoayyedLogo from '../../assets/almoayyed-logo.png';
import NotificationDropdown from './NotificationDropdown';
import UserProfile from './UserProfile';

import { useAuth } from '../../context/AuthContext';

const Header = ({ activeTab, onNavigate, onOpenEnquiry }) => {
  const { currentUser } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItems = [
    { id: 'Dashboard', label: 'Dashboard', icon: 'bi-speedometer2' },
    { id: 'Enquiry', label: 'Enquiry', icon: 'bi-clipboard-data' },
    { id: 'Pricing', label: 'Pricing', icon: 'bi-calculator' },
    { id: 'Quote', label: 'Quote', icon: 'bi-file-earmark-text' },
    { id: 'Probability', label: 'Probability', icon: 'bi-graph-up' },
    { id: 'Reports', label: 'Reports', icon: 'bi-file-earmark-bar-graph' }
  ];

  // Role Based Access
  const roleString = currentUser?.role || currentUser?.Roles || '';
  const userRoles = typeof roleString === 'string'
    ? roleString.split(',').map(r => r.trim())
    : (Array.isArray(roleString) ? roleString : []);

  const visibleItems = navItems.filter(item => {
    if (item.id === 'Dashboard') return true;
    if (userRoles.includes('Admin')) return true;
    if (item.id === 'Enquiry' && userRoles.includes('Enquiry')) return true;
    if (item.id === 'Quote' && userRoles.includes('Quotation')) return true;
    if ((item.id === 'Pricing' || item.id === 'Probability') && userRoles.includes('Sales')) return true;
    return false;
  });

  return (
    <>
      <nav className="navbar navbar-light" style={{
        backgroundColor: 'rgba(255, 255, 255, 0.72)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        padding: '0',
        height: '100px',
        borderBottom: '1px solid rgba(0, 0, 0, 0.16)',
        position: 'fixed',
        top: 0,
        zIndex: 9999,
        transition: 'all 0.4s ease',
        width: isScrolled ? '100%' : '70%',
        maxWidth: '100%',
        borderRadius: isScrolled ? '0' : '0 0 16px 16px',
        margin: '0 auto',
        left: 0,
        right: 0,
        boxShadow: isScrolled ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none'
      }}>
        <div className="container-fluid h-100" style={{
          width: isScrolled ? '70%' : '100%',
          transition: 'width 0.4s ease',
          margin: '0 auto',
          padding: '0 24px'
        }}>
          <div className="d-flex align-items-center justify-content-between w-100 h-100 position-relative">
            {/* Left: EMSO Logo */}
            <div className="d-flex align-items-center logo-container" style={{ animation: 'fadeInLeft 1s ease-out' }}>
              <img
                src={emsoLogo}
                alt="EMS - Enquiry Management System"
                style={{ height: '90px', width: 'auto', display: 'block' }}
              />
            </div>

            <style>
              {`
                @keyframes fadeInLeft {
                    from { opacity: 0; transform: translateX(-20px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                `}
            </style>

            {/* Center: Navigation Links */}
            <div className="position-absolute start-50 translate-middle-x h-100 d-flex align-items-end pb-3">
              <ul className="nav d-flex align-items-center gap-4 m-0">
                {visibleItems.map(item => (
                  <li className="nav-item" key={item.id}>
                    <button
                      className="nav-link bg-transparent border-0 p-0 d-flex align-items-center"
                      onClick={() => onNavigate(item.id)}
                      style={{
                        fontSize: '14px',
                        color: activeTab === item.id ? '#1d1d1f' : '#6e6e73',
                        fontWeight: activeTab === item.id ? '600' : '400',
                        opacity: activeTab === item.id ? 1 : 0.8,
                        transition: 'color 0.2s ease, opacity 0.2s ease',
                        letterSpacing: '-0.01em',
                        cursor: 'pointer',
                        paddingBottom: '4px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#1d1d1f';
                        e.currentTarget.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = activeTab === item.id ? '#1d1d1f' : '#6e6e73';
                        e.currentTarget.style.opacity = activeTab === item.id ? '1' : '0.8';
                      }}
                    >
                      <i className={`bi ${item.icon} me-2`} style={{ fontSize: '16px' }}></i>
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right Group: ACG Logo */}
            <div className="d-flex align-items-end h-100 pb-3">
              <div className="d-flex flex-column align-items-end ps-2 mb-1">
                <img
                  src={almoayyedLogo}
                  alt="ACG"
                  style={{ height: '34px', width: 'auto', objectFit: 'contain', opacity: 0.8 }}
                />
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Floating Profile & Notification - Positioned below the header's right logo */}
      <div style={{
        position: 'fixed',
        top: '105px',
        right: 'calc(15% + 24px)',
        zIndex: 9998,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '10px'
      }}>
        <NotificationDropdown onOpenEnquiry={onOpenEnquiry} />
        <UserProfile />
      </div>
    </>
  );
};

export default Header;
