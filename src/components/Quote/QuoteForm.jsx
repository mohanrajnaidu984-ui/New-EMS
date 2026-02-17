import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Save, Printer, Mail, Plus, ChevronDown, ChevronUp, X, Trash2, FolderOpen, Paperclip, Download } from 'lucide-react';
import CreatableSelect from 'react-select/creatable';
import { format } from 'date-fns';
import DateInput from '../Enquiry/DateInput';
import { useAuth } from '../../context/AuthContext';
import ClauseEditor from './ClauseEditor';

const API_BASE = '';

// Default clause templates
const defaultClauses = {
    scopeOfWork: `The detailed scope of work is provided in Annexure A, covering all tasks and responsibilities.However, a high - level summary is as follows:
1.1. [Briefly list key scope items related to the division]
1.2. [E.g., Civil Works: Excavation, Foundation, Structural Work, etc.]
1.3. [E.g., MEP Works: HVAC, Electrical, Plumbing, Fire Fighting, etc.]`,

    basisOfOffer: `Our offer is based on the following documents provided along with the enquiry:
2.1. [List of Drawings]
2.2. [Specifications]
2.3. [Tender Queries]
2.4. [Conditions of Contract]`,

    exclusions: `The following items are not included in our scope:
3.1. [List exclusions clearly, e.g., Civil Work doesn't include Waterproofing, etc.]
3.2. [E.g., Electrical Work doesn't include Transformer Supply]
3.3. [E.g., Cleaning Services do not include Waste Disposal]
3.4. [List down the qualifications identified in the tender documents]`,

    pricingTerms: `4.1. Our [Lump sum price / total quotation amount] for the scope mentioned above shall be [Amount in figures and words].
4.2. Our quoted amount excludes any Value Added Tax (VAT), which shall be charged additional, as applicable.
4.3. A detailed Bill of Quantity is provided in Annexure B, detailing the Itemized Pricing.
4.4. Payment Terms:
4.4.1. Advance Payment: [Percentage] % upon signing the agreement
4.4.2. Progress Payments: [Percentage] % as per completion milestones
4.4.3. Final Payment: [Percentage] % upon project completion and acceptance`,

    schedule: `5.1.Tentative Commencement Date: [Start Date]
5.2.Estimated Completion Date: [End Date]
5.3.Project Duration: [Number] weeks / months`,

    warranty: `6.1.Warranty Period: [Specify warranty duration]
6.2.Defects Liability Period: [Specify DLP duration]
6.3.Scope of Warranty: Covers[Specify covered items]
6.4.Exclusions: [Specify exclusions]`,

    responsibilityMatrix: `Please refer to Annexure B for a detailed responsibility matrix indicating the division of responsibilities between our company and the client.`,

    termsConditions: `8.1.Force Majeure: Standard force majeure clause applies
8.2.Quote Validity: [E.g., 30 / 60 / 90 days from the date of issuance]
8.3.Commercial Terms are detailed in Appendix to Quotation`,

    acceptance: `We hope that the above is in line with your requirements.Should you have any further queries, please do not hesitate to contact our[designation] Mr./ Ms. [name] on[phone / email].`,

    billOfQuantity: `Please find the detailed Bill of Quantity below: `
};


// Global styles for pasted tables in clauses

const numberToWordsBHD = (num) => {
    const dinars = Math.floor(num);
    const fils = Math.round((num - dinars) * 1000);

    const convert = (n) => {
        const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const scales = ['', 'Thousand', 'Million', 'Billion'];

        if (n === 0) return '';
        if (n < 20) return units[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + units[n % 10] : '');
        if (n < 1000) return units[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + convert(n % 100) : '');

        for (let i = 0, scale = 1; i < scales.length; i++, scale *= 1000) {
            if (n < scale * 1000) {
                return convert(Math.floor(n / scale)) + ' ' + scales[i] + (n % scale !== 0 ? ' ' + convert(n % scale) : '');
            }
        }
        return n.toString();
    };

    let result = "Bahraini Dinars ";
    if (dinars === 0) result += "Zero";
    else result += convert(dinars);

    if (fils > 0) {
        result += " and fils " + fils + "/1000";
    }
    result += " only.";
    return result;
};

const normalize = (s) => (s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const tableStyles = `
    .clause-content table {
        width: 100% !important;
        border-collapse: collapse !important;
        margin-bottom: 16px !important;
        font-size: 12px !important;
    }
    .clause-content table th, .clause-content table td {
        border: 1px solid #cbd5e1 !important;
        padding: 6px 8px !important;
        text-align: left !important;
    }
    .clause-content table th {
        background-color: #f8fafc !important;
        font-weight: 600 !important;
    }
`;

const QuoteForm = () => {
    const { currentUser } = useAuth();
    const isAdmin = ['Admin', 'Admins'].includes(currentUser?.role || currentUser?.Roles);

    // Search state
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchRef = useRef(null);
    const debounceRef = useRef(null);

    // Enquiry and quote data
    const [enquiryData, setEnquiryData] = useState(null);
    const [quoteId, setQuoteId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [existingQuotes, setExistingQuotes] = useState([]);
    const [saving, setSaving] = useState(false);

    // Quote Context Scope (For viewing/revising previous quotes with specific scope)
    const [quoteContextScope, setQuoteContextScope] = useState(null);

    // Clause toggles
    const [clauses, setClauses] = useState({
        showScopeOfWork: true,
        showBasisOfOffer: true,
        showExclusions: true,
        showPricingTerms: true,
        showSchedule: true,
        showWarranty: true,
        showResponsibilityMatrix: true,
        showTermsConditions: true,
        showAcceptance: true,
        showBillOfQuantity: true,
    });

    // Selected Jobs for Pricing
    const [selectedJobs, setSelectedJobs] = useState([]);
    const [expandedGroups, setExpandedGroups] = useState({}); // Track expanded revisions

    const toggleExpanded = (quoteNo) => {
        setExpandedGroups(prev => ({ ...prev, [quoteNo]: !prev[quoteNo] }));
    };

    // Resizable Sidebar State
    const [sidebarWidth, setSidebarWidth] = useState(480);
    const splitPaneRef = useRef(null);

    const startResizing = React.useCallback((mouseDownEvent) => {
        mouseDownEvent.preventDefault();
        const startX = mouseDownEvent.clientX;
        const startWidth = sidebarWidth;

        const doDrag = (mouseMoveEvent) => {
            const newWidth = startWidth + (mouseMoveEvent.clientX - startX);
            if (newWidth > 350 && newWidth < 1000) {
                setSidebarWidth(newWidth);
            }
        };

        const stopDrag = () => {
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        };

        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [sidebarWidth]);

    // Print Settings
    const [printWithHeader, setPrintWithHeader] = useState(true);

    // Pending Files State
    const [pendingFiles, setPendingFiles] = useState([]);

    // Clause content
    const [clauseContent, setClauseContent] = useState({
        scopeOfWork: defaultClauses.scopeOfWork,
        basisOfOffer: defaultClauses.basisOfOffer,
        exclusions: defaultClauses.exclusions,
        pricingTerms: defaultClauses.pricingTerms,
        schedule: defaultClauses.schedule,
        warranty: defaultClauses.warranty,
        responsibilityMatrix: defaultClauses.responsibilityMatrix,
        termsConditions: defaultClauses.termsConditions,
        acceptance: defaultClauses.acceptance,
        billOfQuantity: defaultClauses.billOfQuantity,
    });

    // Quote metadata
    const [quoteNumber, setQuoteNumber] = useState('');
    const [validityDays, setValidityDays] = useState(30);

    // Expanded clause for editing
    const [expandedClause, setExpandedClause] = useState(null);

    // Company Header Info
    const [quoteLogo, setQuoteLogo] = useState(null);
    const [quoteCompanyName, setQuoteCompanyName] = useState('Almoayyed Air Conditioning');
    const [quoteAttachments, setQuoteAttachments] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);
    const [footerDetails, setFooterDetails] = useState(null);
    const [companyProfiles, setCompanyProfiles] = useState([]);

    // Custom Clauses
    const [customClauses, setCustomClauses] = useState([]);
    const [newClauseTitle, setNewClauseTitle] = useState('');
    const [isAddingClause, setIsAddingClause] = useState(false);

    // Metadata State
    const [quoteDate, setQuoteDate] = useState(new Date().toISOString().split('T')[0]);
    const [customerReference, setCustomerReference] = useState('');
    const [subject, setSubject] = useState('');
    const [signatory, setSignatory] = useState('');
    const [signatoryDesignation, setSignatoryDesignation] = useState('');
    const [toName, setToName] = useState('');

    const [toAddress, setToAddress] = useState('');
    const [toPhone, setToPhone] = useState('');
    const [toEmail, setToEmail] = useState('');
    const [toAttention, setToAttention] = useState(''); // ReceivedFrom contact for selected customer


    // Prepared By
    const [preparedBy, setPreparedBy] = useState('');
    const [preparedByOptions, setPreparedByOptions] = useState([]);
    const [signatoryOptions, setSignatoryOptions] = useState([]);
    const [enquiryCustomerOptions, setEnquiryCustomerOptions] = useState([]);

    // Pricing Data
    const [pricingData, setPricingData] = useState(null);
    const [pricingSummary, setPricingSummary] = useState([]);
    const [grandTotal, setGrandTotal] = useState(0);
    const [hasPricedOptional, setHasPricedOptional] = useState(false);
    const [hasUserPricing, setHasUserPricing] = useState(false);

    // Lists
    const [usersList, setUsersList] = useState([]);
    const [customersList, setCustomersList] = useState([]);
    const [pendingQuotes, setPendingQuotes] = useState([]); // Pending List State

    // Tab State for unified Quote and Pricing Sections
    const [activeQuoteTab, setActiveQuoteTab] = useState('self');

    // Templates State
    const [templates, setTemplates] = useState([]);
    const [savedTemplateName, setSavedTemplateName] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState('');

    // Ordered Clauses (Standard + Custom)
    const [orderedClauses, setOrderedClauses] = useState([
        'showScopeOfWork', 'showBasisOfOffer', 'showExclusions', 'showPricingTerms',
        'showBillOfQuantity', 'showSchedule', 'showWarranty', 'showResponsibilityMatrix', 'showTermsConditions', 'showAcceptance'
    ]);

    // Memoized Tabs Calculation
    const calculatedTabs = React.useMemo(() => {
        // Guard: At least enquiryData must exist
        if (!enquiryData) return [];

        let jobsList = [];
        let leadJobId = null;
        let leadPrefix = (enquiryData.leadJobPrefix || '').toUpperCase();

        if (pricingData && pricingData.jobs && pricingData.jobs.length > 0) {
            // Case A: Use Pricing Data (Preferred)
            jobsList = pricingData.jobs;
            const leadJobNameFull = (enquiryData.divisions || []).find(d => d.toUpperCase().startsWith(leadPrefix)) || '';
            const leadJobObj = jobsList.find(j => {
                const jName = (j.itemName || '').toUpperCase();
                return (leadJobNameFull && jName === leadJobNameFull.toUpperCase()) ||
                    jName.startsWith(leadPrefix + ' -') ||
                    jName === leadPrefix;
            });
            leadJobId = leadJobObj?.id;
        } else if (enquiryData.divisionsHierarchy && enquiryData.divisionsHierarchy.length > 0) {
            // Case B: Fallback to Enquiry Divisions Hierarchy (Step 296 Fix)
            jobsList = enquiryData.divisionsHierarchy.map(d => ({
                id: d.id || d.ItemID,
                parentId: d.parentId || d.ParentID,
                itemName: d.itemName || d.ItemName || d.DivisionName,
                companyLogo: d.companyLogo,
                companyName: d.companyName,
                departmentName: d.departmentName
            }));
            // Find root for current lead job prefix
            const root = jobsList.find(j => (!j.parentId || j.parentId == '0' || j.parentId == 0) && (j.itemName || '').toUpperCase().startsWith(leadPrefix));
            leadJobId = root?.id;
        } else if (enquiryData.divisions) {
            // Case C: Minimal fallback from flat divisions list
            jobsList = enquiryData.divisions.map((d, i) => ({ id: `div_${i}`, itemName: d }));
            const leadJob = jobsList.find(j => (j.itemName || '').toUpperCase().startsWith(leadPrefix));
            leadJobId = leadJob?.id;
        }

        if (jobsList.length === 0) return [];

        const userAccess = pricingData?.access || {};
        const accessibleJobs = jobsList.filter(j => {
            if (isAdmin) return true;

            const hasLimitedAccess = !pricingData?.access?.hasLeadAccess && (pricingData?.access?.editableJobs?.length > 0);

            // If we have pricing data, respect its access rules
            if (pricingData) {
                const userAccess = pricingData.access;
                const visibleNames = (userAccess.visibleJobs || []).map(n => n.trim().toLowerCase());
                const editableNames = (userAccess.editableJobs || []).map(n => n.trim().toLowerCase());
                const jName = (j.itemName || '').trim().toLowerCase();

                // Rule: If hasLimitedAccess, we only show tabs that are editable or descendants of editable.
                // We do NOT show parents (even if 'visible') to sub-jobs to enforce hierarchy.
                if (hasLimitedAccess) {
                    // Check if current job (jName) is one of our editable scopes OR a descendant
                    const isEditableRoot = editableNames.some(acc => jName === acc || jName.includes(acc) || acc.includes(jName));
                    if (isEditableRoot) return true;

                    // Check if current job is a descendant of any editable scope
                    const isDescendant = editableNames.some(scopeName => {
                        const scopeJob = jobsList.find(sj => sj.itemName?.trim().toLowerCase() === scopeName);
                        if (!scopeJob) return false;

                        let curr = j;
                        while (curr && curr.parentId) {
                            if (curr.parentId === scopeJob.id) return true;
                            curr = jobsList.find(sj => sj.id === curr.parentId);
                        }
                        return false;
                    });

                    return isDescendant;
                }

                const accessibleNames = [...visibleNames, ...editableNames];
                return accessibleNames.some(acc => {
                    const aName = acc.trim().toLowerCase();
                    return jName === aName || jName.includes(aName) || aName.includes(jName);
                });
            }
            // If no pricing data yet, show all identified jobs as tabs (unrestricted)
            return true;
        });

        const finalTabs = accessibleJobs.map(job => {
            const isLead = job.id === leadJobId;
            let displayName = job.itemName;

            // Clean prefix for display
            if (leadPrefix && displayName.toUpperCase().startsWith(leadPrefix)) {
                displayName = displayName.substring(leadPrefix.length).replace(/^\s*-\s*/, '').trim();
            }
            if (!displayName) displayName = job.itemName;

            return {
                id: isLead ? 'self' : job.id,
                name: isLead ? 'Own Job' : displayName,
                label: job.itemName,
                companyLogo: job.companyLogo,
                companyName: job.companyName,
                departmentName: job.departmentName,
                isSelf: isLead,
                realId: job.id,
                parentId: job.parentId
            };
        });

        // Sort Tabs: Lead/Own Job first, then hierarchy
        finalTabs.sort((a, b) => {
            if (a.isSelf) return -1;
            if (b.isSelf) return 1;
            if (a.realId === b.parentId) return -1;
            if (b.realId === a.parentId) return 1;
            return (a.name || '').localeCompare(b.name || '');
        });

        // Ensure at least one tab is 'Own Job' and is the default 'self' ID
        // If we filtered out the lead job, the first accessible job becomes the 'Own Job' for this user context
        if (finalTabs.length > 0 && !finalTabs.some(t => t.id === 'self')) {
            finalTabs[0].id = 'self';
            finalTabs[0].name = 'Own Job';
            finalTabs[0].isSelf = true;
        }

        return finalTabs;
    }, [pricingData, enquiryData, usersList, isAdmin]);

    // Auto-resolve active tabs based on calculated permissions
    useEffect(() => {
        if (calculatedTabs && calculatedTabs.length > 0) {
            // Fix Quote Tab
            const currentQuoteTabValid = calculatedTabs.find(t => t.id === activeQuoteTab);
            if (!currentQuoteTabValid) {
                console.log('[AutoRes] Fixing Active Quote Tab:', activeQuoteTab, '->', calculatedTabs[0].id);
                setActiveQuoteTab(calculatedTabs[0].id);
            }


        }
    }, [calculatedTabs, activeQuoteTab]);

    // Sync Company Logo and Details based on Active Pricing Tab
    useEffect(() => {
        if (calculatedTabs && activeQuoteTab) {
            const activeTab = calculatedTabs.find(t => t.id === activeQuoteTab);
            if (activeTab) {
                console.log('[QuoteForm] Syncing Logo/Details for Tab:', activeTab.label);
                console.log('[QuoteForm]   - Company:', activeTab.companyName, 'Logo:', activeTab.companyLogo);

                setQuoteLogo(activeTab.companyLogo || null);

                // Prioritize CompanyName for the header (e.g., Almoayyed Contracting)
                setQuoteCompanyName(activeTab.companyName || activeTab.departmentName || 'Almoayyed Contracting');

                // Update Footer Details
                if (activeTab.address || activeTab.phone || activeTab.fax) {
                    setFooterDetails({
                        name: activeTab.companyName || activeTab.departmentName,
                        address: activeTab.address,
                        phone: activeTab.phone,
                        fax: activeTab.fax,
                        email: activeTab.email
                    });
                } else {
                    setFooterDetails(null);
                }
            }
        }
    }, [activeQuoteTab, calculatedTabs]);

    // NEW: Sync Attention Of (toAttention) whenever toName or enquiryData changes
    useEffect(() => {
        if (!toName || !enquiryData) return;

        // Skip if toAttention is already set (don't override manual edits,
        // though currently there is no input for it, it might be set by loadQuote/handleCustomerChange)
        // Since there's no manual input for this, we should always try to resolve it if it's currently empty or N/A
        if (!toAttention || toAttention === 'N/A') {
            const target = normalize(toName);

            // 1. Try Exact Match
            if (enquiryData.customerContacts && enquiryData.customerContacts[toName.trim()]) {
                const contact = enquiryData.customerContacts[toName.trim()];
                setToAttention(contact);
            }
            // 2. Try Normalized Match
            else if (enquiryData.customerContacts) {
                const match = Object.keys(enquiryData.customerContacts).find(k => normalize(k) === target);
                if (match) {
                    const contact = enquiryData.customerContacts[match];
                    setToAttention(contact);
                }
                // 3. Fallback to global enquiry ReceivedFrom
                else if (enquiryData.enquiry?.ReceivedFrom) {
                    setToAttention(enquiryData.enquiry.ReceivedFrom);
                }
            }
            else if (enquiryData.enquiry?.ReceivedFrom) {
                setToAttention(enquiryData.enquiry.ReceivedFrom);
            }
        }

    }, [toName, enquiryData, toAttention]);

    // Load Pricing Data when enquiry and customer are selected
    useEffect(() => {
        if (enquiryData && toName && enquiryData.enquiry?.RequestNo) {
            console.log('[useEffect] Loading pricing data for:', enquiryData.enquiry.RequestNo, 'Customer:', toName);
            loadPricingData(enquiryData.enquiry.RequestNo, toName);
        }
    }, [enquiryData, toName]);

    const addCustomClause = () => {
        if (!newClauseTitle.trim()) return;
        const newClause = {
            id: `custom_${Date.now()}`,
            title: newClauseTitle,
            content: '',
            isChecked: true
        };
        setCustomClauses([...customClauses, newClause]);
        setOrderedClauses([...orderedClauses, newClause.id]);
        setNewClauseTitle('');
        setIsAddingClause(false);
        setExpandedClause(newClause.id); // Auto-expand for editing
    };

    const removeCustomClause = (id) => {
        setCustomClauses(customClauses.filter(c => c.id !== id));
        setOrderedClauses(orderedClauses.filter(cid => cid !== id));
    };

    const moveClause = (index, direction) => {
        const newOrder = [...orderedClauses];
        if (direction === 'up' && index > 0) {
            [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
        } else if (direction === 'down' && index < newOrder.length - 1) {
            [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
        }
        setOrderedClauses(newOrder);
    };

    const updateCustomClause = (id, field, value) => {
        setCustomClauses(customClauses.map(c =>
            c.id === id ? { ...c, [field]: value } : c
        ));
    };

    const canEdit = () => {
        // 1. Admin Override (Always Full Access)
        if (currentUser.Roles === 'Admin' || currentUser.role === 'Admin') return true;

        if (!currentUser) return false;

        // 2. Strict Scope Validation (Based on Active Tab)
        // User can only create/edit quotes for divisions they explicitly have 'editable' access to.
        if (pricingData?.access) {
            const activeTabObj = calculatedTabs.find(t => t.id === activeQuoteTab);
            if (activeTabObj) {
                // Determine the "Job Name" of the current tab
                // For 'Own Job' / Lead, we need to resolve the actual job name if possible, or use the label
                const targetJob = normalize(activeTabObj.label || activeTabObj.name);

                // Get list of jobs the user is allowed to edit
                const allowedJobs = (pricingData.access.editableJobs || []).map(j => normalize(j));

                if (allowedJobs.length > 0) {
                    // Check if current tab is in the allowed list
                    // We use contains check to handle potential naming variations (e.g. "Civil Works" vs "Civil")
                    const isAllowed = allowedJobs.some(allowed =>
                        targetJob === allowed || targetJob.includes(allowed) || allowed.includes(targetJob)
                    );

                    if (!isAllowed) {
                        return false; // Tab is outside user's editable scope
                    }
                }
            }
        }

        // 3. Existing Quote Ownership check (If we are editing a specific quote)
        if (quoteId) {
            const selectedQuote = existingQuotes.find(q => q.ID === quoteId);
            if (!selectedQuote) return true; // Should not happen

            const userEmail = (currentUser.email || currentUser.EmailId || '').toLowerCase().trim();
            const preparedByEmail = (selectedQuote.PreparedByEmail || '').toLowerCase().trim();

            // Creator
            if (userEmail === preparedByEmail) return true;

            // CC List
            if (enquiryData?.divisionEmails) {
                const isInCC = enquiryData.divisionEmails.some(div => {
                    const emails = [div.ccMailIds, div.commonMailIds].filter(Boolean).join(',');
                    const allEmails = emails.split(',').map(e => e.trim().toLowerCase());
                    return allEmails.includes(userEmail);
                });
                if (isInCC) return true;
            }

            // Lead Access (If I passed Scope check above, and have Lead Access, I can edit my division's quotes even if not creator)
            if (pricingData?.access?.hasLeadAccess) return true;

            return false;
        }

        // New Quote (and passed Scope Check)
        return true;
    };



    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);

        // Fetch Pending Quotes
        const userEmail = currentUser?.EmailId || currentUser?.email || '';
        console.log('[QuoteForm] current user object:', currentUser);
        console.log(`[QuoteForm] Fetched pending quotes for: ${userEmail}`);

        fetch(`${API_BASE}/api/quotes/list/pending?userEmail=${encodeURIComponent(userEmail)}`)
            .then(res => res.json())
            .then(data => {
                console.log(`[QuoteForm] Fetched ${data?.length || 0} pending quotes for ${userEmail}`, data);
                setPendingQuotes(data || []);
            })
            .catch(err => console.error('Error fetching pending quotes:', err));

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [currentUser]);

    // Fetch Metadata Lists
    useEffect(() => {
        const fetchLists = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/quotes/lists/metadata`);
                if (res.ok) {
                    const data = await res.json();
                    setUsersList(data.users || []);
                    setCustomersList(data.customers || []);
                }
            } catch (err) {
                console.error('Error fetching metadata lists:', err);
            }
        };
        const fetchTemplates = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/quotes/config/templates`);
                if (res.ok) {
                    const data = await res.json();
                    setTemplates(data || []);
                }
            } catch (err) {
                console.error('Error fetching templates:', err);
            }
        };

        fetchLists();
        fetchTemplates();
    }, []);

    // Dynamic Customer Options based on Lead Job Hierarchy
    useEffect(() => {
        if (!enquiryData) return;

        console.log('--- [Customer Options Calculation] START ---');
        console.log('Lead Job Prefix:', enquiryData.leadJobPrefix);

        // Get user's accessible divisions to exclude from customer list
        const userEmail = (currentUser?.EmailId || '').toLowerCase();

        // 1. Base Options (Enquiry Customers from API)
        const rawBase = enquiryData.customerOptions || [];
        const baseOpts = rawBase.map(c => ({ value: c, label: c, type: 'Linked' }));
        console.log('1. Base Options (API):', baseOpts.map(o => o.value));

        // 2. Internal Options (Calculated relative to CURRENT Lead Job)
        let internalOpts = [];
        if (enquiryData.divisionsHierarchy && enquiryData.leadJobPrefix) {
            const allNodes = enquiryData.divisionsHierarchy;

            // Find the Current Lead Job Node
            // Matching logic: ItemName acts as the key. leadJobPrefix might be 'Civil Project' or 'L1' or 'BMS'
            // We try to find the node that *Best Matches* the prefix.
            // Usually prefix is the Clean Name or the Code.

            let startNode = allNodes.find(n => {
                const clean = n.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                return clean.toLowerCase() === enquiryData.leadJobPrefix.toLowerCase() ||
                    n.itemName.toLowerCase().includes(enquiryData.leadJobPrefix.toLowerCase());
            });

            if (startNode && startNode.parentId) {
                console.log('Found Lead Node:', startNode.itemName);

                // Strictly take DIRECT PARENT only
                const parent = allNodes.find(p => p.id === startNode.parentId);
                if (parent) {
                    const cleanParent = parent.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                    // Only add if it's a valid parent name
                    if (cleanParent && cleanParent !== 'Root') {
                        console.log('Adding Direct Parent as Internal Customer:', cleanParent);
                        internalOpts.push({ value: cleanParent, label: cleanParent, type: 'Internal Division' });
                    }
                }
            } else if (!startNode) {
                console.warn('Could not find Lead Node for prefix:', enquiryData.leadJobPrefix);
            }
            // Fallback: If no specific lead node found (rare), maybe show nothing internal?
            // Or risky fallback to finding parents of *any* node matching user?
            // Let's stick to safe "Ancestors Only" - if we can't find ancestors, we show none.
        }
        console.log('2. Internal Options (Direct Parent Only):', internalOpts.map(o => o.value));

        // 3. Pricing Context Customers
        let pricingOpts = [];
        if (pricingData?.customers) {
            pricingOpts = [...pricingOpts, ...pricingData.customers.map(c => ({ value: c, label: c, type: 'Internal Division' }))];
        }
        if (pricingData?.extraCustomers) {
            pricingOpts = [...pricingOpts, ...pricingData.extraCustomers.map(c => ({ value: c, label: c, type: 'Linked' }))];
        }
        console.log('3. Pricing Options:', pricingOpts.map(o => o.value));

        // 4. Merge & Deduplicate
        const allOpts = [...baseOpts, ...internalOpts, ...pricingOpts];
        const uniqueMap = new Map();

        allOpts.forEach(item => {
            if (!item.value) return;

            // Aggressive normalization
            const key = item.value.toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, item);
            } else {
                const existing = uniqueMap.get(key);
                console.log(`Duplicate detected for key '${key}': Kept '${existing.value}' (${existing.type}), Ignored '${item.value}' (${item.type})`);
            }
        });

        const uniqueOptions = Array.from(uniqueMap.values());

        // STRICTION: Filter out all sub-jobs and User's own division from the dropdown
        // EXCEPT the direct parent calculated above.
        const parentName = internalOpts.length > 0 ? internalOpts[0].value : '';
        const parentNorm = normalize(parentName);
        const jobNamesNorm = new Set((enquiryData.divisionsHierarchy || []).map(n => normalize(n.itemName)));
        const myEmail = (currentUser?.EmailId || currentUser?.email || '').toLowerCase();
        const myName = myEmail.split('@')[0].toLowerCase();

        const filteredOptions = uniqueOptions.filter(opt => {
            const valNorm = normalize(opt.value);

            // 1. Keep if it's the calculated direct parent (Internal Customer)
            if (parentNorm && valNorm === parentNorm) return true;

            // 2. Filter out all other internal job names
            if (jobNamesNorm.has(valNorm)) return false;

            // 3. Filter out if it matches user's own division name (e.g. "electrical")
            if (valNorm.includes(myName)) return false;

            // 4. Everything else (external customers) is kept
            return true;
        });

        console.log('--- Final Filtered Options ---', filteredOptions);
        setEnquiryCustomerOptions(filteredOptions);
        console.log('--- [Customer Options Calculation] END ---');

    }, [enquiryData?.leadJobPrefix, enquiryData?.divisionsHierarchy, enquiryData?.customerOptions, currentUser?.EmailId, enquiryData?.availableProfiles, pricingData?.customers, pricingData?.extraCustomers]);

    // Handle Metadata Selections
    const handleSelectSignatory = (e) => {
        const selectedName = e.target.value;
        const user = usersList.find(u => u.FullName === selectedName);
        setSignatory(selectedName);
        if (user) setSignatoryDesignation(user.Designation);
    };

    const handleSelectCustomer = (e) => {
        const selectedName = e.target.value;
        const cust = customersList.find(c => c.CompanyName === selectedName);
        setToName(selectedName);
        if (cust) {
            setToAddress(`${cust.Address1 || ''} \n${cust.Address2 || ''} `.trim());
            setToPhone(`${cust.Phone1 || ''} ${cust.Phone2 ? '/ ' + cust.Phone2 : ''} `.trim());
            setToEmail(cust.EmailId || '');

            // NOTE: Do not update footerDetails with customer info
        }

        // Reload pricing for selected customer
        if (enquiryData) {
            loadPricingData(enquiryData.enquiry.RequestNo, selectedName);
        }
    };

    // New handler for CreatableSelect
    const handleCustomerChange = (selectedOption) => {
        const selectedName = selectedOption ? selectedOption.value : '';
        console.log('[handleCustomerChange] Selected:', selectedName);
        console.log('[handleCustomerChange] Customers List Size:', customersList.length);

        setToName(selectedName);
        setQuoteId(null); // Reset ID so auto-load can kick in for new customer
        setQuoteDate(''); // Reset date to blank for new customer selection

        if (!selectedName) {
            setToAddress('');
            setToPhone('');
            setToEmail('');
            setToAttention('');
            if (enquiryData) {
                loadPricingData(enquiryData.enquiry.RequestNo, '');
            }
            return;
        }

        // Set Attention of (ReceivedFrom) for the selected customer
        console.log('[handleCustomerChange] Looking up customer:', selectedName);
        console.log('[handleCustomerChange] customerContacts available:', enquiryData?.customerContacts);

        const targetNorm = normalize(selectedName);

        if (enquiryData?.customerContacts) {
            // 1. Try exact match
            if (enquiryData.customerContacts[selectedName]) {
                setToAttention(enquiryData.customerContacts[selectedName]);
                console.log('[handleCustomerChange] ✓ Found via exact match:', enquiryData.customerContacts[selectedName]);
            }
            // 2. Try normalized match
            else {
                const match = Object.keys(enquiryData.customerContacts).find(k => normalizeName(k) === targetNorm);
                if (match) {
                    setToAttention(enquiryData.customerContacts[match]);
                    console.log('[handleCustomerChange] ✓ Found via fuzzy match:', enquiryData.customerContacts[match]);
                } else {
                    // 3. Fallback to main enquiry ReceivedFrom if no specific contact
                    const fallback = enquiryData?.enquiry?.ReceivedFrom || '';
                    setToAttention(fallback);
                    console.log('[handleCustomerChange] ✗ Not found, using fallback:', fallback);
                }
            }
        } else {
            setToAttention(enquiryData?.enquiry?.ReceivedFrom || '');
        }



        // Try exact match first, then robust normalized match
        let cust = customersList.find(c => c.CompanyName === selectedName);
        if (!cust) {
            cust = customersList.find(c => normalize(c.CompanyName) === targetNorm);
        }

        if (cust) {
            console.log('[handleCustomerChange] Found customer in Master list:', cust.CompanyName);
            const addr = [cust.Address1, cust.Address2].filter(Boolean).join('\n').trim();
            setToAddress(addr);
            setToPhone(`${cust.Phone1 || ''} ${cust.Phone2 ? '/ ' + cust.Phone2 : ''} `.trim());
            setToEmail(cust.EmailId || '');
        } else {
            console.log('[handleCustomerChange] Customer NOT found in Master list');

            // Check if it matches the parsed Enquiry Customer (could be inactive)
            let foundInEnquiry = false;
            if (enquiryData?.customerDetails) {
                const enqCustName = enquiryData.enquiry?.CustomerName || enquiryData.CustomerName;
                // Use same normalized check for fallback validity
                if (enqCustName && normalize(enqCustName) === targetNorm && enquiryData.customerDetails) {
                    console.log('[handleCustomerChange] Using Enquiry Customer Details fallback (possibly inactive)');
                    const details = enquiryData.customerDetails;
                    const addr = details.Address || [details.Address1, details.Address2].filter(Boolean).join('\n').trim();
                    setToAddress(addr);
                    setToPhone(`${details.Phone1 || ''} ${details.Phone2 ? '/ ' + details.Phone2 : ''} `.trim());
                    setToEmail(details.EmailId || '');
                    foundInEnquiry = true;
                }
            }

            // STRICT CHECK: Only check Internal Profiles if type is explicitly 'Internal Division'
            // OR if it's a generic/custom entry (no type or __isNew__) to avoid accidental matches.
            // BUT NEVER check if type is 'Linked' (Customer from Enquiry).
            const isLinkedCustomer = selectedOption?.type === 'Linked';

            if (!foundInEnquiry && !isLinkedCustomer && enquiryData?.availableProfiles) {
                // Check in internal division profiles
                const profile = enquiryData.availableProfiles.find(p =>
                    p.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim() === selectedName
                );
                if (profile) {
                    console.log('[handleCustomerChange] Found internal profile:', profile);
                    setToAddress(profile.address || '');
                    setToPhone(profile.phone || '');
                    setToEmail(profile.email || '');
                }
            }
        }

        // Reload pricing for selected customer
        if (enquiryData) {
            console.log('Customer changed to:', selectedName, 'Reloading pricing...');
            loadPricingData(enquiryData.enquiry.RequestNo, selectedName);
        }
    };

    const handleProfileChange = (e) => {
        const code = e.target.value; // Using Department Code as unique identifier? Or DivisionCode?
        // Ideally combination, but for now assuming unique Dept Code or we check both if needed.
        // Let's assume the value is the index or a composite key.
        const profile = companyProfiles.find(p => p.code === code || p.divisionCode === code);

        if (profile) {
            setQuoteCompanyName(profile.name);
            setQuoteLogo(profile.logo);
            setFooterDetails(profile);

            // Update enquiryData references so getQuotePayload uses the correct codes
            setEnquiryData(prev => ({
                ...prev,
                companyDetails: { ...profile }
            }));
        }
    };

    // Helper to load pricing data (Component Level)
    const loadPricingData = async (reqNo, cxName) => {
        console.log('--- loadPricingData START ---');
        console.log('Req:', reqNo, 'Cx:', cxName);
        try {
            const url = `${API_BASE}/api/pricing/${encodeURIComponent(reqNo)}?userEmail=${encodeURIComponent(currentUser?.email || currentUser?.EmailId || '')}&customerName=${encodeURIComponent(cxName || '')}`;
            console.log('Fetching URL:', url);

            console.log('[Pricing Fetch] Requesting:', url, 'ActiveCustomer:', cxName);
            const pricingRes = await fetch(url);
            if (pricingRes.ok) {
                const pData = await pricingRes.json();
                console.log('[Pricing Fetch] Response:', pData.jobs ? pData.jobs.length + ' jobs' : 'No jobs', 'Visible:', pData.jobs ? pData.jobs.map(j => j.itemName + ':' + j.visible) : 'N/A');
                console.log('Pricing Data Received:', pData);

                // --- KEY MIGRATION & CUSTOMER GROUPING ---
                // Process Raw Array into Nested Map: [CustomerName][Key] = Value
                const groupedValues = {};
                if (Array.isArray(pData.values)) {
                    pData.values.forEach(v => {
                        const rawCust = v.CustomerName || pData.activeCustomer || 'Main';
                        // ROBUST KEY MATCHING (Step 1253)
                        const custKey = normalize(rawCust);
                        if (!groupedValues[custKey]) groupedValues[custKey] = {};

                        if (v.EnquiryForID) {
                            groupedValues[custKey][`${v.OptionID}_${v.EnquiryForID}`] = v;
                        }
                    });
                }
                pData.allValues = groupedValues;

                // Set active values for current view customer using normalized key
                // This ensures 'Civil Project ' matches 'Civil Project'
                pData.values = groupedValues[normalize(cxName || '')] || {};

                // --- HIERARCHY STABILITY (Step 1385) ---
                // If the pricing module hasn't identified jobs (e.g. fresh enquiry), 
                // fallback to the Enquiry Divisions Hierarchy so we have IDs and ParentIDs.
                if (!pData.jobs || pData.jobs.length === 0) {
                    console.log('[Pricing Fetch] No jobs from API, falling back to Enquiry Hierarchy');
                    pData.jobs = (enquiryData?.divisionsHierarchy || []).map(d => ({
                        id: d.ItemID,
                        parentId: d.ParentID,
                        itemName: d.DivisionName,
                        visible: true,
                        editable: true
                    }));
                }

                setPricingData(pData);

                // Calculate Summary
                const summary = [];
                // Initial Select All Jobs if loading new pricing data for the first time or if empty
                // Assuming we want to select all available jobs by default
                const allJobs = pData.jobs ? pData.jobs.map(j => j.itemName) : [];
                // Also add Lead Job to selected if it exists
                if (pData.leadJob && !allJobs.includes(pData.leadJob)) {
                    allJobs.push(pData.leadJob);
                }

                setSelectedJobs(allJobs);

                // Default Tabs: If 'self' is not a valid tab for this user, switch to the first available tab
                if (!pData.access?.hasLeadAccess && pData.jobs && pData.jobs.length > 0) {
                    const accessibleJobs = pData.jobs.filter(j => j.visible || j.editable);
                    if (accessibleJobs.length > 0) {
                        const firstJobId = accessibleJobs[0].id;
                        setActiveQuoteTab(prev => (prev === 'self' || prev === 'My Pricing' || !prev) ? firstJobId : prev);
                    }
                }

                // We need to calculate summary based on all jobs initially
                calculateSummary(pData, allJobs, cxName);
            } else {
                console.error('Pricing API Error:', pricingRes.status);
                setPricingData(null);
                setPricingSummary([]);
                setHasUserPricing(false);
            }
        } catch (err) {
            console.error('Error loading pricing data:', err);
            setPricingData(null);
            setPricingSummary([]);
            setHasUserPricing(false);
        }
    };

    const handleJobToggle = (jobName) => {
        const newSelected = selectedJobs.includes(jobName)
            ? selectedJobs.filter(j => j !== jobName)
            : [...selectedJobs, jobName];
        setSelectedJobs(newSelected);
        calculateSummary(pricingData, newSelected);
    };


    // Calculate Summary based on selected jobs
    const calculateSummary = (data = pricingData, currentSelectedJobs = selectedJobs, activeCustomer = toName, overrideScope = quoteContextScope) => {
        // Ensure activeJobs is initialized first to prevent ReferenceError
        const activeJobs = Array.isArray(currentSelectedJobs) ? currentSelectedJobs : [];
        const normalizeCust = (s) => (s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

        console.log('[calculateSummary] START');
        console.log('[calculateSummary] Data:', data);
        console.log('[calculateSummary] Active Customer:', activeCustomer);
        console.log('[calculateSummary] Selected Jobs:', currentSelectedJobs);
        console.log('[calculateSummary] activeJobs list:', activeJobs);
        console.log('[calculateSummary] Access:', data?.access);
        console.log('[calculateSummary] Override Scope:', overrideScope);

        if (!data || !data.options || !data.values) {
            console.log('[calculateSummary] Missing data, options, or values');
            return;
        }

        console.log('[calculateSummary] Options count:', data.options.length);
        console.log('[calculateSummary] Options:', data.options);

        const summary = [];
        let userHasEnteredPrice = false;
        let calculatedGrandTotal = 0;
        let foundPricedOptional = false;

        // SCOPE FILTER (Strict Hierarchy for Quote Generation)
        // If user has limited access (e.g. BMS), they should ONLY quote for their scope + descendants.
        // They should NOT quote for Parent Jobs or Siblings.
        // NOW ENHANCED: Respect quoteContextScope if present (even for Admins/Leads viewing sub-quotes)
        const userScopes = data.access?.editableJobs || [];

        // Effective Scopes: Use Override if present, otherwise User's Editable Jobs
        const effectiveScopes = overrideScope ? [overrideScope] : userScopes;
        const hasLimitedAccess = !!overrideScope || (!data.access?.hasLeadAccess && userScopes.length > 0);

        const allowedQuoteIds = new Set();
        // Fallback: If pricing module hasn't identified jobs, use Enquiry Divisions Hierarchy
        const jobsPool = (data.jobs && data.jobs.length > 0) ? data.jobs : (enquiryData?.divisionsHierarchy || []);

        if (hasLimitedAccess && jobsPool.length > 0) {
            // 1. Find Scope Root Jobs
            const myJobs = jobsPool.filter(j => effectiveScopes.some(s => {
                const jobName = (j.itemName || j.ItemName || j.DivisionName || '').trim().toLowerCase();
                const scopeName = (s || '').trim().toLowerCase();
                return jobName === scopeName || jobName.includes(scopeName) || scopeName.includes(jobName);
            }));
            myJobs.forEach(j => allowedQuoteIds.add(j.id || j.ItemID));

            // 2. Add All Descendants
            let changed = true;
            while (changed) {
                changed = false;
                jobsPool.forEach(j => {
                    const jId = j.id || j.ItemID;
                    const pId = j.parentId || j.ParentID;
                    if (jId && !allowedQuoteIds.has(jId) && allowedQuoteIds.has(pId)) {
                        allowedQuoteIds.add(jId);
                        changed = true;
                    }
                });
            }
            console.log('[calculateSummary] Limited Access Quote Scoping:', { effectiveScopes, allowedIds: Array.from(allowedQuoteIds) });
        }

        const groups = {};

        // DEDUPLICATE OPTIONS (Step 1560)
        // If multiple options with the same name/item exist (e.g. one for 'Main' and one for 'Civil Project'),
        // we should only process the most relevant one to prevent double counting.
        const uniqueOptions = [];
        const seenOptions = new Set();

        // Sort options so specific customer matches come first
        const sortedOptions = [...data.options].sort((a, b) => {
            const aMatch = normalizeCust(a.customerName) === normalizeCust(activeCustomer);
            const bMatch = normalizeCust(b.customerName) === normalizeCust(activeCustomer);
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0;
        });

        sortedOptions.forEach(opt => {
            const key = `${normalizeCust(opt.name)}_${normalizeCust(opt.itemName)}`;
            if (!seenOptions.has(key)) {
                uniqueOptions.push(opt);
                seenOptions.add(key);
            }
        });

        uniqueOptions.forEach(opt => {
            console.log(`[calculateSummary] Processing option:`, opt.name, 'itemName:', opt.itemName, 'customerName:', opt.customerName);

            // 0. Customer Filter
            // Only filter out if option has a customerName AND it doesn't match the active customer
            // FIX: Normalized comparison to handle case/space differences (Step 1353)
            const optCust = normalizeCust(opt.customerName);
            const activeCust = normalizeCust(activeCustomer);

            const isCustomerMatch = (!opt.customerName || optCust === activeCust || optCust === 'main' || (() => {
                // HIERARCHY ALLOWANCE: Allow internal sub-job options to show for parent job customers
                const activeJob = jobsPool.find(j => normalizeCust(j.itemName || j.DivisionName) === activeCust);
                if (activeJob) {
                    const optJob = jobsPool.find(j => normalizeCust(j.itemName || j.DivisionName) === optCust);
                    if (optJob) {
                        let curr = optJob;
                        while (curr && (curr.parentId || curr.ParentID)) {
                            const pid = curr.parentId || curr.ParentID;
                            if (pid === (activeJob.id || activeJob.ItemID)) return true;
                            curr = jobsPool.find(j => (j.id || j.ItemID) === pid);
                        }
                    }
                }
                return false;
            })());

            if (!isCustomerMatch) {
                console.log(`[calculateSummary] Filtered out (customer mismatch):`, opt.name, 'opt:', opt.customerName, 'active:', activeCustomer);
                return;
            }
            console.log(`[calculateSummary] Passed customer filter:`, opt.name);

            // 1. Visibility Filter
            let isVisible = false;
            // Check if option is associated with a job, and if that job IS ACCESSIBLE (visible or editable)
            if (data.access?.hasLeadAccess) {
                isVisible = true;
                console.log(`[calculateSummary] Visible (lead access):`, opt.name);
            } else if (opt.itemName) {
                // Check if this option's itemName matches any accessible job (case-insensitive partial match)
                const optItemNameLower = opt.itemName.toLowerCase();
                console.log(`[calculateSummary] Checking visibility for "${opt.name}" with itemName "${opt.itemName}"`);
                console.log(`[calculateSummary] editableJobs:`, data.access?.editableJobs);
                console.log(`[calculateSummary] visibleJobs:`, data.access?.visibleJobs);

                const isEditable = data.access?.editableJobs?.some(job => {
                    const jobLower = (job || '').trim().toLowerCase();
                    const optLower = (opt.itemName || '').trim().toLowerCase();

                    // Try exact match first
                    if (jobLower === optLower) {
                        return true;
                    }
                    // Then try partial match
                    return jobLower.includes(optLower) || optLower.includes(jobLower);
                });
                const isVisibleJob = data.access?.visibleJobs?.some(job => {
                    const jobLower = (job || '').trim().toLowerCase();
                    const optLower = (opt.itemName || '').trim().toLowerCase();

                    // Try exact match first
                    if (jobLower === optLower) {
                        return true;
                    }
                    // Then try partial match
                    return jobLower.includes(optLower) || optLower.includes(jobLower);
                });
                isVisible = isEditable || isVisibleJob;
                console.log(`[calculateSummary] Visibility result for "${opt.name}": isEditable=${isEditable}, isVisibleJob=${isVisibleJob}, isVisible=${isVisible}`);
            } else if (!opt.itemName && data.access?.editableJobs?.length > 0) {
                // If option has no itemName but user has editable jobs, show it (it's their own pricing)
                isVisible = true;
                console.log(`[calculateSummary] Visible (no itemName, has editable jobs):`, opt.name);
            }

            if (!isVisible) {
                console.log(`[calculateSummary] Filtered out (not visible):`, opt.name);
                return;
            }
            console.log(`[calculateSummary] Passed visibility filter:`, opt.name);

            // Determine if this option's job is currently selected (for Total calculation)
            // If itemName is missing (General), we assume it is included unless specific logic says otherwise
            const isJobIncluded = !opt.itemName || activeJobs.includes(opt.itemName);

            // 2. Calculate Total
            let optionTotal = 0;
            if (data.jobs) {
                data.jobs.forEach(job => {
                    // Filter: If Limited Access, skip jobs outside scope
                    // FIX: Ensure editable jobs AND their descendants are visible (Robust Normalized Check) (Step 1310)
                    const normalizeName = (s) => (s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                    const editableNames = (data.access?.editableJobs || []).map(n => normalizeName(n));

                    const isEditableName = editableNames.includes(normalizeName(job.itemName));

                    const isEditableDescendant = (() => {
                        if (!hasLimitedAccess) return true;

                        // Rule: I can see myself and my children/descendants.
                        // I CANNOT see my parent.
                        const myJobNames = (data.access?.editableJobs || []).map(n => normalizeName(n));
                        const currentJobName = normalizeName(job.itemName);

                        if (myJobNames.includes(currentJobName)) return true;

                        // Check if any of my editable jobs is an ancestor of the current job
                        return (data.access?.editableJobs || []).some(scopeName => {
                            const scopeJob = jobsPool.find(j => normalizeName(j.itemName || j.DivisionName) === normalizeName(scopeName));
                            if (!scopeJob) return false;

                            const scopeId = scopeJob.id || scopeJob.ItemID;
                            const checkId = job.id || job.ItemID;

                            // Recursive ancestor check
                            const isAncestorOf = (ancId, childId) => {
                                const child = jobsPool.find(j => (j.id || j.ItemID) === childId);
                                if (!child) return false;
                                const pid = child.parentId || child.ParentID;
                                if (pid === ancId) return true;
                                if (pid && pid !== '0' && pid !== 0) return isAncestorOf(ancId, pid);
                                return false;
                            };
                            return isAncestorOf(scopeId, checkId);
                        });
                    })();
                    if (job.itemName && job.itemName.toLowerCase().includes('bms')) {
                        console.log(`[Filter Debug] Job: ${job.itemName}, ID: ${job.id}, Parent: ${job.parentId}`);
                        console.log(`[Filter Debug]  - EditableName: ${isEditableName}`);
                        console.log(`[Filter Debug]  - Descendant: ${isEditableDescendant}`);
                        console.log(`[Filter Debug]  - AllowedQuoteIds has it? ${allowedQuoteIds.has(job.id)}`);
                        console.log(`[Filter Debug]  - HasLimited: ${hasLimitedAccess}`);
                        console.log(`[Filter Debug]  - Result: ${(hasLimitedAccess && !allowedQuoteIds.has(job.id) && !isEditableName && !isEditableDescendant) ? 'HIDDEN' : 'VISIBLE'}`);
                    }
                    if (job.itemName && job.itemName.toLowerCase().includes('bms')) {
                    }

                    // Also check allowedQuoteIds (which comes from initial scoping)
                    // But if isEditableName OR isEditableDescendant is true, we allow it.
                    if (hasLimitedAccess && !allowedQuoteIds.has(job.id) && !isEditableName && !isEditableDescendant) {
                        return;
                    }

                    // IMPACT: Resolves 'Hidden Price' (Step 1189) by checking explicit price first.
                    const key = `${opt.id}_${job.id}`;
                    let val = data.values[key];
                    let price = val ? parseFloat(val.Price || 0) : 0;

                    // Only enforce scoping if price is 0 (to prevent double counting)
                    if (price <= 0) {
                        const normalizeTokens = (s) => (s || '').toLowerCase()
                            .replace(/[^a-z0-9]/g, ' ')
                            .split(/\s+/)
                            .filter(w => w.length > 2 && !['sub', 'job', 'and', 'for', 'the'].includes(w) && !/^l\d+$/.test(w));

                        const optTokens = normalizeTokens(opt.itemName);
                        const jobTokens = normalizeTokens(job.itemName);

                        if (optTokens.length > 0 && jobTokens.length > 0) {
                            const hasOverlap = optTokens.some(ot => jobTokens.some(jt => jt.includes(ot) || ot.includes(jt)));
                            if (!hasOverlap) {
                                return; // Skip mismatch
                            }
                        }
                    }

                    // FALLBACK CHAIN: Parent Customers -> Main -> Generic
                    if (price <= 0 && data.allValues) {
                        const fallbackCandidates = [];
                        let pId = job.parentId || job.ParentID;
                        while (pId && pId !== '0' && pId !== 0) {
                            const pJob = jobsPool.find(j => (j.id || j.ItemID) === pId);
                            if (pJob) {
                                fallbackCandidates.push((pJob.itemName || pJob.DivisionName).replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim());
                                pId = pJob.parentId || pJob.ParentID;
                            } else break;
                        }
                        fallbackCandidates.push('Main');

                        for (const candName of fallbackCandidates) {
                            const candKey = normalizeCust(candName);
                            const vals = data.allValues[candKey];
                            if (vals) {
                                // Find the option for this item under the fallback customer
                                const iOpt = data.options.find(o =>
                                    o.name === opt.name &&
                                    o.itemName === job.itemName &&
                                    normalizeCust(o.customerName) === candKey
                                );
                                if (iOpt) {
                                    const iVal = vals[`${iOpt.id}_${job.id}`];
                                    if (iVal && parseFloat(iVal.Price) > 0) {
                                        price = parseFloat(iVal.Price);
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    if (price > 0) {
                        console.log(`[calculateSummary]   Job "${job.itemName}": ${price}`);
                    }
                    optionTotal += price;
                });
            }
            console.log(`[calculateSummary] Total for "${opt.name}": ${optionTotal}`);

            // 3. Zero Value Filter
            if (optionTotal <= 0) {
                console.log(`[calculateSummary] Filtered out (zero value):`, opt.name);
                return;
            }
            console.log(`[calculateSummary] Passed zero value filter:`, opt.name);

            // Add to Total ONLY if included
            if (isJobIncluded) {
                // Check Optional
                if (opt.name === 'Optional' || opt.name === 'Option') {
                    if (opt.name === 'Optional') foundPricedOptional = true;
                } else {
                    calculatedGrandTotal += optionTotal;
                }
            }

            // 4. Grouping
            let rawGroupName = opt.itemName || data.leadJob || 'General';
            let groupName = rawGroupName;
            if (data.jobs) {
                const jobObj = data.jobs.find(j => j.itemName === rawGroupName);
                if (jobObj) {
                    groupName = rawGroupName;
                } else if (rawGroupName === (data.leadJob || 'General')) {
                    groupName = rawGroupName;
                }
            }
            if (!groups[groupName]) {
                groups[groupName] = { total: 0, items: [], hasOptional: false };
            }
            groups[groupName].items.push({ name: opt.name, total: optionTotal });
            groups[groupName].total += optionTotal; // Note: We keep the group total intact for display.

            if (opt.name === 'Optional') groups[groupName].hasOptional = true;

            userHasEnteredPrice = true;
        });

        // Flatten to summary array
        Object.keys(groups).forEach(name => {
            summary.push({ name: name, ...groups[name] });
        });

        // Sort
        summary.sort((a, b) => a.name.localeCompare(b.name));

        setHasUserPricing(userHasEnteredPrice);
        setGrandTotal(calculatedGrandTotal);
        setHasPricedOptional(foundPricedOptional);
        setPricingSummary(summary);

        console.log('[calculateSummary] COMPLETE');
        console.log('[calculateSummary] Summary:', summary);
        console.log('[calculateSummary] Grand Total:', calculatedGrandTotal);
        console.log('[calculateSummary] Has User Pricing:', userHasEnteredPrice);

        // Generate Pricing Terms Content with Table
        let tableHtml = '<table contentEditable="false" style="width:100%; border-collapse:collapse; margin-bottom:16px;">';
        tableHtml += '<thead><tr style="background:#f8fafc; border:1px solid #cbd5e1;"><th style="padding:10px; border:1px solid #cbd5e1; text-align:left;">Description</th><th style="padding:10px; border:1px solid #cbd5e1; text-align:right;">Amount (BHD)</th></tr></thead>';
        tableHtml += '<tbody>';

        let htmlGrandTotal = 0;

        summary.forEach(grp => {
            // Filter 1: Check if group matches selected Lead Job Prefix (if active)
            // Filter 1: Check if group matches selected Lead Job Prefix (if active)
            if (enquiryData && enquiryData.leadJobPrefix) {
                const prefix = enquiryData.leadJobPrefix;
                // Direct match
                if (!grp.name.startsWith(prefix)) {
                    // Check hierarchy logic to see if this group (job) is a descendant of the selected Lead Job
                    let isRelatedToLead = false;
                    if (data.jobs) {
                        const job = data.jobs.find(j => j.itemName === grp.name);
                        if (job) {
                            // Check ancestors
                            let currentJob = job;
                            while (currentJob && currentJob.parentId) {
                                const parent = data.jobs.find(j => j.id === currentJob.parentId);
                                if (parent) {
                                    if (parent.itemName && parent.itemName.startsWith(prefix)) {
                                        isRelatedToLead = true;
                                        break;
                                    }
                                    currentJob = parent;
                                } else {
                                    break;
                                }
                            }
                        }
                    }

                    if (!isRelatedToLead) return;
                }
            }

            // Only add to Quote Table if Included
            // Check if group name corresponds to a selected job (or is General)
            // If grp.name is in activeJobs, we include it.
            if (grp.name && !activeJobs.includes(grp.name)) {
                // Check if it is a Job (Lead or Sub) that is unchecked
                const isSubJob = data.jobs?.some(j => j.itemName === grp.name);
                const isLeadJob = data.leadJob && (data.leadJob === grp.name || grp.name.includes(data.leadJob));

                // If it is a pricing group related to a Job, and it is NOT selected, skip it.
                if (isLeadJob || isSubJob) return;
            }

            const cleanedName = grp.name.replace(/^(LEAD JOB |SUB JOB) \/ /, '');

            // Add Header for the Group
            tableHtml += `<tr><td colspan="2" style="padding:10px; border:1px solid #cbd5e1; background-color:#f1f5f9; font-weight:bold;">${cleanedName}</td></tr>`;

            // Add Detail Rows
            grp.items.forEach(item => {
                tableHtml += `<tr><td style="padding:10px; border:1px solid #cbd5e1; padding-left: 20px;">${item.name}</td><td style="padding:10px; border:1px solid #cbd5e1; text-align:right;">BD ${item.total.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td></tr>`;
            });

            // Add Group Total ONLY if > 1 item
            if (grp.items.length > 1) {
                tableHtml += `<tr><td style="padding:10px; border:1px solid #cbd5e1; text-align:right; font-weight:600;">Total ${cleanedName}</td><td style="padding:10px; border:1px solid #cbd5e1; text-align:right; font-weight:600;">BD ${grp.total.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td></tr>`;
            }

            // Accumulate filtered total
            htmlGrandTotal += grp.total;
        });

        if (!foundPricedOptional && htmlGrandTotal > 0) {
            tableHtml += `<tr style="background:#f8fafc; font-weight:700;"><td style="padding:10px; border:1px solid #cbd5e1; text-align:right;">Grand Total</td><td style="padding:10px; border:1px solid #cbd5e1; text-align:right;">BD ${htmlGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td></tr>`;
        }
        tableHtml += '</tbody></table>';

        // Update Pricing Terms Text with Dynamic Total
        let pricingText = defaultClauses.pricingTerms || '';
        if (htmlGrandTotal > 0 && !foundPricedOptional) {
            const formattedTotal = htmlGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
            const words = numberToWordsBHD(htmlGrandTotal);
            const totalString = `BD ${formattedTotal} (${words})`;

            pricingText = pricingText.replace('[Amount in figures and words]', totalString);
        }

        setClauseContent(prev => ({
            ...prev,
            pricingTerms: tableHtml + pricingText
        }));

        // Save the calculated summary to state
        console.log('[calculateSummary] Saving summary to state:', summary.length, 'groups');
        setPricingSummary(summary);
        setGrandTotal(calculatedGrandTotal);
        setHasUserPricing(userHasEnteredPrice);
        console.log('[calculateSummary] COMPLETE - Grand Total:', calculatedGrandTotal);
    };

    // Search suggestions
    const handleSearchInput = (value) => {
        setSearchTerm(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);

        console.log('Search Input:', value, 'Length:', value.length);

        if (value.trim().length >= 1) { // Changed to 1 to allow single digit testing if needed, though user typed 2
            debounceRef.current = setTimeout(async () => {
                try {
                    console.log('Fetching suggestions for:', value.trim());
                    const url = `${API_BASE}/api/enquiries?search=${encodeURIComponent(value.trim())}`;
                    console.log('Search URL:', url);

                    const res = await fetch(url);
                    console.log('Search Res Status:', res.status);

                    if (res.ok) {
                        const data = await res.json();
                        console.log('Search Data:', data);
                        setSuggestions(data.slice(0, 10));
                        setShowSuggestions(data.length > 0);
                    } else {
                        console.error('Search API Failed');
                    }
                } catch (err) {
                    console.error('Search error:', err);
                }
            }, 300);
        } else {
            console.log('Clearing suggestions');
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    // Template Handlers
    const handleSaveTemplate = async () => {
        if (!savedTemplateName.trim()) return alert('Please enter a template name');

        const clausesConfig = {
            clauses,
            customClauses,
            orderedClauses
        };

        try {
            const res = await fetch(`${API_BASE}/api/quotes/config/templates`, {
                method: quoteId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateName: savedTemplateName,
                    clausesConfig,
                    createdBy: currentUser?.name || currentUser?.FullName || 'Unknown'
                })
            });

            if (res.ok) {
                alert('Template saved successfully!');
                setSavedTemplateName('');
                // Refresh list
                const listRes = await fetch(`${API_BASE}/api/quotes/config/templates`);
                if (listRes.ok) setTemplates(await listRes.json());
            } else {
                alert('Failed to save template');
            }
        } catch (err) {
            console.error('Error saving template:', err);
            alert('Error saving template');
        }
    };

    const handleLoadTemplate = () => {
        if (!selectedTemplateId) return;
        const tmpl = templates.find(t => t.ID == selectedTemplateId);
        if (!tmpl) return;

        try {
            const config = JSON.parse(tmpl.ClausesConfig);
            if (config.clauses) setClauses(config.clauses);
            if (config.customClauses) setCustomClauses(config.customClauses);
            if (config.orderedClauses) setOrderedClauses(config.orderedClauses);
            alert('Template loaded successfully!');
        } catch (err) {
            console.error('Error parsing template:', err);
            alert('Failed to load template configuration');
        }
    };

    const handleDeleteTemplate = async () => {
        if (!selectedTemplateId) return;
        if (!window.confirm('Are you sure you want to delete this template?')) return;

        try {
            const res = await fetch(`${API_BASE}/api/quotes/config/templates/${selectedTemplateId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                setSelectedTemplateId('');
                const listRes = await fetch(`${API_BASE} /api/quotes / config / templates`);
                if (listRes.ok) setTemplates(await listRes.json());
            }
        } catch (err) {
            console.error('Error deleting template:', err);
        }
    };


    const loadQuote = (quote) => {
        if (!currentUser) {
            alert("Please login to access quotes.");
            return;
        }

        const userEmail = (currentUser.email || currentUser.EmailId || '').toLowerCase().trim();
        const preparedByEmail = (quote.PreparedByEmail || '').toLowerCase().trim();

        // 1. Check if user is the creator
        const isCreator = userEmail === preparedByEmail;

        // 2. Check if user is in CC list of any division for this enquiry
        let isInCC = false;
        if (enquiryData?.divisionEmails) {
            isInCC = enquiryData.divisionEmails.some(div => {
                const emails = [div.ccMailIds, div.commonMailIds].filter(Boolean).join(',');
                const allEmails = emails.split(',').map(e => e.trim().toLowerCase());
                return allEmails.includes(userEmail);
            });
        }

        // 3. Admin check
        const isAdmin = currentUser.Roles === 'Admin' || currentUser.role === 'Admin';

        // 4. Lead Access (from Pricing Access)
        const hasLeadAccess = pricingData?.access?.hasLeadAccess;

        if (!isCreator && !isInCC && !isAdmin && !hasLeadAccess) {
            alert("Permission Denied: You are not authorized to edit or view this quote revision (Creator or CC list only).");
            return;
        }

        setQuoteId(quote.ID);
        setQuoteNumber(quote.QuoteNumber);
        setQuoteDate(quote.QuoteDate ? quote.QuoteDate.split('T')[0] : new Date().toISOString().split('T')[0]);
        setValidityDays(quote.ValidityDays || 30);
        setCustomerReference(quote.CustomerReference || '');
        setSubject(quote.Subject || '');
        setPreparedBy(quote.PreparedBy || '');
        setSignatory(quote.Signatory || '');
        setSignatoryDesignation(quote.SignatoryDesignation || '');
        setToName(quote.ToName || '');
        setToAddress(quote.ToAddress || '');
        setToPhone(quote.ToPhone || '');
        setToEmail(quote.ToEmail || '');

        // Set Attention Of (ReceivedFrom) for the loaded quote
        if (quote.ToName && enquiryData?.customerContacts) {
            const contact = enquiryData.customerContacts[quote.ToName.trim()];
            if (contact) {
                setToAttention(contact);
            } else {
                // Fallback to enquiry global ReceivedFrom
                setToAttention(enquiryData?.enquiry?.ReceivedFrom || '');
            }
        } else {
            setToAttention('');
        }

        // Always use Company Details for Footer, never the Customer (recipient) details
        if (enquiryData?.companyDetails) {
            setFooterDetails(enquiryData.companyDetails);
        } else {
            // Fallback default
            setFooterDetails({
                name: 'Almoayyed Contracting',
                address: 'P.O. Box 32232, Manama, Kingdom of Bahrain',
                phone: '(+973) 17 400 407',
                fax: '(+973) 17 400 396',
                email: 'bms@almcg.com'
            });
        }

        // Clause Visibility Logic:
        // 1. If "Legacy" quote (missing ClauseOrder), default all into enabled (TRUE).
        //    This handles old data where '0' might be a misleading default.
        // 2. If "Modern" quote (has ClauseOrder), respect the saved TRUE/FALSE state.
        const isLegacy = !quote.ClauseOrder || quote.ClauseOrder === '[]';

        const isTrue = (val) => {
            if (isLegacy) return true; // Force ON for legacy
            return val !== false && val !== 0; // Respect saved state
        };

        setClauses({
            showScopeOfWork: isTrue(quote.ShowScopeOfWork),
            showBasisOfOffer: isTrue(quote.ShowBasisOfOffer),
            showExclusions: isTrue(quote.ShowExclusions),
            showPricingTerms: isTrue(quote.ShowPricingTerms),
            showSchedule: isTrue(quote.ShowSchedule),
            showWarranty: isTrue(quote.ShowWarranty),
            showResponsibilityMatrix: isTrue(quote.ShowResponsibilityMatrix),
            showTermsConditions: isTrue(quote.ShowTermsConditions),
            showAcceptance: isTrue(quote.ShowAcceptance),
            showBillOfQuantity: isTrue(quote.ShowBillOfQuantity)
        });

        setClauseContent({
            scopeOfWork: quote.ScopeOfWork || defaultClauses.scopeOfWork,
            basisOfOffer: quote.BasisOfOffer || defaultClauses.basisOfOffer,
            exclusions: quote.Exclusions || defaultClauses.exclusions,
            pricingTerms: quote.PricingTerms || defaultClauses.pricingTerms,
            schedule: quote.Schedule || defaultClauses.schedule,
            warranty: quote.Warranty || defaultClauses.warranty,
            responsibilityMatrix: quote.ResponsibilityMatrix || defaultClauses.responsibilityMatrix,
            termsConditions: quote.TermsConditions || defaultClauses.termsConditions,
            acceptance: quote.Acceptance || defaultClauses.acceptance,
            billOfQuantity: quote.BillOfQuantity || defaultClauses.billOfQuantity
        });

        let parsedCustom = [];
        try { parsedCustom = quote.CustomClauses ? JSON.parse(quote.CustomClauses) : []; } catch (e) { console.error('Error parsing custom clauses:', e); }
        setCustomClauses(parsedCustom);

        let parsedOrder = [];
        try { parsedOrder = quote.ClauseOrder ? JSON.parse(quote.ClauseOrder) : []; } catch (e) { console.error('Error parsing clause order:', e); }
        if (parsedOrder.length > 0) {
            setOrderedClauses(parsedOrder);
        } else {
            // Fallback to default order if not saved
            setOrderedClauses([
                'showScopeOfWork', 'showBasisOfOffer', 'showExclusions', 'showPricingTerms',
                'showBillOfQuantity', 'showSchedule', 'showWarranty', 'showResponsibilityMatrix', 'showTermsConditions', 'showAcceptance'
            ]);
        }

        setGrandTotal(quote.TotalAmount || 0);
        setExpandedClause(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // FORCE CORRECT CONTEXT FOR REVISIONS
        // Extract Scope from Quote Number (Format: Dept/Div/Ref/QuoteNo)
        // e.g. AAC/BMS/41... -> BMS
        const quoteParts = quote.QuoteNumber ? quote.QuoteNumber.split('/') : [];
        const scope = quoteParts.length > 1 ? quoteParts[1] : null;

        let newScope = null;
        // Only apply scope limit if it looks like a sub-division (e.g. BMS, ELE, PLFF)
        // Avoid limiting if it matches the lead job (unless specific)
        if (scope && scope !== 'AAC') {
            newScope = scope;
        }

        // VALIDATE SCOPE MATCH (Prevent Empty Quotes for Unmatched Codes like CVLP)
        if (newScope && pricingData && pricingData.jobs) {
            const hasMatch = pricingData.jobs.some(j => {
                const jn = j.itemName.toLowerCase();
                // CRITICAL: Ensure scope comparison is also case-insensitive to match "ELE" with "Electrical" logic in calculateSummary
                const sn = newScope.toLowerCase();
                return jn === sn || jn.includes(sn);
            });

            if (!hasMatch) {
                console.log('[loadQuote] Scope', newScope, 'not found in jobs. Reverting to Full Scope (Lead Context).');
                newScope = null;
            }
        }

        console.log('[loadQuote] Setting Context Scope:', newScope);
        setQuoteContextScope(newScope);

        // Trigger Summary Recalculation to update the Preview HTML with corrected scope
        // This fixes "Corrupted" quotes that were saved with full pricing
        if (pricingData) {
            calculateSummary(pricingData, undefined, quote.ToName, newScope);
            // Note: If pricingData is not for the correct customer, this might be slightly off provided values,
            // but structure will be correct. Usually Previous Quote Context implies same active enquiry.
        }
    };

    // Auto-load Quote or Clear Form when Active Tab Changes
    useEffect(() => {
        if (!activeQuoteTab || !calculatedTabs) return;

        // Ensure data is loaded
        if (!pricingData && !enquiryData) return;

        const activeTabObj = calculatedTabs.find(t => t.id === activeQuoteTab);
        if (!activeTabObj) return;

        const activeTabRealId = activeTabObj.realId;
        const jobsPool = (pricingData?.jobs && pricingData.jobs.length > 0) ? pricingData.jobs : (enquiryData?.divisionsHierarchy || []);

        console.log('[AutoLoad] Checking quotes for tab:', activeTabObj.label, 'ID:', activeTabRealId);

        // Filter quotes for this tab (Replicating render logic)
        const tabQuotes = existingQuotes.filter(q => {
            // 1. Customer Context Match
            const normalizedQuoteTo = normalize(q.ToName);
            const normalizedCurrentTo = normalize(toName);
            const isMainOrGeneric = !normalizedQuoteTo || normalizedQuoteTo === 'main' || normalizedQuoteTo === 'generic';

            // Check if context is internal
            const mJobs = (enquiryData?.divisionsHierarchy || []).map(d => normalize(d.itemName || d.DivisionName));
            const currentIsInternal = mJobs.includes(normalizedCurrentTo);
            const quoteIsInternal = mJobs.includes(normalizedQuoteTo) || isMainOrGeneric;

            if (currentIsInternal) {
                if (!quoteIsInternal && normalizedQuoteTo !== normalizedCurrentTo) return false;
            } else {
                if (!isMainOrGeneric &&
                    normalizedQuoteTo !== normalizedCurrentTo &&
                    !normalizedQuoteTo.startsWith(normalizedCurrentTo + '-') &&
                    !normalizedCurrentTo.startsWith(normalizedQuoteTo + '-')) return false;
            }

            // 2. Hierarchy Match
            const qDivCode = q.QuoteNumber?.split('/')[1]?.toUpperCase();
            // Simplified match as per render block
            const qJob = jobsPool.find(j => {
                const jName = (j.itemName || j.DivisionName || '').toUpperCase();
                return (qDivCode === 'ELE' && jName.includes('ELECTRICAL')) ||
                    (qDivCode === 'BMS' && jName.includes('BMS')) ||
                    (qDivCode === 'PLFF' && jName.includes('PLUMBING')) ||
                    (qDivCode === 'CVLP' && jName.includes('CIVIL')) ||
                    (qDivCode === 'FPE' && jName.includes('FIRE')) ||
                    (qDivCode === 'AAC' && jName.includes('AIR'));
            });

            if (!qJob) return activeTabObj.isSelf; // Fallback mapping
            const qJobId = qJob.id || qJob.ItemID;
            return String(qJobId) == String(activeTabRealId);
        });

        if (tabQuotes.length > 0) {
            // Found quotes: Sort by Revision (Desc) and Load Latest
            const sorted = tabQuotes.sort((a, b) => b.RevisionNo - a.RevisionNo);
            const latest = sorted[0];

            // Only load if different (using closure's quoteId)
            if (quoteId !== latest.ID) {
                console.log('[AutoLoad] Loading latest quote:', latest.QuoteNumber);
                loadQuote(latest);
            }
        } else {
            // No quotes found: Clear Form / Blank State
            if (quoteId !== null) {
                console.log('[AutoLoad] No quotes found for tab. Resetting to blank form.');
                setQuoteId(null);
                setQuoteNumber('');
                setClauseContent(defaultClauses);
                setQuoteDate(new Date().toISOString().split('T')[0]);
                setValidityDays(30);
                setSubject('');
                setCustomerReference('');
            }
        }
    }, [activeQuoteTab, calculatedTabs, existingQuotes, toName]); // Excluded quoteId to allowing 'New Quote' action (clearing ID), kept others for stability



    // Generic Mandatory Field Validation
    const validateMandatoryFields = useCallback(() => {
        const missingFields = [];
        if (!quoteDate) missingFields.push('Quote Date');
        if (!validityDays || validityDays <= 0) missingFields.push('Validity (Days)');
        if (!toAttention || !toAttention.trim()) missingFields.push('Attention of');
        if (!subject || !subject.trim()) missingFields.push('Subject');
        if (!preparedBy || !preparedBy.trim()) missingFields.push('Prepared By');
        if (!signatory || !signatory.trim()) missingFields.push('Signatory');

        if (missingFields.length > 0) {
            alert(`Please fill the following mandatory fields before proceeding:\n\n• ${missingFields.join('\n• ')}`);
            return false;
        }
        return true;
    }, [quoteDate, validityDays, toAttention, subject, preparedBy, signatory]);

    const handleRevise = async () => {
        console.log('[handleRevise] Starting revision process. QuoteId:', quoteId);
        if (!quoteId) {
            console.log('[handleRevise] No quoteId found, aborting');
            return;
        }

        // Validate mandatory fields before revision
        if (!validateMandatoryFields()) return;

        if (!window.confirm('Are you sure you want to create a new revision based on this quote?')) {
            console.log('[handleRevise] User cancelled');
            return;
        }

        setSaving(true);
        try {
            const payload = getQuotePayload();
            console.log('[handleRevise] Payload:', payload);
            console.log('[handleRevise] Calling API:', `${API_BASE}/api/quotes/${quoteId}/revise`);

            const res = await fetch(`${API_BASE}/api/quotes/${quoteId}/revise`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            console.log('[handleRevise] Response status:', res.status);

            if (res.ok) {
                const data = await res.json();
                console.log('[handleRevise] Success! New revision data:', data);

                // Update quote ID and number first
                setQuoteId(data.id);
                setQuoteNumber(data.quoteNumber);

                // Wait a moment for DB commit, then refresh the quotes list
                console.log('[handleRevise] Waiting 500ms for DB commit...');
                await new Promise(resolve => setTimeout(resolve, 500));

                console.log('[handleRevise] Refreshing quotes list...');
                await fetchExistingQuotes(enquiryData.enquiry.RequestNo);

                console.log('[handleRevise] All updates complete!');
                alert('Revision created successfully!');
            } else {
                const err = await res.json();
                console.error('[handleRevise] Error response:', err);
                alert('Error: ' + (err.error || 'Failed to revise quote'));
            }
        } catch (err) {
            console.error('[handleRevise] Fatal error:', err);
            alert('Fatal error revising quote');
        } finally {
            setSaving(false);
        }
    };

    // Select enquiry
    // Trigger fetch when enquiry is loaded
    useEffect(() => {
        if (enquiryData?.enquiry?.RequestNo) {
            console.log('[QuoteForm] Enquiry loaded, fetching quotes for RequestNo:', enquiryData.enquiry.RequestNo);
            fetchExistingQuotes(enquiryData.enquiry.RequestNo);
        } else {
            console.log('[QuoteForm] Enquiry loaded but no RequestNo?', enquiryData);
        }
    }, [enquiryData?.enquiry?.RequestNo]); // Only trigger when RequestNo changes

    const fetchExistingQuotes = useCallback(async (requestNo) => {
        try {
            console.log('[fetchExistingQuotes] START fetching for:', requestNo);
            const url = `${API_BASE}/api/quotes/by-enquiry/${encodeURIComponent(requestNo)}`;
            console.log('[fetchExistingQuotes] URL:', url);

            const res = await fetch(url);
            console.log('[fetchExistingQuotes] Response status:', res.status);

            if (res.ok) {
                const quotes = await res.json();
                console.log('[fetchExistingQuotes] Received quotes payload:', quotes);
                console.log('[fetchExistingQuotes] Count:', quotes.length);
                quotes.forEach(q => console.log('  -', q.QuoteNumber, '| To:', q.ToName));
                setExistingQuotes(quotes);
            } else {
                console.error('[fetchExistingQuotes] Failed to fetch, status:', res.status);
            }
        } catch (err) {
            console.error('[fetchExistingQuotes] Error:', err);
        }
    }, []);

    // NEW: Auto-load latest revision for selected customer and lead job
    useEffect(() => {
        if (!toName || !enquiryData?.leadJobPrefix || existingQuotes.length === 0) {
            // If we previously had a quoteId but now customer/lead job is missing matching quotes,
            // reset to draft mode (null quoteId)
            if (quoteId !== null && (!toName || !enquiryData?.leadJobPrefix)) {
                console.log('[AutoLoad] Resetting to Draft (Selection cleared/missing)');
                setQuoteId(null);
                setQuoteNumber(enquiryData?.quoteNumber || '');
            }
            return;
        }

        // Find matches for current customer AND lead job prefix
        // We use the same prefix pattern logic as the sidebar filter to stay consistent
        // Find matches for current customer

        // 1. Identify current division context from active tab
        const activeTab = (calculatedTabs || []).find(t => t.id === activeQuoteTab) || (calculatedTabs || []).find(t => t.id === 'self');
        let currentTabCode = '';
        if (activeTab) {
            const up = (activeTab.label || '').toUpperCase();
            if (up.includes('PLUMBING') || up.includes('PLFF')) currentTabCode = 'PLFF';
            else if (up.includes('BMS')) currentTabCode = 'BMS';
            else if (up.includes('CIVIL') || up.includes('CVLP')) currentTabCode = 'CVLP';
            else if (up.includes('ELECTRICAL') || up.includes('ELE') || up.includes('ELECT')) currentTabCode = 'ELE';
            else if (up.includes('FIRE') || up.includes('FPE')) currentTabCode = 'FPE';
            else if (up.includes('AIR CONDITIONING') || (up.includes('AAC'))) currentTabCode = 'AAC';
        }

        // 2. Filter matches by Customer AND Division
        const matches = existingQuotes.filter(q => {
            const sameCustomer = (q.ToName || '').trim().toLowerCase() === toName.trim().toLowerCase();
            if (!sameCustomer) return false;

            // Strict Division Check: Only auto-load if it matches the current tab context
            if (currentTabCode) {
                const qDivCode = q.QuoteNumber?.split('/')[1]?.toUpperCase();
                return qDivCode === currentTabCode;
            }
            return true;
        });

        if (matches.length > 0) {
            // Sort by RevisionNo descending
            const sorted = matches.sort((a, b) => (b.RevisionNo || 0) - (a.RevisionNo || 0));
            const latest = sorted[0];

            // Only auto-load if no quote is currently selected (quoteId is null).
            // This prevents jumping back to latest when the user explicitly clicks an older revision (R0).
            if (quoteId === null) {
                console.log('[AutoLoad] Found existing quote(s) for this division, loading latest:', latest.QuoteNumber);
                loadQuote(latest);
            }
        } else {
            // No matches found for this specific customer/division combination
            // ALWAYS reset to default clauses if no quote is found, to ensure we don't carry over
            // any state (like disabled clauses) from a previous selection or default initialization.
            // This ensures a fresh "Draft" always starts with all checkboxes enabled.
            if (true) {
                console.log('[AutoLoad] No matching quotes found. Resetting to Draft default state.');
                setQuoteId(null);
                setQuoteNumber(enquiryData?.quoteNumber || '');

                // RESET CLAUSES TO DEFAULT (ALL TRUE) for fresh Draft
                setClauses({
                    showScopeOfWork: true, showBasisOfOffer: true, showExclusions: true,
                    showPricingTerms: true, showSchedule: true, showWarranty: true,
                    showResponsibilityMatrix: true, showTermsConditions: true, showAcceptance: true, showBillOfQuantity: true
                });

                // Reset their content to defaults as well? 
                // Probably better to keep current content if the user was typing, 
                // BUT if they switched contexts, maybe we should reset to templates?
                // For now, just ensuring visibility is enabled is the critical fix.
            }
        }
    }, [toName, enquiryData?.leadJobPrefix, existingQuotes, quoteId, enquiryData?.quoteNumber, activeQuoteTab, calculatedTabs]);


    const handleSelectEnquiry = async (enq) => {
        setSearchTerm(enq.RequestNo);
        setSuggestions([]);
        setShowSuggestions(false);
        setLoading(true);
        setExistingQuotes([]);
        setToName('');
        setToAttention('');
        setPreparedBy('');
        setSignatory('');
        setSignatoryDesignation('');

        try {
            const userEmail = currentUser?.EmailId || '';
            const res = await fetch(`${API_BASE}/api/quotes/enquiry-data/${encodeURIComponent(enq.RequestNo)}?userEmail=${encodeURIComponent(userEmail)}`);
            if (res.ok) {
                const data = await res.json();
                setEnquiryData(data);
                fetchExistingQuotes(enq.RequestNo);
                setQuoteNumber(data.quoteNumber);
                setQuoteId(null); // New quote

                // Reset Clauses to Defaults
                setClauses({
                    showScopeOfWork: true, showBasisOfOffer: true, showExclusions: true,
                    showPricingTerms: true, showSchedule: true, showWarranty: true,
                    showResponsibilityMatrix: true, showTermsConditions: true, showAcceptance: true, showBillOfQuantity: true
                });
                setClauseContent({
                    scopeOfWork: defaultClauses.scopeOfWork,
                    basisOfOffer: defaultClauses.basisOfOffer,
                    exclusions: defaultClauses.exclusions,
                    pricingTerms: defaultClauses.pricingTerms,
                    schedule: defaultClauses.schedule,
                    warranty: defaultClauses.warranty,
                    responsibilityMatrix: defaultClauses.responsibilityMatrix,
                    termsConditions: defaultClauses.termsConditions,
                    acceptance: defaultClauses.acceptance,
                    billOfQuantity: defaultClauses.billOfQuantity
                });
                setOrderedClauses([
                    'showScopeOfWork', 'showBasisOfOffer', 'showExclusions', 'showPricingTerms',
                    'showBillOfQuantity', 'showSchedule', 'showWarranty', 'showResponsibilityMatrix', 'showTermsConditions', 'showAcceptance'
                ]);

                if (data.companyDetails) {
                    setQuoteCompanyName(data.companyDetails.name || 'Almoayyed Air Conditioning');
                    setQuoteLogo(data.companyDetails.logo);
                    setFooterDetails(data.companyDetails);
                }

                setCompanyProfiles(data.availableProfiles || []);

                // ---------------------------------------------------------
                // INTELLIGENT HEADER/FOOTER SELECTION BASED ON LOGGED-IN USER
                // ---------------------------------------------------------
                let selectedProfile = null;
                const userDept = currentUser?.Department || ''; // e.g., "Civil", "MEP"

                if (userDept && data.availableProfiles?.length > 0) {
                    if (userDept.toLowerCase() === 'civil') {
                        // User is Civil -> Prefer 'Civil Project' or any 'ACC' code
                        selectedProfile = data.availableProfiles.find(p =>
                            p.itemName?.toLowerCase().includes('civil') ||
                            p.code === 'ACC' ||
                            p.divisionCode === 'CVLP'
                        );
                    } else if (userDept.toLowerCase() === 'mep' || userDept.toLowerCase().includes('bms')) {
                        // User is MEP/BMS -> ROBUST Selection Strategy
                        console.log('QuoteForm: User is MEP/BMS, searching for BMS profile...');

                        // 1. Try Specific BMS Match
                        const bmsMatches = data.availableProfiles.filter(p =>
                            (p.itemName && p.itemName.toLowerCase().includes('bms')) ||
                            p.divisionCode === 'BMS'
                        );

                        if (bmsMatches.length > 0) {
                            selectedProfile = bmsMatches[0];
                            console.log('QuoteForm: Found BMS Match:', selectedProfile.name);
                        } else {
                            // 2. Fallback to any AAC Match (Electrical, Plumbing)
                            // We explicitly avoid PLFF if possible by checking divisionCode first?
                            // Actually, PLFF has divisionCode AAC. We just take the first one available.
                            const aacMatches = data.availableProfiles.filter(p =>
                                p.code === 'AAC' ||
                                p.divisionCode === 'AAC'
                            );
                            if (aacMatches.length > 0) {
                                selectedProfile = aacMatches[0];
                                console.log('QuoteForm: Found General AAC Match:', selectedProfile.name);
                            }
                        }
                    }
                }

                // If we found a user-specific match, override the default details
                if (selectedProfile) {
                    console.log('Auto-selecting profile for user:', userDept, '->', selectedProfile.name);
                    setQuoteCompanyName(selectedProfile.name);
                    setQuoteLogo(selectedProfile.logo);
                    setFooterDetails(selectedProfile);
                    // Update enquiryData so the Quote Payload uses this profile's codes (Ref No)
                    data.companyDetails = { ...selectedProfile };
                    // We also need to update the state so a re-render picks it up if needed
                    setEnquiryData({ ...data });
                } else {
                } // End of else

                // 3a. Auto-Select Lead Job
                console.log('[QuoteForm] Auto-Select Lead Job - divisions:', data.divisions);
                console.log('[QuoteForm] Auto-Select Lead Job - divisionsHierarchy:', data.divisionsHierarchy);

                // Use divisions if available, otherwise extract from divisionsHierarchy
                let availableDivisions = data.divisions || [];

                if (availableDivisions.length === 0 && data.divisionsHierarchy && data.divisionsHierarchy.length > 0) {
                    // Use ALL nodes in hierarchy as potential Lead Job context
                    availableDivisions = data.divisionsHierarchy.map(r => r.itemName);
                    console.log('[QuoteForm] Using all divisionsHierarchy nodes for Lead Job selection:', availableDivisions);
                }

                const leadJobs = availableDivisions.filter(d => d.trim().startsWith('L'));
                console.log('[QuoteForm] Filtered Lead Jobs:', leadJobs);

                if (leadJobs.length === 1) {
                    // Only ONE Lead Job available - Auto Select
                    const prefix = leadJobs[0].split('-')[0].trim();
                    data.leadJobPrefix = prefix;
                    console.log('[QuoteForm] Auto-selecting Single Lead Job:', prefix);
                } else if (leadJobs.length > 1) {
                    // Multiple Lead Jobs - Force User Selection
                    data.leadJobPrefix = '';
                    console.log('[QuoteForm] Multiple Lead Jobs found. User must select.');
                } else {
                    // No lead jobs found - try to use best match for current user department
                    const userDept = (currentUser?.Department || '').toLowerCase();
                    const bmsMatch = availableDivisions.find(d => d.toLowerCase().includes('bms'));
                    const elecMatch = availableDivisions.find(d => d.toLowerCase().includes('electrical'));

                    if (userDept.includes('bms') && bmsMatch) {
                        data.leadJobPrefix = bmsMatch;
                        console.log('[QuoteForm] Auto-selecting BMS for BMS user:', bmsMatch);
                    } else if (userDept.includes('electrical') && elecMatch) {
                        data.leadJobPrefix = elecMatch;
                        console.log('[QuoteForm] Auto-selecting Electrical for Electrical user:', elecMatch);
                    } else if (availableDivisions.length > 0) {
                        data.leadJobPrefix = availableDivisions[0].split('-')[0].trim();
                        console.log('[QuoteForm] Using first available division:', data.leadJobPrefix);
                    } else {
                        data.leadJobPrefix = '';
                        console.log('[QuoteForm] No divisions available at all');
                    }
                }

                // ---------------------------------------------------------

                setPreparedByOptions(data.preparedByOptions || []);

                // Map customer options for CreatableSelect: Include ONLY Enquiry Customers + Parent Customer (Base)
                const uniqueCustomerOptions = (data.customerOptions || []).map(c => ({ value: c, label: c, type: 'Linked' }));

                // Initial Set (Effect will update dynamically based on hierarchy)
                setEnquiryCustomerOptions(uniqueCustomerOptions);

                // Ensure state update triggers effect
                // (enquiryData update below handles it)


                // Merge usersList with preparedByOptions for Signatory
                // Logic: Signatory should be standard users OR anyone involved (SE, CC, Common)
                const extendedSignatoryOptions = [
                    ...usersList.map(u => ({ value: u.FullName, label: u.FullName, designation: u.Designation })),
                    ...(data.preparedByOptions || [])
                ];
                // Deduplicate by value (name/email)
                const uniqueSigOptions = extendedSignatoryOptions.filter((v, i, a) => a.findIndex(t => (t.value === v.value)) === i);
                setSignatoryOptions(uniqueSigOptions);

                // Initialize Metadata
                setQuoteDate(new Date().toISOString().split('T')[0]);
                setCustomerReference(data.enquiry.CustomerRefNo || data.enquiry.RequestNo || ''); // Default to Cust Ref or Enquiry No
                setSubject(`Proposal for ${data.enquiry.ProjectName}`);

                // 3b. Smart Default Customer Selection
                // Priority: 
                // 1. If only one customer option is available, use it.
                // 2. If enq object (from Pending Updates table) has a customer, use it ONLY if it's a single customer.
                let defaultCustomer = '';
                const availableOptions = (data.customerOptions || []).map(c => c.trim());

                // Stricter check: only auto-select if exactly one option AND it doesn't look like a combined list (no commas)
                if (availableOptions.length === 1 && !availableOptions[0].includes(',')) {
                    defaultCustomer = availableOptions[0];
                } else {
                    // If multiple options OR a single option with commas, don't auto-select.
                    // This forces the user to pick one, keeping the UI "blank" as requested.
                    defaultCustomer = '';
                }

                setToName(defaultCustomer);
                // Final Data Update to Ensure all modifications (Lead Job Logic, etc.) are reflected in State
                setEnquiryData({ ...data });

                if (defaultCustomer) {
                    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    const target = normalize(defaultCustomer);

                    // Try exact match first, then robust normalized match
                    let cust = customersList.find(c => c.CompanyName === defaultCustomer);
                    if (!cust) {
                        cust = customersList.find(c => normalize(c.CompanyName) === target);
                    }

                    if (cust) {
                        // NOTE: We prioritize MASTER LIST address over enquiry data default.
                        const addr = [cust.Address1, cust.Address2].filter(Boolean).join('\n').trim();
                        setToAddress(addr);
                        setToPhone(`${cust.Phone1 || ''} ${cust.Phone2 ? '/ ' + cust.Phone2 : ''}`.trim());
                        setToEmail(cust.EmailId || ''); // Prioritize Master Email
                    } else {
                        // Customer NOT in Master List.
                        const enqCustName = data.enquiry?.CustomerName || '';

                        // Strict check on normalized name
                        if (enqCustName && normalize(enqCustName) === target && data.customerDetails) {
                            const details = data.customerDetails;
                            const addr = details.Address || [details.Address1, details.Address2].filter(Boolean).join('\n').trim();
                            setToAddress(addr);
                            setToPhone(`${details.Phone1 || ''} ${details.Phone2 ? '/ ' + details.Phone2 : ''} `.trim());
                            setToEmail(details.EmailId || '');
                        } else {
                            // Even if not in master list, allow it but CLEAR details to avoid internal division leak
                            setToAddress('');
                            setToPhone('');
                            setToEmail('');
                        }
                    }
                } else {
                    setToAddress('');
                    setToPhone('');
                    setToEmail('');
                    setToAttention('');
                }

                // Set Attention of (ReceivedFrom) for the default customer
                if (defaultCustomer && data.customerContacts) {
                    console.log('[handleSelectEnquiry] Setting Attention for default customer:', defaultCustomer);
                    console.log('[handleSelectEnquiry] customerContacts:', data.customerContacts);

                    if (data.customerContacts[defaultCustomer]) {
                        setToAttention(data.customerContacts[defaultCustomer]);
                        console.log('[handleSelectEnquiry] ✓ Set Attention to:', data.customerContacts[defaultCustomer]);
                    } else {
                        // Fallback to main enquiry ReceivedFrom if no specific contact
                        const fallback = data.enquiry?.ReceivedFrom || '';
                        setToAttention(fallback);
                        console.log('[handleSelectEnquiry] ✗ Not found in customerContacts, using fallback:', fallback);
                    }
                }


                // Default to enquiry customer for pricing load
                loadPricingData(data.enquiry.RequestNo, defaultCustomer);


                // Default Prepared By to Current User
                if (currentUser) {
                    setPreparedBy(currentUser.name || currentUser.FullName);
                }

                // Set default signatory to current user if in list
                if (currentUser) {
                    const user = usersList.find(u => u.EmailId === currentUser.EmailId || u.FullName === currentUser.FullName);
                    if (user) {
                        setSignatory(user.FullName);
                        setSignatoryDesignation(user.Designation);
                    }
                }
            }
        } catch (err) {
            console.error('Error loading enquiry data:', err);
        } finally {
            setLoading(false);
        }
    };

    // --- Attachment Functions ---
    const fetchQuoteAttachments = useCallback(async (qId) => {
        if (!qId) return;
        try {
            const res = await fetch(`${API_BASE}/api/quotes/attachments/${qId}`);
            if (res.ok) {
                const data = await res.json();
                setQuoteAttachments(data);
            }
        } catch (err) {
            console.error('Error fetching attachments:', err);
        }
    }, []);

    const uploadFiles = useCallback(async (files, targetQuoteId = quoteId) => {
        if (!targetQuoteId) {
            // New Behavior: Queue files as pending until saved
            if (files && files.length > 0) {
                const fileArray = Array.from(files);
                // Simple duplication check based on name
                setPendingFiles(prev => {
                    const newFiles = fileArray.filter(f => !prev.some(p => p.name === f.name));
                    return [...prev, ...newFiles];
                });
            }
            return;
        }
        if (!files || files.length === 0) return;

        setIsUploading(true);
        const formData = new FormData();
        Array.from(files).forEach(file => {
            formData.append('files', file);
        });

        try {
            const res = await fetch(`${API_BASE}/api/quotes/attachments/${targetQuoteId}`, {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                await fetchQuoteAttachments(targetQuoteId);
            } else {
                const err = await res.json();
                alert('Failed to upload attachments: ' + (err.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Upload error:', err);
            alert('Error uploading files. Please try again or check the server status.');
        } finally {
            setIsUploading(false);
        }
    }, [quoteId, fetchQuoteAttachments]);

    const handleDeleteAttachment = async (attachmentId) => {
        if (!window.confirm('Delete this attachment?')) return;
        try {
            const res = await fetch(`${API_BASE}/api/quotes/attachments/${attachmentId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                setQuoteAttachments(prev => prev.filter(a => a.ID !== attachmentId));
            }
        } catch (err) {
            console.error('Error deleting attachment:', err);
        }
    };

    const handleDownloadAttachment = (id, fileName) => {
        window.open(`${API_BASE}/api/quotes/attachments/download/${id}?download=true`, '_blank');
    };


    useEffect(() => {
        if (quoteId) {
            fetchQuoteAttachments(quoteId);
        } else {
            setQuoteAttachments([]);
        }
    }, [quoteId]);

    // Clear selection
    const handleClear = () => {
        setExistingQuotes([]);
        setExpandedGroups({});
        setSearchTerm('');
        setSuggestions([]);
        setShowSuggestions(false);
        setEnquiryData(null);
        setQuoteId(null);
        setQuoteNumber('');
        setPricingData(null);
        setPricingSummary([]);
        setHasUserPricing(false);
        setQuoteContextScope(null); // Clear Scope Context
        setSelectedJobs([]); // Clear selected jobs
        setToAttention('');
        setClauses({
            showScopeOfWork: true, showBasisOfOffer: true, showExclusions: true,
            showPricingTerms: true, showSchedule: true, showWarranty: true,
            showResponsibilityMatrix: true, showTermsConditions: true, showAcceptance: true, showBillOfQuantity: true
        });
        setClauseContent({
            scopeOfWork: defaultClauses.scopeOfWork,
            basisOfOffer: defaultClauses.basisOfOffer,
            exclusions: defaultClauses.exclusions,
            pricingTerms: defaultClauses.pricingTerms,
            schedule: defaultClauses.schedule,
            warranty: defaultClauses.warranty,
            responsibilityMatrix: defaultClauses.responsibilityMatrix,
            termsConditions: defaultClauses.termsConditions,
            acceptance: defaultClauses.acceptance,
            billOfQuantity: defaultClauses.billOfQuantity
        });
        setQuoteCompanyName('Almoayyed Air Conditioning');
        setQuoteLogo(null);
        setCompanyProfiles([]);
        setPreparedBy('');
        setSignatory('');
        setSignatoryDesignation('');
        setSubject('');
        setCustomerReference('');
        setToName('');
        setToAddress('');
        setToPhone('');
        setToEmail('');
    };

    // Toggle clause visibility
    const toggleClause = (clauseKey) => {
        setClauses(prev => ({ ...prev, [clauseKey]: !prev[clauseKey] }));
    };

    // Update clause content
    const updateClauseContent = (key, value) => {
        setClauseContent(prev => ({ ...prev, [key]: value }));
    };

    const getQuotePayload = useCallback((customDivisionCode = null) => {
        // Calculate Effective Division Code
        let effectiveDivisionCode = customDivisionCode;

        // Base default from company details (usually follows Lead Job, e.g. CVLP/BMS)
        let baseDiv = enquiryData.companyDetails?.divisionCode || 'AAC';

        if (!effectiveDivisionCode) {
            effectiveDivisionCode = baseDiv; // Start with base

            // ---------------------------------------------------------
            // AGGRESSIVE DIVISION OVERRIDE LOGIC
            // ---------------------------------------------------------
            let isPlumbing = false;
            let isCivil = false;
            let isBMS = false;
            let isElec = false;
            let isFire = false;

            // 0. PRIORITY: Check User's Primary Editable Scope (Prevents Sub-Job Override)
            // If user is "Electrical" with BMS as sub-job, we want "ELE" not "BMS"
            const userEditableJobs = pricingData?.access?.editableJobs || [];
            if (userEditableJobs.length > 0) {
                // Find the user's PRIMARY scope (typically the first or parent job they can edit)
                const primaryScope = userEditableJobs[0]; // First editable job is usually the primary
                const up = primaryScope.toUpperCase();
                if (up.includes('ELECTRICAL') || up.includes('ELE')) {
                    isElec = true;
                    console.log('[getQuotePayload] User Primary Scope: Electrical');
                } else if (up.includes('PLUMBING') || up.includes('PLFF')) {
                    isPlumbing = true;
                    console.log('[getQuotePayload] User Primary Scope: Plumbing');
                } else if (up.includes('CIVIL') || up.includes('CVLP')) {
                    isCivil = true;
                    console.log('[getQuotePayload] User Primary Scope: Civil');
                } else if (up.includes('FIRE') || up.includes('FPE')) {
                    isFire = true;
                    console.log('[getQuotePayload] User Primary Scope: Fire');
                } else if (up.includes('BMS')) {
                    isBMS = true;
                    console.log('[getQuotePayload] User Primary Scope: BMS');
                }
            }

            // 1. Check Selected Jobs (Only if no primary scope detected)
            if (!isElec && !isPlumbing && !isCivil && !isFire && !isBMS) {
                if (selectedJobs && selectedJobs.length > 0) {
                    selectedJobs.forEach(job => {
                        const up = job.toUpperCase();
                        if (up.includes('PLUMBING') || up.includes('PLFF')) isPlumbing = true;
                        else if (up.includes('BMS')) isBMS = true;
                        else if (up.includes('CIVIL') || up.includes('CVLP')) isCivil = true;
                        else if (up.includes('ELECTRICAL') || up.includes('ELE')) isElec = true;
                        else if (up.includes('FIRE') || up.includes('FPE')) isFire = true;
                    });
                }
            }

            // 2. Check Pricing Summary (Visible Groups on UI) - ONLY if no primary scope detected
            if (!isElec && !isPlumbing && !isCivil && !isFire && !isBMS) {
                if (pricingSummary && pricingSummary.length > 0) {
                    pricingSummary.forEach(grp => {
                        const up = grp.name.toUpperCase();
                        if (up.includes('PLUMBING') || up.includes('PLFF') || up.includes('P&F') || up.includes('P & F')) isPlumbing = true;
                        else if (up.includes('BMS')) isBMS = true;
                        else if (up.includes('CIVIL') || up.includes('CVLP')) isCivil = true;
                        else if (up.includes('ELECTRICAL') || up.includes('ELE')) isElec = true;
                        else if (up.includes('FIRE') || up.includes('FPE')) isFire = true;
                        console.log(`[getQuotePayload] Inspecting Group: ${grp.name} -> Plumb:${isPlumbing}, BMS:${isBMS}, Civil:${isCivil}`);
                    });
                }
            } else {
                console.log('[getQuotePayload] Skipping Pricing Summary check - Primary scope already detected');
            }

            // 3. User Department Hint & Access (Final Tie-Breaker)
            const userDept = currentUser?.Department ? currentUser.Department.toUpperCase() : '';

            if (!isPlumbing && pricingData && pricingData.jobs) {
                const plumbingJob = pricingData.jobs.find(j => {
                    const up = j.itemName.toUpperCase();
                    return up.includes('PLUMBING') || up.includes('PLFF');
                });
                if (plumbingJob) {
                    const visibleJobs = pricingData.access?.visibleJobs || [];
                    const editableJobs = pricingData.access?.editableJobs || [];
                    const hasAccess = visibleJobs.includes(plumbingJob.itemName) || editableJobs.includes(plumbingJob.itemName);
                    const canSeeLead = pricingData.access?.hasLeadAccess;
                    if (hasAccess && !canSeeLead) {
                        isPlumbing = true;
                        console.log('[getQuotePayload] User has exclusive Plumbing access -> Forcing PLFF');
                    }
                }
            }

            if (userDept === 'PLFF' || (userDept === 'MEP' && isPlumbing)) {
                if (pricingSummary.length > 0) isPlumbing = true;
            }

            // 4. Contextual Tab Sync (If no trade content detected, use Tab trade)
            let tabDivision = null;
            if (activeQuoteTab && calculatedTabs && calculatedTabs.length > 0) {
                const activeTabObj = calculatedTabs.find(t => t.id === activeQuoteTab) || calculatedTabs[0];
                if (activeTabObj && activeTabObj.label) {
                    const up = activeTabObj.label.toUpperCase();
                    if (up.includes('PLUMBING') || up.includes('PLFF')) tabDivision = 'PLFF';
                    else if (up.includes('BMS')) tabDivision = 'BMS';
                    else if (up.includes('CIVIL') || up.includes('CVLP')) tabDivision = 'CVLP';
                    else if (up.includes('ELECTRICAL') || up.includes('ELE') || up.includes('ELECT')) tabDivision = 'ELE';
                    else if (up.includes('FIRE') || up.includes('FPE')) tabDivision = 'FPE';
                    else if (up.includes('AIR CONDITIONING') || up.includes('AAC')) tabDivision = 'AAC';
                }
            }

            // APPLY OVERRIDE (Priority: Trade Content > Tab Context > Base)
            if (isPlumbing) effectiveDivisionCode = 'PLFF';
            else if (isBMS) effectiveDivisionCode = 'BMS';
            else if (isElec) effectiveDivisionCode = 'ELE';
            else if (isFire) effectiveDivisionCode = 'FPE';
            else if (tabDivision) {
                effectiveDivisionCode = tabDivision;
                console.log(`[getQuotePayload] Using Tab-based Division: ${tabDivision}`);
            } else if (isCivil) effectiveDivisionCode = 'CVLP';
            else effectiveDivisionCode = baseDiv;

            console.log(`[getQuotePayload] FINAL Division Code: ${effectiveDivisionCode} (isElec:${isElec}, isBMS:${isBMS}, isPlumb:${isPlumbing})`);
            // ---------------------------------------------------------
        }

        return {
            divisionCode: effectiveDivisionCode,
            departmentCode: enquiryData.companyDetails?.departmentCode || '',
            leadJobPrefix: enquiryData.leadJobPrefix || '',
            requestNo: enquiryData.enquiry.RequestNo,
            validityDays,
            preparedBy: preparedBy,
            preparedByEmail: currentUser?.email || currentUser?.EmailId,
            ...clauses,
            ...clauseContent,
            totalAmount: grandTotal,
            customClauses,
            clauseOrder: orderedClauses,
            quoteDate,
            customerReference,
            subject,
            signatory,
            signatoryDesignation,
            toName,
            toAddress,
            toPhone,
            toEmail,
            status: 'Saved'
        };
    }, [enquiryData, selectedJobs, pricingSummary, currentUser, pricingData, validityDays, preparedBy, clauses, clauseContent, grandTotal, customClauses, orderedClauses, quoteDate, customerReference, subject, signatory, signatoryDesignation, toName, toAddress, toPhone, toEmail, activeQuoteTab, calculatedTabs]);



    const saveQuote = useCallback(async (isAutoSave = false, suppressCollisionAlert = false) => {
        if (!enquiryData) return null;

        // Validation for mandatory fields
        // CRITICAL: We check for TRUTHILY true to avoid 'event' objects from onClick triggering an 'auto-save' skip
        if (isAutoSave !== true) {
            // If already saved, we don't allow re-saving (Updates), only Revisions
            if (quoteId) {
                alert("This quote is already saved and cannot be edited directly. Please use the 'Revision' button to make changes.");
                return null;
            }

            if (!validateMandatoryFields()) return null;

            // Warning for the VERY FIRST save of a draft
            const confirmed = window.confirm(
                "Please ensure all the details are properly filled to generate the quote. Once saved, edit function will be disabled.\n\n" +
                "Do you want to proceed?"
            );
            if (!confirmed) return null;
        }

        if (!isAutoSave) setSaving(true);
        try {
            // 1. Get Base Payload first (Now handles its own robust division detection)
            const basePayload = getQuotePayload();
            const effectiveDivisionCode = basePayload.divisionCode;

            console.log('[saveQuote] Derived Division Code:', effectiveDivisionCode);

            // Use the payload as-is for the actual save request
            const savePayload = { ...basePayload };

            if (!quoteId && existingQuotes.length > 0) {
                // Check if any existing quote has the same customer AND same lead job AND same division
                const sameCustomerQuote = existingQuotes.find(q => {
                    const matchCustomer = q.ToName === toName;

                    let matchLeadJob = true;
                    if (enquiryData && enquiryData.leadJobPrefix) {
                        const prefixPattern = `-${enquiryData.leadJobPrefix}`;
                        matchLeadJob = q.QuoteNumber && q.QuoteNumber.includes(prefixPattern);
                    }
                    console.log(`[saveQuote-Debug] Checking Quote: ${q.QuoteNumber}, MatchCustomer=${matchCustomer}, MatchLead=${matchLeadJob}`);

                    // STRICT DIVISION MATCH IS REQUIRED TO BLOCK
                    // Strict Division matching (Step 762)
                    // Only block if division codes are IDENTICAL.
                    // Allows ELE and BMS to coexist for same customer/lead job.
                    let matchDivision = false;
                    if (q.QuoteNumber) {
                        const quoteParts = q.QuoteNumber.split('/');
                        if (quoteParts.length >= 2) {
                            const existingQuoteDivision = quoteParts[1];
                            matchDivision = existingQuoteDivision === effectiveDivisionCode;
                            console.log(`[saveQuote] Check collision: Existing=${existingQuoteDivision} vs New=${effectiveDivisionCode} -> Match=${matchDivision}`);
                        }
                    }

                    // BLOCK ONLY IF ALL 3 MATCH (Customer + Lead Job + Division)
                    return matchCustomer && matchLeadJob && matchDivision;
                });

                if (sameCustomerQuote) {
                    // Check if we should block or warn
                    if (!suppressCollisionAlert) {
                        const proceed = window.confirm(
                            `A quote (${sameCustomerQuote.QuoteNumber}) already exists for this enquiry, customer and lead job.\n\n` +
                            `Click OK to generate a NEW QUOTE (New Reference Number).\n` +
                            `Click Cancel to stop (you can then Revise the existing quote).`
                        );

                        if (!proceed) {
                            if (!isAutoSave) setSaving(false);
                            return { isCollision: true, existingQuote: sameCustomerQuote };
                        }
                        // If proceed is true, we fall through to Create New Quote (POST)
                    } else {
                        // For silent/auto-saves, we typically block duplicates to avoid spamming
                        // unless the caller explicitly handles it.
                        // But since we removed auto-save on paste, this path is rare.
                        if (!isAutoSave) setSaving(false);
                        return { isCollision: true, existingQuote: sameCustomerQuote };
                    }
                }
            }

            let res;
            if (quoteId) {
                res = await fetch(`${API_BASE}/api/quotes/${quoteId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(savePayload)
                });
            } else {
                res = await fetch(`${API_BASE}/api/quotes`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(savePayload)
                });
            }

            if (res.ok) {
                const data = await res.json();
                // CRITICAL FIX: Update existingQuotes locally FIRST to prevent useEffect race condition
                setExistingQuotes(prev => [
                    ...prev,
                    {
                        ID: data.id,
                        QuoteNumber: data.quoteNumber,
                        ToName: toName,
                        RevisionNo: 0,
                        Status: 'Saved',
                        QuoteDate: quoteDate, // Essential for rendering date
                        PreparedBy: preparedBy, // Essential for rendering
                        TotalAmount: grandTotal // Added for immediate display
                    }
                ]);

                if (data.id) setQuoteId(data.id);
                if (data.quoteNumber) setQuoteNumber(data.quoteNumber);

                if (!isAutoSave) {
                    alert('Quote saved successfully!');
                }

                // Upload any pending files now that we have a Quote ID
                // Note: We avoid doing this in auto-save unless explicitly requested,
                // but since this is the main save flow, we should clear the pending queue.
                if (pendingFiles.length > 0) {
                    console.log('[saveQuote] Uploading pending files...', pendingFiles.length);
                    await uploadFiles(pendingFiles, data.id);
                    setPendingFiles([]); // Clear queue
                }

                if (enquiryData) fetchExistingQuotes(enquiryData.enquiry.RequestNo);
                return data;
            } else {
                const errorData = await res.json().catch(() => ({}));
                console.error('[saveQuote] Server Error:', res.status, errorData);
                if (!isAutoSave) alert(`Failed to save quote: ${errorData.error || errorData.details || res.statusText}`);
                else console.warn('[saveQuote] Auto-save failed on server.');
                return null;
            }
        } catch (err) {
            console.error('Error saving quote:', err);
            if (!isAutoSave) alert('Failed to save quote');
            return null;
        } finally {
            if (!isAutoSave) setSaving(false);
        }
    }, [enquiryData, toName, quoteId, existingQuotes, getQuotePayload, calculatedTabs, pricingData, selectedJobs, fetchExistingQuotes, validateMandatoryFields, grandTotal]);

    // Paste Handle
    useEffect(() => {
        const handleGlobalPaste = (e) => {
            // Check for files in clipboard
            const items = e.clipboardData?.items;
            const filesToUpload = [];

            if (items) {
                for (let i = 0; i < items.length; i++) {
                    if (items[i].kind === 'file') {
                        const file = items[i].getAsFile();
                        if (file) filesToUpload.push(file);
                    }
                }
            }

            // Fallback for some browsers
            if (filesToUpload.length === 0 && e.clipboardData?.files?.length > 0) {
                for (let i = 0; i < e.clipboardData.files.length; i++) {
                    filesToUpload.push(e.clipboardData.files[i]);
                }
            }

            if (filesToUpload.length > 0) {
                if (!quoteId) {
                    if (!enquiryData || !toName) {
                        alert('Please select an enquiry and customer first to create a draft.');
                        return;
                    }

                    // Queue data as pending files
                    console.log('[Paste] Queuing files to pending list...');
                    uploadFiles(filesToUpload);
                    return;
                }

                e.preventDefault();
                console.log('[Paste] Detected files:', filesToUpload.length);
                uploadFiles(filesToUpload);
            }
        };

        window.addEventListener('paste', handleGlobalPaste);
        return () => window.removeEventListener('paste', handleGlobalPaste);
    }, [quoteId, uploadFiles, enquiryData, toName, saveQuote]);

    // Print quote
    const printQuote = () => {
        const printContent = document.getElementById('quote-preview');
        if (printContent) {
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>.</title>
                    <style>
                        /* CRITICAL: Top-level @page rule hiding headers */
                        @page {
                            size: A4 portrait;
                            margin: 0; /* No units, no !important */
                        }

                        /* Global Reset */
                        html, body {
                            margin: 0 !important;
                            padding: 0 !important;
                            background: white;
                            width: 100%;
                            height: 100%;
                            font-family: Arial, sans-serif;
                            -webkit-print-color-adjust: exact;
                        }

                        /* Wrapper for Layout Margins */
                        .print-wrapper {
                            padding: 15mm;
                            width: 100%;
                            box-sizing: border-box;
                        }

                        /* Helper Styles from Component */
                        ${tableStyles}

                        /* Conditional Visibility */
                        ${!printWithHeader ? `
                            .print-logo-section, .footer-section { display: none !important; }
                            .page-one { min-height: auto !important; }
                        ` : ''}

                        /* Print Media Specifics */
                        @media print {
                            @page { margin: 0; }
                            body { margin: 0 !important; }
                            .print-wrapper { padding: 15mm !important; }
                            .page-break { page-break-before: always; }
                        }
                    </style>
                </head>
                <body>
                    <div class="print-wrapper">
                        ${printContent.innerHTML}
                    </div>
                    <script>
                        // Clear title to remove app name
                        document.title = ".";
                    </script>
                </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.focus();

            // Increased delay to ensure rendering matches styles
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
            }, 500);
        }
    };

    // Download PDF
    const downloadPDF = () => {
        const element = document.getElementById('quote-preview');
        if (!element) return;

        setIsUploading(true);

        const opt = {
            margin: [10, 10, 10, 10],
            filename: `Quote_${quoteNumber.replace(/\//g, '_')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                logging: false,
                letterRendering: true
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] }
        };

        if (window.html2pdf) {
            window.html2pdf().set(opt).from(element).save()
                .then(() => setIsUploading(false))
                .catch(err => {
                    console.error('PDF generation error:', err);
                    setIsUploading(false);
                    alert('Failed to generate PDF. Please try again or use Print.');
                });
        } else {
            alert('PDF library not loaded yet. Please wait a moment or use Print.');
            setIsUploading(false);
        }
    };



    // Helper to format date as DD-MMM-YYYY
    const formatDate = (dateString) => {
        if (!dateString) return '';
        try {
            return format(new Date(dateString), 'dd-MMM-yyyy');
        } catch (e) {
            return dateString;
        }
    };

    // Calculate validity date
    const getValidityDate = () => {
        if (!quoteDate) return '';
        const date = new Date(quoteDate);
        date.setDate(date.getDate() + parseInt(validityDays || 0));
        return formatDate(date);
    };

    // Clause definitions for rendering
    const clauseDefinitions = [
        { key: 'showScopeOfWork', contentKey: 'scopeOfWork', title: 'Scope of Work' },
        { key: 'showBasisOfOffer', contentKey: 'basisOfOffer', title: 'Basis of the Offer' },
        { key: 'showExclusions', contentKey: 'exclusions', title: 'Exclusions and Qualifications' },
        { key: 'showPricingTerms', contentKey: 'pricingTerms', title: 'Pricing & Payment Terms' },
        { key: 'showSchedule', contentKey: 'schedule', title: 'High-Level Schedule' },
        { key: 'showWarranty', contentKey: 'warranty', title: 'Warranty & Defects Liability Period' },
        { key: 'showResponsibilityMatrix', contentKey: 'responsibilityMatrix', title: 'Responsibility Matrix' },
        { key: 'showTermsConditions', contentKey: 'termsConditions', title: 'Terms & Conditions' },
        { key: 'showBillOfQuantity', contentKey: 'billOfQuantity', title: 'Bill of Quantity' },
        { key: 'showAcceptance', contentKey: 'acceptance', title: 'Acceptance & Confirmation' }
    ];

    // Helper: Check if job is descendant of ancestor (Recursive) - Scoped to Component
    const isDescendantOf = (jobName, ancestorId) => {
        if (!pricingData || !pricingData.jobs) return false;
        const job = pricingData.jobs.find(j => j.itemName === jobName);
        if (!job) return false;
        if (job.parentId === ancestorId) return true;
        if (job.parentId) {
            const parent = pricingData.jobs.find(j => j.id === job.parentId);
            if (parent) return isDescendantOf(parent.itemName, ancestorId);
        }
        return false;
    };

    // Custom styles for CreatableSelect
    const customStyles = {
        control: (base) => ({
            ...base,
            minHeight: '34px',
            fontSize: '13px',
            padding: '0 4px',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            boxShadow: 'none',
            '&:hover': {
                borderColor: '#a0aec0',
            },
        }),
        valueContainer: (base) => ({
            ...base,
            padding: '0 4px',
        }),
        input: (base) => ({
            ...base,
            margin: 0,
            padding: 0,
        }),
        placeholder: (base) => ({
            ...base,
            color: '#9ca3af',
        }),
        singleValue: (base) => ({
            ...base,
            color: '#1f2937',
        }),
        option: (base, state) => ({
            ...base,
            fontSize: '13px',
            backgroundColor: state.isFocused ? '#e2e8f0' : 'white',
            color: '#1f2937',
            '&:active': {
                backgroundColor: '#cbd5e1',
            },
        }),
    };


    return (
        <div style={{ display: 'flex', height: 'calc(100vh - 80px)', background: '#f5f7fa' }}>
            {/* Left Panel - Controls */}
            <div style={{ width: `${sidebarWidth}px`, background: 'white', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
                {/* Search Section */}
                <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', position: 'relative', zIndex: 2000 }}>
                    <div style={{ position: 'relative' }} ref={searchRef}>
                        {/* Row 1: Enquiry No. and Lead Job */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                            {/* 1. Enquiry Input */}
                            <div style={{ flex: '0 0 50%', position: 'relative' }}>
                                <input
                                    type="text"
                                    placeholder="Enquiry No."
                                    value={searchTerm}
                                    onChange={(e) => handleSearchInput(e.target.value)}
                                    onFocus={() => setShowSuggestions(true)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        fontSize: '14px',
                                        backgroundColor: '#fff'
                                    }}
                                />
                                {showSuggestions && suggestions.length > 0 && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0,
                                        background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 10000, marginTop: '4px',
                                        maxHeight: '300px', overflowY: 'auto'
                                    }}>
                                        {suggestions.map((enq, idx) => (
                                            <div
                                                key={enq.RequestNo || idx}
                                                onClick={() => handleSelectEnquiry(enq)}
                                                style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: idx < suggestions.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                                                onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                                            >
                                                <div style={{ fontWeight: '600', fontSize: '13px' }}>{enq.RequestNo}</div>
                                                <div style={{ fontSize: '11px', color: '#64748b' }}>{enq.ProjectName}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* 2. Lead Job Selector */}
                            <div style={{ flex: 1 }}>
                                <div style={{ position: 'relative', width: '100%' }}>
                                    <select
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            border: '1px solid #e2e8f0',
                                            background: enquiryData ? 'white' : '#f1f5f9',
                                            color: '#334155',
                                            fontWeight: '500',
                                            fontSize: '13px',
                                            appearance: 'none',
                                            paddingRight: '30px',
                                            cursor: enquiryData ? 'pointer' : 'not-allowed'
                                        }}
                                        disabled={!enquiryData || ((!enquiryData.divisions || enquiryData.divisions.length === 0) && (!enquiryData.divisionsHierarchy || enquiryData.divisionsHierarchy.length === 0))}
                                        value={(() => {
                                            if (!enquiryData || !enquiryData.leadJobPrefix) return '';

                                            // Try to find in divisions first
                                            if (enquiryData.divisions && enquiryData.divisions.length > 0) {
                                                const found = enquiryData.divisions.find(d => d.startsWith(enquiryData.leadJobPrefix));
                                                if (found) return found;
                                            }

                                            // Try divisionsHierarchy as fallback
                                            if (enquiryData.divisionsHierarchy && enquiryData.divisionsHierarchy.length > 0) {
                                                const roots = enquiryData.divisionsHierarchy.filter(j => !j.parentId);
                                                const found = roots.find(r => r.itemName.startsWith(enquiryData.leadJobPrefix));
                                                if (found) return found.itemName;
                                            }

                                            return enquiryData.leadJobPrefix || '';
                                        })()}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setQuoteId(null); // Reset so auto-load can find correct latest for this job context
                                            // Simple detection: If starts with L\d, assume L\d is prefix.
                                            // Else (Sub Job or Custom Division), use Full Name as "Prefix" (Identifier).
                                            if (val.match(/^L\d+/)) {
                                                const prefix = val.split('-')[0].trim();
                                                setEnquiryData(prev => ({ ...prev, leadJobPrefix: prefix }));
                                            } else {
                                                setEnquiryData(prev => ({ ...prev, leadJobPrefix: val }));
                                            }
                                        }}
                                    >
                                        <option value="" disabled>Select Lead Job</option>
                                        {/* Filter lead jobs based on user access from pricing data */}
                                        {(() => {
                                            console.log('[Quote Lead Job Render] enquiryData:', enquiryData);
                                            console.log('[Quote Lead Job Render] divisions:', enquiryData?.divisions);
                                            console.log('[Quote Lead Job Render] divisionsHierarchy:', enquiryData?.divisionsHierarchy);

                                            if (!enquiryData) {
                                                console.log('[Quote Lead Job Render] No enquiryData - returning null');
                                                return null;
                                            }

                                            // Get all divisions
                                            // FALLBACK: If divisions is empty but divisionsHierarchy exists, extract roots
                                            let allLeadJobs = enquiryData.divisions || [];

                                            if (allLeadJobs.length === 0 && enquiryData.divisionsHierarchy && enquiryData.divisionsHierarchy.length > 0) {
                                                // Extract ONLY roots (Lead Jobs)
                                                // User Request: "only lead job name should show"
                                                allLeadJobs = enquiryData.divisionsHierarchy
                                                    .filter(j => !j.parentId || j.parentId == '0' || j.parentId == 0)
                                                    .map(r => r.itemName);
                                                console.log('[Quote Lead Job Render] Using hierarchy roots:', allLeadJobs);
                                            } else if (enquiryData.divisionsHierarchy && enquiryData.divisionsHierarchy.length > 0) {
                                                // Even if we have divisions, filter them to ensure they are ROOTS if hierarchy is available
                                                const rootNames = new Set(
                                                    enquiryData.divisionsHierarchy
                                                        .filter(j => !j.parentId || j.parentId == '0' || j.parentId == 0)
                                                        .map(j => j.itemName)
                                                );
                                                const filtered = allLeadJobs.filter(name => rootNames.has(name));
                                                if (filtered.length > 0) {
                                                    allLeadJobs = filtered;
                                                    console.log('[Quote Lead Job Render] Filtered divisions to roots:', allLeadJobs);
                                                }
                                            }

                                            console.log('[Quote Lead Job Render] allLeadJobs:', allLeadJobs);
                                            if (allLeadJobs.length === 0) {
                                                console.log('[Quote Lead Job Render] No lead jobs available - returning null');
                                                // Fallback to show something if we filtered everything out?
                                                // Maybe show original list if roots are empty?
                                                if (enquiryData.divisions && enquiryData.divisions.length > 0) {
                                                    console.log('[Quote Lead Job Render] Root filter result empty, falling back to all divisions');
                                                    allLeadJobs = enquiryData.divisions;
                                                } else {
                                                    return null;
                                                }
                                            }

                                            // If no pricing data loaded yet, show all
                                            if (!pricingData || !pricingData.access) {
                                                return allLeadJobs.map(div => <option key={div} value={div}>{div}</option>);
                                            }

                                            // Filter based on user access
                                            const visibleLeadJobs = allLeadJobs.filter(leadJob => {
                                                // Extract lead job name (e.g., "L1 - Civil Project" -> "Civil Project")
                                                const leadJobName = leadJob.replace(/^L\d+\s*-\s*/, '').trim();

                                                // If user is Admin, show all lead jobs.
                                                // otherwise, stricter filtering applies even if hasLeadAccess is true (as leads should only see their own scope)
                                                if (currentUser?.role === 'Admin' || currentUser?.Roles === 'Admin') return true;

                                                // STRICT DEPARTMENT CHECK:
                                                // If User has a Department defined (e.g. "Civil", "MEP"), enforce it strictly against Lead Job Name.
                                                // This prevents "Civil" users from seeing "BMS" or "Electrical" lead jobs even if backend logic accidentally grants visibility.
                                                const userDept = (currentUser?.Department || '').trim().toLowerCase();
                                                const jobNameLower = leadJobName.toLowerCase();

                                                if (userDept) {
                                                    if (userDept === 'civil' && !jobNameLower.includes('civil')) return false;
                                                    // Add other department checks if needed, but Civil is the specific request.
                                                    // Generally, if userDept exists and doesn't partially match the job name, we might want to hide it
                                                    // UNLESS they are explicitly added to that job via granular permissions below.
                                                    // But for LEAD JOB selection, strict alignment is preferred.
                                                }

                                                // Check if user has access to this lead job or any of its sub-jobs
                                                const visibleJobs = pricingData.access.visibleJobs || [];
                                                const editableJobs = pricingData.access.editableJobs || [];

                                                // Check if the lead job itself is in visible/editable jobs
                                                const hasLimitedAccess = !pricingData?.access?.hasLeadAccess && (pricingData?.access?.editableJobs?.length > 0);
                                                if (hasLimitedAccess) {
                                                    const editableNames = (pricingData.access.editableJobs || []).map(n => n.trim().toLowerCase());
                                                    const currentName = leadJobName.toLowerCase();
                                                    const isEditableScope = editableNames.some(acc => currentName === acc || currentName.includes(acc) || acc.includes(currentName));
                                                    if (isEditableScope) return true;

                                                    // Also check if any of our editable jobs are descendants of this lead job name 
                                                    // (This allows selecting "Electrical" if "Electrical" is a root lead job)
                                                } else {
                                                    if (visibleJobs.includes(leadJobName) || editableJobs.includes(leadJobName)) return true;
                                                    if (visibleJobs.includes(leadJob) || editableJobs.includes(leadJob)) return true;
                                                }

                                                // Check if any of user's accessible jobs are descendants of this lead job
                                                // Use job hierarchy from pricing data if available
                                                if (pricingData.jobs && pricingData.jobs.length > 0) {
                                                    // Find the lead job in the jobs array
                                                    const leadJobObj = pricingData.jobs.find(j =>
                                                        j.itemName === leadJob || j.itemName === leadJobName
                                                    );

                                                    if (!leadJobObj) return false;

                                                    // Get all accessible job names
                                                    const accessibleJobs = [...new Set([...visibleJobs, ...editableJobs])];

                                                    // Helper function to check if a job is a descendant of the lead job
                                                    const isDescendantOf = (jobName, ancestorId) => {
                                                        const job = pricingData.jobs.find(j => j.itemName === jobName);
                                                        if (!job) return false;

                                                        // Direct child
                                                        if (job.parentId === ancestorId) return true;

                                                        // Check if parent is a descendant (recursive)
                                                        if (job.parentId) {
                                                            const parent = pricingData.jobs.find(j => j.id === job.parentId);
                                                            if (parent) {
                                                                return isDescendantOf(parent.itemName, ancestorId);
                                                            }
                                                        }

                                                        return false;
                                                    };

                                                    // Check if any accessible job is a descendant of this lead job
                                                    return accessibleJobs.some(jobName => isDescendantOf(jobName, leadJobObj.id));
                                                }

                                                // Fallback: Check if any sub-jobs are accessible (less precise)
                                                const hasAccessibleSubJobs = enquiryData.divisions.some(div => {
                                                    if (div.trim().startsWith('L')) return false;
                                                    return visibleJobs.includes(div) || editableJobs.includes(div);
                                                });

                                                return hasAccessibleSubJobs;
                                            });

                                            return visibleLeadJobs.map(div => <option key={div} value={div}>{div}</option>);
                                        })()}
                                    </select>
                                    <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#64748b' }}>
                                        <ChevronDown size={14} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Row 2: Customer Dropdown and Search Button */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <CreatableSelect
                                    styles={{
                                        control: (base, state) => ({
                                            ...base,
                                            minHeight: '38px',
                                            fontSize: '13px',
                                            borderColor: '#e2e8f0',
                                            backgroundColor: state.isDisabled ? '#f1f5f9' : 'white'
                                        }),
                                        menu: (base) => ({ ...base, zIndex: 9999 })
                                    }}
                                    isDisabled={!enquiryData}
                                    options={enquiryCustomerOptions}
                                    value={enquiryCustomerOptions.find(opt => opt.value === toName)}
                                    onChange={(selected) => handleCustomerChange(selected)}
                                    placeholder="Select Customer..."
                                    formatCreateLabel={(inputValue) => `Use "${inputValue}"`}
                                    isClearable
                                />
                            </div>

                            {/* Search Button */}
                            <button
                                onClick={() => searchTerm.trim() && handleSearchInput(searchTerm)}
                                style={{
                                    padding: '8px 16px',
                                    background: '#1e293b',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: '500',
                                    fontSize: '13px',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                Search
                            </button>
                        </div>
                    </div>
                </div>

                {/* Action Buttons & Clear Selection */}
                {/* Visible ONLY when Enquiry Data, Lead Job AND Customer (toName) are selected */}
                {enquiryData && enquiryData.leadJobPrefix && toName && (
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>

                        {/* Left Actions: Clear, Save, Revision */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={handleClear} style={{ padding: '6px 8px', background: '#e2e8f0', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', color: '#475569', fontWeight: '600' }}>
                                Clear
                            </button>

                            {/* Save Button - Disabled if already saved (Revision only allowed) */}
                            <button
                                onClick={() => saveQuote()}
                                disabled={saving || !canEdit() || !!quoteId}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    background: (!canEdit() || quoteId) ? '#f1f5f9' : '#1e293b',
                                    color: (!canEdit() || quoteId) ? '#94a3b8' : 'white',
                                    border: 'none',
                                    borderRadius: '44px',
                                    cursor: (!canEdit() || quoteId) ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                    fontSize: '12px',
                                    opacity: saving ? 0.7 : 1
                                }}
                                title={!canEdit() ? "No permission to modify" : (quoteId ? "Quote is saved and cannot be edited. Create a revision instead." : "")}
                            >
                                <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                            </button>

                            {/* Revision Button */}
                            {quoteId && (
                                <button onClick={handleRevise} disabled={saving || !canEdit()} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: (!canEdit()) ? '#94a3b8' : '#0284c7', color: 'white', border: 'none', borderRadius: '4px', cursor: (!canEdit()) ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '12px' }} title={!canEdit() ? "No permission to revise" : ""}>
                                    <Plus size={14} /> Revision
                                </button>
                            )}
                        </div>

                        {/* Right Actions: Print, Email */}
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>

                            {/* Print with Header Checkbox */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748b', cursor: 'pointer', marginRight: '4px' }}>
                                <input
                                    type="checkbox"
                                    checked={printWithHeader}
                                    onChange={(e) => setPrintWithHeader(e.target.checked)}
                                />
                                With Header
                            </label>

                            {/* Print Preview - Icon Only */}
                            <button onClick={printQuote} disabled={!hasUserPricing} title="Print Preview" style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', opacity: !hasUserPricing ? 0.5 : 1 }}>
                                <Printer size={16} />
                            </button>

                            {/* Email - Icon Only */}
                            <button title="Email Quote" style={{ width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer' }}>
                                <Mail size={16} />
                            </button>
                        </div>
                    </div>
                )}




                {/* Scrollable Content Area */}
                {enquiryData && (
                    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>


                        {/* Unified Previous Quotes & Pricing Summary Section */}
                        {toName && (
                            <div style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569' }}>Previous Quotes / Revisions (Updated):</h4>

                                {/* Tab Headers and Content Wrapper */}
                                {(() => {
                                    let tabs = calculatedTabs || [];
                                    if (tabs.length === 0) {
                                        tabs = [{ id: 'default', name: 'Own Job', label: 'Own Job', isSelf: true }];
                                    }

                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {/* Tab Headers */}
                                            <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #e2e8f0', marginBottom: '4px', flexWrap: 'wrap' }}>
                                                {tabs.map(tab => (
                                                    <button
                                                        key={tab.id}
                                                        onClick={() => setActiveQuoteTab(tab.id)}
                                                        style={{
                                                            padding: '4px 8px',
                                                            fontSize: '11px',
                                                            fontWeight: '600',
                                                            border: 'none',
                                                            background: activeQuoteTab === tab.id ? '#e0f2fe' : 'transparent',
                                                            color: activeQuoteTab === tab.id ? '#0284c7' : '#64748b',
                                                            borderBottom: activeQuoteTab === tab.id ? '2px solid #0284c7' : '2px solid transparent',
                                                            cursor: 'pointer',
                                                            borderRadius: '4px 4px 0 0'
                                                        }}
                                                    >
                                                        {tab.name || tab.label}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Content for Active Tab */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {(() => {
                                                    const activeTabObj = tabs.find(t => t.id === activeQuoteTab) || tabs[0];
                                                    if (!activeTabObj) return null;

                                                    const jobsPool = (pricingData?.jobs && pricingData.jobs.length > 0) ? pricingData.jobs : (enquiryData?.divisionsHierarchy || []);
                                                    const activeTabRealId = activeTabObj.realId;

                                                    // Hierarchy Helper
                                                    const isDescendant = (childId, ancestorId) => {
                                                        const child = jobsPool.find(j => (j.id || j.ItemID) === childId);
                                                        if (!child) return false;
                                                        const pid = child.parentId || child.ParentID;
                                                        if (pid === ancestorId) return true;
                                                        if (pid && pid !== '0' && pid !== 0) return isDescendant(pid, ancestorId);
                                                        return false;
                                                    };

                                                    // Filter and Render Previous Quotes
                                                    const filteredQuotes = existingQuotes.filter(q => {
                                                        // 1. Customer Match
                                                        const normalizedQuoteTo = normalize(q.ToName);
                                                        const normalizedCurrentTo = normalize(toName);
                                                        const isMainOrGeneric = !normalizedQuoteTo || normalizedQuoteTo === 'main' || normalizedQuoteTo === 'generic';

                                                        // HIERARCHY ALLOWANCE: Filter based on whether we are in an Internal Project Context or External Customer Context
                                                        const mJobs = (enquiryData?.divisionsHierarchy || []).map(d => normalize(d.itemName || d.DivisionName));
                                                        const currentIsInternal = mJobs.includes(normalizedCurrentTo);
                                                        const quoteIsInternal = mJobs.includes(normalizedQuoteTo) || isMainOrGeneric;

                                                        if (currentIsInternal) {
                                                            // In a Project/Division context, only show quotes sent to internal partners or itself
                                                            if (!quoteIsInternal && normalizedQuoteTo !== normalizedCurrentTo) return false;
                                                        } else {
                                                            // In an External Customer context, only show quotes sent specifically to them
                                                            if (!isMainOrGeneric &&
                                                                normalizedQuoteTo !== normalizedCurrentTo &&
                                                                !normalizedQuoteTo.startsWith(normalizedCurrentTo + '-') &&
                                                                !normalizedCurrentTo.startsWith(normalizedQuoteTo + '-')) return false;
                                                        }

                                                        // 2. Hierarchy Match (Only self and descendants)
                                                        const qDivCode = q.QuoteNumber?.split('/')[1]?.toUpperCase();
                                                        const qJob = jobsPool.find(j => {
                                                            const jName = (j.itemName || j.DivisionName || '').toUpperCase();
                                                            return (qDivCode === 'ELE' && jName.includes('ELECTRICAL')) ||
                                                                (qDivCode === 'BMS' && jName.includes('BMS')) ||
                                                                (qDivCode === 'PLFF' && jName.includes('PLUMBING')) ||
                                                                (qDivCode === 'CVLP' && jName.includes('CIVIL')) ||
                                                                (qDivCode === 'FPE' && jName.includes('FIRE')) ||
                                                                (qDivCode === 'AAC' && jName.includes('AIR'));
                                                        });

                                                        if (!qJob) return activeTabObj.isSelf; // Show unknowns on Lead Tab only
                                                        const qJobId = qJob.id || qJob.ItemID;

                                                        // Robust ID comparison (handle type mismatch and 'self' mapping)
                                                        return String(qJobId) == String(activeTabRealId);
                                                    });

                                                    // Group revisions
                                                    const quoteGroups = filteredQuotes.reduce((acc, q) => {
                                                        const key = q.QuoteNumber?.split('-R')[0] || 'Unknown';
                                                        if (!acc[key]) acc[key] = [];
                                                        acc[key].push(q);
                                                        return acc;
                                                    }, {});

                                                    const quoteList = Object.entries(quoteGroups)
                                                        .sort(([a], [b]) => b.localeCompare(a))
                                                        .map(([quoteNo, revisions]) => {
                                                            const sorted = revisions.sort((a, b) => b.RevisionNo - a.RevisionNo);
                                                            const latest = sorted[0];
                                                            const isExpanded = expandedGroups[quoteNo];
                                                            const hasHistory = sorted.length > 1;

                                                            return (
                                                                <div key={quoteNo} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                    <div
                                                                        onClick={() => loadQuote(latest)}
                                                                        style={{
                                                                            padding: '8px',
                                                                            background: quoteId === latest.ID ? '#f0f9ff' : 'white',
                                                                            border: `1px solid ${quoteId === latest.ID ? '#0ea5e9' : '#e2e8f0'}`,
                                                                            borderRadius: '8px',
                                                                            cursor: 'pointer',
                                                                            position: 'relative'
                                                                        }}
                                                                    >
                                                                        {/* Expand Toggle */}
                                                                        {hasHistory && (
                                                                            <div
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    toggleExpanded(quoteNo);
                                                                                }}
                                                                                style={{
                                                                                    position: 'absolute',
                                                                                    right: '6px',
                                                                                    top: '6px',
                                                                                    padding: '2px',
                                                                                    cursor: 'pointer',
                                                                                    color: '#64748b'
                                                                                }}
                                                                            >
                                                                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                                            </div>
                                                                        )}

                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: hasHistory ? '20px' : '0' }}>
                                                                            <span style={{ fontWeight: '700', fontSize: '12px' }}>{latest.QuoteNumber}</span>
                                                                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: latest.Status === 'Draft' ? '#f1f5f9' : '#dcfce7' }}>{latest.Status}</span>
                                                                        </div>
                                                                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                                                            BD {parseFloat(latest.TotalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 3 })}
                                                                        </div>
                                                                    </div>

                                                                    {/* Render History if Expanded */}
                                                                    {isExpanded && sorted.slice(1).map(rev => (
                                                                        <div
                                                                            key={rev.ID}
                                                                            onClick={() => loadQuote(rev)}
                                                                            style={{
                                                                                padding: '6px 8px',
                                                                                background: quoteId === rev.ID ? '#eff6ff' : '#f8fafc',
                                                                                border: '1px solid #e2e8f0',
                                                                                borderRadius: '6px',
                                                                                marginLeft: '12px',
                                                                                fontSize: '11px',
                                                                                cursor: 'pointer',
                                                                                display: 'flex',
                                                                                justifyContent: 'space-between',
                                                                                alignItems: 'center'
                                                                            }}
                                                                        >
                                                                            <span style={{ color: '#475569' }}>{rev.QuoteNumber}</span>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                <span style={{ fontWeight: '600' }}>BD {parseFloat(rev.TotalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 3 })}</span>
                                                                                <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '2px', background: '#e2e8f0' }}>{rev.Status}</span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            );
                                                        });

                                                    // Filter Pricing Summary
                                                    const filteredPricing = pricingSummary.filter(grp => {
                                                        const job = jobsPool.find(j => (j.itemName || j.DivisionName) === grp.name);
                                                        // Show 'General' / Unknown jobs on the first tab ('Own Job')
                                                        if (!job) return activeTabObj.isSelf || tabs.length === 1;

                                                        const jobId = job.id || job.ItemID;
                                                        return jobId === activeTabRealId || isDescendant(jobId, activeTabRealId);
                                                    });

                                                    return (
                                                        <>
                                                            {quoteList.length > 0 ? quoteList : <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>No quotes for this tab.</div>}

                                                            {/* Pricing Summary (Latest Price) */}
                                                            {(filteredPricing.length > 0) && (
                                                                <div style={{ padding: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', marginTop: '12px' }}>
                                                                    <h5 style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#166534', fontWeight: '800' }}>PRICING SUMMARY (LATEST):</h5>
                                                                    {filteredPricing.map((grp, i) => (
                                                                        <div key={i} style={{ marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px dashed #e2e8f0' }}>
                                                                            <div style={{ fontSize: '11px', fontWeight: '700', color: '#166534', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                <input type="checkbox" checked={selectedJobs.includes(grp.name)} onChange={() => handleJobToggle(grp.name)} />
                                                                                {grp.name}
                                                                            </div>
                                                                            <div style={{ marginLeft: '14px', fontSize: '10px', color: '#64748b' }}>
                                                                                {grp.items.map((item, idx) => (
                                                                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                                        <span>- {item.name}</span>
                                                                                        <span>BD {item.total.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    ))}

                                                                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '2px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                        <span style={{ fontSize: '11px', fontWeight: '800', color: '#166534' }}>GRAND BASE PRICE TOTAL:</span>
                                                                        <span style={{ fontSize: '12px', fontWeight: '800', color: '#15803d' }}>
                                                                            BD {filteredPricing
                                                                                .filter(g => selectedJobs.includes(g.name))
                                                                                .reduce((sum, g) => sum + (g.total || 0), 0)
                                                                                .toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                        {/* Show rest ONLY if a customer is selected (New Quote or Edit Mode) */}
                        {toName && (
                            <>

                                {/* Metadata Section (Quote Details) - Moved Below Pricing */}
                                <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>

                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#475569' }}>Quote Details:</h4>

                                    {/* Division is auto-selected based on user department - no manual selection needed */}

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Quote Date <span style={{ color: '#ef4444' }}>*</span></label>
                                        <DateInput value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                                    </div>



                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Validity (Days) <span style={{ color: '#ef4444' }}>*</span></label>
                                        <input type="number" value={validityDays} onChange={(e) => setValidityDays(parseInt(e.target.value) || 0)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                                    </div>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Attention of <span style={{ color: '#ef4444' }}>*</span></label>
                                        <input
                                            type="text"
                                            value={toAttention}
                                            onChange={(e) => setToAttention(e.target.value)}
                                            placeholder="Contact Person..."
                                            style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                                        />
                                    </div>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Subject <span style={{ color: '#ef4444' }}>*</span></label>
                                        <textarea value={subject} onChange={(e) => setSubject(e.target.value)} rows={2} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', resize: 'vertical' }} />
                                    </div>


                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Prepared By <span style={{ color: '#ef4444' }}>*</span></label>
                                        <CreatableSelect
                                            isClearable
                                            onChange={(newValue) => setPreparedBy(newValue ? newValue.value : '')}
                                            options={preparedByOptions}
                                            value={preparedBy ? { label: preparedBy, value: preparedBy } : null}
                                            placeholder="Select or Type Name..."
                                            styles={{
                                                control: (base) => ({ ...base, minHeight: '34px', fontSize: '13px' }),
                                                valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                                                input: (base) => ({ ...base, margin: 0, padding: 0 }),
                                            }}
                                        />
                                    </div>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Signatory <span style={{ color: '#ef4444' }}>*</span></label>
                                        <CreatableSelect
                                            isClearable
                                            onChange={(newValue) => {
                                                setSignatory(newValue ? newValue.value : '');
                                                // Update designation if selected from list
                                                if (newValue && newValue.designation) {
                                                    setSignatoryDesignation(newValue.designation);
                                                }
                                            }}
                                            options={signatoryOptions}
                                            value={signatory ? { label: signatory, value: signatory } : null}
                                            placeholder="Select or Type Signatory..."
                                            styles={{
                                                control: (base) => ({ ...base, minHeight: '34px', fontSize: '13px' }),
                                                valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                                                input: (base) => ({ ...base, margin: 0, padding: 0 }),
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Template Section */}
                                <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <h4 style={{ margin: 0, fontSize: '13px', color: '#475569' }}>Clause Templates:</h4>
                                    </div>

                                    {/* Save Template */}
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                        <input
                                            type="text"
                                            placeholder="New Template Name"
                                            value={savedTemplateName}
                                            onChange={(e) => setSavedTemplateName(e.target.value)}
                                            style={{ flex: 1, padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                        />
                                        <button onClick={handleSaveTemplate} style={{ padding: '6px 12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                                            Save
                                        </button>
                                    </div>

                                    {/* Load Template */}
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <select
                                            value={selectedTemplateId}
                                            onChange={(e) => setSelectedTemplateId(e.target.value)}
                                            style={{ flex: 1, padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                        >
                                            <option value="">Select Template...</option>
                                            {templates.map(t => (
                                                <option key={t.ID} value={t.ID}>{t.TemplateName}</option>
                                            ))}
                                        </select>
                                        <button onClick={handleLoadTemplate} disabled={!selectedTemplateId} style={{ padding: '6px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', color: '#334155' }} title="Load">
                                            <FolderOpen size={14} />
                                        </button>
                                        <button onClick={handleDeleteTemplate} disabled={!selectedTemplateId} style={{ padding: '6px', background: '#fff', border: '1px solid #fee2e2', borderRadius: '4px', cursor: 'pointer', color: '#ef4444' }} title="Delete">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Clause Checkboxes */}
                                <div style={{ padding: '16px' }}>
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#475569' }}>Select & Reorder Clauses:</h4>
                                    {orderedClauses.map((id, index) => {

                                        const isCustom = id.startsWith('custom_');
                                        const customClause = isCustom ? customClauses.find(c => c.id === id) : null;
                                        const standardClause = !isCustom ? clauseDefinitions.find(c => c.key === id) : null;

                                        if (!customClause && !standardClause) return null;

                                        const title = isCustom ? customClause.title : standardClause.title;
                                        const isChecked = isCustom ? customClause.isChecked : clauses[id];
                                        const contentKey = isCustom ? id : standardClause.contentKey;

                                        return (
                                            <div key={id} style={{ marginBottom: '8px', padding: '4px', background: isCustom ? '#fff' : 'transparent', borderBottom: '1px solid #f1f5f9' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {/* Reorder Buttons */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        <button
                                                            onClick={() => moveClause(index, 'up')}
                                                            disabled={index === 0}
                                                            style={{ padding: '0', cursor: index === 0 ? 'default' : 'pointer', border: 'none', background: 'none', color: index === 0 ? '#cbd5e1' : '#64748b' }}
                                                            title="Move Up"
                                                        >
                                                            <ChevronUp size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => moveClause(index, 'down')}
                                                            disabled={index === orderedClauses.length - 1}
                                                            style={{ padding: '0', cursor: index === orderedClauses.length - 1 ? 'default' : 'pointer', border: 'none', background: 'none', color: index === orderedClauses.length - 1 ? '#cbd5e1' : '#64748b' }}
                                                            title="Move Down"
                                                        >
                                                            <ChevronDown size={14} />
                                                        </button>
                                                    </div>

                                                    <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px', background: isChecked ? '#f0fdf4' : '#f8fafc', borderRadius: '6px', border: `1px solid ${isChecked ? '#86efac' : '#e2e8f0'}` }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => isCustom ? updateCustomClause(id, 'isChecked', !isChecked) : toggleClause(id)}
                                                            style={{ width: '16px', height: '16px' }}
                                                        />
                                                        <span style={{ fontSize: '13px', fontWeight: '500' }}>{title}</span>
                                                    </label>

                                                    {isCustom && (
                                                        <button
                                                            onClick={() => removeCustomClause(id)}
                                                            style={{ padding: '8px', color: '#ef4444', background: 'white', border: '1px solid #fee2e2', borderRadius: '6px', cursor: 'pointer' }}
                                                            title="Remove Clause"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>


                                                {isChecked && (
                                                    <button
                                                        onClick={() => setExpandedClause(expandedClause === contentKey ? null : contentKey)}
                                                        style={{ marginTop: '4px', marginLeft: '32px', fontSize: '11px', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer' }}
                                                    >
                                                        {expandedClause === contentKey ? '▼ Hide Editor' : '► Edit Content'}
                                                    </button>
                                                )}

                                                {expandedClause === contentKey && (
                                                    <div style={{ marginLeft: '32px' }}>
                                                        <ClauseEditor
                                                            html={isCustom ? customClause.content : clauseContent[contentKey]}
                                                            onChange={(val) => {
                                                                if (isCustom) updateCustomClause(id, 'content', val);
                                                                else updateClauseContent(contentKey, val);
                                                            }}
                                                            style={{
                                                                width: '100%',
                                                                marginTop: '8px',
                                                                padding: '12px',
                                                                border: '1px solid #e2e8f0',
                                                                borderRadius: '4px',
                                                                fontSize: '12px',
                                                                minHeight: '150px',
                                                                maxHeight: '400px',
                                                                overflowY: 'auto',
                                                                backgroundColor: 'white',
                                                                outline: 'none'
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}


                                    {/* Custom Clauses Section */}


                                    {/* Add New Clause Button */}
                                    <div style={{ marginTop: '16px', borderTop: '1px dashed #e2e8f0', paddingTop: '16px' }}>
                                        {isAddingClause ? (
                                            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                <input
                                                    type="text"
                                                    value={newClauseTitle}
                                                    onChange={(e) => setNewClauseTitle(e.target.value)}
                                                    placeholder="Clause Heading (e.g., Special Conditions)"
                                                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', marginBottom: '8px' }}
                                                    autoFocus
                                                />
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button onClick={addCustomClause} style={{ flex: 1, padding: '6px', background: '#3b82f6', color: 'white', borderRadius: '4px', border: 'none', fontSize: '12px', cursor: 'pointer' }}>Add</button>
                                                    <button onClick={() => setIsAddingClause(false)} style={{ flex: 1, padding: '6px', background: 'white', color: '#64748b', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setIsAddingClause(true)}
                                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', background: 'white', color: '#3b82f6', border: '1px dashed #3b82f6', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
                                            >
                                                <Plus size={16} /> Add New Clause
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Action Buttons */}
            </div>

            {/* Resizer Handle */}
            <div
                onMouseDown={startResizing}
                title="Drag to resize sidebar"
                style={{
                    width: '10px', // Increased touch target
                    backgroundColor: '#f1f5f9',
                    borderRight: '1px solid #e2e8f0',
                    borderLeft: '1px solid #e2e8f0', // Added border for visibility
                    cursor: 'col-resize',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10,
                    transition: 'background-color 0.2s',
                    ':hover': { backgroundColor: '#e2e8f0' } // Note: inline styles don't support pseudo-classes directly in React like this without a library or state, but the borders help.
                }}
            >
                <div style={{ width: '4px', height: '32px', backgroundColor: '#cbd5e1', borderRadius: '2px' }}></div>
            </div>

            {/* Right Panel - Quote Preview */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
                        Loading enquiry data...
                    </div>
                ) : (!enquiryData || !enquiryData.leadJobPrefix || !toName) ? (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {!enquiryData && pendingQuotes.length > 0 ? (
                            <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', width: '100%', margin: '0 auto' }}>
                                <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <FileText size={20} className="text-blue-600" /> Pending Updates ({pendingQuotes.length})
                                    </h2>
                                    <span style={{ fontSize: '12px', color: '#64748b' }}>Sorted by Due Date</span>
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                                            <tr>
                                                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0', width: '80px' }}>Enquiry No.</th>
                                                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0', minWidth: '180px' }}>Project Name</th>
                                                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Customer Name</th>
                                                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0', minWidth: '110px' }}>Due Date</th>
                                                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Subjob Prices</th>
                                                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0', minWidth: '200px' }}>Client Name</th>
                                                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0', minWidth: '200px' }}>Consultant Name</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pendingQuotes.map((enq, idx) => (
                                                <tr
                                                    key={enq.RequestNo || idx}
                                                    style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                                                    onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                    onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                                                    onClick={() => handleSelectEnquiry(enq)}
                                                >
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b', fontWeight: '500', verticalAlign: 'top' }}>{enq.RequestNo}</td>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', minWidth: '180px' }}>{enq.ProjectName || '-'}</td>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', minWidth: '250px' }}>
                                                        {enq.CustomerName ? enq.CustomerName.split(',').map((cust, i) => {
                                                            const cName = cust.trim();

                                                            const quoteMap = {};
                                                            (enq.QuotedCustomers || '').split(';;').filter(Boolean).forEach(p => {
                                                                const parts = p.split('|');
                                                                if (parts.length >= 2) {
                                                                    const key = normalize(parts[0]);
                                                                    const valStr = parts[1].replace(/,/g, '');
                                                                    const val = parseFloat(valStr) || 0;
                                                                    quoteMap[key] = (quoteMap[key] || 0) + val;
                                                                }
                                                            });
                                                            const pricingMap = {};
                                                            (enq.PricingCustomerDetails || '').split(';;').filter(Boolean).forEach(p => {
                                                                const parts = p.split('|');
                                                                if (parts.length >= 2) {
                                                                    const key = normalize(parts[0]);
                                                                    const val = parseFloat(parts[1]) || 0;
                                                                    pricingMap[key] = (pricingMap[key] || 0) + val;
                                                                }
                                                            });


                                                            const cNameNorm = normalize(cName);
                                                            let quotedVal = quoteMap[cNameNorm];
                                                            let pricingVal = pricingMap[cNameNorm];

                                                            if (quotedVal === undefined) {
                                                                // Fuzzy match: check if one contains the other
                                                                const fuzzyKey = Object.keys(quoteMap).find(k => cNameNorm.includes(k) || k.includes(cNameNorm));
                                                                if (fuzzyKey) quotedVal = quoteMap[fuzzyKey];
                                                            }
                                                            if (pricingVal === undefined) {
                                                                const fuzzyKey = Object.keys(pricingMap).find(k => cNameNorm.includes(k) || k.includes(cNameNorm));
                                                                if (fuzzyKey) pricingVal = pricingMap[fuzzyKey];
                                                            }

                                                            const displayQuoted = quotedVal !== undefined
                                                                ? quotedVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                                                : null;

                                                            const displayPricing = pricingVal !== undefined && pricingVal > 0
                                                                ? pricingVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                                                : null;

                                                            return (
                                                                <div key={i} style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: '8px' }}>
                                                                    <span style={{ fontWeight: '500', color: '#334155', whiteSpace: 'nowrap' }}>{cName}</span>
                                                                    {displayPricing ? (
                                                                        <span style={{
                                                                            color: '#166534',
                                                                            fontWeight: '600',
                                                                            fontSize: '11px',
                                                                            background: '#dcfce7',
                                                                            padding: '2px 8px',
                                                                            borderRadius: '4px',
                                                                            border: '1px solid #bbf7d0',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            whiteSpace: 'nowrap'
                                                                        }} title="Pricing Update">
                                                                            BD {displayPricing}
                                                                        </span>
                                                                    ) : displayQuoted ? (
                                                                        <span style={{
                                                                            color: '#166534',
                                                                            fontWeight: '600',
                                                                            fontSize: '11px',
                                                                            background: '#dcfce7',
                                                                            padding: '2px 8px',
                                                                            borderRadius: '4px',
                                                                            border: '1px solid #bbf7d0',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            whiteSpace: 'nowrap'
                                                                        }} title="Already Quoted">
                                                                            BD {displayQuoted}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            );
                                                        }) : '-'}
                                                    </td>

                                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#dc2626', fontWeight: '500', verticalAlign: 'top', minWidth: '110px', whiteSpace: 'nowrap' }}>{enq.DueDate ? format(new Date(enq.DueDate), 'dd-MMM-yyyy') : '-'}</td>
                                                    <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                                                        {(enq.SubJobPrices || enq.subJobPrices) ? (enq.SubJobPrices || enq.subJobPrices).split(';;').filter(Boolean).map((s, i) => {
                                                            const parts = s.split('|');
                                                            const name = parts[0];
                                                            const rawPrice = parts[1];
                                                            const rawDate = parts[2];
                                                            const rawLevel = parts[3];

                                                            const level = parseInt(rawLevel) || 0;
                                                            const isUpdated = rawPrice && rawPrice !== 'Not Updated' && parseFloat(rawPrice) > 0;

                                                            let displayPrice = rawPrice;
                                                            if (isUpdated) {
                                                                const num = parseFloat(rawPrice);
                                                                if (!isNaN(num)) displayPrice = num.toLocaleString(undefined, { minimumFractionDigits: 2 });
                                                            }

                                                            let displayDate = '';
                                                            if (rawDate) {
                                                                try {
                                                                    displayDate = format(new Date(rawDate), 'dd-MMM-yy hh:mm a');
                                                                } catch (e) { }
                                                            }

                                                            return (
                                                                <div key={i} style={{
                                                                    fontSize: '11px',
                                                                    marginBottom: '4px',
                                                                    whiteSpace: 'nowrap',
                                                                    marginLeft: `${level * 20}px`,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}>
                                                                    {level > 0 && <span style={{ color: '#94a3b8', marginRight: '2px' }}>↳</span>}
                                                                    <span style={{ fontWeight: '600', color: '#475569' }}>{name}:</span>
                                                                    <span style={{
                                                                        color: isUpdated ? '#166534' : '#94a3b8',
                                                                        marginLeft: '4px',
                                                                        fontStyle: isUpdated ? 'normal' : 'italic',
                                                                        background: isUpdated ? '#dcfce7' : '#f1f5f9',
                                                                        padding: '1px 6px',
                                                                        borderRadius: '4px',
                                                                        fontSize: '10px'
                                                                    }}>
                                                                        {isUpdated ? `BD ${displayPrice}` : 'Not Updated'}
                                                                    </span>
                                                                    {isUpdated && displayDate && (
                                                                        <span style={{ marginLeft: '6px', color: '#94a3b8', fontSize: '10px' }}>
                                                                            ({displayDate})
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        }) : (
                                                            <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>No subjobs found</div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', minWidth: '200px' }}>{enq.ClientName || enq.clientName || '-'}</td>
                                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', minWidth: '200px' }}>{enq.ConsultantName || enq.consultantName || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div style={{ flex: 1 }} />
                        )}
                    </div>
                ) : (
                    <>
                        {/* Attachments Bar (Outlook Style) */}
                        <div className="no-print" style={{
                            marginBottom: '16px',
                            padding: '12px 16px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569', fontSize: '13px', fontWeight: '600' }}>
                                    <Paperclip size={18} className="text-blue-500" />
                                    <span>Attachments {quoteAttachments.length > 0 && `(${quoteAttachments.length})`}</span>
                                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'normal', marginLeft: '8px' }}>
                                        (Click 'Add Files' or <span style={{ color: '#3b82f6', fontWeight: '500' }}>Paste (Ctrl+V)</span> files - <span style={{ color: '#10b981', fontWeight: '600' }}>{quoteId ? 'Ready' : 'Pending Save'}</span>)
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={downloadPDF}
                                        disabled={!hasUserPricing}
                                        style={{
                                            fontSize: '11px',
                                            color: 'white',
                                            background: '#ef4444',
                                            border: '1px solid #ef4444',
                                            padding: '4px 12px',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontWeight: '600',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            opacity: !hasUserPricing ? 0.5 : 1
                                        }}
                                    >
                                        <Download size={14} /> PDF Download
                                    </button>
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        style={{
                                            fontSize: '11px',
                                            color: '#3b82f6',
                                            background: 'white',
                                            border: '1px solid #3b82f6',
                                            padding: '4px 12px',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontWeight: '600',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <Plus size={14} /> Add Files
                                    </button>
                                </div>
                                <input
                                    type="file"
                                    multiple
                                    ref={fileInputRef}
                                    onChange={(e) => uploadFiles(e.target.files)}
                                    style={{ display: 'none' }}
                                />
                            </div>

                            {(quoteAttachments.length > 0 || pendingFiles.length > 0) ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                                    {pendingFiles.map((file, idx) => (
                                        <div
                                            key={`pending-${idx}`}
                                            className="attachment-card"
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                padding: '8px 12px',
                                                background: '#fff7ed', // Orange tint for pending
                                                border: '1px dashed #f97316',
                                                borderRadius: '6px',
                                                width: '240px',
                                                maxWidth: '240px',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                                transition: 'all 0.2s',
                                                position: 'relative'
                                            }}
                                        >
                                            <div style={{
                                                width: '32px',
                                                height: '32px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: '#ffedd5',
                                                borderRadius: '4px',
                                                color: '#f97316'
                                            }}>
                                                <FileText size={18} />
                                            </div>
                                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                                <div style={{ fontSize: '12px', fontWeight: '600', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={file.name}>
                                                    {file.name}
                                                </div>
                                                <div style={{ fontSize: '10px', color: '#f97316', fontWeight: '600' }}>
                                                    Pending Save...
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '2px' }}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPendingFiles(prev => prev.filter((_, i) => i !== idx));
                                                    }}
                                                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                                                    title="Remove"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    {quoteAttachments.map(att => (
                                        <div
                                            key={att.ID}
                                            className="attachment-card"
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                padding: '8px 12px',
                                                background: 'white',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '6px',
                                                width: '240px',
                                                maxWidth: '240px',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                                transition: 'all 0.2s',
                                                position: 'relative',
                                                group: 'true'
                                            }}
                                        >
                                            <div style={{
                                                width: '32px',
                                                height: '32px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: att.FileName.toLowerCase().endsWith('.pdf') ? '#fee2e2' : '#e0f2fe',
                                                borderRadius: '4px',
                                                color: att.FileName.toLowerCase().endsWith('.pdf') ? '#ef4444' : '#3b82f6'
                                            }}>
                                                <FileText size={18} />
                                            </div>
                                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                                <div style={{ fontSize: '12px', fontWeight: '600', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={att.FileName}>
                                                    {att.FileName}
                                                </div>
                                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                                    {format(new Date(att.UploadedAt), 'dd MMM, HH:mm')}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '2px' }}>
                                                <button
                                                    onClick={() => handleDownloadAttachment(att.ID, att.FileName)}
                                                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                                                    title="Download"
                                                    onMouseOver={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <Download size={14} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteAttachment(att.ID); }}
                                                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                                                    title="Remove"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{
                                    border: '1px dashed #cbd5e1',
                                    borderRadius: '6px',
                                    padding: '12px',
                                    textAlign: 'center',
                                    fontSize: '12px',
                                    color: '#94a3b8',
                                    background: '#ffffff'
                                }}>
                                    {quoteId ? "No attachments yet. Paste files here or Click 'Add Files' to attach documents." : "Start adding attachments anytime. They will be uploaded when you Save."}
                                </div>
                            )}

                            {isUploading && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#3b82f6', fontWeight: '500' }}>
                                    <div className="animate-spin" style={{ width: '12px', height: '12px', border: '2px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
                                    Please wait...
                                </div>
                            )}
                        </div>

                        <style>{tableStyles}</style>
                        <style>
                            {`
                            @media print {
                                body * {
                                    visibility: hidden;
                                }
                                #quote-preview, #quote-preview * {
                                    visibility: visible;
                                }
                                #quote-preview {
                                    position: absolute;
                                    left: 0;
                                    top: 0;
                                    width: 100%;
                                    margin: 0;
                                    padding: 0;
                                    box-shadow: none !important;
                                    background: white;
                                }
                                @page { 
                                    size: A4 portrait; 
                                    margin: 10mm; 
                                }
                                .no-print {
                                    display: none !important;
                                }
                            }
                        `}
                        </style>

                        {/* Document Container */}
                        <div id="quote-preview" style={{
                            background: 'white',
                            padding: '40px',
                            borderRadius: '8px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            maxWidth: '800px',
                            margin: '0 auto',
                            minHeight: '290mm' // Ensures it looks like at least one page
                        }}>

                            {/* Page 1 Container */}
                            <div className="page-one" style={{
                                minHeight: '275mm',
                                display: 'flex',
                                flexDirection: 'column',
                                position: 'relative'
                            }}>
                                <div style={{ flex: 1 }}>

                                    {/* Header */}
                                    <div className="header-section" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px', alignItems: 'flex-start' }}>
                                        {/* To Section (Left) - Adjusted margin to align with Quote Info Table */}
                                        <div style={{ flex: 1, marginTop: '40px', paddingRight: '20px' }}>
                                            <div style={{ fontWeight: '600', marginBottom: '8px', fontSize: '14px', color: '#334155' }}>To,</div>
                                            <div style={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '4px', fontSize: '14px' }}>{toName}</div>
                                            {toAddress && <div style={{ fontSize: '13px', color: '#64748b', whiteSpace: 'pre-line', lineHeight: '1.5', marginBottom: '4px' }}>{toAddress}</div>}
                                            {toPhone && <div style={{ fontSize: '13px', color: '#64748b' }}>Tel: {toPhone}</div>}
                                            {toEmail && <div style={{ fontSize: '13px', color: '#64748b' }}>Email: {toEmail}</div>}
                                        </div>

                                        {/* Header & Quote Info (Right) */}
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                            {/* Identity */}
                                            <div className="print-logo-section" style={{ marginBottom: '12px', textAlign: 'right' }}>
                                                {quoteLogo ? (
                                                    <img
                                                        src={`/${quoteLogo.replace(/\\/g, '/')}`}
                                                        onError={(e) => console.error('[QuoteForm] Logo load fail:', e.target.src)}
                                                        alt="Company Logo"
                                                        style={{ height: '68px', width: 'auto', maxWidth: '212px', objectFit: 'contain' }}
                                                    />
                                                ) : (
                                                    <>
                                                        <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '2px' }}>المؤيد للمقاولات</div>
                                                        <div style={{ fontSize: '21px', fontWeight: 'bold', color: '#0284c7', letterSpacing: '-0.5px' }}>{quoteCompanyName}</div>
                                                    </>
                                                )}
                                            </div>
                                            <table style={{ fontSize: '13px', borderCollapse: 'collapse', textAlign: 'left' }}>
                                                <tbody>
                                                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                                        <td style={{ padding: '8px 16px', fontWeight: 'bold', color: '#334155' }}>Quote Ref:</td>
                                                        <td style={{ padding: '8px 16px', fontWeight: 'bold', color: quoteId ? '#0f172a' : '#ef4444' }}>{quoteId ? quoteNumber : 'Draft'}</td>
                                                    </tr>
                                                    <tr><td style={{ padding: '4px 16px', fontWeight: '600', color: '#64748b' }}>Date:</td><td style={{ padding: '4px 16px' }}>{formatDate(quoteDate)}</td></tr>
                                                    <tr><td style={{ padding: '4px 16px', fontWeight: '600', color: '#64748b' }}>Prepared By:</td><td style={{ padding: '4px 16px' }}>{preparedBy || 'N/A'}</td></tr>
                                                    <tr><td style={{ padding: '4px 16px', fontWeight: '600', color: '#64748b' }}>Type:</td><td style={{ padding: '4px 16px' }}>{enquiryData.enquiry.EnquiryType || 'Tender'}</td></tr>
                                                    <tr><td style={{ padding: '4px 16px', fontWeight: '600', color: '#64748b' }}>Your Ref:</td><td style={{ padding: '4px 16px' }}>{customerReference}</td></tr>
                                                    <tr><td style={{ padding: '4px 16px', fontWeight: '600', color: '#64748b' }}>Validity:</td><td style={{ padding: '4px 16px' }}>{getValidityDate()}</td></tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Subject Section */}
                                    <table style={{ width: '100%', marginBottom: '24px', fontSize: '14px', borderCollapse: 'collapse' }}>
                                        <tbody>
                                            <tr style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ fontWeight: 'bold', padding: '10px 12px', width: '140px', color: '#334155' }}>Project Name:</td>
                                                <td style={{ padding: '10px 12px', fontWeight: '700', color: '#0f172a' }}>{enquiryData.enquiry.ProjectName}</td>
                                            </tr>
                                            <tr>
                                                <td style={{ fontWeight: '600', padding: '8px 12px', color: '#64748b' }}>Subject:</td>
                                                <td style={{ padding: '8px 12px' }}>{subject}</td>
                                            </tr>
                                            <tr>
                                                <td style={{ fontWeight: '600', padding: '8px 12px', color: '#64748b' }}>Attention of:</td>
                                                <td style={{ padding: '8px 12px', fontWeight: '500' }}>
                                                    {toAttention ? toAttention.split(',').map(n => n.trim()).join(', ') : 'N/A'}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    {/* Dear Sir/Madam */}
                                    <div style={{ marginBottom: '20px' }}>
                                        <p>Dear Sir/Madam,</p>
                                        <p>Thank you for providing us with this opportunity to submit our offer for the below-mentioned inclusions. We have carefully reviewed your requirements to ensure that our proposal aligns perfectly. We are pleased to submit our quotation as per the details mentioned below. It is our pleasure to serve you and we assure you that our best efforts will always be made to meet your needs.</p>
                                        <p>We hope you will find our offer competitive and kindly revert to us for any clarifications.</p>
                                    </div>
                                </div> {/* End of Flex-1 Content */}

                                {/* Bottom Section (Signature + Footer) */}
                                <div style={{ marginTop: 'auto' }}>

                                    {/* Signature Section */}
                                    <div style={{ marginTop: '50px' }}>
                                        <div style={{ marginBottom: '40px' }}>For {quoteCompanyName || enquiryData.companyDetails?.name || 'Almoayyed Contracting'},</div>
                                        <div style={{ fontWeight: '600' }}>{signatory || 'N/A'}</div>
                                        <div style={{ fontSize: '13px', color: '#64748b' }}>{signatoryDesignation || ''}</div>
                                    </div>

                                    {/* Footer */}
                                    <div className="footer-section" style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', fontSize: '11px', color: '#64748b', textAlign: 'right' }}>
                                        <div>{footerDetails?.name || enquiryData.companyDetails?.name || 'Almoayyed Contracting'}</div>
                                        <div>{footerDetails?.address || enquiryData.companyDetails?.address || 'P.O. Box 32232, Manama, Kingdom of Bahrain'}</div>
                                        <div>
                                            {footerDetails?.phone ? `Tel: ${footerDetails.phone}` : (enquiryData.companyDetails?.phone ? `Tel: ${enquiryData.companyDetails.phone}` : 'Tel: (+973) 17 400 407')}
                                            {' | '}
                                            Fax: {footerDetails?.fax || enquiryData.companyDetails?.fax || '(+973) 17 400 396'}
                                        </div>
                                        <div>E-mail: {footerDetails?.email || enquiryData.companyDetails?.email || 'bms@almcg.com'}</div>
                                    </div>
                                </div> {/* End of Page 1 Container */}
                            </div>

                            {/* Clauses - Standard + Custom Mixed & Numbered via Ordered List */}
                            <div className="page-break" style={{
                                marginTop: '40px',
                                minHeight: '100mm', // Forced height for visibility
                                paddingBottom: '40px',
                                background: 'white'
                            }}>
                                {/* Visual Divider (Screen Only) */}
                                <div className="no-print" style={{
                                    height: '1px',
                                    borderTop: '2px dashed #3b82f6', // Changed to blue to be more visible
                                    margin: '40px 0',
                                    position: 'relative',
                                    opacity: 1 // Full opacity for debug
                                }}>
                                    <span style={{
                                        position: 'absolute',
                                        top: '-10px',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        background: '#3b82f6',
                                        padding: '2px 10px',
                                        color: 'white',
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        borderRadius: '10px',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        PAGE 2 - Clauses & Conditions ({orderedClauses.filter(id => id.startsWith('custom_') ? customClauses.find(c => c.id === id)?.isChecked : clauses[id]).length} Active)
                                    </span>
                                </div>

                                {orderedClauses.map(id => {
                                    const isCustom = id.startsWith('custom_');
                                    const customClause = isCustom ? customClauses.find(c => c.id === id) : null;
                                    const standardClause = !isCustom ? clauseDefinitions.find(c => c.key === id) : null;

                                    if (!customClause && !standardClause) return null;

                                    return isCustom ?
                                        { ...customClause, type: 'custom' } :
                                        { ...standardClause, type: 'standard', isChecked: clauses[id], content: clauseContent[standardClause.contentKey] };
                                })
                                    .filter(clause => clause && clause.isChecked)
                                    .map((clause, index) => (
                                        <div key={clause.key || clause.id} style={{ marginBottom: '20px' }}>
                                            <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '10px' }}>{index + 1}. {clause.title}</h3>
                                            <div
                                                style={{ fontSize: '13px', lineHeight: '1.6', paddingLeft: '15px' }}
                                                className="clause-content"
                                                dangerouslySetInnerHTML={{ __html: clause.content }}
                                            />
                                        </div>
                                    ))
                                }

                                {/* Placeholder to ensure we can see the bottom of the container */}
                                <div style={{ height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid #f1f5f9', marginTop: '20px', color: '#cbd5e1', fontSize: '10px' }}>
                                    --- End of Quotation ---
                                </div>
                            </div>


                        </div>
                    </>
                )}
            </div>

        </div>
    );
};

export default QuoteForm;
