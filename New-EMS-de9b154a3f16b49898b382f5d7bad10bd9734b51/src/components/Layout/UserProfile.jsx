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
    const timeoutRef = useRef(null);

    const handleImageSave = (base64) => {
        updateProfileImage(currentUser.id, base64);
    };

    const handleMouseEnter = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setDropdownOpen(true);
    };

    const handleMouseLeave = () => {
        timeoutRef.current = setTimeout(() => {
            setDropdownOpen(false);
        }, 300); // 300ms delay before closing
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
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
        <div
            ref={dropdownRef}
            className="d-flex align-items-center position-relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* User Name & Dropdown Toggle */}
            <div
                className="d-flex align-items-center profile-trigger"
                style={{
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'all 0.2s ease',
                    padding: '4px 8px',
                    borderRadius: '8px',
                    marginLeft: '-4px' // Offset padding to keep alignment
                }}
                onClick={() => setDropdownOpen(!dropdownOpen)}
            >
                {/* Profile Image - Clickable */}
                <div
                    className="rounded-circle border d-flex align-items-center justify-content-center overflow-hidden me-2 profile-image-container"
                    style={{
                        width: '32px',
                        height: '32px',
                        backgroundColor: '#f0f2f5',
                        cursor: 'pointer',
                        transition: 'transform 0.2s ease'
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
                        <i className="bi bi-person-fill text-secondary" style={{ fontSize: '1rem' }}></i>
                    )}
                </div>

                <div className="d-flex align-items-center profile-text-group">
                    <span className={`fw-medium ${(dropdownOpen) ? 'text-primary' : 'text-secondary'}`} style={{ fontSize: '12px', transition: 'color 0.2s ease' }}>
                        {currentUser.name}
                    </span>
                    <i className="bi bi-chevron-down ms-1 text-secondary" style={{ fontSize: '0.85rem', transition: 'transform 0.2s ease' }}></i>
                </div>
            </div>

            {/* Dropdown Menu */}
            {dropdownOpen && (
                <div
                    id="user-profile-dropdown"
                    className="position-absolute bg-white shadow-lg rounded py-2"
                    style={{
                        top: '120%',
                        right: '0',
                        minWidth: '220px',
                        zIndex: 10000,
                        border: '1px solid #e0e0e0',
                        marginTop: '10px',
                        animation: 'fadeIn 0.2s ease-out'
                    }}
                >
                    <div className="px-3 py-2 border-bottom mb-1">
                        <div className="fw-bold text-dark" style={{ fontSize: '0.85rem' }}>{currentUser.name}</div>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>{currentUser.email || currentUser.EmailId}</div>
                    </div>

                    <button
                        type="button"
                        className="d-flex align-items-center px-3 py-2 w-100 text-start btn btn-light rounded-0 border-0"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDropdownOpen(false);
                            setShowModal(true);
                        }}
                        style={{ fontSize: '0.9rem', cursor: 'pointer', background: 'transparent' }}
                    >
                        <i className="bi bi-camera me-2"></i>
                        Update Photo
                    </button>

                    <button
                        type="button"
                        className="d-flex align-items-center px-3 py-2 w-100 text-start btn btn-light rounded-0 border-0"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDropdownOpen(false);
                            setShowPasswordModal(true);
                        }}
                        style={{ fontSize: '0.9rem', cursor: 'pointer', background: 'transparent' }}
                    >
                        <i className="bi bi-key me-2"></i>
                        Change Password
                    </button>

                    {isAdmin && (
                        <button
                            type="button"
                            className="d-flex align-items-center px-3 py-2 w-100 text-start btn btn-light rounded-0 border-0"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDropdownOpen(false);
                                setShowUserManagementModal(true);
                            }}
                            style={{ fontSize: '0.9rem', cursor: 'pointer', background: 'transparent' }}
                        >
                            <i className="bi bi-gear me-2"></i>
                            User Management
                        </button>
                    )}

                    <div className="dropdown-divider mx-2"></div>

                    <button
                        type="button"
                        className="d-flex align-items-center px-3 py-2 w-100 text-start btn btn-light rounded-0 border-0 text-danger"
                        onClick={(e) => {
                            console.log("Logout Clicked");
                            e.preventDefault();
                            e.stopPropagation();
                            setDropdownOpen(false);
                            logout();
                        }}
                        style={{ fontSize: '0.9rem', cursor: 'pointer', background: 'transparent' }}
                    >
                        <i className="bi bi-box-arrow-right me-2"></i>
                        Logout
                    </button>
                </div>
            )}
            <style>
                {`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                #user-profile-dropdown .btn-light:hover {
                    background-color: #f8f9fa !important;
                }
                .profile-trigger:hover {
                    background-color: rgba(13, 110, 253, 0.05);
                }
                .profile-trigger:hover .text-secondary {
                    color: #0d6efd !important;
                }
                .profile-trigger:hover .bi-chevron-down {
                    transform: translateY(2px);
                    color: #0d6efd !important;
                }
                .profile-image-container:hover {
                    transform: scale(1.05);
                    border-color: #0d6efd !important;
                }
                `}
            </style>

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
