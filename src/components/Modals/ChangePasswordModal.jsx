import React, { useState } from 'react';
import Modal from './Modal';
import { useAuth } from '../../context/AuthContext';

const ChangePasswordModal = ({ show, onClose }) => {
    const { currentUser } = useAuth();
    const [formData, setFormData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (formData.newPassword !== formData.confirmPassword) {
            setError('New passwords do not match');
            return;
        }

        if (formData.newPassword.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch('http://localhost:5000/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: currentUser.id,
                    currentPassword: formData.currentPassword,
                    newPassword: formData.newPassword
                })
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess('Password changed successfully!');
                setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                setTimeout(() => {
                    onClose();
                    setSuccess('');
                }, 2000);
            } else {
                setError(data.message || 'Failed to change password');
            }
        } catch (err) {
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            show={show}
            title="Change Password"
            onClose={onClose}
            footer={
                <>
                    <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
                        {loading ? 'Updating...' : 'Update Password'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
                </>
            }
        >
            <form onSubmit={handleSubmit}>
                {error && <div className="alert alert-danger py-2" style={{ fontSize: '0.9rem' }}>{error}</div>}
                {success && <div className="alert alert-success py-2" style={{ fontSize: '0.9rem' }}>{success}</div>}

                <div className="mb-3">
                    <label className="form-label">Current Password</label>
                    <input
                        type="password"
                        className="form-control"
                        name="currentPassword"
                        value={formData.currentPassword}
                        onChange={handleChange}
                        required
                    />
                </div>
                <div className="mb-3">
                    <label className="form-label">New Password</label>
                    <input
                        type="password"
                        className="form-control"
                        name="newPassword"
                        value={formData.newPassword}
                        onChange={handleChange}
                        required
                    />
                </div>
                <div className="mb-3">
                    <label className="form-label">Confirm New Password</label>
                    <input
                        type="password"
                        className="form-control"
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        required
                    />
                </div>
            </form>
        </Modal>
    );
};

export default ChangePasswordModal;
