import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import './Login.css';

const Login = ({ onSwitchToSignup }) => {
    const { login } = useAuth();

    // Steps: 'email', 'password', 'setup', 'forgot'
    const [step, setStep] = useState('email');

    const [formData, setFormData] = useState({
        email: '',
        password: '',
        newPassword: '',
        confirmPassword: '',
        rememberMe: false
    });

    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
        setError('');
    };

    // Step 1: Check Email
    const handleEmailSubmit = async (e) => {
        e.preventDefault();
        if (!formData.email) {
            setError('Please enter your email address');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('http://localhost:5000/api/auth/check-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email })
            });
            const data = await res.json();

            if (data.exists) {
                if (data.isFirstLogin) {
                    setStep('setup');
                } else {
                    setStep('password');
                }
            } else {
                setError('Email not found. Please contact administrator.');
            }
        } catch (err) {
            console.error(err);
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Step 2: Login
    const handleLogin = async (e) => {
        e.preventDefault();
        if (!formData.password) {
            setError('Please enter your password');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch('http://localhost:5000/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: formData.email,
                    password: formData.password
                }),
            });

            const data = await response.json();

            if (response.ok) {
                console.log('Login Success! User:', data.user);
                login({
                    id: data.user.UserID || data.user.ID, // Fallback if ID field name varies
                    name: data.user.FullName,
                    email: data.user.EmailId || data.user.MailId,
                    role: data.user.Roles || data.user.Role || 'User'
                });
            } else {
                setError(data.message || 'Login failed');
            }
        } catch (err) {
            console.error('Login error:', err);
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Step 3: Set Password (First Time)
    const handleSetPassword = async (e) => {
        e.preventDefault();
        if (!formData.newPassword || !formData.confirmPassword) {
            setError('Please fill all fields');
            return;
        }
        if (formData.newPassword !== formData.confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (formData.newPassword.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);
        try {
            const res = await fetch('http://localhost:5000/api/auth/set-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: formData.email,
                    newPassword: formData.newPassword
                })
            });

            if (res.ok) {
                // Auto login after setting password
                // Reuse handleLogin logic but with new password
                setFormData(prev => ({ ...prev, password: prev.newPassword }));
                // We need to trigger login, can't verify state update immediately, so call login API directly
                const loginRes = await fetch('http://localhost:5000/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: formData.email,
                        password: formData.newPassword
                    }),
                });
                const loginData = await loginRes.json();
                if (loginRes.ok) {
                    login({
                        id: loginData.user.UserID || loginData.user.ID,
                        name: loginData.user.FullName,
                        email: loginData.user.EmailId || loginData.user.MailId,
                        role: loginData.user.Roles || 'User'
                    });
                } else {
                    setStep('password');
                    setError('Password set, but auto-login failed. Please sign in.');
                }
            } else {
                setError('Failed to set password');
            }
        } catch (err) {
            setError('Error setting password');
        } finally {
            setLoading(false);
        }
    };

    // Step 4: Forgot Password
    const handleForgotPassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch('http://localhost:5000/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email })
            });
            const data = await res.json();
            if (res.ok) {
                setSuccessMsg(data.message || 'Reset link sent to your email.');
                setTimeout(() => {
                    setStep('password');
                    setSuccessMsg('');
                }, 3000);
            } else {
                setError(data.message || 'Failed to process request');
            }
        } catch (err) {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    };

    const renderStep = () => {
        switch (step) {
            case 'email':
                return (
                    <form onSubmit={handleEmailSubmit} className="login-form">
                        <div className="form-group">
                            <label htmlFor="email"><i className="bi bi-envelope me-2"></i>Email Address</label>
                            <input type="email" id="email" name="email" className="form-control"
                                placeholder="Enter your email" value={formData.email} onChange={handleChange} disabled={loading} autoFocus />
                        </div>
                        <button type="submit" className="btn btn-primary btn-login" disabled={loading}>
                            {loading ? 'Checking...' : 'Next'}
                        </button>
                    </form>
                );

            case 'password':
                return (
                    <form onSubmit={handleLogin} className="login-form">
                        <div className="mb-3 text-start">
                            <span className="badge bg-light text-dark border">{formData.email}</span>
                            <button type="button" className="btn btn-link btn-sm p-0 ms-2" onClick={() => { setStep('email'); setError(''); }}>Change</button>
                        </div>
                        <div className="form-group">
                            <label htmlFor="password"><i className="bi bi-lock me-2"></i>Password</label>
                            <div className="password-input-wrapper">
                                <input type={showPassword ? "text" : "password"} id="password" name="password" className="form-control"
                                    placeholder="Enter your password" value={formData.password} onChange={handleChange} disabled={loading} autoFocus />
                                <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} tabIndex="-1">
                                    <i className={`bi bi-eye${showPassword ? '-slash' : ''}`}></i>
                                </button>
                            </div>
                        </div>
                        <div className="d-flex justify-content-between align-items-center mb-3">
                            <div className="form-check">
                                <input type="checkbox" className="form-check-input" id="rememberMe" name="rememberMe"
                                    checked={formData.rememberMe} onChange={handleChange} disabled={loading} />
                                <label className="form-check-label" htmlFor="rememberMe">Remember me</label>
                            </div>
                            <button type="button" className="btn btn-link btn-sm p-0" onClick={() => { setStep('forgot'); setError(''); }}>Forgot Password?</button>
                        </div>
                        <button type="submit" className="btn btn-primary btn-login" disabled={loading}>
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>
                );

            case 'setup':
                return (
                    <form onSubmit={handleSetPassword} className="login-form">
                        <div className="alert alert-info py-2" style={{ fontSize: '0.9rem' }}>
                            <i className="bi bi-info-circle me-2"></i>First time login? Please set a password.
                        </div>
                        <div className="form-group">
                            <label>New Password</label>
                            <input type="password" name="newPassword" className="form-control"
                                placeholder="Create password" value={formData.newPassword} onChange={handleChange} disabled={loading} />
                        </div>
                        <div className="form-group">
                            <label>Confirm Password</label>
                            <input type="password" name="confirmPassword" className="form-control"
                                placeholder="Confirm password" value={formData.confirmPassword} onChange={handleChange} disabled={loading} />
                        </div>
                        <button type="submit" className="btn btn-success btn-login" disabled={loading}>
                            {loading ? 'Setting Password...' : 'Set Password & Login'}
                        </button>
                    </form>
                );

            case 'forgot':
                return (
                    <form onSubmit={handleForgotPassword} className="login-form">
                        <div className="mb-3">
                            <p className="text-muted small">Enter your email address and we'll send you a link to reset your password.</p>
                        </div>
                        <div className="form-group">
                            <label>Email Address</label>
                            <input type="email" className="form-control" value={formData.email} readOnly disabled />
                        </div>
                        <button type="submit" className="btn btn-warning btn-login text-white" disabled={loading}>
                            {loading ? 'Sending...' : 'Send Reset Link'}
                        </button>
                        <button type="button" className="btn btn-link w-100 mt-2" onClick={() => setStep('password')}>Back to Login</button>
                    </form>
                );

            default:
                return null;
        }
    };

    return (
        <div className="login-container">
            <div className="login-background">
                <div className="login-card">
                    <div className="login-header">
                        <div className="login-logo"><i className="bi bi-building"></i></div>
                        <h1>EMS Portal</h1>
                        <p>Enquiry Management System</p>
                    </div>

                    {error && (
                        <div className="alert alert-danger" role="alert">
                            <i className="bi bi-exclamation-circle me-2"></i>{error}
                        </div>
                    )}
                    {successMsg && (
                        <div className="alert alert-success" role="alert">
                            <i className="bi bi-check-circle me-2"></i>{successMsg}
                        </div>
                    )}

                    {renderStep()}

                    {step === 'email' && (
                        <div className="login-footer">
                            <p>Don't have an account? <button className="link-button" onClick={onSwitchToSignup} disabled={loading}>Sign up here</button></p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Login;
