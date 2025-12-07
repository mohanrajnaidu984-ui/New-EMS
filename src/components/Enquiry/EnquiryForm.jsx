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
import ValidationTooltip from '../Common/ValidationTooltip';
import CollaborativeNotes from './CollaborativeNotes';

const EnquiryForm = ({ requestNoToOpen }) => {
    const { masters, addEnquiry, updateEnquiry, getEnquiry, updateMasters, addMaster, updateMaster, enquiries } = useData();

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
    const [hasOpenedFromProp, setHasOpenedFromProp] = useState(false);

    // Effect to open from prop
    useEffect(() => {
        if (requestNoToOpen && !hasOpenedFromProp && enquiries) {
            handleOpenFromSearch(requestNoToOpen);
            setHasOpenedFromProp(true);
        }
    }, [requestNoToOpen, enquiries, hasOpenedFromProp]);

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
    const [pendingFiles, setPendingFiles] = useState([]);
    const [ackSEList, setAckSEList] = useState([]);

    // Project Suggestions State
    const [projectSuggestions, setProjectSuggestions] = useState([]);
    const [showProjectSuggestions, setShowProjectSuggestions] = useState(false);

    // Access Control State
    const [canEdit, setCanEdit] = useState(true);

    // Effect to determine edit permission
    useEffect(() => {
        if (activeTab === 'New') {
            setCanEdit(true);
        } else if (activeTab === 'Modify' && isModifyMode) {
            checkEditPermission();
        }
    }, [activeTab, isModifyMode, formData, currentUser, seList, enqForList]);

    const checkEditPermission = () => {
        if (!currentUser) return;
        const roleString = currentUser.role || currentUser.Roles || '';
        const userRoles = typeof roleString === 'string'
            ? roleString.split(',').map(r => r.trim())
            : (Array.isArray(roleString) ? roleString : []);

        if (userRoles.includes('Admin')) {
            setCanEdit(true);
            return;
        }

        const creatorName = (formData.CreatedBy || '').trim().toLowerCase();
        const currentUserName = (currentUser.name || '').trim().toLowerCase();

        if (creatorName === currentUserName) {
            setCanEdit(true);
            return;
        }

        // 3. Division Member Access (Enquiry For items)
        let isDivisionMember = false;
        const userEmail = (currentUser.email || '').trim().toLowerCase();

        for (const itemName of enqForList) {
            const item = masters.enqItems.find(i => i.ItemName === itemName);
            if (!item) continue;

            if (item.CommonMailIds && (Array.isArray(item.CommonMailIds) ? item.CommonMailIds : item.CommonMailIds.split(',')).some(email => email.trim().toLowerCase() === userEmail)) {
                isDivisionMember = true;
                break;
            }
            if (item.CCMailIds && (Array.isArray(item.CCMailIds) ? item.CCMailIds : item.CCMailIds.split(',')).some(email => email.trim().toLowerCase() === userEmail)) {
                isDivisionMember = true;
                break;
            }
        }

        if (isDivisionMember) {
            setCanEdit(true);
            return;
        }

        setCanEdit(false);
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }

        // Project Name Autocomplete Logic
        if (field === 'ProjectName') {
            if (value && value.trim().length > 0 && enquiries) {
                const matches = Object.values(enquiries).filter(e =>
                    e.ProjectName && e.ProjectName.toLowerCase().includes(value.toLowerCase())
                );
                setProjectSuggestions(matches);
                setShowProjectSuggestions(true);
            } else {
                setProjectSuggestions([]);
                setShowProjectSuggestions(false);
            }
        }
    };

    // Generate RequestNo on mount for New Enquiry
    // Generate RequestNo and set CreatedBy on mount for New Enquiry
    useEffect(() => {
        if (activeTab === 'New' && !isModifyMode) {
            generateNewRequestNo();
            if (currentUser && currentUser.name) {
                setFormData(prev => ({ ...prev, CreatedBy: currentUser.name }));
            }
        }
    }, [activeTab, isModifyMode, currentUser]);

    const generateNewRequestNo = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/system/next-request-no');
            if (res.ok) {
                const data = await res.json();
                setFormData(prev => ({ ...prev, RequestNo: data.nextId }));
            } else {
                console.error('Failed to get next request no');
                // Fallback or error handling? For now allow manual entry or retry
            }
        } catch (err) {
            console.error('Error fetching next request no:', err);
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

        if (!canEdit) {
            alert('You do not have permission to modify this enquiry.');
            return;
        }

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
            CreatedBy: isModifyMode ? formData.CreatedBy : (currentUser?.name || 'System'),
            ModifiedBy: currentUser?.name || 'System'
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
            // Send RequestNo and UserName as query parameter
            const userName = currentUser?.name || 'System';
            const res = await fetch(`http://localhost:5000/api/attachments/upload?requestNo=${encodeURIComponent(requestNo)}&userName=${encodeURIComponent(userName)}`, {
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
        setProjectSuggestions([]);
        setShowProjectSuggestions(false);
    };

    // --- Modify Logic ---
    const loadEnquiry = async (requestNo) => {
        const enq = getEnquiry(requestNo);
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
            console.error('Enquiry not found:', requestNo);
            alert('Enquiry not found!');
        }
    };

    const handleLoadEnquiry = async () => {
        await loadEnquiry(modifyRequestNo);
    };

    const handleOpenFromSearch = (reqNo) => {
        setModifyRequestNo(reqNo);
        setActiveTab('Modify');
        setTimeout(() => {
            loadEnquiry(reqNo);
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
            // Send RequestNo and UserName as query parameters
            const userName = currentUser?.name || 'System';
            const res = await fetch(`http://localhost:5000/api/attachments/upload?requestNo=${encodeURIComponent(formData.RequestNo)}&userName=${encodeURIComponent(userName)}`, {
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
            <div style={{ position: 'relative', zIndex: 1 }}>
                <div className="row justify-content-center">
                    <div className="col-12" style={{ flex: '0 0 66%', maxWidth: '66%' }}>
                        <div className="d-flex mb-4" style={{ borderBottom: '1px solid #e0e0e0' }}>
                            <button
                                className="btn rounded-0"
                                style={{
                                    color: activeTab === 'New' ? '#d63384' : '#6c757d',
                                    borderBottom: activeTab === 'New' ? '3px solid #d63384' : '3px solid transparent',
                                    fontWeight: activeTab === 'New' ? '600' : '500',
                                    backgroundColor: 'transparent',
                                    padding: '10px 20px',
                                    marginBottom: '-2px',
                                    fontSize: '15px'
                                }}
                                onClick={() => { setActiveTab('New'); resetForm(); }}
                            >
                                New Enquiry
                            </button>
                            <button
                                className="btn rounded-0"
                                style={{
                                    color: activeTab === 'Modify' ? '#d63384' : '#6c757d',
                                    borderBottom: activeTab === 'Modify' ? '3px solid #d63384' : '3px solid transparent',
                                    fontWeight: activeTab === 'Modify' ? '600' : '500',
                                    backgroundColor: 'transparent',
                                    padding: '10px 20px',
                                    marginBottom: '-2px',
                                    fontSize: '15px'
                                }}
                                onClick={() => { setActiveTab('Modify'); resetForm(); }}
                            >
                                Modify Enquiry
                            </button>
                            <button
                                className="btn rounded-0"
                                style={{
                                    color: activeTab === 'Search' ? '#d63384' : '#6c757d',
                                    borderBottom: activeTab === 'Search' ? '3px solid #d63384' : '3px solid transparent',
                                    fontWeight: activeTab === 'Search' ? '600' : '500',
                                    backgroundColor: 'transparent',
                                    padding: '10px 20px',
                                    marginBottom: '-2px',
                                    fontSize: '15px'
                                }}
                                onClick={() => setActiveTab('Search')}
                            >
                                Search Enquiry
                            </button>
                        </div>
                    </div>
                </div>

                {activeTab === 'Search' ? (
                    <SearchEnquiry onOpen={handleOpenFromSearch} />
                ) : (
                    <>
                        {activeTab === 'Modify' && (
                            <div className="row justify-content-center mb-3">
                                <div className="col-12" style={{ flex: '0 0 66%', maxWidth: '66%' }}>
                                    <div className="row">
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
                                                    <option value="Follow-up">Follow-up</option>
                                                    <option value="Won">Won</option>
                                                    <option value="Lost">Lost</option>
                                                </select>
                                                {(formData.Status === 'Won' || formData.Status === 'Lost') && (
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
                                </div>
                            </div>
                        )}

                        {(activeTab === 'New' || (activeTab === 'Modify' && isModifyMode)) && (
                            <div className="row justify-content-center">
                                <div className="col-12" style={{ flex: '0 0 66%', maxWidth: '66%' }}>
                                    <form onSubmit={handleSubmit}>
                                        {/* Enquiry Status Tracker */}
                                        <div className="card mb-4 shadow-sm border-0 bg-white" style={{ borderRadius: '12px' }}>
                                            <div className="card-body p-4">
                                                <h6 className="card-title fw-bold mb-4" style={{ color: '#2d3748' }}>Enquiry Status Tracker</h6>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', marginTop: '10px', marginBottom: '10px' }}>
                                                    {['Enquiry', 'Pricing', 'Quote', 'Follow-up', 'Won'].map((step, index) => {
                                                        const stepNum = index + 1;

                                                        // Determine current step number based on formData.Status
                                                        let currentStep = 1;
                                                        const status = formData.Status || 'Enquiry';

                                                        if (status === 'Enquiry') currentStep = 1;
                                                        else if (status === 'Pricing') currentStep = 2;
                                                        else if (status === 'Quote') currentStep = 3;
                                                        else if (status === 'Follow-up') currentStep = 4;
                                                        else if (status === 'Won' || status === 'Lost') currentStep = 5;

                                                        const isActive = stepNum === currentStep;
                                                        const isCompleted = stepNum < currentStep;
                                                        const isLast = index === 4;

                                                        // Dynamic label for the last step
                                                        let label = step;
                                                        if (isLast) {
                                                            if (status === 'Lost') label = 'Lost';
                                                            else label = 'Won';
                                                        }

                                                        return (
                                                            <React.Fragment key={step}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
                                                                    <div style={{
                                                                        width: '35px',
                                                                        height: '35px',
                                                                        borderRadius: '50%',
                                                                        backgroundColor: isActive || isCompleted ? (status === 'Lost' && isLast ? '#ef4444' : '#3b82f6') : '#e2e8f0', // Blue generally, Red if Lost and active/completed
                                                                        color: isActive || isCompleted ? '#ffffff' : '#718096',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        fontWeight: 'bold',
                                                                        fontSize: '14px',
                                                                        border: isActive ? `2px solid ${status === 'Lost' && isLast ? '#fca5a5' : '#ebf8ff'}` : 'none',
                                                                        boxShadow: isActive ? `0 0 0 4px ${status === 'Lost' && isLast ? '#fecaca' : '#bfdbfe'}` : 'none'
                                                                    }}>
                                                                        {isCompleted ? '✓' : stepNum}
                                                                    </div>
                                                                    <span style={{
                                                                        marginTop: '8px',
                                                                        fontSize: '12px',
                                                                        color: isActive || isCompleted ? (status === 'Lost' && isLast ? '#ef4444' : '#3b82f6') : '#a0aec0',
                                                                        fontWeight: isActive ? '600' : '400'
                                                                    }}>
                                                                        {label}
                                                                    </span>
                                                                </div>
                                                                {!isLast && (
                                                                    <div style={{
                                                                        flex: 1,
                                                                        height: '2px',
                                                                        backgroundColor: isCompleted ? '#3b82f6' : '#e2e8f0',
                                                                        marginLeft: '10px',
                                                                        marginRight: '10px',
                                                                        marginTop: '-25px' // Align with circle center
                                                                    }} />
                                                                )}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card 1: Enquiry Details */}
                                        <div className="card mb-4 shadow-sm border-0 bg-light card-overline">
                                            <div className="card-body p-4">
                                                <h5 className="card-title fw-bold mb-4">Enquiry Details</h5>

                                                {/* Created By Field */}
                                                {!isModifyMode && (
                                                    <div className="d-flex align-items-center mb-3">
                                                        <span className="badge bg-light text-dark border me-2">
                                                            <i className="bi bi-person me-1"></i>
                                                            Created By: {currentUser?.name || 'Unknown'}
                                                        </span>
                                                    </div>
                                                )}

                                                {isModifyMode && (
                                                    <div className="d-flex align-items-center mb-3 justify-content-between">
                                                        <span className="badge bg-light text-dark border">
                                                            <i className="bi bi-person me-1"></i>
                                                            Created By: {formData.CreatedBy || 'Unknown'}
                                                        </span>
                                                        {!canEdit && (
                                                            <span className="badge bg-danger">
                                                                <i className="bi bi-lock-fill me-1"></i>
                                                                Read Only (No Permission)
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Project Name & Source */}
                                                <div className="row mb-3">
                                                    <div className="col-md-6" style={{ position: 'relative' }}>
                                                        <label className="form-label">Project Name<span className="text-danger">*</span></label>
                                                        <div className="input-group">
                                                            <input
                                                                type="text"
                                                                className="form-control"
                                                                style={{ fontSize: '13px' }}
                                                                value={formData.ProjectName}
                                                                onChange={(e) => handleInputChange('ProjectName', e.target.value)}
                                                                onBlur={() => setTimeout(() => setShowProjectSuggestions(false), 200)}
                                                                onFocus={() => { if (formData.ProjectName) handleInputChange('ProjectName', formData.ProjectName); }}
                                                                autoComplete="off"
                                                            />
                                                        </div>

                                                        {/* Autocomplete Dropdown */}
                                                        {showProjectSuggestions && projectSuggestions.length > 0 && (
                                                            <div className="shadow-lg p-0" style={{
                                                                position: 'absolute',
                                                                top: '75px',
                                                                left: '10px',
                                                                right: '0',
                                                                zIndex: 1000,
                                                                backgroundColor: 'white',
                                                                borderRadius: '8px',
                                                                border: '1px solid #e2e8f0',
                                                                maxHeight: '300px',
                                                                overflowY: 'auto'
                                                            }}>
                                                                {/* Arrow */}
                                                                <div style={{
                                                                    position: 'absolute',
                                                                    top: '-6px',
                                                                    left: '20px',
                                                                    width: '12px',
                                                                    height: '12px',
                                                                    backgroundColor: 'white',
                                                                    borderTop: '1px solid #e2e8f0',
                                                                    borderLeft: '1px solid #e2e8f0',
                                                                    transform: 'rotate(45deg)'
                                                                }}></div>

                                                                <div className="list-group list-group-flush">
                                                                    {projectSuggestions.map((suggestion) => (
                                                                        <div key={suggestion.RequestNo} className="list-group-item list-group-item-action d-flex justify-content-between align-items-center p-3">
                                                                            <div>
                                                                                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#2d3748' }}>{suggestion.ProjectName}</div>
                                                                                <div style={{ fontSize: '11px', color: '#718096' }}>{suggestion.RequestNo}</div>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                className="btn btn-primary btn-sm"
                                                                                style={{ fontSize: '11px', padding: '4px 12px' }}
                                                                                onMouseDown={(e) => {
                                                                                    e.preventDefault(); // Prevent input blur
                                                                                    handleOpenFromSearch(suggestion.RequestNo);
                                                                                    setShowProjectSuggestions(false);
                                                                                }}
                                                                            >
                                                                                Open
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {errors.ProjectName && <ValidationTooltip message={errors.ProjectName} />}
                                                    </div>
                                                    <div className="col-md-6" style={{ position: 'relative' }}>
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
                                                        {errors.SourceOfInfo && <ValidationTooltip message={errors.SourceOfInfo} />}
                                                    </div>
                                                </div>

                                                {/* Dates */}
                                                <div className="mb-3" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', width: '100%', gap: '15px' }}>
                                                    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                                                        <label className="form-label">Enquiry Date <span className="text-danger">*</span></label>
                                                        <DateInput
                                                            value={formData.EnquiryDate}
                                                            onChange={(e) => handleInputChange('EnquiryDate', e.target.value)}
                                                            placeholder="DD-MMM-YYYY"
                                                        />
                                                        {errors.EnquiryDate && <ValidationTooltip message={errors.EnquiryDate} />}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                                                        <label className="form-label">Due Date <span className="text-danger">*</span></label>
                                                        <DateInput
                                                            value={formData.DueOn}
                                                            onChange={(e) => handleInputChange('DueOn', e.target.value)}
                                                            placeholder="DD-MMM-YYYY"
                                                        />
                                                        {errors.DueOn && <ValidationTooltip message={errors.DueOn} />}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <label className="form-label">Site Visit Date</label>
                                                        <DateInput
                                                            value={formData.SiteVisitDate}
                                                            onChange={(e) => handleInputChange('SiteVisitDate', e.target.value)}
                                                            placeholder="DD-MMM-YYYY"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Enquiry Type */}
                                                <div className="mb-3" style={{ width: 'calc(66.666667% - 5px)' }}>
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

                                                {/* Enquiry For */}
                                                <div className="mb-3" style={{ width: 'calc(66.666667% - 5px)' }}>
                                                    <ListBoxControl
                                                        label={<span>Enquiry For<span className="text-danger">*</span></span>}
                                                        options={masters.enquiryFor}
                                                        selectedOption={formData.EnquiryFor}
                                                        onOptionChange={(val) => handleInputChange('EnquiryFor', val)}
                                                        listBoxItems={enqForList}
                                                        onAdd={handleAddEnqFor}
                                                        onRemove={() => handleRemoveItem(enqForList, setEnqForList)}
                                                        showNew={currentUser?.role === 'Admin'}
                                                        showEdit={currentUser?.role === 'Admin'}
                                                        canEdit={!!formData.EnquiryFor && currentUser?.role === 'Admin'}
                                                        onNew={() => openNewModal(setShowEnqItemModal)}
                                                        onEdit={handleEditEnqFor}
                                                        error={errors.EnquiryFor}
                                                    />
                                                </div>

                                                {/* Enquiry Details */}
                                                <div className="row mb-3">
                                                    <div className="col-md-12" style={{ position: 'relative' }}>
                                                        <label className="form-label">Enquiry details<span className="text-danger">*</span></label>
                                                        <textarea className="form-control" rows="3"
                                                            style={{ resize: 'none' }}
                                                            onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                                            value={formData.DetailsOfEnquiry} onChange={(e) => handleInputChange('DetailsOfEnquiry', e.target.value)} />
                                                        {errors.DetailsOfEnquiry && <ValidationTooltip message={errors.DetailsOfEnquiry} />}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card 2: Customer Information */}
                                        <div className="card mb-4 shadow-sm border-0 bg-light card-overline">
                                            <div className="card-body p-4">
                                                <h5 className="card-title fw-bold mb-4">Customer Information</h5>

                                                {/* Customer & Received From */}
                                                <div className="row mb-3">
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
                                                            onAdd={onAddCustomerClick}
                                                            onRemove={handleRemoveCustomer}
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

                                                {/* Client Name */}
                                                <div className="mb-3" style={{ width: '50%', paddingRight: '12px' }}>
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

                                                {/* Consultant Name */}
                                                <div className="mb-3" style={{ width: '50%', paddingRight: '12px' }}>
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
                                        </div>

                                        {/* Card 3: Assignment */}
                                        <div className="card mb-4 shadow-sm border-0 bg-light card-overline">
                                            <div className="card-body p-4">
                                                <h5 className="card-title fw-bold mb-4">Assignment</h5>

                                                {/* Concerned SE */}
                                                <div className="row mb-3">
                                                    <div className="col-md-6">
                                                        <ListBoxControl
                                                            label={<span>Concerned SE<span className="text-danger">*</span></span>}
                                                            options={masters.concernedSEs}
                                                            selectedOption={formData.ConcernedSE}
                                                            onOptionChange={(val) => handleInputChange('ConcernedSE', val)}
                                                            listBoxItems={seList}
                                                            onAdd={handleAddSE}
                                                            onRemove={() => handleRemoveItem(seList, setSeList)}
                                                            showNew={(currentUser?.role || '').includes('Admin')}
                                                            showEdit={(currentUser?.role || '').includes('Admin')}
                                                            canEdit={!!formData.ConcernedSE}
                                                            onNew={() => openNewModal(setShowUserModal)}
                                                            onEdit={handleEditSE}
                                                            error={errors.ConcernedSE}
                                                        />
                                                    </div>
                                                </div>


                                            </div>
                                        </div>

                                        {/* Card 4: Attachments & Remarks */}
                                        <div className="card mb-4 shadow-sm border-0 bg-light card-overline">
                                            <div className="card-body p-4">
                                                <h5 className="card-title fw-bold mb-4">Attachments & Remarks</h5>

                                                {/* Document Received */}
                                                <div className="row mb-3">
                                                    <div className="col-md-12">
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
                                                            style={{ resize: 'none' }}
                                                            onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                                            value={formData.DocumentsReceived} onChange={(e) => handleInputChange('DocumentsReceived', e.target.value)} />

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

                                                {/* Remarks */}
                                                <div className="row mb-3">
                                                    <div className="col-md-12">
                                                        <label className="form-label">Remarks</label>
                                                        <textarea className="form-control" rows="2"
                                                            style={{ resize: 'none' }}
                                                            onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                                            value={formData.Remark} onChange={(e) => handleInputChange('Remark', e.target.value)} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card 5: Collaborative Notes */}
                                        {isModifyMode && (
                                            <CollaborativeNotes
                                                enquiryId={formData?.RequestNo || modifyRequestNo}
                                                enquiryData={{
                                                    ...formData,
                                                    SelectedConcernedSEs: seList,
                                                    SelectedEnquiryFor: enqForList
                                                }}
                                            />
                                        )}

                                        {/* Footer: Actions */}
                                        {/* Footer: Actions */}
                                        <div>
                                            {/* Checkboxes Section */}
                                            <div className="d-flex flex-column gap-2 mb-3">
                                                {/* Send Acknowledgement Mail */}
                                                <div className="form-check" style={{ fontSize: '13px' }}>
                                                    <input className="form-check-input" type="checkbox" id="autoAck"
                                                        checked={formData.AutoAck} onChange={(e) => handleInputChange('AutoAck', e.target.checked)} />
                                                    <label className="form-check-label" htmlFor="autoAck">Send acknowledgement mail</label>
                                                </div>

                                                {/* Concerned SE Selection (Conditionally Rendered BELOW Send Ack) */}
                                                {formData.AutoAck && seList.length > 0 && (
                                                    <div className="ms-4 mb-2" style={{ fontSize: '13px' }}>
                                                        <select
                                                            className="form-select form-select-sm"
                                                            value={ackSEList[0] || ''}
                                                            onChange={(e) => {
                                                                setAckSEList(e.target.value ? [e.target.value] : []);
                                                            }}
                                                            style={{ fontSize: '13px', width: '200px' }}
                                                        >
                                                            <option value="">-- Select SE --</option>
                                                            {seList.map((se, idx) => (
                                                                <option key={idx} value={se}>{se}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                )}

                                                {/* ED/CEO Signature Required */}
                                                <div className="form-check" style={{ fontSize: '13px' }}>
                                                    <input className="form-check-input" type="checkbox" id="ceoSign"
                                                        checked={formData.ceosign} onChange={(e) => handleInputChange('ceosign', e.target.checked)} />
                                                    <label className="form-check-label" htmlFor="ceoSign">ED/CEO Signature required</label>
                                                </div>
                                            </div>

                                            {/* Buttons Section (Below Checkboxes) */}
                                            <div className="d-flex justify-content-end gap-2 mt-4 mb-5">
                                                <button type="button" className="btn btn-outline-danger" onClick={resetForm}>Cancel</button>
                                                <button type="submit" className="btn btn-outline-success">
                                                    {isModifyMode ? 'Save Changes' : 'Add Enquiry'}
                                                </button>
                                            </div>
                                        </div>
                                    </form>

                                    {/* Modals */}
                                    <CustomerModal
                                        show={showCustomerModal}
                                        onClose={() => setShowCustomerModal(false)}
                                        mode={modalMode}
                                        initialData={editData}
                                        onSubmit={handleCustomerSubmit}
                                        fixedCategory={fixedCategory}
                                    />
                                    <ContactModal
                                        show={showContactModal}
                                        onClose={() => setShowContactModal(false)}
                                        mode={modalMode}
                                        initialData={editData}
                                        onSubmit={handleContactSubmit}
                                    />
                                    <UserModal
                                        show={showUserModal}
                                        onClose={() => setShowUserModal(false)}
                                        mode={modalMode}
                                        initialData={editData}
                                        onSubmit={handleUserSubmit}
                                    />
                                    <EnquiryItemModal
                                        show={showEnqItemModal}
                                        onClose={() => setShowEnqItemModal(false)}
                                        mode={modalMode}
                                        initialData={editData}
                                        onSubmit={handleEnqItemSubmit}
                                    />
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div >
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

export default function EnquiryFormWrapper(props) {
    return (
        <ErrorBoundary>
            <EnquiryForm {...props} />
        </ErrorBoundary>
    );
}
