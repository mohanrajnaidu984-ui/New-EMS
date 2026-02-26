import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import ListBoxControl from './ListBoxControl';
import HierarchyBuilder from './HierarchyBuilder';
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
    const [activeTab, setActiveTab] = useState(() => localStorage.getItem('enquiry_subTab') || 'New');

    // -- Persistence --
    useEffect(() => {
        localStorage.setItem('enquiry_subTab', activeTab);
    }, [activeTab]);

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
        Status: 'Enquiry',
        EnquiryStatus: 'Active',
        CustomerRefNo: ''
    };

    // Initialize formData from localStorage if available, but only for 'New' mode
    const [formData, setFormData] = useState(() => {
        const saved = localStorage.getItem('enquiry_new_formData');
        if (saved && (localStorage.getItem('enquiry_subTab') || 'New') === 'New') {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error("Failed to parse enquiry_new_formData", e);
            }
        }
        return initialFormState;
    });

    useEffect(() => {
        // Only save to localStorage if we are in 'New' mode to avoid overwriting draft with Modify data
        if (activeTab === 'New') {
            localStorage.setItem('enquiry_new_formData', JSON.stringify(formData));
        }
    }, [formData, activeTab]);

    // ListBox States
    const [enqTypeList, setEnqTypeList] = useState(() => {
        const saved = localStorage.getItem('enquiry_new_enqTypeList');
        return (saved && activeTab === 'New') ? JSON.parse(saved) : [];
    });
    const [enqForList, setEnqForList] = useState(() => {
        const saved = localStorage.getItem('enquiry_new_enqForList');
        return (saved && activeTab === 'New') ? JSON.parse(saved) : [];
    });
    const [customerList, setCustomerList] = useState(() => {
        const saved = localStorage.getItem('enquiry_new_customerList');
        return (saved && activeTab === 'New') ? JSON.parse(saved) : [];
    });
    const [receivedFromList, setReceivedFromList] = useState(() => {
        const saved = localStorage.getItem('enquiry_new_receivedFromList');
        return (saved && activeTab === 'New') ? JSON.parse(saved) : [];
    });
    const [seList, setSeList] = useState(() => {
        const saved = localStorage.getItem('enquiry_new_seList');
        return (saved && activeTab === 'New') ? JSON.parse(saved) : [];
    });
    const [consultantList, setConsultantList] = useState(() => {
        const saved = localStorage.getItem('enquiry_new_consultantList');
        return (saved && activeTab === 'New') ? JSON.parse(saved) : [];
    });

    useEffect(() => {
        if (activeTab === 'New') {
            localStorage.setItem('enquiry_new_enqTypeList', JSON.stringify(enqTypeList));
            localStorage.setItem('enquiry_new_enqForList', JSON.stringify(enqForList));
            localStorage.setItem('enquiry_new_customerList', JSON.stringify(customerList));
            localStorage.setItem('enquiry_new_receivedFromList', JSON.stringify(receivedFromList));
            localStorage.setItem('enquiry_new_seList', JSON.stringify(seList));
            localStorage.setItem('enquiry_new_consultantList', JSON.stringify(consultantList));
        }
    }, [enqTypeList, enqForList, customerList, receivedFromList, seList, consultantList, activeTab]);

    // Validation Errors
    const [errors, setErrors] = useState({});
    const [attachments, setAttachments] = useState([]);
    const [pendingFiles, setPendingFiles] = useState([]); // Now stores only meta: { id, fileName, previewUrl }
    const fileObjectsRef = useRef({}); // Stores actual File objects: { [id]: File }
    const [ackSEList, setAckSEList] = useState([]);
    const [hyperlink, setHyperlink] = useState({ name: '', url: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Project Suggestions State
    const [projectSuggestions, setProjectSuggestions] = useState([]);
    const [showProjectSuggestions, setShowProjectSuggestions] = useState(false);

    // Access Control State
    const [canEdit, setCanEdit] = useState(true);
    const [isLimitedEdit, setIsLimitedEdit] = useState(false); // New state for limited editing

    // Track original items when form loads (for selective removal by limited users)
    const [originalEnqForList, setOriginalEnqForList] = useState([]);
    const [originalSeList, setOriginalSeList] = useState([]);
    const [originalCustomerList, setOriginalCustomerList] = useState([]);
    const [originalReceivedFromList, setOriginalReceivedFromList] = useState([]);
    const [originalConsultantList, setOriginalConsultantList] = useState([]);

    // Ref for error section to scroll to it when validation fails
    const errorSectionRef = useRef(null);

    // Dynamic Lists
    const combinedClientNames = useMemo(() => {
        const combined = [
            ...(masters.existingCustomers || []),
            ...(masters.clientNames || []),
            ...(masters.consultantNames || [])
        ];
        return Array.from(new Set(combined.filter(Boolean))).sort();
    }, [masters.existingCustomers, masters.clientNames, masters.consultantNames]);

    const isFormEmpty = useMemo(() => {
        // We ignore EnquiryDate as it has a default, and RequestNo/Status/etc.
        const hasText = (formData.SourceOfInfo || '').trim() ||
            (formData.DueOn || '').trim() ||
            (formData.SiteVisitDate || '').trim() ||
            (formData.ProjectName || '').trim() ||
            (formData.ClientName || '').trim() ||
            (formData.ConsultantName || '').trim() ||
            (formData.DetailsOfEnquiry || '').trim() ||
            (formData.DocumentsReceived || '').trim() ||
            (formData.Remark || '').trim() ||
            (formData.CustomerRefNo || '').trim();

        const hasCheck = formData.hardcopy || formData.drawing || formData.dvd ||
            formData.spec || formData.eqpschedule || formData.AutoAck || formData.ceosign;

        const hasLists = enqTypeList.length > 0 ||
            enqForList.length > 0 ||
            customerList.length > 0 ||
            receivedFromList.length > 0 ||
            seList.length > 0 ||
            consultantList.length > 0;

        return !hasText && !hasCheck && !hasLists;
    }, [formData, enqTypeList, enqForList, customerList, receivedFromList, seList, consultantList]);

    const enquiriesList = useMemo(() => enquiries ? Object.values(enquiries) : [], [enquiries]);

    const renderContactOption = useCallback((opt) => {
        const [name, company] = opt.split('|');
        return `${name} (${company})`;
    }, []);

    const renderContactListBoxItem = useCallback((item, idx) => {
        const [name, company] = item.split('|');
        return `${idx + 1}. ${name} (${company})`;
    }, []);

    const receivedFromOptions = useMemo(() => {
        if (!formData.CustomerName || !masters.contacts) return [];
        const normalize = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
        const target = normalize(formData.CustomerName);
        return masters.contacts
            .filter(c => normalize(c.CompanyName) === target)
            .map(c => `${c.ContactName}|${c.CompanyName}`);
    }, [formData.CustomerName, masters.contacts]);

    const filteredSEOptions = useMemo(() => {
        if (!enqForList || enqForList.length === 0) return masters.concernedSEs;
        if (!masters.users) return masters.concernedSEs;

        const selectedDivisions = enqForList.map(item => {
            const nameStr = typeof item === 'string' ? item : (item.itemName || item.name || '');
            // Strip format "L1 - Name" to handle names correctly
            const match = nameStr.match(/^L\d+\s-\s(.+)/);
            return (match ? match[1] : nameStr).trim().toLowerCase();
        });

        // Filter users whose Department matches any selected division
        const filteredUsers = masters.users.filter(u => {
            if (!u.Department) return false;
            return selectedDivisions.includes(u.Department.trim().toLowerCase());
        });

        // Create a unique list of FullNames from the filtered users
        const uniqueNames = Array.from(new Set(filteredUsers.map(u => u.FullName.trim())));

        // Fallback to all SEs if no match found (to avoid empty dropdown if mappings aren't perfect)
        return uniqueNames.length > 0 ? uniqueNames : masters.concernedSEs;
    }, [enqForList, masters.users, masters.concernedSEs]);

    // Effect to determine edit permission
    useEffect(() => {
        if (activeTab === 'New') {
            setCanEdit(true);
            setIsLimitedEdit(false);
        } else if (activeTab === 'Modify' && isModifyMode) {
            checkEditPermission();
        }
    }, [activeTab, isModifyMode, formData, currentUser, seList, enqForList]);

    const checkEditPermission = () => {
        if (!currentUser) return;
        const roleString = currentUser.role || currentUser.Roles || '';
        const userRoles = typeof roleString === 'string'
            ? roleString.split(',').map(r => r.trim().toLowerCase())
            : (Array.isArray(roleString) ? roleString.map(r => r.toLowerCase()) : []);

        // Admin has full edit access
        if (userRoles.includes('admin') || userRoles.includes('system')) {
            setCanEdit(true);
            setIsLimitedEdit(false);
            return;
        }

        const creatorName = (formData.CreatedBy || '').trim().toLowerCase();
        const currentUserName = (currentUser.name || '').trim().toLowerCase();

        // Creator has full edit access
        if (creatorName === currentUserName) {
            setCanEdit(true);
            setIsLimitedEdit(false);
            return;
        }

        // Check if user has view access (Concerned SE or Division Member)
        const userEmail = (currentUser.email || currentUser.EmailId || '').trim().toLowerCase();
        let hasViewAccess = false;

        // Check if user is a Concerned SE
        if (seList.includes(currentUser.name)) {
            hasViewAccess = true;
        }

        // Check if user is a Division Member (CC or Common email in Enquiry For items)
        for (const itemName of enqForList) {
            const item = masters.enqItems.find(i => i.ItemName === itemName);
            if (!item) continue;

            const commonEmails = (item.CommonMailIds ? (Array.isArray(item.CommonMailIds) ? item.CommonMailIds : item.CommonMailIds.split(/[,;]/)) : []).map(e => e.trim().toLowerCase());
            const ccEmails = (item.CCMailIds ? (Array.isArray(item.CCMailIds) ? item.CCMailIds : item.CCMailIds.split(/[,;]/)) : []).map(e => e.trim().toLowerCase());

            if (commonEmails.includes(userEmail) || ccEmails.includes(userEmail)) {
                hasViewAccess = true;
                break;
            }
        }

        // If user has view access, allow limited editing
        if (hasViewAccess) {
            setCanEdit(true);
            setIsLimitedEdit(true); // Limited edit: can only add to Enquiry For and Concerned SE
            return;
        }

        // No access at all
        setCanEdit(false);
        setIsLimitedEdit(false);
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
            if (value && value.trim().length >= 3 && enquiriesList.length > 0) {
                const matches = enquiriesList.filter(e =>
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
            const res = await fetch(`/api/system/next-request-no?t=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                setFormData(prev => ({ ...prev, RequestNo: data.nextId }));
            } else {
                // Fallback or error handling? For now allow manual entry or retry
            }
        } catch (err) {
            // Error handling
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
            alert('Error: ' + err.message);
        }
    };

    const handleAddReceivedFrom = () => {
        // Check if both Customer Name and Received From are selected
        if (!formData.CustomerName) {
            alert('Please select a Customer Name first');
            return;
        }

        if (!formData.ReceivedFrom) {
            alert('Please select a Received From contact');
            return;
        }

        if (formData.ReceivedFrom && !receivedFromList.includes(formData.ReceivedFrom)) {
            setReceivedFromList([...receivedFromList, formData.ReceivedFrom]);

            // Auto-add customer if not present (Enforce paired insertion)
            // We use formData.CustomerName directly as the source of truth
            if (formData.CustomerName && !customerList.includes(formData.CustomerName)) {
                setCustomerList(prev => [...prev, formData.CustomerName]);
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

    const handleAddConsultant = () => {
        if (formData.ConsultantName && !consultantList.includes(formData.ConsultantName)) {
            setConsultantList([...consultantList, formData.ConsultantName]);
            handleInputChange('ConsultantName', '');
        }
    };

    const handleRemoveCustomer = () => {
        if (isLimitedEdit && customerList.length <= originalCustomerList.length) {
            return;
        }
        if (customerList.length > 0) {
            const removedCustomer = customerList[customerList.length - 1];
            setCustomerList(customerList.slice(0, -1));

            // Sync: Remove contacts belonging to this customer
            const newReceivedFromList = receivedFromList.filter(item => {
                const [, company] = item.split('|');
                // Robust comparison: Trim and ignore trailing commas/spaces
                const cleanCompany = (company || '').replace(/,\s*$/, '').trim();
                const cleanRemoved = (removedCustomer || '').replace(/,\s*$/, '').trim();
                return cleanCompany !== cleanRemoved;
            });
            setReceivedFromList(newReceivedFromList);
        }
    };

    const handleRemoveReceivedFrom = () => {
        if (isLimitedEdit && receivedFromList.length <= originalReceivedFromList.length) {
            return;
        }
        if (receivedFromList.length > 0) {
            const removedItem = receivedFromList[receivedFromList.length - 1];
            const [, removedCompany] = removedItem.split('|');

            // CLEANUP: Handle cases where company name in contact has trailing comma (e.g. from bad concatenation)
            const cleanRemovedCompany = (removedCompany || '').replace(/,\s*$/, '').trim();

            const newReceivedFromList = receivedFromList.slice(0, -1);
            setReceivedFromList(newReceivedFromList);

            // Sync: Only remove the company if NO other contacts from that company remain
            const hasOtherContacts = newReceivedFromList.some(item => {
                const [, company] = item.split('|');
                const cleanCompany = (company || '').replace(/,\s*$/, '').trim();
                return cleanCompany === cleanRemovedCompany;
            });

            if (!hasOtherContacts) {
                // If limited edit, don't remove if it's an original customer
                if (!isLimitedEdit || !originalCustomerList.some(c => (c || '').replace(/,\s*$/, '').trim() === cleanRemovedCompany)) {
                    setCustomerList(prev => prev.filter(c => (c || '').replace(/,\s*$/, '').trim() !== cleanRemovedCompany));
                }
            }
        }
    };

    const handleRemoveItem = (list, setList, originalList = []) => {
        if (isLimitedEdit && list.length <= originalList.length) {
            return;
        }
        if (list.length > 0) {
            setList(list.slice(0, -1));
        }
    };

    // --- Modal Open Handlers ---
    const openNewModal = (setter, category = null, prefilledData = null) => {
        setEditData(prefilledData);
        setModalMode('Add');
        setFixedCategory(category);
        setter(true);
    };

    const handleEditEnqFor = (itemName) => {
        let selected = itemName || formData.EnquiryFor;

        // Handle "L1 - Name" format from HierarchyBuilder (strip prefix)
        if (typeof selected === 'string') {
            const prefixMatch = selected.match(/^L\d+\s-\s(.+)/);
            if (prefixMatch) {
                selected = prefixMatch[1];
            }
        }

        if (!selected) return alert("Select an item to edit");
        const itemData = masters.enqItems.find(i => i.ItemName === selected);
        if (itemData) {
            setEditData(itemData);
            setModalMode('Edit');
            setShowEnqItemModal(true);
        } else {
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
        if (modalMode === 'Add') {
            const result = await addMaster('customer', { ...data, RequestNo: formData.RequestNo });
            if (!result) return;
            const newItem = { ...data, ID: result.id };

            // Update specific list based on category
            if (data.Category === 'Contractor') {
                handleInputChange('CustomerName', data.CompanyName);
                updateMasters(prev => ({
                    ...prev,
                    existingCustomers: [...prev.existingCustomers, data.CompanyName],
                    customers: [...prev.customers, newItem]
                }));
            } else if (data.Category === 'Client') {
                handleInputChange('ClientName', data.CompanyName);
                updateMasters(prev => ({
                    ...prev,
                    clientNames: [...prev.clientNames, data.CompanyName],
                    customers: [...prev.customers, newItem]
                }));
            } else if (data.Category === 'Consultant') {
                handleInputChange('ConsultantName', data.CompanyName);
                updateMasters(prev => ({
                    ...prev,
                    consultantNames: [...prev.consultantNames, data.CompanyName],
                    customers: [...prev.customers, newItem]
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
        if (modalMode === 'Add') {
            const result = await addMaster('contact', { ...data, RequestNo: formData.RequestNo });
            if (!result) return;
            const newItem = { ...data, ID: result.id };
            updateMasters(prev => {
                const newContacts = [...prev.contacts, newItem];
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
            const result = await addMaster('user', { ...data, RequestNo: formData.RequestNo });
            if (!result) return;
            const newItem = { ...data, ID: result.id };
            handleInputChange('ConcernedSE', data.FullName);
            updateMasters(prev => ({
                ...prev,
                users: [...prev.users, newItem],
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
        if (modalMode === 'Add') {
            const result = await addMaster('enquiryItem', { ...data, RequestNo: formData.RequestNo });
            if (!result) return;
            const newItem = { ...data, ID: result.id };
            handleInputChange('EnquiryFor', data.ItemName);
            updateMasters(prev => ({
                ...prev,
                enqItems: [...prev.enqItems, newItem],
                enquiryFor: [...prev.enquiryFor, data.ItemName]
            }));
        } else {
            if (data.ID) {
                const success = await updateMaster('enquiryItem', data.ID, data);
                if (success) {
                    updateMasters(prev => {
                        const newItems = prev.enqItems.map(item => item.ID == data.ID ? data : item);
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

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!canEdit) {
            alert('You do not have permission to modify this enquiry.');
            return;
        }

        if (isSubmitting) return;

        const newErrors = {};

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
            'DetailsOfEnquiry': formData.DetailsOfEnquiry,
            'CustomerRefNo': formData.CustomerRefNo
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
            // Scroll to error message section after a brief delay to ensure it's rendered
            setTimeout(() => {
                if (errorSectionRef.current) {
                    errorSectionRef.current.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                }
            }, 100);
            return;
        }

        setIsSubmitting(true);

        const payload = {
            ...formData,
            SelectedEnquiryTypes: enqTypeList,
            SelectedEnquiryFor: enqForList,
            SelectedCustomers: customerList,
            SelectedReceivedFroms: receivedFromList,
            SelectedConcernedSEs: seList,
            SelectedConsultants: consultantList,
            AcknowledgementSE: ackSEList[0] || '',
            CreatedBy: isModifyMode ? formData.CreatedBy : (currentUser?.name || 'System'),
            ModifiedBy: currentUser?.name || 'System',
            // Only trigger email if EnquiryStatus is Active
            AutoAck: formData.EnquiryStatus === 'Active' ? formData.AutoAck : false
        };

        try {
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
                await updateEnquiry(formData.RequestNo, payload);

                // Upload pending files if any
                if (pendingFiles.length > 0) {
                    await uploadPendingFiles(formData.RequestNo);
                }

                alert(`Enquiry Updated: ${formData.RequestNo}`);
            } else {
                // RequestNo is already generated in useEffect
                const result = await addEnquiry(payload);

                // If duplicate error, regenerate number and retry
                if (!result.success && result.error && result.error.includes('already exists')) {
                    alert('Duplicate enquiry number detected. Generating a new unique number...');
                    generateNewRequestNo();
                    return; // Don't reset form, let user resubmit with new number
                }

                if (result.success) {
                    // Upload pending files if any BEFORE triggering notification
                    if (pendingFiles.length > 0) {
                        await uploadPendingFiles(formData.RequestNo);
                    }

                    // Trigger Email Notification (Created Mode only)
                    await sendNotification(formData.RequestNo);

                    alert(`Enquiry Added: ${formData.RequestNo}`);
                    resetForm();
                }
            }
        } catch (err) {
            console.error('Submit failed:', err);
            alert('An unexpected error occurred during submission.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const sendNotification = async (requestNo) => {
        try {
            const res = await fetch('/api/enquiries/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestNo })
            });
            if (!res.ok) {
                // notification failed
            } else {
                // success
            }
        } catch (err) {
            // error
        }
    };

    const uploadPendingFiles = async (requestNo) => {
        const userName = currentUser?.name || 'System';
        const userDivision = currentUser?.DivisionName || '';

        // Separate pending items into groups by visibility and type
        const groups = pendingFiles.reduce((acc, item) => {
            const key = `${item.visibility || 'Public'}-${item.type || 'File'}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
        }, {});

        for (const key in groups) {
            const items = groups[key];
            const [visibility, type] = key.split('-');

            if (type === 'File') {
                const uploadData = new FormData();
                items.forEach(meta => {
                    const file = fileObjectsRef.current[meta.id];
                    if (file) uploadData.append('files', file, meta.fileName);
                });

                try {
                    const res = await fetch(`/api/attachments/upload?requestNo=${encodeURIComponent(requestNo)}&userName=${encodeURIComponent(userName)}&visibility=${visibility}&type=File&division=${encodeURIComponent(userDivision)}`, {
                        method: 'POST',
                        body: uploadData
                    });
                    if (!res.ok) {
                        const errText = await res.text();
                        console.error('File upload failed:', errText);
                    }
                } catch (err) {
                    console.error('Upload error:', err);
                }
            } else if (type === 'Folder') {
                for (const item of items) {
                    const uploadData = new FormData();
                    const groupFiles = fileObjectsRef.current[item.id];
                    if (groupFiles && Array.isArray(groupFiles)) {
                        groupFiles.forEach(file => {
                            uploadData.append('files', file, file.webkitRelativePath || file.name);
                        });
                    }

                    try {
                        const res = await fetch(`/api/attachments/upload?requestNo=${encodeURIComponent(requestNo)}&userName=${encodeURIComponent(userName)}&visibility=${visibility}&type=File&division=${encodeURIComponent(userDivision)}`, {
                            method: 'POST',
                            body: uploadData
                        });
                        if (!res.ok) {
                            const errText = await res.text();
                            console.error('Folder upload failed:', errText);
                        }
                    } catch (err) {
                        console.error('Upload error:', err);
                    }
                }
            } else if (type === 'Link') {
                for (const item of items) {
                    try {
                        const url = item.LinkURL || item.linkUrl;
                        const fName = item.FileName || item.fileName;
                        const res = await fetch(`/api/attachments/upload?requestNo=${encodeURIComponent(requestNo)}&userName=${encodeURIComponent(userName)}&visibility=${visibility}&type=Link&linkUrl=${encodeURIComponent(url)}&fileName=${encodeURIComponent(fName)}&division=${encodeURIComponent(userDivision)}`, {
                            method: 'POST'
                        });
                        if (!res.ok) {
                            const errText = await res.text();
                            console.error('Link upload failed:', errText);
                        }
                    } catch (err) {
                        console.error('Upload error:', err);
                    }
                }
            }
        }

        setPendingFiles([]);
        fileObjectsRef.current = {};
        await fetchAttachments();
    };

    const resetForm = () => {
        setFormData(initialFormState);
        setEnqTypeList([]);
        setEnqForList([]);
        setCustomerList([]);
        setReceivedFromList([]);
        setSeList([]);
        setConsultantList([]);
        setAckSEList([]); // Clear acknowledgement SE list
        setIsModifyMode(false);
        setModifyRequestNo('');
        setAttachments([]);
        setPendingFiles([]);
        setProjectSuggestions([]);
        setShowProjectSuggestions(false);
        setOriginalEnqForList([]);
        setOriginalSeList([]);
        setOriginalCustomerList([]);
        setOriginalReceivedFromList([]);
        setOriginalConsultantList([]);

        // Clear Persistence
        localStorage.removeItem('enquiry_new_formData');
        localStorage.removeItem('enquiry_new_enqTypeList');
        localStorage.removeItem('enquiry_new_enqForList');
        localStorage.removeItem('enquiry_new_customerList');
        localStorage.removeItem('enquiry_new_receivedFromList');
        localStorage.removeItem('enquiry_new_seList');
        localStorage.removeItem('enquiry_new_consultantList');

        if (activeTab === 'New') {
            generateNewRequestNo();
        }
    };

    // --- Modify Logic ---
    const loadEnquiry = async (requestNo) => {
        let enq = null;
        try {
            // Attempt to fetch fresh data from server
            const res = await fetch(`/api/enquiries/${encodeURIComponent(requestNo)}`);
            if (res.ok) {
                enq = await res.json();
            } else {
                // console.warn(`API fetch fail for ${requestNo}, falling back to context.`);
                enq = getEnquiry(requestNo);
            }
        } catch (err) {
            // console.error('Error fetching fresh enquiry:', err);
            enq = getEnquiry(requestNo);
        }

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
                ClientName: enq.ClientName || '',
                ConsultantName: enq.ConsultantName || '',
                EnquiryDate: formatDate(enq.EnquiryDate),
                DueOn: formatDate(enq.DueDate || enq.DueOn),
                SiteVisitDate: formatDate(enq.SiteVisitDate),
                hardcopy: enq.Doc_HardCopies !== undefined ? !!enq.Doc_HardCopies : !!enq.hardcopy,
                drawing: enq.Doc_Drawing !== undefined ? !!enq.Doc_Drawing : !!enq.drawing,
                dvd: enq.Doc_CD_DVD !== undefined ? !!enq.Doc_CD_DVD : !!enq.dvd,
                spec: enq.Doc_Spec !== undefined ? !!enq.Doc_Spec : !!enq.spec,
                eqpschedule: enq.Doc_EquipmentSchedule !== undefined ? !!enq.Doc_EquipmentSchedule : !!enq.eqpschedule,
                ceosign: enq.ED_CEOSignatureRequired !== undefined ? !!enq.ED_CEOSignatureRequired : !!enq.ceosign,
                AutoAck: enq.SendAcknowledgementMail !== undefined ? !!enq.SendAcknowledgementMail : !!enq.AutoAck,
                // FIX: inputs should be empty on load, lists are populated separately
                CustomerName: '',
                ReceivedFrom: ''
            };

            setFormData(mappedData);
            setEnqTypeList(enq.SelectedEnquiryTypes || (enq.EnquiryType ? enq.EnquiryType.split(',').filter(Boolean) : []));

            const loadedEnqForList = enq.SelectedEnquiryFor || (enq.EnquiryFor ? enq.EnquiryFor.split(',').filter(Boolean) : []);
            setEnqForList(loadedEnqForList);
            setOriginalEnqForList([...loadedEnqForList]); // Store original for comparison

            const loadedCustomers = enq.SelectedCustomers || (enq.CustomerName ? enq.CustomerName.split(',').filter(Boolean) : []);
            setCustomerList(loadedCustomers);
            setOriginalCustomerList([...loadedCustomers]);

            const loadedReceivedFrom = enq.SelectedReceivedFroms || (enq.ReceivedFrom ? enq.ReceivedFrom.split(',').filter(Boolean) : []);
            setReceivedFromList(loadedReceivedFrom);
            setOriginalReceivedFromList([...loadedReceivedFrom]);

            const seList = enq.SelectedConcernedSEs || (enq.ConcernedSE ? enq.ConcernedSE.split(',').filter(Boolean) : []);
            setSeList(seList);
            setOriginalSeList([...seList]); // Store original for comparison

            const consultants = enq.SelectedConsultants || (enq.ConsultantName ? enq.ConsultantName.split(',').filter(Boolean) : []);
            setConsultantList(consultants);
            setOriginalConsultantList([...consultants]);

            setAckSEList(seList);
            setIsModifyMode(true);

            if (enq.RequestNo) {
                await loadAttachmentsForEnquiry(enq.RequestNo);
            }
        } else {
            console.warn('Enquiry not found:', requestNo);
        }
    };

    const handleLoadEnquiry = async () => {
        await loadEnquiry(modifyRequestNo);
    };

    const handleOpenFromSearch = async (reqNo) => {
        setModifyRequestNo(reqNo);
        await loadEnquiry(reqNo);
        setActiveTab('Modify');
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

    const handleAddLink = (visibility = 'Public') => {
        if (!hyperlink.url) return;

        // Split by newlines or commas, then filter out empty lines
        const links = hyperlink.url.split(/[\n,]+/).map(l => l.trim()).filter(l => l.length > 0);

        if (links.length === 0) return;

        const now = Date.now();
        const addedDate = new Date().toISOString();
        const newLinks = links.map((link, index) => ({
            id: now + index,
            FileName: link, // Match SQL naming
            isPending: true,
            visibility,
            type: 'Link',
            LinkURL: link, // Match SQL naming
            addedDate
        }));

        setPendingFiles(prev => [...prev, ...newLinks]);
        setHyperlink({ ...hyperlink, url: '' }); // Clear only URL
    };

    const renderAttachmentList = (visibility, type) => {
        const userDivision = (currentUser?.DivisionName || '').trim().toLowerCase();
        const isAdmin = (currentUser?.role || currentUser?.Roles || '').toLowerCase().includes('admin');

        // Combined filter for both individual files and folders when type is 'File'
        const filteredPending = pendingFiles.filter(f => {
            if ((f.visibility || 'Public') !== visibility) return false;
            const fType = f.type || 'File';
            if (type === 'File') return fType === 'File' || fType === 'Folder';
            return fType === type;
        });

        const filteredUploaded = attachments.filter(a => {
            if ((a.Visibility || 'Public') === 'Private') {
                if (visibility !== 'Private') return false;

                // Strict check: Show only to Admin, same Division, or original Uploader
                if (!isAdmin) {
                    const fileDivision = (a.Division || '').trim().toLowerCase();
                    const isOwnFile = (a.UploadedBy || '').toLowerCase() === (currentUser?.FullName || currentUser?.name || currentUser?.UserName || '').toLowerCase();

                    if (fileDivision && userDivision) {
                        if (fileDivision !== userDivision && !isOwnFile) return false;
                    } else if (!isOwnFile) {
                        // If either division is missing, fallback to creator only
                        return false;
                    }
                }
            } else {
                if (visibility !== 'Public') return false;
            }

            const aType = a.AttachmentType || 'File';
            if (type === 'File') return aType === 'File';
            return aType === type;
        });

        // Grouping logic for UI display
        const groups = {}; // { folderName: { id, fileName, isGroup: true, items: [] } }
        const topLevel = [];

        // Group uploaded files by path (ONLY for File type, not for Links which naturally contain slashes)
        filteredUploaded.forEach(att => {
            if (type === 'File' && att.FileName && att.FileName.includes('/')) {
                const root = att.FileName.split('/')[0];
                if (!groups[root]) {
                    groups[root] = { id: `ugroup-${root}`, fileName: root, isGroup: true, items: [], visibility: att.Visibility };
                }
                groups[root].items.push(att);
            } else {
                topLevel.push(att);
            }
        });

        // Add pending items
        filteredPending.forEach(p => {
            const pName = p.FileName || p.fileName;
            if (p.type === 'Folder') {
                topLevel.push({ ...p, isGroup: true });
            } else if (type === 'File' && pName && pName.includes('/')) {
                const root = pName.split('/')[0];
                if (!groups[root]) {
                    groups[root] = { id: `pgroup-${root}`, fileName: root, isGroup: true, items: [], isPending: true };
                }
                groups[root].items.push(p);
            } else {
                topLevel.push(p);
            }
        });

        // Merge groups into topLevel
        Object.values(groups).forEach(g => topLevel.push(g));

        if (topLevel.length === 0) return null;

        return (
            <ul className="list-group border-0">
                {topLevel.map((item, idx) => {
                    const dateVal = item.addedDate || item.UploadedAt || item.CreatedDate || item.UploadDate || '';
                    const displayDate = dateVal ? new Date(dateVal).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '';
                    const uploadedBy = item.UploadedBy || '';

                    return (
                        <li key={item.id || idx} className={`list-group-item d-flex align-items-center justify-content-between mb-1 border rounded ${type === 'Link' ? 'p-1' : 'p-2'}`}>
                            <div className="d-flex align-items-center text-truncate me-2" style={{ flex: '1' }} title={item.fileName || item.FileName}>
                                <i className={item.isGroup ? "bi bi-folder-fill text-warning fs-5 me-2" : (type === 'Link' ? "bi bi-link-45deg text-success fs-6 me-2" : "bi bi-file-earmark-text text-secondary fs-5 me-2")}></i>
                                <div className="d-flex flex-column text-truncate">
                                    <span className="fw-medium text-dark text-truncate" style={{ fontSize: type === 'Link' ? '12px' : '13px' }}>{item.fileName || item.FileName}</span>
                                    {(displayDate || uploadedBy) && (
                                        <div className="d-flex align-items-center gap-2 text-muted" style={{ fontSize: '9px' }}>
                                            {displayDate && <span><i className="bi bi-clock me-1"></i>{displayDate}</span>}
                                            {uploadedBy && <span><i className="bi bi-person me-1"></i>{uploadedBy}</span>}
                                        </div>
                                    )}
                                </div>
                                {item.isPending && <span className="badge bg-warning text-dark ms-2 rounded-pill" style={{ fontSize: '9px' }}>Pending</span>}
                                {item.items?.length > 0 && <span className="text-muted ms-2" style={{ fontSize: '10px' }}>({item.items.length} files)</span>}
                            </div>

                            <div className="d-flex align-items-center gap-1">
                                {item.isPending ? (
                                    <button type="button" className="btn btn-sm btn-outline-danger p-0" style={{ width: type === 'Link' ? '24px' : '28px', height: type === 'Link' ? '24px' : '28px', fontSize: '10px' }} onClick={() => handleRemoveAttachment(item.id, true)} title="Remove"><i className="bi bi-trash"></i></button>
                                ) : (
                                    !item.isGroup && (
                                        type === 'File' ? (
                                            <>
                                                <a href={`/api/attachments/${item.ID}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-info p-0 d-flex align-items-center justify-content-center" style={{ width: '28px', height: '28px' }} title="View"><i className="bi bi-eye"></i></a>
                                                <a href={`/api/attachments/${item.ID}?download=true`} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary p-0 d-flex align-items-center justify-content-center" style={{ width: '28px', height: '28px' }} title="Download"><i className="bi bi-download"></i></a>
                                            </>
                                        ) : (
                                            <a
                                                href={(() => {
                                                    const url = item.LinkURL || item.linkUrl || '';
                                                    return url.startsWith('http') ? url : `https://${url}`;
                                                })()}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn btn-sm btn-outline-info p-0 d-flex align-items-center justify-content-center"
                                                style={{ width: '24px', height: '24px', fontSize: '10px' }}
                                                title="Open Link"
                                            >
                                                <i className="bi bi-box-arrow-up-right"></i>
                                            </a>
                                        )
                                    )
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
        );
    };

    // --- File Upload ---
    // --- File Upload ---
    const handleFileUpload = (e, visibility = 'Public') => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        // More robust check for folder vs file input
        const isFolder = e.target.hasAttribute('webkitdirectory');
        const id = Date.now();

        if (isFolder) {
            // Group files as a single "Folder" entry
            const firstPath = files[0].webkitRelativePath || '';
            const rootFolderName = firstPath.split('/')[0] || 'Selected Folder';

            fileObjectsRef.current[id] = Array.from(files);
            setPendingFiles(prev => [...prev, {
                id,
                fileName: rootFolderName,
                isPending: true,
                visibility,
                type: 'Folder',
                itemCount: files.length,
                addedDate: new Date().toISOString()
            }]);
        } else {
            // Individual file uploads
            const newMeta = [];
            const now = Date.now();
            const addedDate = new Date().toISOString();
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fid = now + i;
                fileObjectsRef.current[fid] = file;
                newMeta.push({ id: fid, fileName: file.name, isPending: true, visibility, type: 'File', addedDate });
            }
            setPendingFiles(prev => [...prev, ...newMeta]);
        }
        e.target.value = null; // Reset to allow repeated selection of same folder/file
    };

    const handleRemoveAttachment = async (attachmentId, isPending = false) => {

        if (isPending) {
            // No confirmation needed for pending files (not saved yet)
            setPendingFiles(prev => {
                const filtered = prev.filter(f => f.id !== attachmentId);
                delete fileObjectsRef.current[attachmentId];
                const fileToRemove = prev.find(f => f.id === attachmentId);
                if (fileToRemove && fileToRemove.previewUrl) {
                    URL.revokeObjectURL(fileToRemove.previewUrl);
                }
                return filtered;
            });
            return;
        }

        // Confirmation only for uploaded files
        if (!window.confirm('Are you sure you want to delete this file?')) {
            return;
        }

        try {
            const res = await fetch(`/api/attachments/${attachmentId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                setAttachments(prev => prev.filter(a => a.ID !== attachmentId));
            } else {
                console.error('Failed to delete file');
            }
        } catch (err) {
            console.error('Error deleting file:', err);
        }
    };

    const loadAttachmentsForEnquiry = async (requestNo) => {
        setAttachments([]);
        try {
            // Send RequestNo as query parameter
            const res = await fetch(`/api/attachments?requestNo=${encodeURIComponent(requestNo)}`);
            if (res.ok) {
                const data = await res.json();
                setAttachments(data);
            }
        } catch (err) {
            // error
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


    return (
        <div style={{ position: 'relative', minHeight: '100vh' }}>
            <div style={{ position: 'relative', zIndex: 1 }}>
                <div className="row justify-content-center">
                    <div className="col-12" style={{ flex: '0 0 66%', maxWidth: '66%' }}>
                        <div className="d-flex mb-3" style={{ borderBottom: '1px solid #e0e0e0' }}>
                            <button
                                className="btn rounded-0 d-flex align-items-center"
                                style={{
                                    color: activeTab === 'New' ? '#1d1d1f' : '#6c757d',
                                    borderBottom: '3px solid transparent',
                                    fontWeight: activeTab === 'New' ? '600' : '400',
                                    backgroundColor: 'transparent',
                                    padding: '8px 16px',
                                    marginBottom: '-2px',
                                    fontSize: '12px',
                                    opacity: activeTab === 'New' ? 1 : 0.8
                                }}
                                onClick={() => { setActiveTab('New'); setIsModifyMode(false); }}
                            >
                                <i className="bi bi-plus-lg me-2"></i>
                                New Enquiry
                            </button>
                            <button
                                className="btn rounded-0 d-flex align-items-center"
                                style={{
                                    color: activeTab === 'Modify' ? '#1d1d1f' : '#6c757d',
                                    borderBottom: '3px solid transparent',
                                    fontWeight: activeTab === 'Modify' ? '600' : '400',
                                    backgroundColor: 'transparent',
                                    padding: '8px 16px',
                                    marginBottom: '-2px',
                                    fontSize: '12px',
                                    opacity: activeTab === 'Modify' ? 1 : 0.8
                                }}
                                onClick={() => { setActiveTab('Modify'); }}
                            >
                                <i className="bi bi-pencil-square me-2"></i>
                                {activeTab === 'Modify' && !canEdit ? 'View Enquiry' : 'Modify Enquiry'}
                            </button>
                            <button
                                className="btn rounded-0 d-flex align-items-center"
                                style={{
                                    color: activeTab === 'Search' ? '#1d1d1f' : '#6c757d',
                                    borderBottom: '3px solid transparent',
                                    fontWeight: activeTab === 'Search' ? '600' : '400',
                                    backgroundColor: 'transparent',
                                    padding: '8px 16px',
                                    marginBottom: '-2px',
                                    fontSize: '12px',
                                    opacity: activeTab === 'Search' ? 1 : 0.8
                                }}
                                onClick={() => setActiveTab('Search')}
                            >
                                <i className="bi bi-search me-2"></i>
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
                                            <label className="form-label">Enquiry No.<span className="text-danger">*</span></label>
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
                                        <div className="card mb-2 shadow-sm border-0 bg-white" style={{ borderRadius: '12px' }}>
                                            <div className="card-body p-2">
                                                <h6 className="card-title fw-bold mb-2" style={{ color: '#2d3748', fontSize: '14px' }}>Enquiry Status Tracker</h6>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', marginTop: '5px', marginBottom: '5px' }}>
                                                    {['Enquiry', 'Pricing', 'Quote', 'Follow-up', 'Won'].map((step, index) => {
                                                        const stepNum = index + 1;

                                                        // Determine current step number based on formData.Status
                                                        let currentStep = 1;
                                                        const status = (formData.Status || 'Enquiry').trim();
                                                        const statusLower = status.toLowerCase();

                                                        if (statusLower === 'enquiry' || statusLower === 'open') currentStep = 1;
                                                        else if (statusLower === 'pricing') currentStep = 2;
                                                        else if (statusLower === 'quote') currentStep = 3;
                                                        else if (statusLower === 'follow-up' || statusLower === 'followup') currentStep = 4;
                                                        else if (statusLower === 'won' || statusLower === 'lost') currentStep = 5;

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
                                                                        width: '20px',
                                                                        height: '20px',
                                                                        borderRadius: '50%',
                                                                        backgroundColor: isActive || isCompleted ? (status === 'Lost' && isLast ? '#ef4444' : '#3b82f6') : '#e2e8f0', // Blue generally, Red if Lost and active/completed
                                                                        color: isActive || isCompleted ? '#ffffff' : '#718096',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        fontWeight: 'bold',
                                                                        fontSize: '10px',
                                                                        border: isActive ? `1px solid ${status === 'Lost' && isLast ? '#fca5a5' : '#ebf8ff'}` : 'none',
                                                                        boxShadow: isActive ? `0 0 0 2px ${status === 'Lost' && isLast ? '#fecaca' : '#bfdbfe'}` : 'none'
                                                                    }}>
                                                                        {isCompleted ? '✓' : stepNum}
                                                                    </div>
                                                                    <span style={{
                                                                        marginTop: '4px',
                                                                        fontSize: '10px',
                                                                        color: isActive || isCompleted ? (status === 'Lost' && isLast ? '#ef4444' : '#3b82f6') : '#a0aec0',
                                                                        fontWeight: isActive ? '600' : '400'
                                                                    }}>
                                                                        {label}
                                                                    </span>
                                                                </div>
                                                                {!isLast && (
                                                                    <div style={{
                                                                        flex: 1,
                                                                        height: '1px',
                                                                        backgroundColor: isCompleted ? '#3b82f6' : '#e2e8f0',
                                                                        marginLeft: '5px',
                                                                        marginRight: '5px',
                                                                        marginTop: '-14px' // Align with circle center
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
                                                                disabled={isLimitedEdit}
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
                                                                    {projectSuggestions.map((suggestion, idx) => (
                                                                        <div key={`${suggestion.RequestNo}-${idx}`} className="list-group-item list-group-item-action d-flex justify-content-between align-items-center p-3">
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
                                                            disabled={isLimitedEdit}
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
                                                            disabled={isLimitedEdit}
                                                        />
                                                        {errors.EnquiryDate && <ValidationTooltip message={errors.EnquiryDate} />}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                                                        <label className="form-label">Due Date <span className="text-danger">*</span></label>
                                                        <DateInput
                                                            value={formData.DueOn}
                                                            onChange={(e) => handleInputChange('DueOn', e.target.value)}
                                                            placeholder="DD-MMM-YYYY"
                                                            disabled={isLimitedEdit}
                                                        />
                                                        {errors.DueOn && <ValidationTooltip message={errors.DueOn} />}
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <label className="form-label">Site Visit Date</label>
                                                        <DateInput
                                                            value={formData.SiteVisitDate}
                                                            onChange={(e) => handleInputChange('SiteVisitDate', e.target.value)}
                                                            placeholder="DD-MMM-YYYY"
                                                            disabled={isLimitedEdit}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Content Row: Enquiry Type + Customer Ref No */}
                                                <div className="d-flex mb-3 gap-3" style={{ width: '100%' }}>
                                                    {/* Enquiry Type (Left - ~66%) */}
                                                    <div style={{ flex: '0 0 calc(66.666667% - 10px)' }}>
                                                        <ListBoxControl
                                                            label={<span>Enquiry Type<span className="text-danger">*</span></span>}
                                                            options={masters.enquiryType}
                                                            selectedOption={formData.EnquiryType}
                                                            onOptionChange={(val) => handleInputChange('EnquiryType', val)}
                                                            listBoxItems={enqTypeList}
                                                            onAdd={handleAddEnqType}
                                                            onRemove={() => handleRemoveItem(enqTypeList, setEnqTypeList)}
                                                            error={errors.EnquiryType}
                                                            disabled={isLimitedEdit}
                                                            minSearchLength={0}
                                                        />
                                                    </div>

                                                    {/* Customer Ref No (Right - Remaining) */}
                                                    <div className="form-group" style={{ flex: 1, position: 'relative' }}>
                                                        <label className="form-label" style={{ marginBottom: '8px' }}>Customer Ref. No<span className="text-danger">*</span></label>
                                                        <input
                                                            type="text"
                                                            className="form-control"
                                                            value={formData.CustomerRefNo}
                                                            onChange={(e) => handleInputChange('CustomerRefNo', e.target.value)}
                                                            placeholder="Enter Customer Reference"
                                                            disabled={!canEdit || isLimitedEdit}
                                                            style={{ height: '38px' }} // Match standard input height if needed
                                                        />
                                                        {errors.CustomerRefNo && <ValidationTooltip message={errors.CustomerRefNo} />}
                                                    </div>
                                                </div>

                                                {/* Enquiry For */}
                                                {/* Enquiry For / Hierarchy */}
                                                <div className="mb-3" style={{ width: '100%' }}>
                                                    <HierarchyBuilder
                                                        label={<span>Enquiry For Structure<span className="text-danger">*</span></span>}
                                                        options={masters.enquiryFor}
                                                        value={enqForList}
                                                        onChange={(newList) => {
                                                            setEnqForList(newList);
                                                            // Also update form data string for backward compatibility or validation
                                                            setFormData(prev => ({ ...prev, EnquiryFor: newList.length > 0 ? newList[0].itemName : '' }));
                                                        }}
                                                        error={errors.EnquiryFor}
                                                        showNew={(currentUser?.role || currentUser?.Roles || '').toLowerCase().includes('admin')}
                                                        onNew={() => openNewModal(setShowEnqItemModal)}
                                                        showEdit={(currentUser?.role || currentUser?.Roles || '').toLowerCase().includes('admin')}
                                                        onEditItem={(item) => handleEditEnqFor(item.itemName)}
                                                        canRemove={true}
                                                        canRemoveItem={(item) => {
                                                            if (!isLimitedEdit) return true;
                                                            const normalizedName = (item.itemName || '').trim().toLowerCase();
                                                            return !originalEnqForList.some(orig => {
                                                                if (typeof orig === 'object' && (orig.id || orig.ID) && item.id) {
                                                                    const origId = String(orig.id || orig.ID);
                                                                    return origId === String(item.id);
                                                                }

                                                                const origName = (typeof orig === 'string' ? orig : (orig?.itemName || '')).trim().toLowerCase();
                                                                return origName === normalizedName;
                                                            });
                                                        }}
                                                    />
                                                </div>

                                                {/* Enquiry Details */}
                                                <div className="row mb-3">
                                                    <div className="col-md-12" style={{ position: 'relative' }}>
                                                        <label className="form-label">Enquiry details<span className="text-danger">*</span></label>
                                                        <textarea className="form-control" rows="3" placeholder="Enter Enquiry Details"
                                                            style={{ resize: 'none' }}
                                                            onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                                            value={formData.DetailsOfEnquiry} onChange={(e) => handleInputChange('DetailsOfEnquiry', e.target.value)} disabled={isLimitedEdit} />
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
                                                            label={<span>Customer Name / Contractor Name<span className="text-danger">*</span></span>}
                                                            options={masters.existingCustomers}
                                                            selectedOption={formData.CustomerName}
                                                            onOptionChange={(val) => {
                                                                handleInputChange('CustomerName', val);
                                                                handleInputChange('ReceivedFrom', '');
                                                            }}
                                                            listBoxItems={customerList}
                                                            showNew={true}
                                                            showEdit={true}
                                                            canEdit={!!formData.CustomerName}
                                                            renderListBoxItem={(item, idx) => `${idx + 1}. ${item}`}
                                                            onNew={() => openNewModal(setShowCustomerModal, 'Contractor')}
                                                            onEdit={handleEditCustomer}
                                                            selectedItemDetails={renderCustomerCard()}
                                                            error={errors.CustomerName}
                                                            minSearchLength={3}
                                                            disabled={isLimitedEdit}
                                                        /* Buttons removed to enforce paired insertion via Received From */
                                                        />
                                                    </div>
                                                    <div className="col-md-6">
                                                        <ListBoxControl
                                                            label={<span>Received From<span className="text-danger">*</span></span>}
                                                            options={receivedFromOptions}
                                                            selectedOption={formData.ReceivedFrom}
                                                            onOptionChange={(val) => handleInputChange('ReceivedFrom', val)}
                                                            listBoxItems={receivedFromList}
                                                            onAdd={handleAddReceivedFrom}
                                                            onRemove={handleRemoveReceivedFrom}
                                                            showNew={true}
                                                            showEdit={true}
                                                            canEdit={!!formData.ReceivedFrom}
                                                            renderOption={renderContactOption}
                                                            renderListBoxItem={renderContactListBoxItem}
                                                            onNew={() => openNewModal(setShowContactModal, null, { CompanyName: formData.CustomerName })}
                                                            onEdit={handleEditContact}
                                                            selectedItemDetails={renderContactCard()}
                                                            error={errors.ReceivedFrom}
                                                            minSearchLength={0}
                                                            disabled={isLimitedEdit}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Client Name */}
                                                <div className="mb-3" style={{ width: '50%', paddingRight: '12px' }}>
                                                    <SearchableSelectControl
                                                        label={<span>Client Name<span className="text-danger">*</span></span>}
                                                        options={combinedClientNames}
                                                        selectedOption={formData.ClientName}
                                                        onOptionChange={(val) => handleInputChange('ClientName', val)}
                                                        showNew={true}
                                                        showEdit={true}
                                                        canEdit={!!formData.ClientName}
                                                        onNew={() => openNewModal(setShowCustomerModal, 'Client')}
                                                        onEdit={handleEditClient}
                                                        error={errors.ClientName}
                                                        disabled={isLimitedEdit}
                                                        minSearchLength={3}
                                                    />
                                                </div>

                                                {/* Consultant Name */}
                                                <div className="mb-3" style={{ width: '50%', paddingRight: '12px' }}>
                                                    <ListBoxControl
                                                        label="Main Consultant / Lead Consultant / MEP Consultant / Project Manager"
                                                        options={masters.consultantNames}
                                                        selectedOption={formData.ConsultantName}
                                                        onOptionChange={(val) => handleInputChange('ConsultantName', val)}
                                                        listBoxItems={consultantList}
                                                        onAdd={handleAddConsultant}
                                                        onRemove={() => handleRemoveItem(consultantList, setConsultantList, originalConsultantList)}
                                                        showNew={true}
                                                        showEdit={true}
                                                        canEdit={!!formData.ConsultantName}
                                                        onNew={() => openNewModal(setShowCustomerModal, 'Consultant')}
                                                        onEdit={handleEditConsultant}
                                                        disabled={isLimitedEdit}
                                                        minSearchLength={3}
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
                                                            label={<span>Sales Engineer / Estimation Engineer / Quantity Surveyor<span className="text-danger">*</span></span>}
                                                            options={filteredSEOptions}
                                                            selectedOption={formData.ConcernedSE}
                                                            onOptionChange={(val) => handleInputChange('ConcernedSE', val)}
                                                            listBoxItems={seList}
                                                            onAdd={handleAddSE}
                                                            onRemove={() => handleRemoveItem(seList, setSeList, originalSeList)}
                                                            showNew={(currentUser?.role || '').includes('Admin')}
                                                            showEdit={(currentUser?.role || '').includes('Admin')}
                                                            canEdit={!!formData.ConcernedSE}
                                                            onNew={() => openNewModal(setShowUserModal)}
                                                            onEdit={handleEditSE}
                                                            error={errors.ConcernedSE}
                                                            canRemove={!isLimitedEdit || (seList.length > originalSeList.length)}
                                                            minSearchLength={0}
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
                                                                        checked={formData[chk]} onChange={(e) => handleInputChange(chk, e.target.checked)} disabled={isLimitedEdit} />
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
                                                        <textarea className="form-control mb-2" rows="2" placeholder="Enter Documents Received"
                                                            style={{ resize: 'none' }}
                                                            onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                                            value={formData.DocumentsReceived} onChange={(e) => handleInputChange('DocumentsReceived', e.target.value)} disabled={isLimitedEdit} />

                                                        {/* Attachment Sections */}
                                                        <div className="mt-4">
                                                            {/* 1. Public Attachments */}
                                                            <div className="mb-4">
                                                                <h6 className="fw-bold text-primary mb-2" style={{ fontSize: '14px' }}>
                                                                    <i className="bi bi-globe me-2"></i>1. Public Attachments <span className="text-muted fw-normal" style={{ fontSize: '11px' }}>(Visible to all subjobs)</span>
                                                                </h6>
                                                                <div className="d-flex align-items-center mb-2 gap-2 ps-3">
                                                                    <input type="file" id="publicFileInput" style={{ display: 'none' }} multiple onChange={(e) => handleFileUpload(e, 'Public')} />
                                                                    <input type="file" id="publicFolderInput" style={{ display: 'none' }} webkitdirectory="" directory="" onChange={(e) => handleFileUpload(e, 'Public')} />

                                                                    <button type="button" className="btn btn-outline-primary btn-sm" style={{ fontSize: '12px' }} onClick={() => document.getElementById('publicFileInput').click()}>
                                                                        <i className="bi bi-file-earmark-plus me-1"></i>Add Files
                                                                    </button>
                                                                    <button type="button" className="btn btn-outline-primary btn-sm" style={{ fontSize: '12px' }} onClick={() => document.getElementById('publicFolderInput').click()}>
                                                                        <i className="bi bi-folder-plus me-1"></i>Add Folder
                                                                    </button>
                                                                </div>
                                                                <div className="ps-3">
                                                                    {(() => {
                                                                        const list = renderAttachmentList('Public', 'File');
                                                                        return list ? (
                                                                            <div className="border rounded p-2 bg-light-subtle" style={{ maxHeight: '230px', overflowY: 'auto' }}>
                                                                                {list}
                                                                            </div>
                                                                        ) : null;
                                                                    })()}
                                                                </div>
                                                            </div>

                                                            {/* 2. Private Attachments */}
                                                            <div className="mb-4">
                                                                <h6 className="fw-bold text-danger mb-2" style={{ fontSize: '14px' }}>
                                                                    <i className="bi bi-lock me-2"></i>2. Private Attachments <span className="text-muted fw-normal" style={{ fontSize: '11px' }}>(Visible only to own division users)</span>
                                                                </h6>
                                                                <div className="d-flex align-items-center mb-2 gap-2 ps-3">
                                                                    <input type="file" id="privateFileInput" style={{ display: 'none' }} multiple onChange={(e) => handleFileUpload(e, 'Private')} />
                                                                    <input type="file" id="privateFolderInput" style={{ display: 'none' }} webkitdirectory="" directory="" onChange={(e) => handleFileUpload(e, 'Private')} />

                                                                    <button type="button" className="btn btn-outline-danger btn-sm" style={{ fontSize: '12px' }} onClick={() => document.getElementById('privateFileInput').click()}>
                                                                        <i className="bi bi-file-earmark-lock me-1"></i>Add Files
                                                                    </button>
                                                                    <button type="button" className="btn btn-outline-danger btn-sm" style={{ fontSize: '12px' }} onClick={() => document.getElementById('privateFolderInput').click()}>
                                                                        <i className="bi bi-folder-lock me-1"></i>Add Folder
                                                                    </button>
                                                                </div>
                                                                <div className="ps-3">
                                                                    {(() => {
                                                                        const list = renderAttachmentList('Private', 'File');
                                                                        return list ? (
                                                                            <div className="border rounded p-2 bg-light-subtle" style={{ maxHeight: '230px', overflowY: 'auto' }}>
                                                                                {list}
                                                                            </div>
                                                                        ) : null;
                                                                    })()}
                                                                </div>
                                                            </div>

                                                            {/* 3. Hyperlinks */}
                                                            <div className="mb-4">
                                                                <h6 className="fw-bold text-success mb-2" style={{ fontSize: '14px' }}>
                                                                    <i className="bi bi-link-45deg me-2"></i>3. Hyperlinks for Document Download
                                                                </h6>
                                                                <div className="ps-3">
                                                                    {/* Input Row */}
                                                                    <div className="mb-4">
                                                                        <div className="mb-2">
                                                                            <label className="form-label" style={{ fontSize: '11px' }}>URL / Path (Paste one or more links separated by Enter)</label>
                                                                            <textarea
                                                                                className="form-control form-control-sm mb-2"
                                                                                style={{ fontSize: '12px', minHeight: '60px' }}
                                                                                placeholder={"https://link1.com\nhttps://link2.com\n\\\\server\\path"}
                                                                                value={hyperlink.url}
                                                                                onChange={(e) => setHyperlink({ ...hyperlink, url: e.target.value })}
                                                                            />
                                                                        </div>
                                                                        <div className="d-flex gap-2">
                                                                            <button type="button" className="btn btn-sm btn-outline-success" style={{ fontSize: '11px', minWidth: '120px' }} onClick={() => handleAddLink('Public')} disabled={!hyperlink.url}>
                                                                                <i className="bi bi-plus-lg me-1"></i>Public Link
                                                                            </button>
                                                                            <button type="button" className="btn btn-sm btn-outline-danger" style={{ fontSize: '11px', minWidth: '120px' }} onClick={() => handleAddLink('Private')} disabled={!hyperlink.url}>
                                                                                <i className="bi bi-lock me-1"></i>Private Link
                                                                            </button>
                                                                        </div>
                                                                    </div>

                                                                    {/* Link Lists */}
                                                                    <div className="row mt-2">
                                                                        <div className="col-md-6 border-end">
                                                                            {(() => {
                                                                                const list = renderAttachmentList('Public', 'Link');
                                                                                return list ? (
                                                                                    <>
                                                                                        <span className="badge bg-success-subtle text-success mb-2" style={{ fontSize: '10px' }}>Public Links</span>
                                                                                        <div className="border rounded p-2 bg-light-subtle" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                                                                                            {list}
                                                                                        </div>
                                                                                    </>
                                                                                ) : null;
                                                                            })()}
                                                                        </div>
                                                                        <div className="col-md-6">
                                                                            {(() => {
                                                                                const list = renderAttachmentList('Private', 'Link');
                                                                                return list ? (
                                                                                    <>
                                                                                        <span className="badge bg-danger-subtle text-danger mb-2" style={{ fontSize: '10px' }}>Private (Division Only)</span>
                                                                                        <div className="border rounded p-2 bg-light-subtle" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                                                                                            {list}
                                                                                        </div>
                                                                                    </>
                                                                                ) : null;
                                                                            })()}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Remarks */}
                                                <div className="row mb-3">
                                                    <div className="col-md-12">
                                                        <label className="form-label">Remarks</label>
                                                        <textarea className="form-control" rows="2" placeholder="Enter Remarks"
                                                            style={{ resize: 'none' }}
                                                            onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                                                            value={formData.Remark} onChange={(e) => handleInputChange('Remark', e.target.value)} disabled={isLimitedEdit} />
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
                                                        checked={formData.AutoAck} onChange={(e) => handleInputChange('AutoAck', e.target.checked)} disabled={isLimitedEdit} />
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

                                                {/* Enquiry Status Dropdown */}
                                                <div className="d-flex align-items-center gap-2 mt-2" style={{ fontSize: '13px' }}>
                                                    <label className="mb-0">Enquiry Status:</label>
                                                    <select
                                                        className="form-select form-select-sm"
                                                        style={{ width: '120px', fontSize: '13px' }}
                                                        value={formData.EnquiryStatus}
                                                        onChange={(e) => handleInputChange('EnquiryStatus', e.target.value)}
                                                    >
                                                        <option value="Active">Active</option>
                                                        <option value="Inactive">Inactive</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Buttons Section (Left Aligned, Add then Cancel) */}
                                            <div className="d-flex justify-content-start gap-2 mt-4 mb-5">
                                                {(!isModifyMode || (isModifyMode && canEdit)) && (
                                                    <button
                                                        type="submit"
                                                        className="btn btn-outline-success"
                                                        disabled={isSubmitting || (!isModifyMode && isFormEmpty)}
                                                    >
                                                        {isSubmitting ? (
                                                            <>
                                                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                                                {isModifyMode ? 'Saving...' : 'Adding...'}
                                                            </>
                                                        ) : (
                                                            isModifyMode ? 'Save Changes' : 'Add Enquiry'
                                                        )}
                                                    </button>
                                                )}
                                                <button type="button" className="btn btn-outline-danger" onClick={resetForm} disabled={isSubmitting}>
                                                    {isModifyMode && !canEdit ? 'Close' : 'Cancel'}
                                                </button>
                                            </div>

                                            {/* Validation Error Messages */}
                                            {Object.keys(errors).length > 0 && (
                                                <div ref={errorSectionRef} className="alert alert-danger mt-2 mb-5" role="alert" style={{ fontSize: '13px' }}>
                                                    <strong>Please fill in the following mandatory fields:</strong>
                                                    <ul className="mb-0 mt-2" style={{ paddingLeft: '20px' }}>
                                                        {Object.keys(errors).map(field => (
                                                            <li key={field}>
                                                                {field === 'SourceOfInfo' && 'Source of Information'}
                                                                {field === 'EnquiryDate' && 'Enquiry Date'}
                                                                {field === 'DueOn' && (errors[field] === 'Required' ? 'Due On' : errors[field])}
                                                                {field === 'EnquiryType' && 'Enquiry Type'}
                                                                {field === 'EnquiryFor' && 'Enquiry For Structure'}
                                                                {field === 'CustomerName' && 'Customer Name'}
                                                                {field === 'ReceivedFrom' && 'Received From'}
                                                                {field === 'ProjectName' && 'Project Name'}
                                                                {field === 'ClientName' && 'Client Name'}
                                                                {field === 'ConcernedSE' && 'Concerned SE'}
                                                                {field === 'DetailsOfEnquiry' && 'Details of Enquiry'}
                                                                {field === 'CustomerRefNo' && 'Customer Ref. No'}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
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
                                        onModeChange={(newMode, data) => {
                                            setModalMode(newMode);
                                            setEditData(data);
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </>
                )}
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
