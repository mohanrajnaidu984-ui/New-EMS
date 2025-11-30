import React from 'react';
import { useAuth } from '../../context/AuthContext';
import logo from '../../assets/logo.jpg'; // Import the new logo

const Header = ({ activeTab, onTabChange }) => {
  const { currentUser, logout } = useAuth();
  const [profileImage, setProfileImage] = React.useState(null);
  const fileInputRef = React.useRef(null);

  const handleProfileClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setProfileImage(imageUrl);
    }
  };

  const handleTabClick = (item) => {
    if (item.name === 'Dashboard') {
      // Handle Dashboard click - for now, just log or maybe navigate if routing was set up
      console.log('Dashboard clicked');
      if (onTabChange) onTabChange('Dashboard');
    } else if (onTabChange && item.id) {
      onTabChange(item.id);
    }
  };

  const navItems = [
    { name: 'Dashboard', icon: 'bi-grid', id: 'Dashboard' },
    { name: 'Enquiry', icon: 'bi-laptop', id: 'New' }, // Default to New Enquiry
    { name: 'Pricing', icon: 'bi-tag' },
    { name: 'Quote', icon: 'bi-file-text' },
    { name: 'Probability', icon: 'bi-graph-up' },
    { name: 'Reports', icon: 'bi-bar-chart' },
  ];

  return (
    <header style={{ backgroundColor: '#fff', padding: '0 30px', boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.08)', height: '160px', display: 'flex', alignItems: 'center' }}>
      <div className="d-flex align-items-center justify-content-between w-100">
        {/* Logo Section */}
        <div className="d-flex flex-column justify-content-center" style={{ width: '450px' }}>
          <div className="d-flex align-items-center gap-2">
            <h1 className="m-0 fw-bold" style={{
              fontSize: '5.5rem',
              color: '#E91E63',
              lineHeight: 1,
              letterSpacing: '-3px',
              animation: 'logo-pulse 3s infinite ease-in-out'
            }}>EMS</h1>
            <div
              className="rounded-circle d-flex align-items-center justify-content-center"
              style={{
                width: '80px',
                height: '80px',
                backgroundColor: '#E91E63',
                animation: 'play-button-scale 2s infinite ease-in-out'
              }}
            >
              <i className="bi bi-play-fill text-white" style={{ fontSize: '4rem', marginLeft: '6px' }}></i>
            </div>
          </div>
          <div className="text-secondary" style={{ fontSize: '1.2rem', letterSpacing: '2px', fontWeight: '300', marginTop: '-5px' }}>
            ENQUIRY MANAGEMENT SYSTEM
          </div>
          <div
            className="text-muted mt-1"
            style={{
              fontSize: '0.8rem',
              fontWeight: '400',
              animation: 'slide-fade 3s ease-out forwards',
              opacity: 0
            }}
          >
            Powered by Almoayyed Air Conditioning - BMS
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="d-flex gap-2">
          {navItems.map((item) => (
            <button
              key={item.name}
              onClick={() => handleTabClick(item)}
              className="btn d-flex align-items-center gap-2"
              style={{
                backgroundColor: (activeTab === item.id || (item.name === 'Enquiry' && activeTab === 'New')) ? '#FFF0F5' : 'transparent',
                color: (activeTab === item.id || (item.name === 'Enquiry' && activeTab === 'New')) ? '#D81B60' : '#8F9BBA',
                fontWeight: '600',
                fontSize: '0.95rem',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '12px',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: (activeTab === item.id || (item.name === 'Enquiry' && activeTab === 'New')) ? '0 4px 12px rgba(233, 30, 99, 0.15)' : 'none'
              }}
            >
              <i className={`bi ${item.icon}`} style={{ fontSize: '1.1rem' }}></i>
              {item.name}
            </button>
          ))}
        </nav>

        {/* User Profile */}
        <div className="d-flex align-items-center gap-5">
          <div className="d-flex align-items-center gap-3 p-2 pe-4" style={{ transition: 'all 0.3s ease' }}>
            <div
              className="position-relative rounded-circle shadow-sm hover-scale"
              style={{ width: '90px', height: '90px', cursor: 'pointer', overflow: 'hidden', border: '3px solid #fff', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}
              onClick={handleProfileClick}
              title="Click to upload profile photo"
            >
              {profileImage ? (
                <img src={profileImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div className="w-100 h-100 bg-white d-flex align-items-center justify-content-center">
                  <i className="bi bi-person-fill text-primary fs-1"></i>
                </div>
              )}
              <div className="position-absolute bottom-0 start-0 w-100 bg-dark bg-opacity-50 text-white text-center py-1" style={{ fontSize: '0.6rem' }}>
                <i className="bi bi-camera"></i>
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept="image/*"
              onChange={handleFileChange}
            />

            <div className="d-flex flex-column">
              <span className="fw-bold" style={{ fontSize: '1.2rem', color: '#2B3674', letterSpacing: '0.5px' }}>{currentUser?.name || 'Vignesh'}</span>
              <span className="text-muted text-uppercase" style={{ fontSize: '0.85rem', fontWeight: '600', letterSpacing: '1px' }}>Admin</span>
            </div>
          </div>

          <button
            onClick={logout}
            className="btn btn-light rounded-circle d-flex align-items-center justify-content-center shadow-sm hover-scale"
            style={{ width: '90px', height: '90px', color: '#E53E3E', backgroundColor: '#FFF5F5' }}
            title="Logout"
          >
            <i className="bi bi-power" style={{ fontSize: '3.5rem' }}></i>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
