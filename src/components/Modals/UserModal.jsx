import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { availableRoles } from '../../data/mockData';
import ValidationTooltip from '../Common/ValidationTooltip';

const defaultFormData = {
    FullName: '',
    Designation: '',
    EmailId: '',
    Status: 'Active',
    Department: 'MEP',
    Roles: []
};

const UserModal = ({ show, onClose, mode = 'Add', initialData = null, onSubmit }) => {
    const [formData, setFormData] = useState(defaultFormData);
    const [newRole, setNewRole] = useState('');
    const [errors, setErrors] = useState({});

    // Sync formData with initialData when it changes (for Edit mode)
    // Reset form when modal is closed
    useEffect(() => {
        if (initialData) {
            // Ensure Roles is an array (it might come as a comma-separated string from DB)
            let roles = initialData.Roles;
            if (typeof roles === 'string') {
                roles = roles.split(',').map(r => r.trim()).filter(r => r);
            } else if (!Array.isArray(roles)) {
                roles = [];
            }

            setFormData({
                ...initialData,
                Roles: roles
            });
        } else if (!show) {
            setFormData(defaultFormData);
            setNewRole('');
        }
        setErrors({});
    }, [initialData, show]);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: null }));
        }
    };

    const handleAddRole = () => {
        if (newRole && !formData.Roles.includes(newRole)) {
            setFormData(prev => ({ ...prev, Roles: [...prev.Roles, newRole] }));
            setNewRole('');
        }
    };

    const handleRemoveRole = () => {
        // Remove the last role from the list
        if (formData.Roles.length > 0) {
            setFormData(prev => ({ ...prev, Roles: prev.Roles.slice(0, -1) }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const newErrors = {};
        if (!formData.FullName) newErrors.FullName = 'Full Name is required';
        if (!formData.EmailId) newErrors.EmailId = 'E-Mail ID is required';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        // Convert Roles array to comma-separated string
        const payload = {
            ...formData,
            Roles: Array.isArray(formData.Roles) ? formData.Roles.join(',') : formData.Roles
        };
        onSubmit(payload);
        // Reset form is handled by useEffect on close/open or we can do it here if needed, 
        // but onClose usually triggers parent state change which triggers useEffect here.
        // For good measure:
        setFormData(defaultFormData);
        setNewRole('');
        onClose();
    };

    return (
        <Modal
            show={show}
            title={`User Details (${mode} User)`}
            onClose={onClose}
            footer={
                <>
                    <button type="button" className="btn btn-primary" style={{ width: '80px' }} onClick={handleSubmit}>
                        {mode === 'Add' ? 'Add' : 'Update'}
                    </button>
                    <button type="button" className="btn btn-danger" style={{ width: '80px' }} onClick={onClose}>Cancel</button>
                </>
            }
        >
            <form>
                <div className="row mb-2">
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">Full Name<span className="text-danger">*</span></label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.FullName} onChange={(e) => handleChange('FullName', e.target.value)} />
                        {errors.FullName && <ValidationTooltip message={errors.FullName} />}
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">Designation</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Designation} onChange={(e) => handleChange('Designation', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">E-Mail ID<span className="text-danger">*</span></label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.EmailId} onChange={(e) => handleChange('EmailId', e.target.value)} />
                        {errors.EmailId && <ValidationTooltip message={errors.EmailId} />}
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-3">
                        <label className="form-label">Status</label>
                        <select className="form-select" style={{ fontSize: '13px' }}
                            value={formData.Status} onChange={(e) => handleChange('Status', e.target.value)}>
                            <option>Active</option>
                            <option>Inactive</option>
                        </select>
                    </div>
                    <div className="col-md-3">
                        <label className="form-label">Department</label>
                        <select className="form-select" style={{ fontSize: '13px' }}
                            value={formData.Department} onChange={(e) => handleChange('Department', e.target.value)}>
                            <option>MEP</option>
                            <option>Civil</option>
                        </select>
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">Roles</label>
                        <select className="form-select mb-1" style={{ fontSize: '13px' }}
                            value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                            <option value="">-- Select Role --</option>
                            {availableRoles.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <div className="d-flex align-items-center mt-1">
                            <select className="form-select" multiple style={{ height: '70px', fontSize: '13px' }}>
                                {formData.Roles.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <div className="d-flex flex-column ms-1">
                                <button type="button" className="btn btn-outline-success mb-1" style={{ width: '36px', padding: '0.25rem 0.5rem' }} onClick={handleAddRole}>+</button>
                                <button type="button" className="btn btn-outline-danger" style={{ width: '36px', padding: '0.25rem 0.5rem' }} onClick={handleRemoveRole}>-</button>
                            </div>
                        </div>
                    </div>
                </div>
            </form>
        </Modal>
    );
};

export default UserModal;
