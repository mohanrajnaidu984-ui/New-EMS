import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import ValidationTooltip from '../Common/ValidationTooltip';

const ContactModal = ({ show, onClose, mode = 'Add', initialData = null, onSubmit }) => {
    const defaultState = {
        Category: 'Contractor',
        CompanyName: '',
        ContactName: '',
        Designation: '',
        CategoryOfDesignation: 'Technical',
        Address1: '',
        Address2: '',
        FaxNo: '',
        Phone: '',
        Mobile1: '',
        Mobile2: '',
        EmailId: ''
    };
    const [formData, setFormData] = useState(initialData || defaultState);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (initialData) {
            setFormData({ ...defaultState, ...initialData });
        } else {
            setFormData(defaultState);
        }
        setErrors({});
    }, [initialData, show]);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: null }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const newErrors = {};

        // Email validation regex
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!formData.CompanyName) newErrors.CompanyName = 'Company Name is required';
        if (!formData.ContactName) newErrors.ContactName = 'Contact Person Name is required';
        if (!formData.Address1) newErrors.Address1 = 'Address 1 is required';
        if (!formData.Mobile1) newErrors.Mobile1 = 'Mobile 1 is required';
        if (!formData.EmailId) {
            newErrors.EmailId = 'E-Mail ID is required';
        } else if (!emailRegex.test(formData.EmailId.trim())) {
            newErrors.EmailId = 'Please enter a valid email address (e.g., user@example.com)';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        onSubmit(formData);
        onClose();
    };

    return (
        <Modal
            show={show}
            title={`Contact Person Details (${mode} Contact Person)`}
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
                    <div className="col-md-6">
                        <label className="form-label">Category</label>
                        <select className="form-select" style={{ fontSize: '13px' }}
                            value={formData.Category} onChange={(e) => handleChange('Category', e.target.value)}>
                            <option>Contractor</option>
                            <option>Client</option>
                            <option>Consultant</option>
                        </select>
                    </div>
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">Company Name<span className="text-danger">*</span></label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.CompanyName} onChange={(e) => handleChange('CompanyName', e.target.value)} />
                        {errors.CompanyName && <ValidationTooltip message={errors.CompanyName} />}
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">Contact Person Name<span className="text-danger">*</span></label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.ContactName} onChange={(e) => handleChange('ContactName', e.target.value)} />
                        {errors.ContactName && <ValidationTooltip message={errors.ContactName} />}
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">Designation</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Designation} onChange={(e) => handleChange('Designation', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6">
                        <label className="form-label">Category of Designation</label>
                        <select className="form-select" style={{ fontSize: '13px' }}
                            value={formData.CategoryOfDesignation} onChange={(e) => handleChange('CategoryOfDesignation', e.target.value)}>
                            <option>Technical</option>
                            <option>General</option>
                        </select>
                    </div>
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">Address 1<span className="text-danger">*</span></label>
                        <textarea className="form-control" style={{ fontSize: '13px', fontFamily: 'inherit' }}
                            value={formData.Address1} onChange={(e) => handleChange('Address1', e.target.value)} />
                        {errors.Address1 && <ValidationTooltip message={errors.Address1} />}
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6">
                        <label className="form-label">Address 2</label>
                        <textarea className="form-control" style={{ fontSize: '13px', fontFamily: 'inherit' }}
                            value={formData.Address2} onChange={(e) => handleChange('Address2', e.target.value)} />
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">Fax No.</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.FaxNo} onChange={(e) => handleChange('FaxNo', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6">
                        <label className="form-label">Phone</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Phone} onChange={(e) => handleChange('Phone', e.target.value)} />
                    </div>
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">Mobile 1<span className="text-danger">*</span></label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Mobile1} onChange={(e) => handleChange('Mobile1', e.target.value)} />
                        {errors.Mobile1 && <ValidationTooltip message={errors.Mobile1} />}
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6">
                        <label className="form-label">Mobile 2</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Mobile2} onChange={(e) => handleChange('Mobile2', e.target.value)} />
                    </div>
                    <div className="col-md-6" style={{ position: 'relative' }}>
                        <label className="form-label">E-Mail ID<span className="text-danger">*</span></label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.EmailId} onChange={(e) => handleChange('EmailId', e.target.value)} />
                        {errors.EmailId && <ValidationTooltip message={errors.EmailId} />}
                    </div>
                </div>
            </form>
        </Modal>
    );
};

export default ContactModal;
