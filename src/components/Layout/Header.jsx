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
    { id: 'Sales Report', label: 'Sales Report', icon: 'bi-bullseye' },
    { id: 'Reports', label: 'Reports', icon: 'bi-file-earmark-bar-graph' }
  ];

  // Role Based Access
  const roleString = currentUser?.role || currentUser?.Roles || '';
  const userRoles = typeof roleString === 'string'
    ? roleString.split(',').map(r => r.trim().toLowerCase())
    : (Array.isArray(roleString) ? roleString.map(r => r.toLowerCase()) : []);

  const visibleItems = navItems.filter(item => {
    if (item.id === 'Dashboard') return true;

    // Grant Admin access to everything
    if (userRoles.includes('admin')) return true;

    // Granular Role Checks
    if (item.id === 'Enquiry' && userRoles.includes('enquiry')) return true;
    if (item.id === 'Pricing' && userRoles.includes('pricing')) return true;
    if (item.id === 'Quote' && userRoles.includes('quote')) return true;
    if (item.id === 'Probability' && userRoles.includes('probability')) return true;
    if (item.id === 'Sales Report' && (userRoles.includes('sales target') || userRoles.includes('sales report'))) return true;
    if (item.id === 'Reports' && userRoles.includes('report')) return true;

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
        width: '100%',
        maxWidth: '100%',
        borderRadius: '0',
        margin: '0 auto',
        left: 0,
        right: 0,
        boxShadow: isScrolled ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)' : 'none'
      }}>
        <div className="container-fluid h-100" style={{
          width: '100%',
          transition: 'width 0.4s ease',
          margin: '0 auto',
          padding: '0 24px'
        }}>
          <div className="d-flex align-items-end w-100 h-100 pb-0">
            {/* Left: EMSO Logo */}
            <div className="d-flex align-items-center logo-container" style={{ animation: 'fadeInLeft 1s ease-out' }}>
              <img
                src={emsoLogo}
                alt="EMS"
                style={{ height: '85px', width: 'auto', display: 'block' }}
              />
            </div>

            {/* Centered: Navigation Links + User Controls */}
            <div className="flex-grow-1 d-flex justify-content-center align-items-center">
              <ul className="nav d-flex align-items-center gap-4 m-0">
                {visibleItems.map(item => (
                  <li className="nav-item" key={item.id}>
                    <button
                      className="nav-link bg-transparent border-0 p-0 d-flex align-items-center shadow-none"
                      onClick={() => onNavigate(item.id)}
                      style={{
                        fontSize: '14px',
                        color: activeTab === item.id ? '#1d1d1f' : '#6e6e73',
                        fontWeight: activeTab === item.id ? '600' : '400',
                        opacity: activeTab === item.id ? 1 : 0.8,
                        transition: 'all 0.2s ease',
                        letterSpacing: '-0.01em',
                        cursor: 'pointer'
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

            {/* Right: Stacked ACG Logo + User Controls */}
            <div className="d-flex flex-column align-items-end justify-content-end h-100 pb-1">
              {/* Top: ACG Logo */}
              <img
                src={almoayyedLogo}
                alt="ACG"
                className="mb-1"
                style={{ height: '35px', width: 'auto', objectFit: 'contain', opacity: 0.9 }}
              />

              {/* Bottom: User Controls */}
              <div className="d-flex align-items-center gap-2">
                <NotificationDropdown onOpenEnquiry={onOpenEnquiry} />
                <div style={{ transform: 'scale(0.9)', transformOrigin: 'right bottom' }}>
                  <UserProfile />
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
};

export default Header;
