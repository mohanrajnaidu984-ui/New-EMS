import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ProfileImageModal from '../Modals/ProfileImageModal';

const UserProfile = () => {
    const { currentUser, logout, updateProfileImage } = useAuth();
    const [showModal, setShowModal] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    const handleImageSave = (base64) => {
        updateProfileImage(currentUser.id, base64);
    };

    if (!currentUser) return null;

    return (
        <div className="d-flex align-items-center position-relative">
            {/* User Name & Dropdown Toggle */}
            <div
                className="d-flex align-items-center me-3"
                style={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setDropdownOpen(!dropdownOpen)}
            >
                {/* Profile Image - Clickable */}
                <div
                    className="rounded-circle border d-flex align-items-center justify-content-center overflow-hidden me-2"
                    style={{
                        width: '32px',
                        height: '32px',
                        backgroundColor: '#f0f2f5',
                        cursor: 'pointer'
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowModal(true);
                    }}
                    title="Click to update profile picture"
                >
                    {currentUser.ProfileImage ? (
                        <img
                            src={currentUser.ProfileImage}
                            alt="Profile"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    ) : (
                        <i className="bi bi-person-fill text-secondary" style={{ fontSize: '1.2rem' }}></i>
                    )}
                </div>

                <span className={`fw-medium text-secondary ${(dropdownOpen) ? 'text-primary' : ''}`}>
                    {currentUser.name}
                </span>
                <i className="bi bi-chevron-down ms-1 text-secondary" style={{ fontSize: '0.7rem' }}></i>
            </div>

            {/* Dropdown Menu */}
            {dropdownOpen && (
                <div
                    className="position-absolute bg-white shadow rounded py-2"
                    style={{
                        top: '100%', // Below the bar
                        right: 0,
                        marginTop: '8px',
                        minWidth: '150px',
                        zIndex: 1050,
                        border: '1px solid #e0e0e0'
                    }}
                >
                    <button
                        className="dropdown-item d-flex align-items-center px-3 py-2 w-100 text-start"
                        onClick={() => {
                            setDropdownOpen(false);
                            setShowModal(true);
                        }}
                        style={{ background: 'transparent', border: 'none', fontSize: '0.9rem' }}
                    >
                        <i className="bi bi-camera me-2"></i>
                        Update Photo
                    </button>
                    <button
                        className="dropdown-item d-flex align-items-center px-3 py-2 w-100 text-start text-danger"
                        onClick={() => {
                            setDropdownOpen(false);
                            logout();
                        }}
                        style={{ background: 'transparent', border: 'none', fontSize: '0.9rem' }}
                    >
                        <i className="bi bi-box-arrow-right me-2"></i>
                        Logout
                    </button>
                </div>
            )}

            <ProfileImageModal
                show={showModal}
                onClose={() => setShowModal(false)}
                onSave={handleImageSave}
            />
        </div>
    );
};

export default UserProfile;
