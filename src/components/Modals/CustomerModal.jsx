import React, { useState } from 'react';
import Modal from './Modal';
import { consultantTypeOptions } from '../../data/mockData';

const CustomerModal = ({ show, onClose, mode = 'Add', initialData = null, onSubmit, fixedCategory = null }) => {
    const defaultState = {
        Category: fixedCategory || 'Contractor',
        CompanyName: '',
        Address1: '',
        Address2: '',
        Rating: '',
        Type: '',
        FaxNo: '',
        Phone1: '',
        Phone2: '',
        EmailId: '',
        Website: '',
        Status: 'Active'
    };
    const [formData, setFormData] = useState(initialData || defaultState);

    React.useEffect(() => {
        setFormData(initialData || defaultState);
    }, [initialData, show]); // Reset when show changes too if needed, but mainly initialData

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.CompanyName || !formData.Address1 || !formData.Phone1) {
            alert('Please fill required fields (Company Name, Address 1, Phone 1)');
            return;
        }
        onSubmit(formData);
        onClose();
    };

    return (
        <Modal
            show={show}
            title={`CCC Details (${mode} Customer/Client/Consultant)`}
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
                            value={formData.Category}
                            onChange={(e) => handleChange('Category', e.target.value)}
                            disabled={!!fixedCategory}
                        >
                            <option>Contractor</option>
                            <option>Client</option>
                            <option>Consultant</option>
                        </select>
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">Company Name<span className="text-danger">*</span></label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.CompanyName} onChange={(e) => handleChange('CompanyName', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6">
                        <label className="form-label">Address 1<span className="text-danger">*</span></label>
                        <textarea className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Address1} onChange={(e) => handleChange('Address1', e.target.value)} />
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">Address 2</label>
                        <textarea className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Address2} onChange={(e) => handleChange('Address2', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-3">
                        <label className="form-label">Rating</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Rating} onChange={(e) => handleChange('Rating', e.target.value)} />
                    </div>
                    <div className="col-md-3">
                        <label className="form-label">Type</label>
                        <select className="form-select" style={{ fontSize: '13px' }}
                            value={formData.Type} onChange={(e) => handleChange('Type', e.target.value)}>
                            <option value="">-- Select Type --</option>
                            {consultantTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">Fax No.</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.FaxNo} onChange={(e) => handleChange('FaxNo', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6">
                        <label className="form-label">Phone 1<span className="text-danger">*</span></label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Phone1} onChange={(e) => handleChange('Phone1', e.target.value)} />
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">Phone 2</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Phone2} onChange={(e) => handleChange('Phone2', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6">
                        <label className="form-label">E-Mail ID</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.EmailId} onChange={(e) => handleChange('EmailId', e.target.value)} />
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">Website</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Website} onChange={(e) => handleChange('Website', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6">
                        <label className="form-label">Status</label>
                        <select className="form-select" style={{ fontSize: '13px' }}
                            value={formData.Status} onChange={(e) => handleChange('Status', e.target.value)}>
                            <option>Active</option>
                            <option>Inactive</option>
                        </select>
                    </div>
                </div>
            </form>
        </Modal>
    );
};

export default CustomerModal;
