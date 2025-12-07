import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import ProfileImageModal from '../Modals/ProfileImageModal';
import ChangePasswordModal from '../Modals/ChangePasswordModal';
import UserManagementModal from '../Modals/UserManagementModal';

const UserProfile = () => {
    const { currentUser, logout, updateProfileImage } = useAuth();
    const [showModal, setShowModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [showUserManagementModal, setShowUserManagementModal] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    const handleImageSave = (base64) => {
        updateProfileImage(currentUser.id, base64);
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setDropdownOpen(false);
            }
        };

        if (dropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [dropdownOpen]);

    if (!currentUser) return null;

    // Check Admin Role
    const roleString = currentUser.role || currentUser.Roles || '';
    const userRoles = typeof roleString === 'string'
        ? roleString.split(',').map(r => r.trim())
        : (Array.isArray(roleString) ? roleString : []);
    const isAdmin = userRoles.includes('Admin');

    return (
        <div ref={dropdownRef} className="d-flex align-items-center position-relative">
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
                        width: '42px',
                        height: '42px',
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
                        <i className="bi bi-person-fill text-secondary" style={{ fontSize: '1.5rem' }}></i>
                    )}
                </div>

                <span className={`fw-medium text-secondary ${(dropdownOpen) ? 'text-primary' : ''}`} style={{ fontSize: '16px' }}>
                    {currentUser.name}
                </span>
                <i className="bi bi-chevron-down ms-2 text-secondary" style={{ fontSize: '0.9rem' }}></i>
            </div>

            {/* Dropdown Menu */}
            {dropdownOpen && (
                <div
                    className="position-absolute bg-white shadow rounded py-2"
                    style={{
                        top: '100%', // Below the bar
                        right: 0,
                        marginTop: '8px',
                        minWidth: '180px',
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
                        className="dropdown-item d-flex align-items-center px-3 py-2 w-100 text-start"
                        onClick={() => {
                            setDropdownOpen(false);
                            setShowPasswordModal(true);
                        }}
                        style={{ background: 'transparent', border: 'none', fontSize: '0.9rem' }}
                    >
                        <i className="bi bi-key me-2"></i>
                        Change Password
                    </button>

                    {isAdmin && (
                        <button
                            className="dropdown-item d-flex align-items-center px-3 py-2 w-100 text-start"
                            onClick={() => {
                                setDropdownOpen(false);
                                setShowUserManagementModal(true);
                            }}
                            style={{ background: 'transparent', border: 'none', fontSize: '0.9rem' }}
                        >
                            <i className="bi bi-gear me-2"></i>
                            User Management
                        </button>
                    )}

                    <div className="dropdown-divider"></div>
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

            <ChangePasswordModal
                show={showPasswordModal}
                onClose={() => setShowPasswordModal(false)}
            />

            <UserManagementModal
                show={showUserManagementModal}
                onClose={() => setShowUserManagementModal(false)}
            />
        </div>
    );
};

export default UserProfile;
