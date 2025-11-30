import React, { useState, useEffect, useRef } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import CustomerModal from '../Modals/CustomerModal';
import ContactModal from '../Modals/ContactModal';
import UserModal from '../Modals/UserModal';
import EnquiryItemModal from '../Modals/EnquiryItemModal';
import SearchableSelectControl from './SearchableSelectControl';
import ListBoxControl from './ListBoxControl';
import SearchEnquiry from './SearchEnquiry';

// --- Status Tracker Component ---
const StatusTracker = ({ status }) => {
    const steps = ['Received', 'Assigned', 'Quoted', 'Follow-up', 'Closed'];
    // Map backend status to frontend steps if needed, or assume they match
    // Assuming 'Enquiry' -> 'Received', 'Pricing' -> 'Assigned', 'Quote' -> 'Quoted', 'Probability' -> 'Follow-up', 'Reports' -> 'Closed'
    const statusMap = {
        'Enquiry': 'Received',
        'Pricing': 'Assigned',
        'Quote': 'Quoted',
        'Probability': 'Follow-up',
        'Reports': 'Closed'
    };

    const currentStatusLabel = statusMap[status] || status || 'Received';
    const currentStepIndex = steps.indexOf(currentStatusLabel);

    return (
        <div className="card mb-4 border-0 shadow-sm">
            <div className="card-body p-4">
                <h5 className="mb-4 fw-bold text-dark">Enquiry Status Tracker</h5>
                <div className="position-relative d-flex justify-content-between align-items-center" style={{ margin: '0 40px' }}>
                    {/* Progress Line Background */}
                    <div className="position-absolute w-100" style={{ height: '2px', backgroundColor: '#E0E0E0', top: '20px', zIndex: 0 }}></div>

                    {/* Progress Line Active */}
                    <div
                        className="position-absolute"
                        style={{
                            height: '2px',
                            backgroundColor: '#4285F4',
                            top: '20px',
                            zIndex: 0,
                            width: `${(currentStepIndex / (steps.length - 1)) * 100}%`,
                            transition: 'width 0.5s ease'
                        }}
                    ></div>

                    {steps.map((step, index) => {
                        const isCompleted = index < currentStepIndex;
                        const isActive = index === currentStepIndex;

                        return (
                            <div key={step} className="d-flex flex-column align-items-center" style={{ zIndex: 1 }}>
                                <div
                                    className={`rounded-circle d-flex align-items-center justify-content-center fw-bold ${isActive || isCompleted ? 'bg-primary text-white' : 'bg-light text-muted'}`}
                                    style={{
                                        width: '40px',
                                        height: '40px',
                                        backgroundColor: isActive || isCompleted ? '#4285F4' : '#E9ECEF',
                                        color: isActive || isCompleted ? '#fff' : '#6C757D',
                                        transition: 'all 0.3s ease'
                                    }}
                                >
                                    {isCompleted ? <i className="bi bi-check-lg"></i> : index + 1}
                                </div>
                                <div
                                    className={`mt-2 fw-bold ${isActive ? 'text-primary' : 'text-muted'}`}
                                    style={{ fontSize: '0.85rem', color: isActive ? '#4285F4' : '#6C757D' }}
                                >
                                    {step}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const ParticleBackground = () => null; // Removed for cleaner UI

const EnquiryForm = ({ requestNoToOpen }) => {
    const { masters, addEnquiry, updateEnquiry, getEnquiry, updateMasters, addMaster, updateMaster } = useData();
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState('New');

    // Modal States
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [showContactModal, setShowContactModal] = useState(false);
    const [showUserModal, setShowUserModal] = useState(false);
    const [showEnqItemModal, setShowEnqItemModal] = useState(false);

    // Edit States
    const [editData, setEditData] = useState(null);
    const [modalMode, setModalMode] = useState('Add');
    const [fixedCategory, setFixedCategory] = useState(null);

    // Modify State
    // Modify State
    // Modify State
    const [isModifyMode, setIsModifyMode] = useState(false);
    const [modifyRequestNo, setModifyRequestNo] = useState('');

    // Form State
    const initialFormState = {
        SourceOfInfo: '',
        EnquiryDate: new Date().toLocaleDateString('en-CA'),
        DueOn: '',
        SiteVisitDate: '',
        EnquiryType: '',
        EnquiryFor: '',
        CustomerName: '',
        ReceivedFrom: '',
        ProjectName: '',
        ClientName: '',
        ConsultantName: '',
        ConcernedSE: '',
        DetailsOfEnquiry: '',
        DocumentsReceived: '',
        hardcopy: false,
        drawing: false,
        dvd: false,
        spec: false,
        eqpschedule: false,
        Remark: '',
        AutoAck: false,
        ceosign: false,
        Status: 'Enquiry'
    };

    const [formData, setFormData] = useState(initialFormState);

    // ListBox States
    const [enqTypeList, setEnqTypeList] = useState([]);
    const [enqForList, setEnqForList] = useState([]);
    const [customerList, setCustomerList] = useState([]);
    const [receivedFromList, setReceivedFromList] = useState([]);
    const [seList, setSeList] = useState([]);

    // Validation Errors
    const [errors, setErrors] = useState({});
    const [attachments, setAttachments] = useState([]);
    const [pendingFiles, setPendingFiles] = useState([]); // New state for deferred uploads
    const [ackSEList, setAckSEList] = useState([]); // SEs selected for acknowledgement mail

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }
    };

    // Handle RequestNo generation or Loading Enquiry
    useEffect(() => {
        if (activeTab === 'New' && !isModifyMode) {
            // Fetch unique RequestNo from server
            const fetchRequestNo = async () => {
                try {
                    const res = await fetch('http://localhost:5000/api/generate-request-no');
                    if (res.ok) {
                        const data = await res.json();
                        setFormData(prev => ({ ...prev, RequestNo: data.requestNo }));
                    } else {
                        console.error('Failed to generate RequestNo');
                    }
                } catch (err) {
                    console.error('Error fetching RequestNo:', err);
                }
            };
            fetchRequestNo();
        }
    }, [activeTab, isModifyMode]);

    const loadEnquiryForEdit = async (reqNo) => {
        console.log('Loading enquiry for edit:', reqNo);
        try {
            const enq = getEnquiry(reqNo);
            if (enq) {
                // Helper to format date for input (YYYY-MM-DD)
                const formatDate = (d) => {
                    if (!d) return '';
                    try {
                        return new Date(d).toISOString().split('T')[0];
                    } catch (e) { return ''; }
                };

                // Map DB fields to Form State
                const mappedData = {
                    ...enq,
                    SourceOfInfo: enq.SourceOfEnquiry || enq.SourceOfInfo,
                    DetailsOfEnquiry: enq.EnquiryDetails || enq.DetailsOfEnquiry,
                    Remark: enq.Remarks || enq.Remark,
                    DocumentsReceived: enq.OthersSpecify || enq.DocumentsReceived,
                    EnquiryDate: formatDate(enq.EnquiryDate),
                    DueOn: formatDate(enq.DueDate || enq.DueOn),
                    SiteVisitDate: formatDate(enq.SiteVisitDate),
                    hardcopy: enq.Doc_HardCopies !== undefined ? !!enq.Doc_HardCopies : !!enq.hardcopy,
                    drawing: enq.Doc_Drawing !== undefined ? !!enq.Doc_Drawing : !!enq.drawing,
                    dvd: enq.Doc_CD_DVD !== undefined ? !!enq.Doc_CD_DVD : !!enq.dvd,
                    spec: enq.Doc_Spec !== undefined ? !!enq.Doc_Spec : !!enq.spec,
                    eqpschedule: enq.Doc_EquipmentSchedule !== undefined ? !!enq.Doc_EquipmentSchedule : !!enq.eqpschedule,
                    ceosign: enq.ED_CEOSignatureRequired !== undefined ? !!enq.ED_CEOSignatureRequired : !!enq.ceosign,
                    AutoAck: enq.SendAcknowledgementMail !== undefined ? !!enq.SendAcknowledgementMail : !!enq.AutoAck
                };

                setFormData(mappedData);
                // Parse comma-separated strings back into arrays
                setEnqTypeList(enq.SelectedEnquiryTypes || (enq.EnquiryType ? enq.EnquiryType.split(',').filter(Boolean) : []));
                setEnqForList(enq.SelectedEnquiryFor || (enq.EnquiryFor ? enq.EnquiryFor.split(',').filter(Boolean) : []));
                setCustomerList(enq.SelectedCustomers || (enq.CustomerName ? enq.CustomerName.split(',').filter(Boolean) : []));
                setReceivedFromList(enq.SelectedReceivedFroms || (enq.ReceivedFrom ? enq.ReceivedFrom.split(',').filter(Boolean) : []));
                const seList = enq.SelectedConcernedSEs || (enq.ConcernedSE ? enq.ConcernedSE.split(',').filter(Boolean) : []);
                setSeList(seList);
                setAckSEList(seList);
                setIsModifyMode(true);

                if (enq.RequestNo) {
                    await loadAttachmentsForEnquiry(enq.RequestNo);
                }
            } else {
                console.error('Enquiry not found:', reqNo);
                alert('Enquiry not found! Please try searching again.');
            }
        } catch (err) {
            console.error('Error loading enquiry:', err);
        }
    };



    // --- ListBox Handlers ---
    const handleAddEnqType = () => {
        if (formData.EnquiryType && !enqTypeList.includes(formData.EnquiryType)) {
            setEnqTypeList([...enqTypeList, formData.EnquiryType]);
            handleInputChange('EnquiryType', '');
            // Clear error if exists
            if (errors.EnquiryType) {
                setErrors(prev => {
                    const { EnquiryType, ...rest } = prev;
                    return rest;
                });
            }
        }
    };

    const handleAddEnqFor = () => {
        if (formData.EnquiryFor && !enqForList.includes(formData.EnquiryFor)) {
            setEnqForList([...enqForList, formData.EnquiryFor]);
            handleInputChange('EnquiryFor', '');
            // Clear error if exists
            if (errors.EnquiryFor) {
                setErrors(prev => {
                    const { EnquiryFor, ...rest } = prev;
                    return rest;
                });
            }
        }
    };

    const onAddCustomerClick = () => {
        try {
            // alert('onAddCustomerClick called');
            if (formData.CustomerName) {
                if (!customerList.includes(formData.CustomerName)) {
                    setCustomerList([...customerList, formData.CustomerName]);
                } else {
                    alert('Customer already added to the list');
                }

                // alert('Clearing CustomerName');
                handleInputChange('CustomerName', '');

                // alert('Clearing ReceivedFrom');
                handleInputChange('ReceivedFrom', '');

                // Clear error if exists
                if (errors.CustomerName) {
                    setErrors(prev => {
                        const { CustomerName, ...rest } = prev;
                        return rest;
                    });
                }
            }
        } catch (err) {
            console.error('Error in onAddCustomerClick:', err);
            alert('Error: ' + err.message);
        }
    };

    const handleAddReceivedFrom = () => {
        if (formData.ReceivedFrom && !receivedFromList.includes(formData.ReceivedFrom)) {
            setReceivedFromList([...receivedFromList, formData.ReceivedFrom]);

            // Auto-add customer if not present
            const parts = formData.ReceivedFrom.split('|');
            if (parts.length >= 2) {
                const company = parts[1];
                if (company && !customerList.includes(company)) {
                    setCustomerList(prev => [...prev, company]);
                }
            }

            handleInputChange('ReceivedFrom', '');
            handleInputChange('CustomerName', ''); // Sync clear customer selection

            // Clear error if exists
            if (errors.ReceivedFrom) {
                setErrors(prev => {
                    const { ReceivedFrom, ...rest } = prev;
                    return rest;
                });
            }
        }
    };

    const handleAddSE = () => {
        if (formData.ConcernedSE && !seList.includes(formData.ConcernedSE)) {
            setSeList([...seList, formData.ConcernedSE]);
            handleInputChange('ConcernedSE', '');
            // Clear error if exists
            if (errors.ConcernedSE) {
                setErrors(prev => {
                    const { ConcernedSE, ...rest } = prev;
                    return rest;
                });
            }
        }
    };

    const handleRemoveCustomer = () => {
        if (customerList.length > 0) {
            const removedCustomer = customerList[customerList.length - 1];
            setCustomerList(customerList.slice(0, -1));

            // Sync: Remove contacts belonging to this customer
            const newReceivedFromList = receivedFromList.filter(item => {
                const [, company] = item.split('|');
                return company !== removedCustomer;
            });
            setReceivedFromList(newReceivedFromList);
        }
    };

    const handleRemoveReceivedFrom = () => {
        if (receivedFromList.length > 0) {
            const removedItem = receivedFromList[receivedFromList.length - 1];
            const [, removedCompany] = removedItem.split('|');

            const newReceivedFromList = receivedFromList.slice(0, -1);
            setReceivedFromList(newReceivedFromList);

            // Sync: Only remove the company if NO other contacts from that company remain
            const hasOtherContacts = newReceivedFromList.some(item => {
                const [, company] = item.split('|');
                return company === removedCompany;
            });

            if (!hasOtherContacts) {
                setCustomerList(prev => prev.filter(c => c !== removedCompany));
            }
        }
    };

    const handleRemoveItem = (list, setList) => {
        if (list.length > 0) {
            setList(list.slice(0, -1));
        }
    };

    // --- Modal Open Handlers ---
    const openNewModal = (setter, category = null) => {
        setEditData(null);
        setModalMode('Add');
        setFixedCategory(category);
        setter(true);
    };

    const handleEditEnqFor = () => {
        const selected = formData.EnquiryFor;
        if (!selected) return alert("Select an item to edit");
        const itemData = masters.enqItems.find(i => i.ItemName === selected);
        if (itemData) {
            setEditData(itemData);
            setModalMode('Edit');
            setShowEnqItemModal(true);
        }
    };

    const handleEditCustomer = () => {
        const selected = formData.CustomerName;
        if (!selected) return alert("Select a customer to edit");
        const custData = masters.customers.find(c => c.CompanyName === selected);
        if (custData) {
            setEditData(custData);
            setModalMode('Edit');
            setFixedCategory('Contractor');
            setShowCustomerModal(true);
        }
    };

    const handleEditContact = () => {
        const selected = formData.ReceivedFrom;
        if (!selected) return alert("Select a contact to edit");
        const [name, company] = selected.split('|');
        const contactData = masters.contacts.find(c => c.ContactName === name && c.CompanyName === company);
        if (contactData) {
            setEditData(contactData);
            setModalMode('Edit');
            setShowContactModal(true);
        }
    };

    const handleEditClient = () => {
        const selected = formData.ClientName;
        if (!selected) return alert("Select a client to edit");
        const custData = masters.customers.find(c => c.CompanyName === selected);
        if (custData) {
            setEditData(custData);
            setModalMode('Edit');
            setFixedCategory('Client');
            setShowCustomerModal(true);
        } else {
            console.error('Client not found in masters.customers:', selected);
            alert("Client details not found in master data.");
        }
    };

    const handleEditConsultant = () => {
        const selected = formData.ConsultantName;
        if (!selected) return alert("Select a consultant to edit");
        const custData = masters.customers.find(c => c.CompanyName === selected);
        if (custData) {
            setEditData(custData);
            setModalMode('Edit');
            setFixedCategory('Consultant');
            setShowCustomerModal(true);
        } else {
            console.error('Consultant not found in masters.customers:', selected);
            alert("Consultant details not found in master data.");
        }
    };

    const handleEditSE = () => {
        const selected = formData.ConcernedSE;
        if (!selected) return alert("Select a SE to edit");
        const userData = masters.users.find(u => u.FullName === selected);
        if (userData) {
            setEditData(userData);
            setModalMode('Edit');
            setShowUserModal(true);
        }
    };

    // --- Modal Submit Handlers ---
    const handleCustomerSubmit = async (data) => {
        console.log('handleCustomerSubmit data:', data);
        if (modalMode === 'Add') {
            await addMaster('customer', { ...data, RequestNo: formData.RequestNo });


            // Update specific list based on category
            if (data.Category === 'Contractor') {
                handleInputChange('CustomerName', data.CompanyName);
                updateMasters(prev => ({
                    ...prev,
                    existingCustomers: [...prev.existingCustomers, data.CompanyName],
                    customers: [...prev.customers, data]
                }));
            } else if (data.Category === 'Client') {
                handleInputChange('ClientName', data.CompanyName);
                updateMasters(prev => ({
                    ...prev,
                    clientNames: [...prev.clientNames, data.CompanyName],
                    customers: [...prev.customers, data]
                }));
            } else if (data.Category === 'Consultant') {
                handleInputChange('ConsultantName', data.CompanyName);
                updateMasters(prev => ({
                    ...prev,
                    consultantNames: [...prev.consultantNames, data.CompanyName],
                    customers: [...prev.customers, data]
                }));
            }
        } else {
            if (data.ID) {
                const success = await updateMaster('customer', data.ID, data);
                if (success) {
                    updateMasters(prev => ({
                        ...prev,
                        customers: prev.customers.map(c => c.ID == data.ID ? data : c),
                        // Update contacts if company name changed
                        contacts: prev.contacts.map(c => c.CompanyName === editData.CompanyName ? { ...c, CompanyName: data.CompanyName } : c),
                        // Update lists if name changed
                        existingCustomers: prev.existingCustomers.map(name => name === editData.CompanyName ? data.CompanyName : name),
                        clientNames: prev.clientNames.map(name => name === editData.CompanyName ? data.CompanyName : name),
                        consultantNames: prev.consultantNames.map(name => name === editData.CompanyName ? data.CompanyName : name)
                    }));

                    // Update local lists
                    setCustomerList(prev => prev.map(name => name === editData.CompanyName ? data.CompanyName : name));
                    setReceivedFromList(prev => prev.map(item => {
                        const [contact, company] = item.split('|');
                        if (company === editData.CompanyName) {
                            return `${contact}| ${data.CompanyName} `;
                        }
                        return item;
                    }));

                    // Update form field if currently selected
                    if (formData.CustomerName === editData.CompanyName) handleInputChange('CustomerName', data.CompanyName);
                    if (formData.ClientName === editData.CompanyName) handleInputChange('ClientName', data.CompanyName);
                    if (formData.ConsultantName === editData.CompanyName) handleInputChange('ConsultantName', data.CompanyName);

                    if (formData.ReceivedFrom) {
                        const [contact, company] = formData.ReceivedFrom.split('|');
                        if (company === editData.CompanyName) {
                            handleInputChange('ReceivedFrom', `${contact}| ${data.CompanyName} `);
                        }
                    }

                    setEditData(data);
                } else {
                    alert('Failed to update customer');
                }
            }
        }
    };

    const handleContactSubmit = async (data) => {
        console.log('handleContactSubmit data:', data);
        if (modalMode === 'Add') {
            await addMaster('contact', { ...data, RequestNo: formData.RequestNo });
            updateMasters(prev => {
                const newContacts = [...prev.contacts, data];
                const newCustomers = prev.existingCustomers.includes(data.CompanyName)
                    ? prev.existingCustomers
                    : [...prev.existingCustomers, data.CompanyName];
                return { ...prev, contacts: newContacts, existingCustomers: newCustomers };
            });
            handleInputChange('CustomerName', data.CompanyName);
            const val = `${data.ContactName}| ${data.CompanyName} `;
            handleInputChange('ReceivedFrom', val);
        } else {
            if (data.ID) {
                const success = await updateMaster('contact', data.ID, data);
                if (success) {
                    updateMasters(prev => ({
                        ...prev,
                        contacts: prev.contacts.map(c => c.ID == data.ID ? data : c)
                    }));

                    // Robust update strategy: Find the item in the list that matches the edited data
                    // We use editData (which opened the modal) to find the target in the list
                    const newVal = `${data.ContactName}| ${data.CompanyName} `;
                    let actualOldVal = formData.ReceivedFrom;

                    // Find index in the current list
                    const listIndex = receivedFromList.findIndex(item => {
                        const [n, c] = item.split('|');
                        return n.trim() === editData.ContactName.trim() && c.trim() === editData.CompanyName.trim();
                    });

                    if (listIndex !== -1) {
                        actualOldVal = receivedFromList[listIndex];
                        // Update list using index
                        setReceivedFromList(prev => {
                            const newArr = [...prev];
                            newArr[listIndex] = newVal;
                            return newArr;
                        });
                    } else {
                        // Fallback: try to update by value if not found by strict match
                        setReceivedFromList(prev => prev.map(val => val === actualOldVal ? newVal : val));
                    }

                    // Update form input if it matches the old value
                    if (formData.ReceivedFrom === actualOldVal) {
                        handleInputChange('ReceivedFrom', newVal);
                    }

                    // Handle Company Name change
                    if (data.CompanyName !== editData.CompanyName) {
                        // Add new company to customer list if not present
                        setCustomerList(prev => prev.includes(data.CompanyName) ? prev : [...prev, data.CompanyName]);

                        // If Customer Name matched old company (loose match), update it
                        if (formData.CustomerName && formData.CustomerName.trim() === editData.CompanyName.trim()) {
                            handleInputChange('CustomerName', data.CompanyName);
                        }
                    }

                    setEditData(data);
                } else {
                    alert('Failed to update contact');
                }
            }
        }
    };

    const handleUserSubmit = async (data) => {
        if (modalMode === 'Add') {
            await addMaster('user', { ...data, RequestNo: formData.RequestNo });
            handleInputChange('ConcernedSE', data.FullName);
            updateMasters(prev => ({
                ...prev,
                users: [...prev.users, data],
                concernedSEs: [...prev.concernedSEs, data.FullName]
            }));
        } else {
            if (data.ID) {
                const success = await updateMaster('user', data.ID, data);
                if (success) {
                    updateMasters(prev => ({
                        ...prev,
                        users: prev.users.map(u => u.ID == data.ID ? data : u),
                        concernedSEs: prev.concernedSEs.map(name => name === editData.FullName ? data.FullName : name)
                    }));
                    if (formData.ConcernedSE === editData.FullName) {
                        handleInputChange('ConcernedSE', data.FullName);
                    }
                    setEditData(data);
                } else {
                    alert('Failed to update user');
                }
            }
        }
    };

    const handleEnqItemSubmit = async (data) => {
        console.log('handleEnqItemSubmit data:', data);
        if (modalMode === 'Add') {
            await addMaster('enquiryItem', { ...data, RequestNo: formData.RequestNo });
            handleInputChange('EnquiryFor', data.ItemName);
            updateMasters(prev => ({
                ...prev,
                enqItems: [...prev.enqItems, data],
                enquiryFor: [...prev.enquiryFor, data.ItemName]
            }));
        } else {
            if (data.ID) {
                console.log('Updating ID:', data.ID);
                const success = await updateMaster('enquiryItem', data.ID, data);
                console.log('Update success:', success);
                if (success) {
                    updateMasters(prev => {
                        const newItems = prev.enqItems.map(item => item.ID == data.ID ? data : item);
                        console.log('Updated enqItems:', newItems);
                        return {
                            ...prev,
                            enqItems: newItems,
                            enquiryFor: prev.enquiryFor.map(name => name === editData.ItemName ? data.ItemName : name)
                        };
                    });

                    // Update selected list if the name changed
                    setEnqForList(prev => prev.map(name => name === editData.ItemName ? data.ItemName : name));

                    if (formData.EnquiryFor === editData.ItemName) {
                        handleInputChange('EnquiryFor', data.ItemName);
                    }
                    setEditData(data);
                } else {
                    alert('Failed to update item');
                }
            } else {
                console.error('No ItemID in data:', data);
            }
        }
    };

    // --- Validation Effect ---
    useEffect(() => {
        if (formData.EnquiryDate && formData.DueOn) {
            if (new Date(formData.DueOn) < new Date(formData.EnquiryDate)) {
                setErrors(prev => ({ ...prev, DueOn: 'Due Date cannot be before Enquiry Date' }));
            } else {
                setErrors(prev => {
                    const { DueOn, ...rest } = prev;
                    return rest;
                });
            }
        }
    }, [formData.EnquiryDate, formData.DueOn]);

    // --- Main Form Submit ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        const newErrors = {};

        // Auto-add logic removed as functions are undefined and data requires full modal input
        // if (formData.EnquiryFor && !enqForList.includes(formData.EnquiryFor)) {
        //     handleAddEnqFor();
        // }
        // if (formData.CustomerName && !customerList.includes(formData.CustomerName)) {
        //     handleAddCustomer();
        // }
        // if (formData.ReceivedFrom && !receivedFromList.includes(formData.ReceivedFrom)) {
        //     handleAddReceivedFrom();
        // }
        // if (formData.ConcernedSE && !seList.includes(formData.ConcernedSE)) {
        //     handleAddSE();
        // }

        // Validate Required Fields
        const requiredFields = {
            'SourceOfInfo': formData.SourceOfInfo,
            'EnquiryDate': formData.EnquiryDate,
            'DueOn': formData.DueOn,
            'EnquiryType': enqTypeList.length > 0,
            'EnquiryFor': enqForList.length > 0,
            'CustomerName': customerList.length > 0,
            'ReceivedFrom': receivedFromList.length > 0,
            'ProjectName': formData.ProjectName,
            'ClientName': formData.ClientName,
            'ConcernedSE': seList.length > 0,
            'DetailsOfEnquiry': formData.DetailsOfEnquiry
        };

        Object.keys(requiredFields).forEach(field => {
            if (!requiredFields[field]) newErrors[field] = 'Required';
        });

        // Date Validation Check
        if (formData.EnquiryDate && formData.DueOn && new Date(formData.DueOn) < new Date(formData.EnquiryDate)) {
            newErrors.DueOn = 'Due Date cannot be before Enquiry Date';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        const payload = {
            ...formData,
            SelectedEnquiryTypes: enqTypeList,
            SelectedEnquiryFor: enqForList,
            SelectedCustomers: customerList,
            SelectedReceivedFroms: receivedFromList,
            SelectedConcernedSEs: seList,
            AcknowledgementSE: ackSEList[0] || '',
            CreatedBy: currentUser?.name || 'System'
        };

        if (isModifyMode) {
            // Check if enquiry is closed (Status = Reports)
            if (formData.Status === 'Reports') {
                const confirmed = window.confirm(
                    'This enquiry has already been closed (Status: Reports).\n\n' +
                    'Are you sure you want to modify it?'
                );
                if (!confirmed) {
                    return; // User cancelled
                }
            }
            updateEnquiry(formData.RequestNo, payload);

            // Upload pending files if any
            if (pendingFiles.length > 0) {
                await uploadPendingFiles(formData.RequestNo);
            }

            alert(`Enquiry Updated: ${formData.RequestNo} `);
        } else {
            // RequestNo is already generated in useEffect
            await addEnquiry(payload);

            // Upload pending files if any BEFORE resetting form
            if (pendingFiles.length > 0) {
                await uploadPendingFiles(formData.RequestNo);
            }

            alert(`Enquiry Added: ${formData.RequestNo} `);
            resetForm();
        }
    };

    const uploadPendingFiles = async (requestNo) => {
        const uploadData = new FormData();
        pendingFiles.forEach(fileObj => {
            uploadData.append('files', fileObj.file, fileObj.fileName);
        });

        try {
            // Send RequestNo as query parameter
            const res = await fetch(`http://localhost:5000/api/attachments/upload?requestNo=${encodeURIComponent(requestNo)}`, {
                method: 'POST',
                body: uploadData
            });

            if (res.ok) {
                console.log('Pending files uploaded successfully');
                setPendingFiles([]); // Clear pending
                // Refresh attachments to show uploaded files
                await fetchAttachments();
            } else {
                const errorText = await res.text();
                console.error('Failed to upload pending files:', errorText);
                alert(`Enquiry saved, but failed to upload pending files: ${errorText}`);
            }
        } catch (err) {
            console.error('Error uploading pending files:', err);
            alert(`Enquiry saved, but error uploading pending files: ${err.message}`);
        }
    };

    const resetForm = () => {
        setFormData(initialFormState);
        setEnqTypeList([]);
        setEnqForList([]);
        setCustomerList([]);
        setReceivedFromList([]);
        setSeList([]);
        setAckSEList([]); // Clear acknowledgement SE list
        setIsModifyMode(false);
        setModifyRequestNo('');
        setAttachments([]);
        setPendingFiles([]);
    };

    // --- Modify Logic ---
    const handleLoadEnquiry = async () => {
        const enq = getEnquiry(modifyRequestNo);
        if (enq) {
            setFormData(enq);
            // Parse comma-separated strings back into arrays
            setEnqTypeList(enq.SelectedEnquiryTypes || (enq.EnquiryType ? enq.EnquiryType.split(',').filter(Boolean) : []));
            setEnqForList(enq.SelectedEnquiryFor || (enq.EnquiryFor ? enq.EnquiryFor.split(',').filter(Boolean) : []));
            setCustomerList(enq.SelectedCustomers || (enq.CustomerName ? enq.CustomerName.split(',').filter(Boolean) : []));
            setReceivedFromList(enq.SelectedReceivedFroms || (enq.ReceivedFrom ? enq.ReceivedFrom.split(',').filter(Boolean) : []));
            setSeList(enq.SelectedConcernedSEs || (enq.ConcernedSE ? enq.ConcernedSE.split(',').filter(Boolean) : []));
            setIsModifyMode(true);
            // Load attachments for this enquiry
            if (enq.RequestNo) {
                await loadAttachmentsForEnquiry(enq.RequestNo);
            }
        } else {
            alert('Enquiry not found!');
        }
    };

    const handleOpenFromSearch = (reqNo) => {
        console.log('handleOpenFromSearch called with:', reqNo);
        setModifyRequestNo(reqNo);
        setActiveTab('Modify');
        setTimeout(async () => {
            try {
                const enq = getEnquiry(reqNo);
                console.log('Fetched enquiry for Modify:', enq);
                console.log('Full Enquiry Object:', enq); // Added for debugging
                if (enq) {
                    // Helper to format date for input (YYYY-MM-DD)
                    const formatDate = (d) => {
                        if (!d) return '';
                        try {
                            return new Date(d).toISOString().split('T')[0];
                        } catch (e) { return ''; }
                    };

                    // Map DB fields to Form State
                    const mappedData = {
                        ...enq,
                        SourceOfInfo: enq.SourceOfEnquiry || enq.SourceOfInfo, // Map DB 'SourceOfEnquiry' to State 'SourceOfInfo'
                        DetailsOfEnquiry: enq.EnquiryDetails || enq.DetailsOfEnquiry, // Map DB 'EnquiryDetails' to State 'DetailsOfEnquiry'
                        Remark: enq.Remarks || enq.Remark, // Map DB 'Remarks' to State 'Remark'
                        DocumentsReceived: enq.OthersSpecify || enq.DocumentsReceived, // Map DB 'OthersSpecify' to State 'DocumentsReceived'

                        EnquiryDate: formatDate(enq.EnquiryDate),
                        DueOn: formatDate(enq.DueDate || enq.DueOn), // Map DB 'DueDate' or Payload 'DueOn'
                        SiteVisitDate: formatDate(enq.SiteVisitDate),
                        // Map Checkboxes - DB column names are Doc_... or payload keys
                        hardcopy: enq.Doc_HardCopies !== undefined ? !!enq.Doc_HardCopies : !!enq.hardcopy,
                        drawing: enq.Doc_Drawing !== undefined ? !!enq.Doc_Drawing : !!enq.drawing,
                        dvd: enq.Doc_CD_DVD !== undefined ? !!enq.Doc_CD_DVD : !!enq.dvd,
                        spec: enq.Doc_Spec !== undefined ? !!enq.Doc_Spec : !!enq.spec,
                        eqpschedule: enq.Doc_EquipmentSchedule !== undefined ? !!enq.Doc_EquipmentSchedule : !!enq.eqpschedule,
                        ceosign: enq.ED_CEOSignatureRequired !== undefined ? !!enq.ED_CEOSignatureRequired : !!enq.ceosign,
                        AutoAck: enq.SendAcknowledgementMail !== undefined ? !!enq.SendAcknowledgementMail : !!enq.AutoAck
                    };

                    setFormData(mappedData);
                    // Parse comma-separated strings back into arrays
                    setEnqTypeList(enq.SelectedEnquiryTypes || (enq.EnquiryType ? enq.EnquiryType.split(',').filter(Boolean) : []));
                    setEnqForList(enq.SelectedEnquiryFor || (enq.EnquiryFor ? enq.EnquiryFor.split(',').filter(Boolean) : []));
                    setCustomerList(enq.SelectedCustomers || (enq.CustomerName ? enq.CustomerName.split(',').filter(Boolean) : []));
                    setReceivedFromList(enq.SelectedReceivedFroms || (enq.ReceivedFrom ? enq.ReceivedFrom.split(',').filter(Boolean) : []));
                    setReceivedFromList(enq.SelectedReceivedFroms || (enq.ReceivedFrom ? enq.ReceivedFrom.split(',').filter(Boolean) : []));
                    const seList = enq.SelectedConcernedSEs || (enq.ConcernedSE ? enq.ConcernedSE.split(',').filter(Boolean) : []);
                    setSeList(seList);
                    setAckSEList(seList); // Also populate Ack SE list
                    setIsModifyMode(true);
                    // Load attachments for this enquiry
                    if (enq.RequestNo) {
                        await loadAttachmentsForEnquiry(enq.RequestNo);
                    }
                } else {
                    console.error('Enquiry not found in context for:', reqNo);
                    alert('Enquiry not found! Please try searching again.');
                }
            } catch (err) {
                console.error('Error in handleOpenFromSearch:', err);
                alert('Error loading enquiry: ' + err.message);
            }
        }, 100);
    };

    const renderCustomerCard = () => {
        if (!formData.CustomerName) return null;
        const cust = masters.customers.find(c => c.CompanyName === formData.CustomerName);
        if (!cust) return null;
        return (
            <div style={{ fontSize: '12px' }}>
                <strong>{cust.CompanyName}</strong><br />
                {cust.Address1 && <div>{cust.Address1}</div>}
                {cust.EmailId && <div><i className="bi bi-envelope me-1"></i>{cust.EmailId}</div>}
                {cust.Phone1 && <div><i className="bi bi-telephone me-1"></i>{cust.Phone1}</div>}
            </div>
        );
    };

    const renderContactCard = () => {
        if (!formData.ReceivedFrom) return null;
        const [name, company] = formData.ReceivedFrom.split('|');
        const contact = masters.contacts.find(c => c.ContactName === name && c.CompanyName === company);
        if (!contact) return null;
        return (
            <div style={{ fontSize: '12px' }}>
                <strong>{contact.ContactName}</strong> <span className="text-muted">({contact.Designation})</span><br />
                {contact.EmailId && <div><i className="bi bi-envelope me-1"></i>{contact.EmailId}</div>}
                {contact.Mobile1 && <div><i className="bi bi-phone me-1"></i>{contact.Mobile1}</div>}
            </div>
        );
    };

    // --- File Upload ---
    // --- File Upload ---
    const handleFileUpload = async (e) => {
        console.log('=== handleFileUpload called ===');
        const files = e.target.files;
        console.log('Files selected:', files ? files.length : 0);
        console.log('Current RequestNo:', formData.RequestNo);
        console.log('Is Modify Mode:', isModifyMode);

        if (!files || files.length === 0) {
            console.log('No files selected, returning');
            return;
        }

        // If not Modify Mode (New Enquiry), add to pendingFiles
        if (!isModifyMode) {
            console.log('No RequestNo, adding to pending files');
            const newPending = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileName = file.webkitRelativePath || file.name;
                const previewUrl = URL.createObjectURL(file);
                newPending.push({ file, fileName, isPending: true, id: Date.now() + i, previewUrl });
            }
            setPendingFiles(prev => [...prev, ...newPending]);
            e.target.value = null; // Clear input
            console.log('Added to pending files:', newPending.length);
            return;
        }

        // Existing logic for immediate upload
        console.log('Attempting immediate upload. RequestNo:', formData.RequestNo);

        const uploadData = new FormData();
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            // Use webkitRelativePath if available (folder upload), otherwise use name
            const fileName = file.webkitRelativePath || file.name;
            uploadData.append('files', file, fileName);
            console.log(`Added file ${i + 1}:`, fileName);
        }

        try {
            // Send RequestNo as query parameter to avoid URL encoding issues
            const res = await fetch(`http://localhost:5000/api/attachments/upload?requestNo=${encodeURIComponent(formData.RequestNo)}`, {
                method: 'POST',
                body: uploadData
            });

            if (res.ok) {
                const data = await res.json();
                // Optimistic update with new files
                const newAttachments = data.files.map(f => ({ FileName: f.fileName, FilePath: f.filePath, ID: Date.now() + Math.random() }));
                setAttachments([...attachments, ...newAttachments]);
                alert('Files uploaded successfully');
                // Refresh attachments
                await fetchAttachments();
            } else {
                const errorText = await res.text();
                console.error('Upload failed:', errorText);
                alert('Failed to upload files: ' + errorText);
            }
        } catch (err) {
            console.error('Upload error:', err);
            alert('Error uploading files: ' + err.message);
        } finally {
            // Clear the input value to allow re-selection of the same file if needed
            e.target.value = null;
        }
    };

    const handleRemoveAttachment = async (attachmentId, isPending = false) => {
        console.log('handleRemoveAttachment called:', { attachmentId, isPending });

        if (isPending) {
            // No confirmation needed for pending files (not saved yet)
            console.log('Removing pending file, current pendingFiles:', pendingFiles);
            setPendingFiles(prev => {
                const filtered = prev.filter(f => f.id !== attachmentId);
                const fileToRemove = prev.find(f => f.id === attachmentId);
                if (fileToRemove && fileToRemove.previewUrl) {
                    URL.revokeObjectURL(fileToRemove.previewUrl);
                }
                console.log('Filtered pendingFiles:', filtered);
                return filtered;
            });
            console.log('Pending file removed');
            return;
        }

        // Confirmation only for uploaded files
        if (!window.confirm('Are you sure you want to delete this file?')) {
            console.log('User cancelled deletion');
            return;
        }

        try {
            const res = await fetch(`http://localhost:5000/api/attachments/${attachmentId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                setAttachments(prev => prev.filter(a => a.ID !== attachmentId));
                alert('File deleted successfully');
            } else {
                alert('Failed to delete file');
            }
        } catch (err) {
            console.error(err);
            alert('Error deleting file');
        }
    };

    const loadAttachmentsForEnquiry = async (requestNo) => {
        setAttachments([]);
        try {
            // Send RequestNo as query parameter
            const res = await fetch(`http://localhost:5000/api/attachments?requestNo=${encodeURIComponent(requestNo)}`);
            if (res.ok) {
                const data = await res.json();
                setAttachments(data);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchAttachments = async () => {
        if (formData.RequestNo) {
            await loadAttachmentsForEnquiry(formData.RequestNo);
        }
    };

    useEffect(() => {
        fetchAttachments();
    }, [formData.RequestNo]);

    console.log('EnquiryForm Render:', { isModifyMode, requestNoToOpen });
    return (
        <div className="container-fluid py-4" style={{ maxWidth: '1800px', margin: '0 auto' }}>
            {/* Header Removed as per request */}
            <div className="mb-4">
                {/* Tab Navigation */}
                <div className="d-flex border-bottom">
                    <button
                        className={`btn rounded-0 px-4 py-3 fw-bold ${activeTab === 'New' ? 'text-primary border-bottom border-3 border-primary' : 'text-muted'}`}
                        style={{ background: 'none', border: 'none', borderBottom: activeTab === 'New' ? '3px solid #E91E63' : 'none' }}
                        onClick={() => { setActiveTab('New'); resetForm(); }}
                    >
                        New Enquiry
                    </button>
                    <button
                        className={`btn rounded-0 px-4 py-3 fw-bold ${activeTab === 'Modify' ? 'text-primary border-bottom border-3 border-primary' : 'text-muted'}`}
                        style={{ background: 'none', border: 'none', borderBottom: activeTab === 'Modify' ? '3px solid #E91E63' : 'none' }}
                        onClick={() => { setActiveTab('Modify'); resetForm(); }}
                    >
                        Modify Enquiry
                    </button>
                    <button
                        className={`btn rounded-0 px-4 py-3 fw-bold ${activeTab === 'Search' ? 'text-primary border-bottom border-3 border-primary' : 'text-muted'}`}
                        style={{ background: 'none', border: 'none', borderBottom: activeTab === 'Search' ? '3px solid #E91E63' : 'none' }}
                        onClick={() => setActiveTab('Search')}
                    >
                        Search Enquiry
                    </button>
                </div>
            </div>



            {activeTab === 'Search' ? (
                <div className="card">
                    <SearchEnquiry onOpen={(reqNo) => {
                        setActiveTab('Modify');
                        loadEnquiryForEdit(reqNo);
                    }} />
                </div>
            ) : (
                <>
                    {/* Modify Mode Search Bar */}
                    {activeTab === 'Modify' && (
                        <div className="card mb-4">
                            <div className="row align-items-end">
                                <div className="col-md-4">
                                    <label className="form-label">Request No <span className="text-danger">*</span></label>
                                    <div className="input-group">
                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="e.g. EYS/2025/11/001"
                                            value={modifyRequestNo}
                                            onChange={(e) => setModifyRequestNo(e.target.value)}
                                        />
                                        <button className="btn btn-primary" onClick={() => loadEnquiryForEdit(modifyRequestNo)}>Load</button>
                                    </div>
                                </div>
                                {isModifyMode && (
                                    <div className="col-md-3">
                                        <label className="form-label">Current Status</label>
                                        <select
                                            className="form-select"
                                            value={formData.Status || 'Enquiry'}
                                            onChange={(e) => handleInputChange('Status', e.target.value)}
                                        >
                                            <option value="Enquiry">Enquiry (Received)</option>
                                            <option value="Pricing">Pricing</option>
                                            <option value="Quote">Quote</option>
                                            <option value="Probability">Probability</option>
                                            <option value="Reports">Reports (Closed)</option>
                                        </select>
                                    </div>
                                )}
                                <div className="col-md-2">
                                    <button className="btn btn-outline-secondary w-100" onClick={resetForm}>Clear</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {(activeTab === 'New' || (activeTab === 'Modify' && isModifyMode)) && (
                        <>
                            {activeTab === 'Modify' && (
                                <StatusTracker status={formData.Status} />
                            )}

                            <form onSubmit={handleSubmit}>
                                <div className="row">
                                    {/* Left Column: Enquiry Details */}
                                    <div className="col-md-6">
                                        <div className="card h-100">
                                            <h4 className="mb-3">Enquiry Details</h4>

                                            <div className="row mb-3">
                                                <div className="col-md-6">
                                                    <label className="form-label">Source of Enquiry <span className="text-danger">*</span></label>
                                                    <select
                                                        className="form-select"
                                                        value={formData.SourceOfInfo}
                                                        onChange={(e) => handleInputChange('SourceOfInfo', e.target.value)}
                                                    >
                                                        <option value="">-- Select --</option>
                                                        {masters.sourceOfInfos?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                    </select>
                                                    {errors.SourceOfInfo && <div className="text-danger small">{errors.SourceOfInfo}</div>}
                                                </div>
                                                <div className="col-md-6">
                                                    <ListBoxControl
                                                        label={<span>Enquiry Type <span className="text-danger">*</span></span>}
                                                        options={masters.enquiryType}
                                                        selectedOption={formData.EnquiryType}
                                                        onOptionChange={(val) => handleInputChange('EnquiryType', val)}
                                                        listBoxItems={enqTypeList}
                                                        onAdd={handleAddEnqType}
                                                        onRemove={() => handleRemoveItem(enqTypeList, setEnqTypeList)}
                                                        error={errors.EnquiryType}
                                                    />
                                                </div>
                                            </div>

                                            <div className="row mb-3">
                                                <div className="col-md-6">
                                                    <label className="form-label">Enquiry Date <span className="text-danger">*</span></label>
                                                    <input type="date" className="form-control"
                                                        value={formData.EnquiryDate} onChange={(e) => handleInputChange('EnquiryDate', e.target.value)} />
                                                    {errors.EnquiryDate && <div className="text-danger small">{errors.EnquiryDate}</div>}
                                                </div>
                                                <div className="col-md-6">
                                                    <label className="form-label">Due Date <span className="text-danger">*</span></label>
                                                    <input type="date" className="form-control"
                                                        value={formData.DueOn} onChange={(e) => handleInputChange('DueOn', e.target.value)} />
                                                    {errors.DueOn && <div className="text-danger small">{errors.DueOn}</div>}
                                                </div>
                                            </div>

                                            <div className="mb-3">
                                                <label className="form-label">Site Visit Date</label>
                                                <input type="date" className="form-control"
                                                    value={formData.SiteVisitDate} onChange={(e) => handleInputChange('SiteVisitDate', e.target.value)} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Customer Information */}
                                    <div className="col-md-6">
                                        <div className="card h-100">
                                            <h4 className="mb-3">Customer Information</h4>

                                            <div className="mb-3">
                                                <ListBoxControl
                                                    label={<span>Customer Name <span className="text-danger">*</span></span>}
                                                    options={masters.existingCustomers}
                                                    selectedOption={formData.CustomerName}
                                                    onOptionChange={(val) => handleInputChange('CustomerName', val)}
                                                    listBoxItems={customerList}
                                                    showNew={true}
                                                    showEdit={true}
                                                    canEdit={!!formData.CustomerName}
                                                    renderListBoxItem={(item, idx) => `${idx + 1}. ${item}`}
                                                    onNew={() => openNewModal(setShowCustomerModal, 'Contractor')}
                                                    onEdit={handleEditCustomer}
                                                    selectedItemDetails={renderCustomerCard()}
                                                    error={errors.CustomerName}
                                                />
                                            </div>

                                            <div className="mb-3">
                                                <ListBoxControl
                                                    label={<span>Received From <span className="text-danger">*</span></span>}
                                                    options={
                                                        (formData.CustomerName
                                                            ? masters.contacts.filter(c => {
                                                                const normalize = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
                                                                return normalize(c.CompanyName) === normalize(formData.CustomerName);
                                                            })
                                                            : []
                                                        ).map(c => `${c.ContactName}|${c.CompanyName}`)
                                                    }
                                                    selectedOption={formData.ReceivedFrom}
                                                    onOptionChange={(val) => handleInputChange('ReceivedFrom', val)}
                                                    listBoxItems={receivedFromList}
                                                    onAdd={handleAddReceivedFrom}
                                                    onRemove={handleRemoveReceivedFrom}
                                                    showNew={true}
                                                    showEdit={true}
                                                    canEdit={!!formData.ReceivedFrom}
                                                    renderOption={(opt) => {
                                                        const [name, company] = opt.split('|');
                                                        return `${name} (${company})`;
                                                    }}
                                                    renderListBoxItem={(item, idx) => {
                                                        const [name, company] = item.split('|');
                                                        return `${idx + 1}. ${name} (${company})`;
                                                    }}
                                                    onNew={() => openNewModal(setShowContactModal)}
                                                    onEdit={handleEditContact}
                                                    selectedItemDetails={renderContactCard()}
                                                    error={errors.ReceivedFrom}
                                                />
                                            </div>

                                            <div className="mb-3">
                                                <label className="form-label">Project Name <span className="text-danger">*</span></label>
                                                <input type="text" list="projectList" className="form-control" placeholder="e.g. Downtown Office HVAC Upgrade"
                                                    value={formData.ProjectName} onChange={(e) => handleInputChange('ProjectName', e.target.value)} />
                                                <datalist id="projectList">
                                                    {masters.projectNames.map(p => <option key={p} value={p} />)}
                                                </datalist>
                                                {errors.ProjectName && <div className="text-danger small">{errors.ProjectName}</div>}
                                            </div>
                                        </div>
                                    </div>
                                </div >

                                {/* Project Information Card */}
                                < div className="card mt-4" >
                                    <h4 className="mb-3">Project Information</h4>
                                    <div className="row mb-3">
                                        <div className="col-md-4">
                                            <SearchableSelectControl
                                                label={<span>Client Name <span className="text-danger">*</span></span>}
                                                options={masters.clientNames}
                                                selectedOption={formData.ClientName}
                                                onOptionChange={(val) => handleInputChange('ClientName', val)}
                                                showNew={true}
                                                showEdit={true}
                                                canEdit={!!formData.ClientName}
                                                onNew={() => openNewModal(setShowCustomerModal, 'Client')}
                                                onEdit={handleEditClient}
                                                error={errors.ClientName}
                                            />
                                        </div>
                                        <div className="col-md-4">
                                            <SearchableSelectControl
                                                label="Consultant Name"
                                                options={masters.consultantNames}
                                                selectedOption={formData.ConsultantName}
                                                onOptionChange={(val) => handleInputChange('ConsultantName', val)}
                                                showNew={true}
                                                showEdit={true}
                                                canEdit={!!formData.ConsultantName}
                                                onNew={() => openNewModal(setShowCustomerModal, 'Consultant')}
                                                onEdit={handleEditConsultant}
                                            />
                                        </div>
                                        <div className="col-md-4">
                                            <ListBoxControl
                                                label={<span>Concerned SE <span className="text-danger">*</span></span>}
                                                options={masters.concernedSEs}
                                                selectedOption={formData.ConcernedSE}
                                                onOptionChange={(val) => handleInputChange('ConcernedSE', val)}
                                                listBoxItems={seList}
                                                onAdd={handleAddSE}
                                                onRemove={() => handleRemoveItem(seList, setSeList)}
                                                showNew={true}
                                                showEdit={true}
                                                canEdit={!!formData.ConcernedSE}
                                                onNew={() => openNewModal(setShowUserModal)}
                                                onEdit={handleEditSE}
                                                error={errors.ConcernedSE}
                                            />
                                        </div>
                                    </div>

                                    <div className="row">
                                        <div className="col-md-6">
                                            <label className="form-label">Enquiry Details <span className="text-danger">*</span></label>
                                            <textarea className="form-control" rows="4"
                                                value={formData.DetailsOfEnquiry} onChange={(e) => handleInputChange('DetailsOfEnquiry', e.target.value)} />
                                            {errors.DetailsOfEnquiry && <div className="text-danger small">{errors.DetailsOfEnquiry}</div>}
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label">Others Specify</label>
                                            <textarea className="form-control" rows="4"
                                                value={formData.DocumentsReceived} onChange={(e) => handleInputChange('DocumentsReceived', e.target.value)} />
                                        </div>
                                    </div>
                                </div >

                                {/* Attachments & Remarks Card */}
                                < div className="card mt-4" >
                                    <h4 className="mb-3">Attachments & Remarks</h4>

                                    <div className="mb-4">
                                        <label className="form-label mb-2">Document Received</label>
                                        <div className="d-flex flex-wrap gap-4">
                                            {['hardcopy', 'drawing', 'dvd', 'spec', 'eqpschedule'].map(chk => (
                                                <div className="form-check" key={chk}>
                                                    <input className="form-check-input" type="checkbox" id={chk}
                                                        checked={formData[chk]} onChange={(e) => handleInputChange(chk, e.target.checked)} />
                                                    <label className="form-check-label" htmlFor={chk}>
                                                        {chk === 'hardcopy' ? 'Hard Copies' :
                                                            chk === 'drawing' ? 'Drawing' :
                                                                chk === 'dvd' ? 'CD/DVD' :
                                                                    chk === 'spec' ? 'Spec' : 'Equipment Schedule'}
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="mb-4">
                                        <label className="form-label">Attach Files</label>
                                        <div
                                            className="border-2 border-dashed rounded p-4 text-center"
                                            style={{ borderColor: '#E0E5F2', backgroundColor: '#FAFCFE', cursor: 'pointer' }}
                                            onClick={() => document.getElementById('fileInput').click()}
                                        >
                                            <i className="bi bi-cloud-upload fs-2 text-primary mb-2"></i>
                                            <div className="text-primary fw-bold">Upload a file <span className="text-muted fw-normal">or drag and drop</span></div>
                                            <div className="text-muted small">PNG, JPG, PDF up to 10MB</div>
                                            <input
                                                type="file"
                                                id="fileInput"
                                                style={{ display: 'none' }}
                                                multiple
                                                onChange={handleFileUpload}
                                            />
                                        </div>

                                        {/* File List */}
                                        {(attachments.length > 0 || pendingFiles.length > 0) && (
                                            <div className="d-flex flex-wrap gap-3 mt-3">
                                                {/* Pending Files */}
                                                {pendingFiles.map((file, idx) => (
                                                    <div key={`pending-${idx}`} className="p-2 border rounded bg-white d-flex align-items-center gap-2 shadow-sm" style={{ minWidth: '200px' }}>
                                                        <i className="bi bi-file-earmark-text fs-4 text-warning"></i>
                                                        <div className="flex-grow-1 text-truncate" style={{ maxWidth: '150px' }}>
                                                            <div className="fw-bold small text-truncate">{file.fileName}</div>
                                                            <div className="text-muted" style={{ fontSize: '10px' }}>Pending</div>
                                                        </div>
                                                        <button type="button" className="btn btn-sm text-danger" onClick={(e) => { e.stopPropagation(); handleRemoveAttachment(file.id, true); }}>
                                                            <i className="bi bi-x-lg"></i>
                                                        </button>
                                                    </div>
                                                ))}
                                                {/* Uploaded Files */}
                                                {attachments.map((att, idx) => (
                                                    <div key={`uploaded-${idx}`} className="p-2 border rounded bg-white d-flex align-items-center gap-2 shadow-sm" style={{ minWidth: '200px' }}>
                                                        <i className="bi bi-file-earmark-check fs-4 text-success"></i>
                                                        <div className="flex-grow-1 text-truncate" style={{ maxWidth: '150px' }}>
                                                            <div className="fw-bold small text-truncate">{att.FileName}</div>
                                                            <div className="text-muted" style={{ fontSize: '10px' }}>Uploaded</div>
                                                        </div>
                                                        <a href={`http://localhost:5000/api/attachments/${att.ID}?download=true`} target="_blank" rel="noopener noreferrer" className="btn btn-sm text-primary">
                                                            <i className="bi bi-download"></i>
                                                        </a>
                                                        <button type="button" className="btn btn-sm text-danger" onClick={(e) => { e.stopPropagation(); handleRemoveAttachment(att.ID, false); }}>
                                                            <i className="bi bi-trash"></i>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="mb-3">
                                        <label className="form-label">Remarks</label>
                                        <textarea className="form-control" rows="3"
                                            value={formData.Remark} onChange={(e) => handleInputChange('Remark', e.target.value)} />
                                    </div>
                                </div >

                                {/* Collaborative Notes (Mock) */}
                                < div className="card mt-4" >
                                    <h4 className="mb-3">Collaborative Notes</h4>
                                    <div className="bg-light p-3 rounded mb-3">
                                        <div className="d-flex gap-2 mb-2">
                                            <div className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center" style={{ width: '32px', height: '32px' }}>V</div>
                                            <div>
                                                <div className="fw-bold small">Vignesh <span className="text-muted fw-normal ms-2">2 hours ago</span></div>
                                                <div className="small text-muted">Client mentioned they are also interested in a maintenance package. We should follow up on this when preparing the quote.</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="d-flex gap-2">
                                        <div className="rounded-circle bg-secondary text-white d-flex align-items-center justify-content-center" style={{ width: '32px', height: '32px' }}>U</div>
                                        <input type="text" className="form-control" placeholder="Add a new note..." />
                                        <button type="button" className="btn btn-primary">Post</button>
                                    </div>
                                </div >

                                {/* Footer Actions */}
                                < div className="d-flex justify-content-between align-items-center mt-4 p-4 bg-white rounded shadow-sm fixed-bottom-bar" style={{ position: 'sticky', bottom: 0, zIndex: 100, borderTop: '1px solid #E0E5F2' }}>
                                    <div className="d-flex gap-4">
                                        <div className="form-check">
                                            <input className="form-check-input" type="checkbox" id="autoAck"
                                                checked={formData.AutoAck} onChange={(e) => handleInputChange('AutoAck', e.target.checked)} />
                                            <label className="form-check-label" htmlFor="autoAck">Send acknowledgement mail?</label>
                                        </div>
                                        <div className="form-check">
                                            <input className="form-check-input" type="checkbox" id="ceoSign"
                                                checked={formData.ceosign} onChange={(e) => handleInputChange('ceosign', e.target.checked)} />
                                            <label className="form-check-label" htmlFor="ceoSign">ED/CEO Signature required?</label>
                                        </div>
                                    </div>
                                    <div className="d-flex gap-2">
                                        <button type="button" className="btn btn-light" onClick={resetForm}>Cancel</button>
                                        <button type="submit" className="btn btn-success px-4">
                                            {isModifyMode ? 'Update Enquiry' : 'Add Enquiry'}
                                        </button>
                                    </div>
                                </div >
                            </form>
                        </>
                    )}
                </>
            )}

            {/* Modals */}
            <CustomerModal show={showCustomerModal} onClose={() => setShowCustomerModal(false)} onSubmit={handleCustomerSubmit} mode={modalMode} initialData={editData} fixedCategory={fixedCategory} />
            <ContactModal show={showContactModal} onClose={() => setShowContactModal(false)} onSubmit={handleContactSubmit} mode={modalMode} initialData={editData} />
            <UserModal show={showUserModal} onClose={() => setShowUserModal(false)} onSubmit={handleUserSubmit} mode={modalMode} initialData={editData} />
            <EnquiryItemModal show={showEnqItemModal} onClose={() => setShowEnqItemModal(false)} onSubmit={handleEnqItemSubmit} mode={modalMode} initialData={editData} />
        </div >
    );
};

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error("EnquiryForm Error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 bg-light border rounded text-danger">
                    <h4>Something went wrong.</h4>
                    <p>{this.state.error && this.state.error.toString()}</p>
                    <pre style={{ fontSize: '11px' }}>{this.state.errorInfo && this.state.errorInfo.componentStack}</pre>
                    <button className="btn btn-outline-secondary mt-2" onClick={() => window.location.reload()}>Reload Page</button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default function EnquiryFormWrapper() {
    return (
        <ErrorBoundary>
            <EnquiryForm />
        </ErrorBoundary>
    );
}
