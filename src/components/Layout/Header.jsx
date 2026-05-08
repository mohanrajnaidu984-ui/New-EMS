import React, { useState, useEffect } from 'react';
import almoayyedLogo from '../../assets/almoayyed-logo.png';
import emsMarkLogo from '../../assets/ems_logo2.png';
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
    { id: 'Sales Report', label: 'Sales Report', icon: 'bi-file-earmark-bar-graph' },
    { id: 'Reports', label: 'Sales Target', icon: 'bi-bullseye' },
    { id: 'Help', label: 'Help', icon: 'bi-question-circle' },
    { id: 'About', label: 'About', icon: 'bi-info-circle' }
  ];

  // Role Based Access
  const roleString = currentUser?.role || currentUser?.Roles || '';
  const userRoles = typeof roleString === 'string'
    ? roleString.split(',').map(r => r.trim().toLowerCase())
    : (Array.isArray(roleString) ? roleString.map(r => r.toLowerCase()) : []);

  const visibleItems = navItems.filter(item => {
    if (item.id === 'Dashboard') return true;
    if (item.id === 'Help') return true;
    if (item.id === 'About') return true;

    // Grant Admin access to everything
    if (userRoles.includes('admin')) return true;

    // Granular Role Checks
    if (item.id === 'Enquiry' && userRoles.includes('enquiry')) return true;
    if (item.id === 'Pricing' && userRoles.includes('pricing')) return true;
    if (item.id === 'Quote' && userRoles.includes('quote')) return true;
    if (item.id === 'Probability' && userRoles.includes('probability')) return true;
    if (item.id === 'Sales Report' && (userRoles.includes('sales target') || userRoles.includes('sales report'))) return true;
    if (item.id === 'Reports' && (userRoles.includes('report') || userRoles.includes('sales target'))) return true;

    return false;
  });
  const visibleMenuCount = visibleItems.length;
  const menuStripPadding = visibleMenuCount <= 2 ? '0 10px' : visibleMenuCount <= 4 ? '0 8px' : '0 4px';

  return (
    <>
      <nav className="navbar navbar-light" style={{
        backgroundColor: '#ffffff',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        padding: '0',
        height: '72px',
        borderBottom: 'none',
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
          padding: '0 14px',
          position: 'relative',
          zIndex: 1
        }}>
          <div className="d-flex align-items-end w-100 h-100" style={{ position: 'relative' }}>
            {/* Left: EMS Text */}
            <div className="d-flex align-items-center logo-container" style={{ animation: 'fadeInLeft 1s ease-out' }}>
              <span className="ems-brand-text d-flex align-items-center">
                <img src={emsMarkLogo} alt="" className="ems-brand-mark me-1" aria-hidden="true" />
                <span className="ems-brand-word">EMS</span>
                <span className="ems-brand-divider" aria-hidden="true"></span>
                <span className="ems-brand-subtext">
                  Enquiry<br />
                  Management<br />
                  System
                </span>
              </span>
            </div>

            {/* Centered: Navigation Links aligned to header bottom */}
            <div
              className="d-flex justify-content-center align-items-center pb-0"
              style={{
                background: 'linear-gradient(180deg, #2f5fae 0%, #203f75 100%)',
                borderTopLeftRadius: '18px',
                borderTopRightRadius: '18px',
                height: '35px',
                margin: '0',
                flexGrow: 0,
                padding: menuStripPadding,
                position: 'absolute',
                left: '50%',
                bottom: 0,
                transform: 'translateX(-50%)',
                boxShadow: '0 2px 8px rgba(23, 47, 99, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
                width: 'fit-content',
                zIndex: 2
              }}
            >
              <ul className="nav d-flex align-items-center gap-2 m-0 ems-top-nav">
                {visibleItems.map(item => (
                  <li className="nav-item" key={item.id}>
                    <button
                      className={`nav-link bg-transparent border-0 d-flex align-items-center shadow-none ems-top-nav-link${activeTab === item.id ? ' active' : ''}`}
                      onClick={() => onNavigate(item.id)}
                      aria-current={activeTab === item.id ? 'page' : undefined}
                    >
                      <i className={`bi ${item.icon} me-2 ems-top-nav-link__icon`}></i>
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: Stacked ACG Logo + User Controls */}
            <div className="d-flex flex-column align-items-end justify-content-end h-100 pb-1" style={{ marginLeft: 'auto' }}>
              {/* Top: ACG Logo */}
              <img
                src={almoayyedLogo}
                alt="ACG"
                className="mb-1"
                style={{
                  height: '26px',
                  width: 'auto',
                  objectFit: 'contain',
                  opacity: 1,
                  imageRendering: 'crisp-edges',
                  transform: 'translateY(6px)'
                }}
              />

              {/* Bottom: User Controls */}
              <div className="d-flex align-items-center gap-2">
                <NotificationDropdown onOpenEnquiry={onOpenEnquiry} />
                <div style={{ transform: 'scale(0.9)', transformOrigin: 'right bottom' }}>
                  <UserProfile activeTab={activeTab} />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '8px',
            background: 'linear-gradient(180deg, #2f5fae 0%, #203f75 100%)',
            zIndex: 0,
            pointerEvents: 'none'
          }}
        />
      </nav>
    </>
  );
};

export default Header;
