import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';

const NotificationDropdown = ({ onOpenEnquiry }) => {
    const { currentUser } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const [unreadCount, setUnreadCount] = useState(0);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchNotifications = async () => {
        if (!currentUser) return;
        try {
            const res = await fetch(`/api/notifications/${currentUser.id}`);
            if (res.ok) {
                const data = await res.json();
                setNotifications(data);
                setUnreadCount(data.filter(n => !n.IsRead).length);
            }
        } catch (err) {
            console.error('Failed to fetch notifications', err);
        }
    };

    // Poll every 30s
    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 10000);
        return () => clearInterval(interval);
    }, [currentUser]);

    const handleRead = async (notification) => {
        if (!notification.IsRead) {
            try {
                await fetch(`/api/notifications/${notification.ID}/read`, { method: 'PUT' });
                // Update local state
                setNotifications(prev => prev.map(n => n.ID === notification.ID ? { ...n, IsRead: true } : n));
                setUnreadCount(prev => Math.max(0, prev - 1));
            } catch (err) {
                console.error(err);
            }
        }

        setIsOpen(false);

        // Navigate
        // Only navigate if LinkID is present and it is NOT 'Profile' or 'System' (which are markers for system msgs)
        const isSystemMsg = notification.LinkID === 'Profile' || notification.LinkID === 'System';
        if (notification.LinkID && onOpenEnquiry && !isSystemMsg) {
            onOpenEnquiry(notification.LinkID);
        }
    };

    const formatTime = (dateStr) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return date.toLocaleDateString();
    };

    const handleClearAll = async (e) => {
        e.stopPropagation();
        if (!currentUser) return;
        try {
            const res = await fetch(`/api/notifications/${currentUser.id}`, { method: 'DELETE' });
            if (res.ok) {
                setNotifications([]);
                setUnreadCount(0);
            }
        } catch (err) {
            console.error('Failed to clear notifications', err);
        }
    };

    const renderMessage = (message, linkId) => {
        if (!linkId) return message;

        // If message contains the linkId, replace it with a styled span
        // Otherwise just return appropriate text
        const parts = message.split(new RegExp(`(${linkId})`, 'gi'));
        return (
            <span>
                {parts.map((part, i) =>
                    part.toLowerCase() === linkId.toLowerCase() ? (
                        <span key={i} className="text-primary text-decoration-underline fw-bold">{part}</span>
                    ) : (
                        <span key={i}>{part}</span>
                    )
                )}
            </span>
        );
    };

    return (
        <div className="position-relative me-3" ref={dropdownRef}>
            <button
                className="btn btn-light position-relative rounded-circle d-flex align-items-center justify-content-center border-0 shadow-sm"
                style={{ width: '32px', height: '32px' }}
                onClick={() => setIsOpen(!isOpen)}
            >
                <i className="bi bi-bell fs-6 text-secondary"></i>
                {unreadCount > 0 && (
                    <span className="position-absolute top-0 end-0 badge rounded-pill bg-danger" style={{ fontSize: '0.6rem', marginTop: '0px', marginRight: '0px' }}>
                        {unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="card position-absolute end-0 mt-2 shadow-lg border-0" style={{ width: '350px', zIndex: 999, maxHeight: '400px', overflow: 'hidden' }}>
                    <div className="card-header bg-white border-bottom py-2 d-flex justify-content-between align-items-center">
                        <h6 className="mb-0 fw-bold">Notifications</h6>
                        {notifications.length > 0 && (
                            <button className="btn btn-link btn-sm text-decoration-none p-0" style={{ fontSize: '0.8rem' }} onClick={handleClearAll}>
                                Clear All
                            </button>
                        )}
                    </div>
                    <div className="card-body p-0" style={{ overflowY: 'auto', maxHeight: '350px' }}>
                        {notifications.length === 0 ? (
                            <div className="p-3 text-center text-muted small">No notifications</div>
                        ) : (
                            notifications.map(n => (
                                <div
                                    key={n.ID}
                                    className={`p-3 border-bottom cursor-pointer ${!n.IsRead ? 'bg-info bg-opacity-10' : ''}`}
                                    style={{ cursor: 'pointer', transition: 'background 0.2s' }}
                                    onClick={() => handleRead(n)}
                                    onMouseEnter={(e) => e.currentTarget.classList.add('bg-light')}
                                    onMouseLeave={(e) => e.currentTarget.classList.remove('bg-light')}
                                >
                                    <div className="d-flex justify-content-between mb-1">
                                        <small className={`fw-bold ${n.Type === 'Mention' ? 'text-primary' : 'text-dark'}`}>{n.Type}</small>
                                        <small className="text-muted" style={{ fontSize: '0.7rem' }}>{formatTime(n.CreatedAt)}</small>
                                    </div>
                                    <p className="mb-0 small text-secondary lh-sm">
                                        {renderMessage(n.Message, n.LinkID?.toString())}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationDropdown;
