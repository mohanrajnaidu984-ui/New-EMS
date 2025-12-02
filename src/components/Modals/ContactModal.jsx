import React, { useState } from 'react';
import Modal from './Modal';

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

    React.useEffect(() => {
        setFormData(initialData || defaultState);
    }, [initialData]);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.CompanyName || !formData.ContactName || !formData.Address1) {
            alert('Please fill required fields (Company Name, Contact Name, Address 1)');
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
                    <div className="col-md-6">
                        <label className="form-label">Company Name<span className="text-danger">*</span></label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.CompanyName} onChange={(e) => handleChange('CompanyName', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6">
                        <label className="form-label">Contact Person Name<span className="text-danger">*</span></label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.ContactName} onChange={(e) => handleChange('ContactName', e.target.value)} />
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
                    <div className="col-md-6">
                        <label className="form-label">Address 1<span className="text-danger">*</span></label>
                        <textarea className="form-control" style={{ fontSize: '13px', fontFamily: 'inherit' }}
                            value={formData.Address1} onChange={(e) => handleChange('Address1', e.target.value)} />
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
                    <div className="col-md-6">
                        <label className="form-label">Mobile 1</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Mobile1} onChange={(e) => handleChange('Mobile1', e.target.value)} />
                    </div>
                </div>
                <div className="row mb-2">
                    <div className="col-md-6">
                        <label className="form-label">Mobile 2</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.Mobile2} onChange={(e) => handleChange('Mobile2', e.target.value)} />
                    </div>
                    <div className="col-md-6">
                        <label className="form-label">E-Mail ID</label>
                        <input type="text" className="form-control" style={{ fontSize: '13px' }}
                            value={formData.EmailId} onChange={(e) => handleChange('EmailId', e.target.value)} />
                    </div>
                </div>
            </form>
        </Modal>
    );
};

export default ContactModal;
