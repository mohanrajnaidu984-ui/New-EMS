import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
                // Also check if click is inside the portal dropdown
                // Since portal is in body, we need a ref for it or handle it carefully.
                // We'll add a ref to the dropdown content below.
                const dropdownEl = document.getElementById('user-profile-dropdown');
                if (dropdownEl && dropdownEl.contains(event.target)) {
                    return;
                }
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
        ? roleString.split(',').map(r => r.trim().toLowerCase())
        : (Array.isArray(roleString) ? roleString.map(r => r.trim().toLowerCase()) : []);
    const isAdmin = userRoles.includes('admin');

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

                <span className={`fw-medium text-secondary ${(dropdownOpen) ? 'text-primary' : ''}`} style={{ fontSize: '11.2px' }}>
                    {currentUser.name}
                </span>
                <i className="bi bi-chevron-down ms-2 text-secondary" style={{ fontSize: '0.9rem' }}></i>
            </div>

            {/* Dropdown Menu - Portaled to Body */}
            {dropdownOpen && createPortal(
                <div
                    id="user-profile-dropdown"
                    className="position-fixed bg-white shadow rounded py-2"
                    style={{
                        top: '110px',
                        right: '80px',
                        minWidth: '220px',
                        zIndex: 20000,
                        border: '1px solid #e0e0e0'
                    }}
                >
                    <button
                        type="button"
                        className="d-flex align-items-center px-3 py-2 w-100 text-start btn btn-light rounded-0"
                        onClick={(e) => {
                            // alert("Update Photo Clicked");
                            console.log("Update Photo Clicked");
                            e.preventDefault();
                            e.stopPropagation();
                            setDropdownOpen(false);
                            setShowModal(true);
                        }}
                        style={{ background: 'transparent', border: 'none', fontSize: '0.9rem', cursor: 'pointer' }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                        <i className="bi bi-camera me-2"></i>
                        Update Photo
                    </button>
                    <button
                        type="button"
                        className="d-flex align-items-center px-3 py-2 w-100 text-start btn btn-light rounded-0"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDropdownOpen(false);
                            setShowPasswordModal(true);
                        }}
                        style={{ background: 'transparent', border: 'none', fontSize: '0.9rem', cursor: 'pointer' }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                        <i className="bi bi-key me-2"></i>
                        Change Password
                    </button>

                    {isAdmin && (
                        <button
                            type="button"
                            className="d-flex align-items-center px-3 py-2 w-100 text-start btn btn-light rounded-0"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDropdownOpen(false);
                                setShowUserManagementModal(true);
                            }}
                            style={{ background: 'transparent', border: 'none', fontSize: '0.9rem', cursor: 'pointer' }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        >
                            <i className="bi bi-gear me-2"></i>
                            User Management
                        </button>
                    )}

                    <div className="dropdown-divider"></div>
                    <button
                        type="button"
                        className="d-flex align-items-center px-3 py-2 w-100 text-start btn btn-light rounded-0 text-danger"
                        onClick={(e) => {
                            // alert("Logout Clicked");
                            console.log("Logout Clicked");
                            e.preventDefault();
                            e.stopPropagation();
                            setDropdownOpen(false);
                            // Call logout
                            logout();
                        }}
                        style={{ background: 'transparent', border: 'none', fontSize: '0.9rem', cursor: 'pointer' }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                    >
                        <i className="bi bi-box-arrow-right me-2"></i>
                        Logout
                    </button>
                </div>,
                document.body
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
