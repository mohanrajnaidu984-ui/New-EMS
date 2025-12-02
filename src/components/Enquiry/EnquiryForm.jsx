import React, { useState, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import ListBoxControl from './ListBoxControl';
import SearchableSelectControl from './SearchableSelectControl';
import SearchEnquiry from './SearchEnquiry';
import CustomerModal from '../Modals/CustomerModal';
import ContactModal from '../Modals/ContactModal';
import UserModal from '../Modals/UserModal';
import EnquiryItemModal from '../Modals/EnquiryItemModal';
// import ParticleBackground from '../Common/ParticleBackground';
import DateInput from './DateInput';

const EnquiryForm = () => {
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
    const [modifyRequestNo, setModifyRequestNo] = useState('');
    const [isModifyMode, setIsModifyMode] = useState(false);

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

    // Generate RequestNo on mount for New Enquiry
    useEffect(() => {
        if (activeTab === 'New' && !isModifyMode) {
            // Generate a more unique RequestNo to avoid collisions
            const timestamp = Date.now();
            const random = Math.floor(Math.random() * 1000);
            const generatedReqNo = `EYS/2025/11/${timestamp.toString().slice(-4)}${random}`;
            setFormData(prev => ({ ...prev, RequestNo: generatedReqNo }));
        }
    }, [activeTab, isModifyMode]);

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
                            return `${contact}|${data.CompanyName}`;
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
                            handleInputChange('ReceivedFrom', `${contact}|${data.CompanyName}`);
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
            const val = `${data.ContactName}|${data.CompanyName}`;
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
                    const newVal = `${data.ContactName}|${data.CompanyName}`;
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

            alert(`Enquiry Updated: ${formData.RequestNo}`);
        } else {
            // RequestNo is already generated in useEffect
            await addEnquiry(payload);

            // Upload pending files if any BEFORE resetting form
            if (pendingFiles.length > 0) {
                await uploadPendingFiles(formData.RequestNo);
            }

            alert(`Enquiry Added: ${formData.RequestNo}`);
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

    console.log('EnquiryForm Render:', { activeTab, isModifyMode, modifyRequestNo });
    return (
        <div style={{ position: 'relative', minHeight: '100vh' }}>
            {/* <ParticleBackground /> */}
            <div style={{ position: 'relative', zIndex: 1 }}>
                <ul className="nav nav-tabs mb-3">
                    <li className="nav-item">
                        <button className={`nav-link ${activeTab === 'New' ? 'active' : ''}`} onClick={() => { setActiveTab('New'); resetForm(); }}>New Enquiry</button>
                    </li>
                    <li className="nav-item">
                        <button className={`nav-link ${activeTab === 'Modify' ? 'active' : ''}`} onClick={() => { setActiveTab('Modify'); resetForm(); }}>Modify Enquiry</button>
                    </li>
                    <li className="nav-item">
                        <button className={`nav-link ${activeTab === 'Search' ? 'active' : ''}`} onClick={() => setActiveTab('Search')}>Search Enquiry</button>
                    </li>
                </ul>

                {activeTab === 'Search' ? (
                    <SearchEnquiry onOpen={handleOpenFromSearch} />
                ) : (
                    <>
                        {activeTab === 'Modify' && (
                            <div className="row mb-3">
                                <div className="col-md-3">
                                    <label className="form-label">Request No<span className="text-danger">*</span></label>
                                    <input type="text" className="form-control" placeholder="e.g. EYS/2025/11/001"
                                        value={modifyRequestNo} onChange={(e) => setModifyRequestNo(e.target.value)} />
                                </div>
                                {isModifyMode && (
                                    <div className="col-md-3">
                                        <label className="form-label">Status<span className="text-danger">*</span></label>
                                        <select
                                            className="form-select"
                                            value={formData.Status || 'Enquiry'}
                                            onChange={(e) => handleInputChange('Status', e.target.value)}
                                            style={{ fontSize: '13px' }}
                                        >
                                            <option value="Enquiry">Enquiry</option>
                                            <option value="Pricing">Pricing</option>
                                            <option value="Quote">Quote</option>
                                            <option value="Probability">Probability</option>
                                            <option value="Reports">Reports</option>
                                        </select>
                                        {formData.Status === 'Reports' && (
                                            <div className="alert alert-success mt-2 p-2" style={{ fontSize: '11px' }}>
                                                <i className="bi bi-check-circle me-1"></i>
                                                This enquiry is closed
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="col-md-3 d-flex align-items-end">
                                    <button className="btn btn-outline-primary me-2" onClick={handleLoadEnquiry}>Load</button>
                                    <button className="btn btn-outline-secondary" onClick={resetForm}>Clear</button>
                                </div>
                            </div>
                        )}

                        {(activeTab === 'New' || (activeTab === 'Modify' && isModifyMode)) && (
                            <form onSubmit={handleSubmit}>
                                {/* Row 1: Source */}
                                <div className="row mb-2">
                                    <div className="col-md-3">
                                        <label className="form-label">Source of Enquiry<span className="text-danger">*</span></label>
                                        <select
                                            className="form-select"
                                            value={formData.SourceOfInfo}
                                            onChange={(e) => handleInputChange('SourceOfInfo', e.target.value)}
                                            style={{ fontSize: '13px' }}
                                        >
                                            <option value="">-- Select Source --</option>
                                            {masters.sourceOfInfos?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                        {errors.SourceOfInfo && <div className="text-danger" style={{ fontSize: '11px' }}>{errors.SourceOfInfo}</div>}
                                    </div>
                                </div>

                                {/* Row 2: Dates */}
                                <div className="row mb-2">
                                    <div className="col-md-2">
                                        <label className="form-label">Enquiry Date <span className="text-danger">*</span></label>
                                        <DateInput
                                            value={formData.EnquiryDate}
                                            onChange={(e) => handleInputChange('EnquiryDate', e.target.value)}
                                            placeholder="DD-MMM-YYYY"
                                        />
                                        {errors.EnquiryDate && <div className="text-danger" style={{ fontSize: '11px' }}>{errors.EnquiryDate}</div>}
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label">Due Date <span className="text-danger">*</span></label>
                                        <DateInput
                                            value={formData.DueOn}
                                            onChange={(e) => handleInputChange('DueOn', e.target.value)}
                                            placeholder="DD-MMM-YYYY"
                                        />
                                        {errors.DueOn && <div className="text-danger" style={{ fontSize: '11px' }}>{errors.DueOn}</div>}
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label">Site visit date</label>
                                        <DateInput
                                            value={formData.SiteVisitDate}
                                            onChange={(e) => handleInputChange('SiteVisitDate', e.target.value)}
                                            placeholder="DD-MMM-YYYY"
                                        />
                                    </div>
                                </div>

                                {/* Row 3: Enquiry Type */}
                                <div className="row mb-2">
                                    <div className="col-md-6">
                                        <ListBoxControl
                                            label={<span>Enquiry Type<span className="text-danger">*</span></span>}
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

                                {/* Row 4: Enquiry For */}
                                <div className="row mb-2">
                                    <div className="col-md-6">
                                        <ListBoxControl
                                            label={<span>Enquiry For<span className="text-danger">*</span></span>}
                                            options={masters.enquiryFor}
                                            selectedOption={formData.EnquiryFor}
                                            onOptionChange={(val) => handleInputChange('EnquiryFor', val)}
                                            listBoxItems={enqForList}
                                            onAdd={handleAddEnqFor}
                                            onRemove={() => handleRemoveItem(enqForList, setEnqForList)}
                                            showNew={true}
                                            showEdit={true}
                                            canEdit={!!formData.EnquiryFor}
                                            onNew={() => openNewModal(setShowEnqItemModal)}
                                            onEdit={handleEditEnqFor}
                                            error={errors.EnquiryFor}
                                        />
                                    </div>
                                </div>

                                {/* Row 5: Customer & Received From */}
                                <div className="row mb-2">
                                    <div className="col-md-6">
                                        <ListBoxControl
                                            label={<span>Customer Name<span className="text-danger">*</span></span>}
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
                                    <div className="col-md-6">
                                        <ListBoxControl
                                            label={<span>Received From<span className="text-danger">*</span></span>}
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
                                </div>

                                {/* Row 6: Project Name */}
                                <div className="row mb-2">
                                    <div className="col-md-6">
                                        <label className="form-label">Project Name<span className="text-danger">*</span></label>
                                        <input type="text" list="projectList" className="form-control" style={{ fontSize: '13px' }}
                                            value={formData.ProjectName} onChange={(e) => handleInputChange('ProjectName', e.target.value)} />
                                        <datalist id="projectList">
                                            {masters.projectNames.map(p => <option key={p} value={p} />)}
                                        </datalist>
                                        {errors.ProjectName && <div className="text-danger" style={{ fontSize: '11px' }}>{errors.ProjectName}</div>}
                                    </div>
                                </div>

                                {/* Row 7: Client Name */}
                                <div className="row mb-2">
                                    <div className="col-md-6">
                                        <SearchableSelectControl
                                            label={<span>Client Name<span className="text-danger">*</span></span>}
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
                                </div>

                                {/* Row 8: Consultant Name */}
                                <div className="row mb-2">
                                    <div className="col-md-6">
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
                                </div>

                                {/* Row 9: Concerned SE */}
                                <div className="row mb-2">
                                    <div className="col-md-6">
                                        <ListBoxControl
                                            label={<span>Concerned SE<span className="text-danger">*</span></span>}
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

                                {/* Row 10: Details */}
                                <div className="row mb-3">
                                    <div className="col-md-6">
                                        <label className="form-label">Enquiry details<span className="text-danger">*</span></label>
                                        <textarea className="form-control" rows="3"
                                            value={formData.DetailsOfEnquiry} onChange={(e) => handleInputChange('DetailsOfEnquiry', e.target.value)} />
                                        {errors.DetailsOfEnquiry && <div className="text-danger" style={{ fontSize: '11px' }}>{errors.DetailsOfEnquiry}</div>}
                                    </div>
                                </div>

                                {/* Row 11: Documents */}
                                <div className="row mb-2">
                                    <div className="col-md-6">
                                        <label className="form-label">Document received</label>
                                        <div className="d-flex gap-2 mb-2" style={{ fontSize: '13px', flexWrap: 'nowrap' }}>
                                            {['hardcopy', 'drawing', 'dvd', 'spec', 'eqpschedule'].map(chk => (
                                                <div className="form-check form-check-inline" key={chk}>
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

                                        <label className="form-label">Others Specify</label>
                                        <textarea className="form-control mb-2" rows="2"
                                            value={formData.DocumentsReceived} onChange={(e) => handleInputChange('DocumentsReceived', e.target.value)} />

                                        {/* Acknowledgement Section */}


                                        {/* File Upload UI */}
                                        <div className="mb-2">
                                            <label className="form-label">Attachments</label>
                                            <div className="d-flex align-items-center mb-2">
                                                <input
                                                    type="file"
                                                    id="fileInput"
                                                    style={{ display: 'none' }}
                                                    multiple
                                                    onChange={handleFileUpload}
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-secondary btn-sm"
                                                    onClick={() => document.getElementById('fileInput').click()}
                                                >
                                                    Choose Files
                                                </button>
                                                <span className="ms-2 text-muted" style={{ fontSize: '13px' }}>
                                                    {pendingFiles.length > 0
                                                        ? `${pendingFiles.length} file(s) pending save`
                                                        : 'No new files selected'}
                                                </span>
                                            </div>
                                            <div className="form-text mb-2" style={{ fontSize: '11px' }}>Supported: Multiple files</div>

                                            {/* Combined List of Pending and Uploaded Files */}
                                            {(attachments.length > 0 || pendingFiles.length > 0) && (
                                                <ul className="list-group mt-2 border-0">
                                                    {/* Pending Files */}
                                                    {pendingFiles.map((file, idx) => (
                                                        <li key={`pending-${idx}`} className="list-group-item d-flex align-items-center justify-content-between p-2 mb-1 border rounded bg-light">
                                                            <div className="d-flex align-items-center text-truncate me-3" title={file.fileName}>
                                                                <i className="bi bi-file-earmark-text text-secondary fs-5 me-2"></i>
                                                                <span className="fw-medium text-dark">{file.fileName}</span>
                                                                <span className="badge bg-warning text-dark ms-2 rounded-pill" style={{ fontSize: '0.7em' }}>Pending</span>
                                                            </div>
                                                            <div className="d-flex align-items-center gap-2">
                                                                <a
                                                                    href={file.previewUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="btn btn-sm btn-outline-info d-flex align-items-center justify-content-center"
                                                                    style={{ width: '32px', height: '32px' }}
                                                                    title="View"
                                                                >
                                                                    <i className="bi bi-eye"></i>
                                                                </a>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-sm btn-outline-danger d-flex align-items-center justify-content-center"
                                                                    style={{ width: '32px', height: '32px' }}
                                                                    onClick={() => handleRemoveAttachment(file.id, true)}
                                                                    title="Remove"
                                                                >
                                                                    <i className="bi bi-trash"></i>
                                                                </button>
                                                            </div>
                                                        </li>
                                                    ))}
                                                    {/* Uploaded Files */}
                                                    {attachments.map((att, idx) => (
                                                        <li key={`uploaded-${idx}`} className="list-group-item d-flex align-items-center justify-content-between p-2 mb-1 border rounded">
                                                            <div className="d-flex align-items-center text-truncate me-3" title={att.FileName}>
                                                                <i className="bi bi-paperclip text-secondary fs-5 me-2"></i>
                                                                <span className="fw-medium text-dark">{att.FileName}</span>
                                                            </div>
                                                            <div className="d-flex align-items-center gap-2">
                                                                <a
                                                                    href={`http://localhost:5000/api/attachments/${att.ID}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="btn btn-sm btn-outline-info d-flex align-items-center justify-content-center"
                                                                    style={{ width: '32px', height: '32px' }}
                                                                    title="View"
                                                                >
                                                                    <i className="bi bi-eye"></i>
                                                                </a>
                                                                <a
                                                                    href={`http://localhost:5000/api/attachments/${att.ID}?download=true`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="btn btn-sm btn-outline-primary d-flex align-items-center justify-content-center"
                                                                    style={{ width: '32px', height: '32px' }}
                                                                    title="Download"
                                                                >
                                                                    <i className="bi bi-download"></i>
                                                                </a>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-sm btn-outline-danger d-flex align-items-center justify-content-center"
                                                                    style={{ width: '32px', height: '32px' }}
                                                                    onClick={() => handleRemoveAttachment(att.ID, false)}
                                                                    title="Remove"
                                                                >
                                                                    <i className="bi bi-trash"></i>
                                                                </button>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Row 12: Remarks */}
                                <div className="row mb-2">
                                    <div className="col-md-3">
                                        <label className="form-label">Remarks</label>
                                        <textarea className="form-control" rows="2"
                                            value={formData.Remark} onChange={(e) => handleInputChange('Remark', e.target.value)} />
                                    </div>
                                </div>

                                {/* Row 13: Checkboxes and SE Selection */}
                                <div className="row mb-2">
                                    <div className="col-md-3">
                                        <div className="form-check" style={{ fontSize: '13px' }}>
                                            <input className="form-check-input" type="checkbox" id="autoAck"
                                                checked={formData.AutoAck} onChange={(e) => handleInputChange('AutoAck', e.target.checked)} />
                                            <label className="form-check-label" htmlFor="autoAck">Send acknowledgement mail?</label>
                                        </div>

                                        {/* Concerned SE Selection for Acknowledgement */}
                                        {formData.AutoAck && seList.length > 0 && (
                                            <div className="mt-2" style={{ fontSize: '13px' }}>
                                                <label className="form-label">Select SE for Acknowledgement</label>
                                                <select
                                                    className="form-select form-select-sm"
                                                    value={ackSEList[0] || ''}
                                                    onChange={(e) => {
                                                        setAckSEList(e.target.value ? [e.target.value] : []);
                                                    }}
                                                    style={{ fontSize: '13px' }}
                                                >
                                                    <option value="">-- Select SE --</option>
                                                    {seList.map((se, idx) => (
                                                        <option key={idx} value={se}>{se}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        <div className="form-check mt-2" style={{ fontSize: '13px' }}>
                                            <input className="form-check-input" type="checkbox" id="ceoSign"
                                                checked={formData.ceosign} onChange={(e) => handleInputChange('ceosign', e.target.checked)} />
                                            <label className="form-check-label" htmlFor="ceoSign">ED/CEO Signature required?</label>
                                        </div>
                                    </div>
                                </div>

                                {/* Buttons */}
                                <div className="row mt-4 mb-4" style={{ paddingBottom: '100px' }}>
                                    <div className="col-12">
                                        <button type="submit" className="btn btn-outline-success me-2">
                                            {isModifyMode ? 'Save Changes' : 'Add'}
                                        </button>
                                        <button type="button" className="btn btn-outline-danger me-2" onClick={resetForm}>Cancel</button>
                                    </div>
                                </div>
                            </form>
                        )}
                    </>
                )}


                {/* Modals */}
                <CustomerModal show={showCustomerModal} onClose={() => setShowCustomerModal(false)} onSubmit={handleCustomerSubmit} mode={modalMode} initialData={editData} fixedCategory={fixedCategory} />
                <ContactModal show={showContactModal} onClose={() => setShowContactModal(false)} onSubmit={handleContactSubmit} mode={modalMode} initialData={editData} />
                <UserModal show={showUserModal} onClose={() => setShowUserModal(false)} onSubmit={handleUserSubmit} mode={modalMode} initialData={editData} />
                <EnquiryItemModal show={showEnqItemModal} onClose={() => setShowEnqItemModal(false)} onSubmit={handleEnqItemSubmit} mode={modalMode} initialData={editData} />
            </div>
        </div>
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
