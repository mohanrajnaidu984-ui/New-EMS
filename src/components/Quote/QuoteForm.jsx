import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Save, Printer, Mail, Plus, ChevronDown, ChevronUp, X, Trash2, FolderOpen, Paperclip, Download } from 'lucide-react';
import CreatableSelect from 'react-select/creatable';
import { format } from 'date-fns';
import DateInput from '../Enquiry/DateInput';
import { useAuth } from '../../context/AuthContext';
import ClauseEditor from './ClauseEditor';

/** Confirms this file is the bundle executed by Vite (Main.jsx → ./Quote/QuoteForm). Hard-refresh if missing. */
console.log("QUOTE FILE LOADED");

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

    acceptance: `We hope that the above is in line with your requirements.
Should you have any further queries, please do not hesitate to contact our [designation] Mr./ Ms. [name] on [phone / email].`,

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

const normalize = (str) => {
    if (!str) return '';
    return String(str)
        .trim()
        .toLowerCase()
        .replace(/[.,]/g, '') // Remove dots and commas for robust matching
        .replace(/\s+/g, ' ');
};
const normalizeName = normalize;

const parsePrice = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    const clean = String(v).replace(/[^\d.]/g, '');
    return parseFloat(clean) || 0;
};

// Global Helper for Division Code Mapping - Updated for more robust matching
const matchDivisionCode = (qDivCode, jName, jDivCode = null) => {
    if (!qDivCode || !jName) return false;
    const q = qDivCode.toUpperCase();
    const j = jName.toUpperCase();
    const jd = jDivCode ? jDivCode.toUpperCase() : null;

    // Priority 1: Direct match with data-driven division code
    if (jd && (q === jd || jd.includes(q) || q.includes(jd))) {
        // console.log(`[matchDivisionCode] Priority 1 match! q:${q} jd:${jd}`);
        return true;
    }

    // Priority 2: Label-based heuristic matches
    return (q === 'ELE' || q === 'ELP' || q === 'ELM' || q === 'AME') && (j.includes('ELECTRICAL') || j.includes('ELE') || j.includes('ELM')) ||
        ((q === 'BMS' || q === 'BMP' || q === 'PRP') && (j.includes('BMS') || j.includes('PRICING') || j.includes('PROJECT'))) ||
        (q === 'PLFF' || q === 'PLP') && (j.includes('PLUMBING') || j.includes('FIRE') || j.includes('PLFF')) ||
        (q === 'CVLP' || q === 'CVP' || q === 'CVL' || q === 'CMP' || q === 'CIP') && (j.includes('CIVIL') || j.includes('CONCRETE')) ||
        (q === 'FPE' || q === 'FPP') && j.includes('FIRE') ||
        (q === 'HVP' || q === 'HVM' || q === 'HVC' || q === 'AMM') && (j.includes('HVAC') || j.includes('AIR CONDITIONING') || j.includes('HVM') || j.includes('AMM')) ||
        (q === 'AAC' && (j.includes('AIR') || j.includes('MAIN') || j.includes('HVAC'))) ||
        (q === 'AIN' || q === 'INP' || q === 'INT') && j.includes('INTERIORS') ||
        (j.includes(q) || q.includes(j)) || // Fuzzy overlap
        (q === 'GEN'); // Global fallback for general quotes
};

const isDescendant = (childId, ancestorId, pool) => {
    if (!childId || !ancestorId || !pool) return false;
    const child = pool.find(j => String(j.id || j.ItemID || j.ID) === String(childId));
    if (!child) return false;
    const pid = child.parentId || child.ParentID;
    if (!pid || pid === '0' || pid === 0 || pid === 'undefined') return false;
    if (String(pid) === String(ancestorId)) return true;
    // Recursive check with safety
    let curr = child;
    let safety = 0;
    while (curr && (curr.parentId || curr.ParentID) && safety < 10) {
        const pId = String(curr.parentId || curr.ParentID);
        if (pId === String(ancestorId)) return true;
        curr = pool.find(pj => String(pj.id || pj.ItemID || pj.ID) === pId);
        safety++;
    }
    return false;
};

const tableStyles = `
    .clause-content table {
        width: 100% !important;
        border-collapse: collapse !important;
        margin-bottom: 16px !important;
        font-size: 12px !important;
        page-break-inside: auto !important;
    }
    .clause-content tr {
        page-break-inside: avoid !important;
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
    .clause-content {
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
    }
    .clause-content p {
        margin-bottom: 8px !important;
        white-space: normal !important;
    }
    .clause-content ul, .clause-content ol {
        margin-top: 4px !important;
        margin-bottom: 12px !important;
        padding-left: 24px !important;
        white-space: normal !important;
    }
    .clause-content li {
        margin-bottom: 4px !important;
        display: list-item !important;
        list-style-position: outside !important;
    }
    .clause-content ul {
        list-style-type: disc !important;
    }
    .clause-content ol {
        list-style-type: decimal !important;
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
    const [selectedLeadId, setSelectedLeadId] = useState(null);
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
    const [toFax, setToFax] = useState('');
    const [toAttention, setToAttention] = useState(''); // ReceivedFrom contact for selected customer


    // Prepared By
    const [preparedBy, setPreparedBy] = useState('');
    const [preparedByOptions, setPreparedByOptions] = useState([]);
    const [signatoryOptions, setSignatoryOptions] = useState([]);
    const [enquiryCustomerOptions, setEnquiryCustomerOptions] = useState([]);

    // Pricing Data
    const [pricingData, setPricingData] = useState(null);

    // Unified Jobs Pool for consistent rendering and calculation (Step 1240)
    const jobsPool = React.useMemo(() => {
        const hierarchy = enquiryData?.divisionsHierarchy || [];
        const pricingJobs = pricingData?.jobs || [];
        return pricingJobs.length > 0 ? pricingJobs : hierarchy.map(d => ({
            id: d.id || d.ItemID || d.ID,
            parentId: d.parentId || d.ParentID,
            itemName: d.itemName || d.ItemName || d.DivisionName,
            leadJobCode: d.leadJobCode || d.LeadJobCode,
            companyLogo: d.companyLogo,
            companyName: d.companyName,
            departmentName: d.departmentName,
            divisionCode: d.divisionCode || d.DivisionCode,
            departmentCode: d.departmentCode || d.DepartmentCode
        }));
    }, [pricingData, enquiryData]);
    const [pricingSummary, setPricingSummary] = useState([]);
    const [grandTotal, setGrandTotal] = useState(0);
    const [hasPricedOptional, setHasPricedOptional] = useState(false);
    const [hasUserPricing, setHasUserPricing] = useState(false);

    // Lists
    const [usersList, setUsersList] = useState([]);
    const [customersList, setCustomersList] = useState([]);
    const [pendingQuotes, setPendingQuotes] = useState([]); // Pending List State
    const [pendingQuotesSortConfig, setPendingQuotesSortConfig] = useState({ field: 'DueDate', direction: 'asc' }); // Default: soonest due date on top

    // Tab State for unified Quote and Pricing Sections
    const [activeQuoteTab, setActiveQuoteTab] = useState('self');

    // --- LOCKED LOGIC: Independent Tab State Management (Step 1722 fix) ---
    // Registry to store form state per tab to prevent data sharing/leakage.
    const tabStateRegistry = useRef({});

    // --- LOCKED LOGIC: Reusable Form Reset ---
    const resetFormState = useCallback(() => {
        setQuoteId(null);
        setQuoteNumber('');
        setQuoteDate(new Date().toISOString().split('T')[0]);
        setValidityDays(30);
        setPreparedBy(currentUser?.FullName || currentUser?.name || '');
        setSignatory('');
        setSignatoryDesignation('');
        setSubject('');
        setCustomerReference('');
        setToName('');
        setToAddress('');
        setToPhone('');
        setToEmail('');
        setToFax('');
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
        setCustomClauses([]);
        setOrderedClauses([
            'showScopeOfWork', 'showBasisOfOffer', 'showExclusions', 'showPricingTerms',
            'showBillOfQuantity', 'showSchedule', 'showWarranty', 'showResponsibilityMatrix', 'showTermsConditions', 'showAcceptance'
        ]);
        setSelectedJobs([]);
        setQuoteContextScope(null);
        setPricingSummary([]);
        setHasUserPricing(false);

        // --- ENFORCE USER IDENTITY (Step 4488) ---
        if (enquiryData?.companyDetails) {
            setQuoteCompanyName(enquiryData.companyDetails.name);
            setQuoteLogo(enquiryData.companyDetails.logo);
            setFooterDetails(enquiryData.companyDetails);
        } else {
             setQuoteCompanyName('Almoayyed Air Conditioning');
             setQuoteLogo(null);
        }
    }, [currentUser, enquiryData]);

    const handleTabChange = (newTabId) => {
        if (newTabId === activeQuoteTab) return;

        // 1. Save Current Tab State
        tabStateRegistry.current[activeQuoteTab] = {
            subject, quoteDate, validityDays, customerReference,
            signatory, signatoryDesignation, preparedBy,
            toName, toAddress, toPhone, toEmail, toAttention,
            clauseContent, clauses, customClauses, orderedClauses,
            selectedJobs, quoteId, quoteNumber
        };

        // 2. Load or Reset New Tab State
        const saved = tabStateRegistry.current[newTabId];

        // Preserve current customer info to carry over
        const currentCustomer = {
            toName, toAddress, toPhone, toEmail, toAttention
        };

        if (saved) {
            setSubject(saved.subject);
            setQuoteDate(saved.quoteDate);
            setValidityDays(saved.validityDays);
            setCustomerReference(saved.customerReference);
            setSignatory(saved.signatory);
            setSignatoryDesignation(saved.signatoryDesignation);
            setPreparedBy(saved.preparedBy);

            // Use saved customer if it exists, otherwise carry over from current tab
            setToName(saved.toName || currentCustomer.toName);
            setToAddress(saved.toAddress || currentCustomer.toAddress);
            setToPhone(saved.toPhone || currentCustomer.toPhone);
            setToEmail(saved.toEmail || currentCustomer.toEmail);
            setToAttention(saved.toAttention || currentCustomer.toAttention);

            setClauseContent(saved.clauseContent);
            setClauses(saved.clauses);
            setCustomClauses(saved.customClauses);
            setOrderedClauses(saved.orderedClauses);
            setSelectedJobs(saved.selectedJobs);
            setQuoteId(saved.quoteId);
            setQuoteNumber(saved.quoteNumber);
        } else {
            // Reset to defaults if fresh tab
            resetFormState();

            // Carry over customer info from previous tab
            setToName(currentCustomer.toName);
            setToAddress(currentCustomer.toAddress);
            setToPhone(currentCustomer.toPhone);
            setToEmail(currentCustomer.toEmail);
            setToAttention(currentCustomer.toAttention);
        }

        setActiveQuoteTab(newTabId);
    };

    // --- PROACTIVE IDENTITY SYNC (Step 4488) ---
    // ABSOLUTE LOCK: Ensure logo and footer are ALWAYS based on current user's personal profile
    useEffect(() => {
        if (currentUser && enquiryData?.availableProfiles) {
            const userDept = (currentUser.Department || '').trim().toLowerCase();
            const userEmail = (currentUser.EmailId || currentUser.email || '').trim().toLowerCase();
            const userName = (currentUser.FullName || currentUser.name || '').trim();

            if (!preparedBy && userName) {
                setPreparedBy(userName);
            }

            // Priority 1: Backend Flag
            let personalProfile = enquiryData.availableProfiles.find(p => p.isPersonalProfile);

            // Priority 2: Robust match (Email or Dept)
            if (!personalProfile) {
                personalProfile = enquiryData.availableProfiles.find(p => {
                    const pEmail = (p.email || '').trim().toLowerCase();
                    const pItem = (p.itemName || '').trim().toLowerCase();
                    const pName = (p.name || '').trim().toLowerCase();
                    return (userEmail && pEmail && (userEmail.includes(pEmail) || pEmail.includes(userEmail.split('@')[0]))) ||
                        (pItem === userDept || pName === userDept || (userDept.includes('bms') && pItem.includes('bms')));
                });
            }

            if (personalProfile) {
                if (quoteCompanyName !== personalProfile.name) {
                    console.log('[IdentitySync] Absolute branding lock applied for:', personalProfile.name);
                    setQuoteCompanyName(personalProfile.name);
                    setQuoteLogo(personalProfile.logo);
                    setFooterDetails(personalProfile);
                }

                // Inject/Lock in enquiryData for persistence
                if (enquiryData.companyDetails?.name !== personalProfile.name) {
                    setEnquiryData(prev => ({
                        ...prev,
                        companyDetails: { ...personalProfile, isPersonalProfile: true },
                        enquiryLogo: personalProfile.logo,
                        enquiryCompanyName: personalProfile.name
                    }));
                }
            }
        }
    }, [currentUser, enquiryData?.availableProfiles]);

    const isDescendant = useCallback((childId, ancestorId, pool = null) => {
        if (!childId || !ancestorId) return false;
        const targetAncId = String(ancestorId);
        const jobsPool = pool || (pricingData?.jobs && pricingData.jobs.length > 0 ? pricingData.jobs : (enquiryData?.divisionsHierarchy || []));

        let currentId = String(childId);
        let visited = new Set();

        while (currentId && !visited.has(currentId)) {
            visited.add(currentId);
            const item = jobsPool.find(j => String(j.id || j.ItemID || j.ID || j.ID) === currentId);
            if (!item) break;

            const pid = String(item.parentId || item.ParentID || '');
            if (!pid || pid === '0' || pid === '' || pid === 'undefined') break;

            if (pid === targetAncId) return true;
            currentId = pid;
        }
        return false;
    }, [pricingData, enquiryData]);

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
        try {
            // Guard: At least enquiryData must exist
            if (!enquiryData) return [];

            const hierarchy = enquiryData.divisionsHierarchy || [];
            if (hierarchy.length === 0 && jobsPool.length === 0) return [];

            // 1. Source of Truth: Use consolidated jobsPool
            const localJobsList = jobsPool.length > 0 ? jobsPool : hierarchy.map(d => ({
                id: d.id || d.ItemID || d.ID,
                parentId: d.parentId || d.ParentID,
                itemName: d.itemName || d.ItemName || d.DivisionName,
                leadJobCode: d.leadJobCode || d.LeadJobCode,
                companyLogo: d.companyLogo,
                companyName: d.companyName,
                departmentName: d.departmentName,
                divisionCode: d.divisionCode || d.DivisionCode,
                departmentCode: d.departmentCode || d.DepartmentCode
            }));

            // ROBUST PREFIX/L-CODE EXTRACTION: Matches '17-L1' -> 'L1' or 'L1-17' -> 'L1'
            const rawPrefix = (enquiryData.leadJobPrefix || '').toUpperCase();
            const leadLCode = rawPrefix.match(/L\d+/) ? rawPrefix.match(/L\d+/)[0] : rawPrefix;

            const findLeadJobByPrefix = (prefix, pool) => {
                if (!prefix) return null;
                const p = prefix.toUpperCase();
                // Priority 1: Exact root match
                const rootMatch = pool.find(j => {
                    const isRoot = !(j.parentId || j.ParentID) || (j.parentId || j.ParentID) == '0' || (j.parentId || j.ParentID) == 0;
                    if (!isRoot) return false;
                    const jName = (j.itemName || '').toUpperCase();
                    const jCode = (j.leadJobCode || '').toUpperCase();
                    const cleanJName = jName.replace(/^(L\d+\s*-\s*)/, '').trim();
                    return jName === p || cleanJName === p || jName.includes(p) || jCode === p;
                });
                if (rootMatch) return rootMatch;
                // Priority 2: Any match
                return pool.find(j => {
                    const jName = (j.itemName || '').toUpperCase();
                    const jCode = (j.leadJobCode || '').toUpperCase();
                    const cleanJName = jName.replace(/^(L\d+\s*-\s*)/, '').trim();
                    return jName === p || cleanJName === p || jName.includes(p) || jCode === p;
                });
            };

            const resolvedLeadJobId = findLeadJobByPrefix(leadLCode, localJobsList)?.id;

            // --- Resolved Lead Code for Quote Number Comparison ---
            const currentLeadCode = (() => {
                if (!leadLCode) return '';
                if (leadLCode.match(/^L\d+/)) return leadLCode;

                let job = localJobsList.find(j => String(j.id || j.ItemID) === String(resolvedLeadJobId));
                if (job) {
                    let root = job;
                    let safety = 0;
                    while (root && root.parentId && root.parentId !== '0' && root.parentId !== 0 && safety < 10) {
                        const parent = localJobsList.find(p => String(p.id || p.ItemID) === String(root.parentId));
                        if (parent) root = parent;
                        else break;
                        safety++;
                    }
                    const rCode = (root.leadJobCode || root.LeadJobCode || '').toUpperCase();
                    if (rCode && rCode.match(/^L\d+/)) return rCode;
                }
                return leadLCode;
            })();

            // Helper for hierarchy checks
            const isDescendantOrSelf = (jobId, targetId) => {
                let currId = jobId;
                let visited = new Set();
                while (currId && currId !== '0' && currId !== 0 && !visited.has(currId)) {
                    if (String(currId) === String(targetId)) return true;
                    visited.add(currId);
                    const found = localJobsList.find(j => String(j.id || j.ItemID) === String(currId));
                    if (!found) break;
                    currId = found.parentId || found.ParentID;
                }
                return false;
            };

            // RESOLVE EFFECTIVE ROOT:
            // 1. Determine user context
            const userDept = (currentUser?.Department || currentUser?.Division || '').trim().toLowerCase();
            const hasLeadAccess = isAdmin || ['civil', 'admin', 'bms admin'].includes(userDept) || pricingData?.access?.hasLeadAccess;
            const isSubUser = !hasLeadAccess;

            // 2. Find the job that represents the user's focus within this L-branch
            // Priority 1: Use explicit pricing assignments (editableJobs) as it's the most accurate
            const editableJobs = (pricingData?.access?.editableJobs || []).map(s => (s || '').toLowerCase().trim());
            const userDeptLower = (userDept || '').toLowerCase().trim();

            const matchesInBranch = localJobsList.filter(j => {
                const jName = (j.itemName || j.DivisionName || '').toLowerCase().trim();
                const isMatch = editableJobs.includes(jName) || (jName && editableJobs.some(ej => ej !== '' && (jName === ej || jName.includes(ej)))) || (userDeptLower && jName.includes(userDeptLower));
                return isMatch && isDescendantOrSelf(j.id || j.ItemID, resolvedLeadJobId);
            });

            // The effective root is either the user's specific job (to hide parents/peers) or the branch lead
            const effectiveRootId = (() => {
                if (!matchesInBranch || matchesInBranch.length === 0) return resolvedLeadJobId;

                // If only one match, it's the root
                if (matchesInBranch.length === 1) return (matchesInBranch[0].id || matchesInBranch[0].ItemID);

                // If multiple matches, find the top-most (shallowest) ones
                const topLevelMatches = matchesInBranch.filter(curr => {
                    // It's a top-level match if none of the OTHER matches are its ancestor
                    return !matchesInBranch.some(other => curr !== other && isDescendantOrSelf(curr.id || curr.ItemID, other.id || other.ItemID));
                });

                if (topLevelMatches.length === 1) return (topLevelMatches[0].id || topLevelMatches[0].ItemID);

                // If multiple top-level matches exist (siblings under the common root), favor the one matching user department
                const deptMatch = topLevelMatches.find(j => {
                    const jName = (j.itemName || j.DivisionName || '').toLowerCase().trim();
                    return jName.includes(userDeptLower) || userDeptLower.includes(jName);
                });

                if (deptMatch) return (deptMatch.id || deptMatch.ID);

                // Fallback: Use the first one
                return (topLevelMatches[0].id || topLevelMatches[0].ItemID);
            })();

            // 3. GENERATE TABS BASED ON ROLE & CONTEXT
            let finalTabs = [];

            // Determine if the effective root is a Lead Job or a Sub-job (Own Job Type)
            const isLeadJobContext = String(effectiveRootId) === String(resolvedLeadJobId);

            if (!isLeadJobContext) {
                // --- SUB-JOB LOGIC: Only parent job as customer name ---
                const currentJob = localJobsList.find(j => String(j.id || j.ItemID || j.ID) === String(effectiveRootId));
                if (currentJob) {
                    const pid = currentJob.parentId || currentJob.ParentID;
                    const parentJob = localJobsList.find(j => String(j.id || j.ItemID || j.ID) === String(pid));
                    if (parentJob) {
                        const pName = parentJob.itemName || parentJob.DivisionName;
                        let quoteNo = null;

                        // Resolve latest quote for this internal parent customer
                        if (existingQuotes.length > 0) {
                            const tabQuotes = existingQuotes.filter(q => {
                                if (normalize(q.ToName || '') !== normalize(pName || '')) return false;
                                return matchDivisionCode(q.QuoteNumber?.split('/')[1]?.toUpperCase(), currentJob.itemName || currentJob.DivisionName, currentJob.divisionCode);
                            });
                            if (tabQuotes.length > 0) {
                                tabQuotes.sort((a, b) => (b.RevisionNo || 0) - (a.RevisionNo || 0));
                                quoteNo = tabQuotes[0].QuoteNumber;
                            }
                        }

                        finalTabs = [{
                            id: 'self',
                            name: pName,
                            label: pName,
                            isSelf: true,
                            realId: currentJob.id || currentJob.ItemID || currentJob.ID, // Pricing context is this sub-job
                            companyLogo: currentJob.companyLogo,
                            companyName: currentJob.companyName,
                            departmentName: currentJob.departmentName,
                            quoteNo: quoteNo
                        }];
                    }
                }
            } else {
                // --- LEAD-JOB LOGIC: Only external customer names ---
                // 1. Identify unique external customers from existing quotes
                const externalNames = [...new Set(existingQuotes
                    .map(q => (q.ToName || '').trim())
                    .filter(name => {
                        if (!name) return false;
                        // Avoid internal project components
                        const isInternal = localJobsList.some(j =>
                            normalize(j.itemName || j.DivisionName) === normalize(name) ||
                            normalize(j.ItemName) === normalize(name) ||
                            normalize(j.itemName || '').includes(normalize(name))
                        );
                        return !isInternal;
                    })
                )];

                // 2. Include current selection if external and not in the quote list yet
                if (toName && !localJobsList.some(j => normalize(j.itemName || j.DivisionName) === normalize(toName))) {
                    if (!externalNames.some(n => normalize(n) === normalize(toName))) {
                        externalNames.push(toName.trim());
                    }
                }

                // 3. Map to tabs
                finalTabs = externalNames.map(name => {
                    let latestQuoteNo = null;
                    const custQuotes = existingQuotes.filter(q => normalize(q.ToName) === normalize(name));
                    if (custQuotes.length > 0) {
                        custQuotes.sort((a, b) => (b.RevisionNo || 0) - (a.RevisionNo || 0));
                        latestQuoteNo = custQuotes[0].QuoteNumber;
                    }

                    return {
                        id: name,
                        name: name,
                        label: name,
                        isExternal: true,
                        isSelf: true, // Lead user "owns" all external quoting contexts
                        realId: effectiveRootId, // Essential for pricing lookup
                        quoteNo: latestQuoteNo
                    };
                });

                // NO 'Own Job' tab for Lead Users as per request ("ONLY external customer name")
            }


            // 4. Final Polish: Sorting
            finalTabs.sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : (a.name || '').localeCompare(b.name || '')));

            // Safety Fix: Ensure 'self' tab exists and is tagged
            if (finalTabs.length > 0 && !finalTabs.some(t => t.isSelf)) {
                finalTabs[0].isSelf = true;
                finalTabs[0].id = 'self';
            }

            return finalTabs;
        } catch (err) {
            console.error('[calculatedTabs] Error:', err);
            return [];
        }
    }, [pricingData, enquiryData, usersList, isAdmin, existingQuotes, toName, matchDivisionCode, jobsPool, currentUser]);

    // Auto-resolve active tabs based on calculated permissions
    useEffect(() => {
        if (calculatedTabs && calculatedTabs.length > 0) {
            // Fix Quote Tab
            const currentQuoteTabValid = calculatedTabs.find(t => String(t.id) === String(activeQuoteTab));
            if (!currentQuoteTabValid) {
                console.log('[AutoRes] Fixing Active Quote Tab:', activeQuoteTab, '->', calculatedTabs[0].id);
                setActiveQuoteTab(calculatedTabs[0].id);
            }


        }
    }, [calculatedTabs, activeQuoteTab]);

    // Sync Company Logo and Details based on Active Pricing Tab
    useEffect(() => {
        if (calculatedTabs && activeQuoteTab) {
            const activeTab = calculatedTabs.find(t => String(t.id) === String(activeQuoteTab));
            if (activeTab) {
                console.log('[QuoteForm] Syncing Logo/Details for Tab:', activeTab.label);
                
                // --- MANDATORY IDENTITY LOCK (Step 4488) ---
                // Prioritize the locked identity in enquiryData if it's been synced
                const personalProfile = enquiryData?.availableProfiles?.find(p => p.isPersonalProfile);
                
                const finalLogo = personalProfile?.logo || activeTab.companyLogo || enquiryData?.enquiryLogo || null;
                const finalCompanyName = personalProfile?.name || activeTab.companyName || activeTab.departmentName || enquiryData?.enquiryCompanyName || 'Almoayyed Air Conditioning';
                
                console.log('[QuoteForm]   - Locked Company:', finalCompanyName);

                setQuoteLogo(finalLogo);
                setQuoteCompanyName(finalCompanyName);

                // Update Footer Details
                const footerSource = personalProfile || activeTab || enquiryData?.companyDetails;
                if (footerSource && (footerSource.address || footerSource.phone || footerSource.email)) {
                    setFooterDetails({
                        name: finalCompanyName,
                        address: footerSource.address,
                        phone: footerSource.phone,
                        fax: footerSource.fax,
                        email: footerSource.email || footerSource.CommonMailIds
                    });
                } else {
                    // Final safety fallback
                    if (personalProfile) setFooterDetails(personalProfile);
                    else setFooterDetails(null);
                }
            }
        }
    }, [activeQuoteTab, calculatedTabs, enquiryData?.availableProfiles]);


    // Ref to track if we've already auto-selected for the current tab (prevents overwriting user manual selection)
    const lastAutoSelectRef = useRef({ tab: null, processed: false });
    // Ref to read current toName without adding it to deps (adding it causes an infinite loop:
    // toName → pricingData load → AutoSelect re-runs → overwrites toName → repeat)
    const toNameRef = useRef(toName);
    useEffect(() => { toNameRef.current = toName; }, [toName]);

    // Auto-select customer based on tab navigation (singleness rule)
    useEffect(() => {
        if (!enquiryData || !pricingData || !activeQuoteTab) return;

        // Reset processed flag if tab OR pricingData changes
        if (lastAutoSelectRef.current.tab !== activeQuoteTab) {
            lastAutoSelectRef.current = { tab: activeQuoteTab, processed: false };
        }

        // Only run logic if not yet processed for this tab
        if (lastAutoSelectRef.current.processed) return;

        // Helper to check hierarchy
        const isDescendantLocal = (childId, parentId) => {
            const hierarchy = enquiryData.divisionsHierarchy || [];
            let current = hierarchy.find(d => String(d.ItemID || d.id) === String(childId));
            while (current) {
                if (String(current.ParentID || current.parentId) === String(parentId)) return true;
                current = hierarchy.find(d => String(d.ItemID || d.id) === String(current.ParentID || current.parentId));
            }
            return false;
        };

        const activeTabObj = (calculatedTabs || []).find(t => String(t.id) === String(activeQuoteTab));
        if (!activeTabObj) return;

        const realId = activeTabObj.realId;
        const currentToName = toNameRef.current; // Read via ref — avoids dep loop
        const allCandidates = (enquiryData.customerOptions || []).map(c => c.trim());

        // Identify customers who have at least one price > 0 for this tab's subtree
        const pricedCustomers = allCandidates.filter(custName => {
            const custKey = normalize(custName);
            const custValues = pricingData.allValues ? pricingData.allValues[custKey] : null;
            if (!custValues) return false;

            return Object.values(custValues).some(v => {
                const vJobId = v.EnquiryForID;
                if (!vJobId) return false;

                const isMatch = String(vJobId) === String(realId) || isDescendantLocal(vJobId, realId);
                return isMatch && parseFloat(v.Price) > 0;
            });
        });

        // NOTE: Auto-selection of toName based on pricing is disabled to ensure manual control and clean slate.
        // The user must manually select a customer even if pricing exists.

        // Mark as processed for this tab so we don't run again until tab changes
        lastAutoSelectRef.current.processed = true;
    }, [activeQuoteTab, pricingData, enquiryData, calculatedTabs]); // toName intentionally excluded — read via ref above



    // NEW: Sync Attention Of (toAttention) whenever toName or enquiryData changes
    // NOTE: toAttention is intentionally NOT in the dep array — adding it blocks manual editing by
    // re-running on every keystroke. We use a ref to track which customer we last resolved for.
    const lastAttentionResolvedForRef = useRef('');
    useEffect(() => {
        if (!toName || !enquiryData) return;

        // Only run once per customer change (prevents re-firing on every keystroke)
        if (lastAttentionResolvedForRef.current === toName) return;
        lastAttentionResolvedForRef.current = toName;

        // --- INTERNAL CUSTOMER DETECTION: Clear fields for internal divisions ---
        const allJobNamesNormSetEffect = new Set(
            (enquiryData?.divisionsHierarchy || []).map(n =>
                (n.itemName || n.DivisionName || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase()
            )
        );
        const toNameClean = toName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase();
        if (allJobNamesNormSetEffect.has(toNameClean)) {
            // Internal customer — clear attention
            setToAttention('');
            return;
        }

        // For external customers: resolve attention from contacts (only auto-fills on customer change)
        const target = normalize(toName);

        // 1. Try Exact Match
        if (enquiryData.customerContacts && enquiryData.customerContacts[toName.trim()]) {
            setToAttention(enquiryData.customerContacts[toName.trim()]);
        }
        else if (enquiryData.customerContacts) {
            const match = Object.keys(enquiryData.customerContacts).find(k => normalize(k) === target);
            if (match) {
                setToAttention(enquiryData.customerContacts[match]);
            }
            // 3. Fallback to global enquiry ReceivedFrom
            else if (enquiryData.enquiry?.ReceivedFrom) {
                setToAttention(enquiryData.enquiry.ReceivedFrom);
            } else {
                setToAttention('');
            }
        }
        else if (enquiryData.enquiry?.ReceivedFrom) {
            setToAttention(enquiryData.enquiry.ReceivedFrom);
        } else {
            setToAttention('');
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toName, enquiryData]); // toAttention intentionally excluded — see note above



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

        // 2. Determine generalized Lead Access (Matches calculatedTabs logic)
        const userDept = (currentUser?.Department || currentUser?.Division || '').trim().toLowerCase();
        const hasLeadAccess = !!pricingData?.access?.hasLeadAccess || ['civil', 'admin', 'bms admin'].includes(userDept);

        // 3. Strict Scope Validation (Based on Active Tab)
        const activeTabObj = (calculatedTabs || []).find(t => String(t.id) === String(activeQuoteTab));

        // If we are on the default tab or tab is not found, allow for Lead Users
        if (!activeTabObj) {
            return hasLeadAccess;
        }

        // If the tab is marked as 'Self' or 'Owned', it's editable by the user
        if (activeTabObj.isSelf) {
            // Further validation for sub-users: they cannot edit tabs they don't have explicit access to
            if (!hasLeadAccess) {
                const targetJob = normalize(activeTabObj.label || activeTabObj.name);
                const allowedJobs = (pricingData?.access?.editableJobs || []).map(j => normalize(j));
                const isAllowed = allowedJobs.some(allowed =>
                    targetJob === allowed || targetJob.includes(allowed) || allowed.includes(targetJob)
                );
                if (!isAllowed) return false;
            }
            return true;
        }

        // 4. Default: No access to Peer or Parent divisions
        return false;
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
        console.log(`[Customer Filter] Lead Job Prefix: ${enquiryData.leadJobPrefix}`);

        // Robust Detection: Match user to a node in the hierarchy
        const userEmailNorm = (currentUser?.EmailId || '').toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
        const userDeptNorm = (currentUser?.Department || '').trim().toLowerCase();
        const editableNames = (pricingData?.access?.editableJobs || []).map(n => String(n).replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase());

        const myNode = (enquiryData.divisionsHierarchy || []).find(n => {
            const mails = [n.commonMailIds, n.ccMailIds].filter(Boolean).join(',').toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com');
            const nodeNameNorm = (n.itemName || n.DivisionName || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase();

            if (userEmailNorm && mails.includes(userEmailNorm)) return true;
            if (editableNames.includes(nodeNameNorm)) return true;

            if (userDeptNorm) {
                if (nodeNameNorm === userDeptNorm) return true;
                if (nodeNameNorm.includes(userDeptNorm) && userDeptNorm.length > 2) return true;
                if (userDeptNorm.includes(nodeNameNorm.replace(' project', '').trim()) && nodeNameNorm.length > 2) return true;
            }
            return false;
        });

        // Determine if we are in Subjob Mode
        const hasParent = myNode && myNode.parentId && myNode.parentId != '0' && myNode.parentId != 0;
        const isSubjobUser = enquiryData.userIsSubjobUser === true || hasParent;

        console.log(`[Customer Filter] Detection: BackendFlag=${enquiryData.userIsSubjobUser}, HasParent=${hasParent}, Final=${isSubjobUser}`);
        if (myNode) console.log(`[Customer Filter] User Matched to Node: ${myNode.itemName}`);

        // 1. Base Options from API
        const rawBase = enquiryData.customerOptions || [];
        const baseOpts = rawBase.map(c => ({ value: c, label: c, type: 'Linked' }));

        // 2. All job names from hierarchy (normalized for strict exclusion/inclusion)
        const pool = jobsPool.length > 0 ? jobsPool : (enquiryData.divisionsHierarchy || []);
        const allJobNamesNormSet = new Set(
            pool.map(n => normalize(n.itemName || n.DivisionName || ''))
        );

        // 3. Pricing Context Customers
        let pricingOpts = [];
        if (pricingData?.customers) {
            pricingOpts = [...pricingOpts, ...pricingData.customers.map(c => ({ value: c, label: c, type: 'Internal Division' }))];
        }
        if (pricingData?.extraCustomers) {
            pricingOpts = [...pricingOpts, ...pricingData.extraCustomers.map(c => ({ value: c, label: c, type: 'Linked' }))];
        }

        // 4. Merge & Deduplicate
        const allOpts = [...baseOpts, ...pricingOpts];
        const uniqueMap = new Map();
        allOpts.forEach(item => {
            if (!item.value) return;
            const key = normalize(item.value);
            if (!uniqueMap.has(key)) uniqueMap.set(key, item);
        });

        // 5. EXTENDED FILTER LOGIC (Dynamic Context based on Tab):
        const activeTabObj = calculatedTabs?.find(t => String(t.id) === String(activeQuoteTab));
        const activeTabRealId = activeTabObj?.realId;
        const currentNode = pool.find(n => String(n.id || n.ItemID) === String(activeTabRealId));

        // MODE DETECTION: Is the currently active tab a Lead Job (root) or a Sub-job?
        const isLeadJob = !currentNode || !currentNode.parentId || currentNode.parentId == '0' || currentNode.parentId == 0;

        console.log('[Customer Filter] All Job Names (Norm):', Array.from(allJobNamesNormSet));
        console.log('[Customer Filter] Current Tab:', activeQuoteTab, 'isLead?', isLeadJob);

        // --- ENHANCEMENT: Strictly ensure parent job exists for sub-jobs ---
        if (!isLeadJob && currentNode) {
            const pid = currentNode.parentId || currentNode.ParentID;
            const parent = pool.find(p => String(p.id || p.ItemID) === String(pid));
            if (parent) {
                const pName = parent.itemName || parent.DivisionName || '';
                const pKey = normalize(pName);
                if (pName && !uniqueMap.has(pKey)) {
                    console.log('[Customer Filter] Injecting missing parent job:', pName);
                    uniqueMap.set(pKey, { value: pName, label: pName, type: 'Internal Division' });
                }
            }
        }

        const uniqueOptions = Array.from(uniqueMap.values());

        const filteredOptions = uniqueOptions.filter(opt => {
            const valNorm = normalize(opt.value);
            const isInternalJob = allJobNamesNormSet.has(valNorm);

            if (isLeadJob) {
                // 1. Lead Job Context: Show ONLY external customers (Strictly reject any internal job names)
                return !isInternalJob;
            } else {
                // 2. Sub-job Context: Show ONLY the immediate parent job as customer
                if (!isInternalJob || !currentNode) return false;

                const parentId = currentNode.parentId || currentNode.ParentID;
                if (parentId && parentId != '0' && parentId != 0) {
                    const parentNode = pool.find(p => String(p.id || p.ItemID) === String(parentId));
                    if (parentNode) {
                        const parentNameNorm = normalize(parentNode.itemName || parentNode.DivisionName || '');
                        return valNorm === parentNameNorm;
                    }
                }
                return false;
            }
        });

        console.log('[Customer Filter] Final Filtered Count:', filteredOptions.length, filteredOptions.map(o => o.value));
        setEnquiryCustomerOptions(filteredOptions);
        console.log('--- [Customer Options Calculation] END ---');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enquiryData?.divisionsHierarchy, enquiryData?.customerOptions, currentUser, pricingData, activeQuoteTab, calculatedTabs, jobsPool]);

    // Clear Customer Name ONLY when switching between Internal and External context
    // This ensures that if we switch from BMS (Internal) to Civil (External), 
    // we don't keep an internal job as the recipient for an external quote.
    useEffect(() => {
        if (!enquiryData || !toName || !enquiryCustomerOptions || enquiryCustomerOptions.length === 0) return;

        // --- PROACTIVE FIX: Check for validity against current strictly filtered options ---
        const isValid = enquiryCustomerOptions.some(opt => normalize(opt.value) === normalize(toName));

        if (!isValid) {
            const valuesEmpty =
                !pricingData ||
                pricingData.values == null ||
                (typeof pricingData.values === 'object' &&
                    !Array.isArray(pricingData.values) &&
                    Object.keys(pricingData.values).length === 0);
            if (valuesEmpty) {
                console.log('[Customer Context Safety] Skipping clear — pricing values empty (avoid dropdown reset during load/merge).');
                return;
            }
            console.log(`[Customer Context Safety] 🚨 Conflict! Selection "${toName}" is not valid for context ${activeQuoteTab}. Clearing.`);
            handleCustomerChange(null);
        }
    }, [enquiryCustomerOptions, toName, activeQuoteTab, enquiryData, pricingData]);



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
            console.log(`[QuoteForm] Rendering Preview Panel context:`, {
                quoteId,
                quoteNumber,
                company: quoteCompanyName,
                div: enquiryData.companyDetails?.divisionCode
            });
            loadPricingData(enquiryData.enquiry.RequestNo, selectedName);
        }
    };

    // New handler for CreatableSelect
    const handleCustomerChange = (selectedOption) => {
        const selectedName = selectedOption ? selectedOption.value : '';
        console.log('[handleCustomerChange] Selected:', selectedName);

        // Only reset if effectively changed (prevents auto-selection from clearing active quote)
        if (normalize(selectedName) === normalize(toName)) {
            console.log('[handleCustomerChange] Customer name unchanged (normalized), skipping reset.');
            return;
        }

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

        // --- INTERNAL CUSTOMER DETECTION ---
        // An internal customer is a job/division name (e.g. "Electrical", "BMS") rather than an external company.
        // For internal customers: keep address/phone/email/attention blank.
        const isInternalOption = selectedOption?.type === 'Internal Division';
        const allJobNamesNormSet = new Set(
            (enquiryData?.divisionsHierarchy || []).map(n =>
                (n.itemName || n.DivisionName || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase()
            )
        );
        const selectedNameClean = selectedName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase();
        const isInternalByName = allJobNamesNormSet.has(selectedNameClean);
        const isInternal = isInternalOption || isInternalByName;

        // Note: Legacy clearing block removed. We now attempt to find details 
        // for internal customers from availableProfiles/jobsPool below.

        // --- EXTERNAL CUSTOMER: Look up contact details ---
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
                const match = Object.keys(enquiryData.customerContacts).find(k => normalize(k) === targetNorm);
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
            setToFax(cust.FaxNo || '');
        } else {
            console.log('[handleCustomerChange] Customer NOT found in Master list');

            // Check if it matches the parsed Enquiry Customer (could be inactive)
            let foundInEnquiry = false;
            if (enquiryData?.customerDetails) {
                const enqCustName = enquiryData.enquiry?.CustomerName || enquiryData.CustomerName || '';
                const enqCustList = enqCustName.split(',').map(c => normalize(c.trim()));

                // Use same normalized check for fallback validity
                if (enqCustList.includes(targetNorm) && enquiryData.customerDetails) {
                    console.log('[handleCustomerChange] Using Enquiry Customer Details fallback (possibly inactive)');
                    const details = enquiryData.customerDetails;
                    const addr = details.Address || [details.Address1, details.Address2].filter(Boolean).join('\n').trim();
                    setToAddress(addr);
                    setToPhone(`${details.Phone1 || ''} ${details.Phone2 ? '/ ' + details.Phone2 : ''} `.trim());
                    setToEmail(details.EmailId || '');
                    setToFax(details.FaxNo || '');
                    foundInEnquiry = true;
                }
            }

            // RELAXED CHECK: Check internal profiles IF no address found yet, 
            // OR if it's an internal-sounding name, even if it's "Linked".
            if (!foundInEnquiry && (toAddress === '' || !isInternal) && enquiryData?.availableProfiles) {
                // Check in internal division profiles
                const profile = enquiryData.availableProfiles.find(p =>
                    p.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim() === selectedName ||
                    normalize(p.itemName) === targetNorm ||
                    normalize(p.name) === targetNorm
                );
                if (profile) {
                    console.log('[handleCustomerChange] ✓ Found internal profile match:', profile.itemName);
                    if (!toAddress) setToAddress(profile.address || '');
                    if (!toPhone) setToPhone(profile.phone || '');
                    if (!toEmail) setToEmail(profile.email || '');
                    if (!toFax) setToFax(profile.fax || '');
                    if (profile.address) foundInEnquiry = true; // Mark found if we got a real address
                }
            }
        }

        // Additional match in jobsPool/pricingData if available (more direct)
        // Check even if Linked, because many root/parent jobs are added to the customer options list
        if (enquiryData) {
            const jobMatch = jobsPool.find(j =>
                normalize(j.itemName || j.DivisionName) === targetNorm ||
                normalize(j.ItemName) === targetNorm
            );
            if (jobMatch) {
                console.log('[handleCustomerChange] Checking direct job match in pool:', jobMatch.itemName);
                // Robust mapping: check multiple possible field names
                const addr = jobMatch.Address || jobMatch.address || '';
                const ph = jobMatch.Phone || jobMatch.phone || jobMatch.PhoneNo || '';
                const fx = jobMatch.FaxNo || jobMatch.fax || jobMatch.Fax || '';
                const em = jobMatch.Email || jobMatch.email || jobMatch.CommonMailIds || '';

                if (addr && !toAddress) setToAddress(addr);
                if (ph && !toPhone) setToPhone(ph);
                if (fx && !toFax) setToFax(fx);
                if (em && !toEmail) setToEmail(em.split(',')[0].trim());
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

                // --- KEY MIGRATION & LEAD JOB ISOLATION (Step 2293 Fix) ---
                // Process Raw Array into Nested Map: [CustomerKey][LeadJobKey][OptionID_JobID] = Value
                const groupedValues = {};
                if (Array.isArray(pData.values)) {
                    pData.values.forEach(v => {
                        const custKey = normalize(v.CustomerName || pData.activeCustomer || 'Main');
                        const leadKey = normalize(v.LeadJobName || 'Legacy');

                        if (!groupedValues[custKey]) groupedValues[custKey] = {};
                        if (!groupedValues[custKey][leadKey]) groupedValues[custKey][leadKey] = {};

                        // Store by ID key (primary)
                        if (v.EnquiryForID) {
                            const idKey = `${v.OptionID}_${v.EnquiryForID}`;
                            groupedValues[custKey][leadKey][idKey] = v;
                        }
                        // Also store by name key (fallback for legacy data or name-based lookups)
                        if (v.EnquiryForItem) {
                            const nameKey = `${v.OptionID}_${v.EnquiryForItem}`;
                            if (!groupedValues[custKey][leadKey][nameKey]) {
                                groupedValues[custKey][leadKey][nameKey] = v;
                            }
                        }
                    });
                }
                pData.allValues = groupedValues;

                // Set effective values for current view (Prioritize Active Lead Job)
                const currentCustKey = normalize(cxName || '');
                const mainKey = normalize('Main');

                const stripJobCustomerPrefix = (s) => String(s || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase();

                /** Align groupedValues top-level key with selected customer (normalize + fuzzy + stripped name). */
                const resolveCustomerSlice = (gv, selectedNameRaw) => {
                    const ac = normalize(pData.activeCustomer || '');
                    const tries = [normalize(selectedNameRaw || ''), ac, mainKey].filter((k, i, a) => k !== '' && a.indexOf(k) === i);
                    for (const k of tries) {
                        if (gv[k] && Object.keys(gv[k]).length > 0) return { resolvedKey: k, slice: gv[k] };
                    }
                    for (const k of tries) {
                        if (gv[k]) return { resolvedKey: k, slice: gv[k] };
                    }
                    const target = normalize(selectedNameRaw || '');
                    for (const top of Object.keys(gv)) {
                        if (normalize(top) === target) return { resolvedKey: top, slice: gv[top] };
                    }
                    const ts = stripJobCustomerPrefix(selectedNameRaw || '');
                    if (ts) {
                        for (const top of Object.keys(gv)) {
                            if (stripJobCustomerPrefix(top) === ts) return { resolvedKey: top, slice: gv[top] };
                        }
                    }
                    return { resolvedKey: tries[0] ?? mainKey, slice: {} };
                };

                const extractLeadIndex = (s) => {
                    const m = String(s || '').match(/\bL\s*(\d+)\b/i);
                    return m ? m[1] : null;
                };

                /** Merge all value rows under this customer whose LeadJobName bucket matches API lead hint / L-code (fixes "l1" vs "l1 hvac"). */
                const mergeLeadBucketsForCustomer = (custBucket, resolvedCustomerKeyForLog) => {
                    const bucket = custBucket || {};
                    const availableLeadBuckets = Object.keys(bucket);
                    const rootJob = (pData.jobs || []).find((j) => !j.parentId || j.parentId === '0' || j.parentId === 0) || (pData.jobs || [])[0];
                    const leadJobCode = rootJob ? String(rootJob.leadJobCode || rootJob.LeadJobCode || '').trim() : '';
                    const activeNorm = normalize(pData.leadJob || '');
                    const codeNorm = normalize(leadJobCode);
                    const targetL = extractLeadIndex(pData.leadJob) || extractLeadIndex(leadJobCode);

                    const matchedKeys = new Set();
                    for (const bk of availableLeadBuckets) {
                        const legacyKey = bk === 'legacy' || bk === normalize('Legacy');
                        if (legacyKey) {
                            matchedKeys.add(bk);
                            continue;
                        }
                        if ((activeNorm && bk === activeNorm) || (codeNorm && bk === codeNorm)) {
                            matchedKeys.add(bk);
                            continue;
                        }
                        const bkL = extractLeadIndex(bk);
                        if (targetL && bkL && bkL === targetL) {
                            matchedKeys.add(bk);
                            continue;
                        }
                        if (activeNorm.length >= 2 && bk.length >= activeNorm.length && bk.startsWith(activeNorm) && (bk.length === activeNorm.length || /\s|-/.test(bk[activeNorm.length]))) {
                            matchedKeys.add(bk);
                            continue;
                        }
                        if (activeNorm.length >= 2 && activeNorm.length >= bk.length && activeNorm.startsWith(bk) && (activeNorm.length === bk.length || /\s|-/.test(activeNorm[bk.length]))) {
                            matchedKeys.add(bk);
                            continue;
                        }
                        if (codeNorm.length >= 1 && codeNorm.length <= 4 && bk.startsWith(codeNorm) && (bk.length === codeNorm.length || /\s|-/.test(bk[codeNorm.length]))) {
                            matchedKeys.add(bk);
                            continue;
                        }
                    }

                    let out = {};
                    matchedKeys.forEach((mk) => Object.assign(out, bucket[mk] || {}));

                    const hadLeadMatch = [...matchedKeys].some((k) => k !== 'legacy' && k !== normalize('Legacy'));
                    const leadMergeEmpty = Object.keys(out).length === 0;
                    if ((!hadLeadMatch || leadMergeEmpty) && availableLeadBuckets.length > 0) {
                        console.log('[Quote loadPricingData] lead bucket fallback: merging ALL lead sub-buckets for customer', resolvedCustomerKeyForLog);
                        out = {};
                        Object.values(bucket).forEach((sub) => {
                            if (sub && typeof sub === 'object' && !Array.isArray(sub)) Object.assign(out, sub);
                        });
                    }

                    console.log('[Quote loadPricingData] customer slice resolved key', resolvedCustomerKeyForLog, 'lead bucket keys', availableLeadBuckets);
                    console.log('available lead buckets', availableLeadBuckets);
                    console.log('selected lead', pData.leadJob);
                    console.log('matched bucket keys', Array.from(matchedKeys).join(', ') || '(none)');

                    return out;
                };

                console.log('[Quote loadPricingData] Object.keys(groupedValues)', Object.keys(groupedValues));
                console.log('[Quote loadPricingData] currentCustKey (normalize cxName)', currentCustKey, 'cxName raw', cxName);

                const getBucket = (selectedNameRaw, label) => {
                    const { resolvedKey, slice } = resolveCustomerSlice(groupedValues, selectedNameRaw);
                    console.log(`[Quote loadPricingData] getBucket(${label}) requested`, normalize(selectedNameRaw || ''), '→ slice key', resolvedKey);
                    console.log('[Quote loadPricingData] Object.keys(groupedValues[resolvedKey] || {})', Object.keys(slice || {}));
                    return mergeLeadBucketsForCustomer(slice, resolvedKey);
                };

                pData.values = {
                    ...getBucket('Main', 'main'),
                    ...getBucket(cxName || '', 'currentCustomer')
                };

                const vk = Object.keys(pData.values || {});
                console.log('[Quote loadPricingData] flat values keys count', vk.length, 'sample', vk.slice(0, 8));

                // --- HIERARCHY STABILITY (Step 1385) ---
                // If the pricing module hasn't identified jobs (e.g. fresh enquiry), 
                // fallback to the Enquiry Divisions Hierarchy so we have IDs and ParentIDs.
                if (!pData.jobs || pData.jobs.length === 0) {
                    console.log('[Pricing Fetch] No jobs from API, falling back to Enquiry Hierarchy');
                    pData.jobs = (enquiryData?.divisionsHierarchy || []).map(d => ({
                        id: d.id || d.ItemID || d.ItemIDVal,
                        parentId: d.parentId || d.ParentID || d.ParentIDVal,
                        itemName: d.itemName || d.DivisionName || d.ItemName,
                        visible: true,
                        editable: true
                    }));
                }

                setPricingData(pData);

                // Calculate Summary
                const summary = [];
                // INITIAL SELECTION: Filter jobs by current branch prefix (Step 2293)
                const branchPrefix = (enquiryData?.leadJobPrefix || '').toUpperCase();
                const jobsPool = pData.jobs || [];

                const activeRoot = branchPrefix ? jobsPool.find(j => {
                    const name = (j.itemName || '').toUpperCase();
                    const clean = name.replace(/^(L\d+\s*-\s*)/, '').trim();
                    return name === branchPrefix || clean === branchPrefix || (j.leadJobCode && j.leadJobCode.toUpperCase() === branchPrefix);
                }) : null;

                let filteredJobs = jobsPool;
                if (activeRoot) {
                    const rootId = String(activeRoot.id);
                    const branchIds = new Set([rootId]);
                    let changed = true;
                    while (changed) {
                        changed = false;
                        jobsPool.forEach(j => {
                            const jId = String(j.id);
                            if (!branchIds.has(jId) && branchIds.has(String(j.parentId))) {
                                branchIds.add(jId);
                                changed = true;
                            }
                        });
                    }
                    filteredJobs = jobsPool.filter(j => branchIds.has(String(j.id)));
                }

                const allJobs = filteredJobs.map(j => j.itemName);
                // Also add Lead Job to selected if it exists and matches branch
                if (pData.leadJob && !allJobs.includes(pData.leadJob)) {
                    const leadNorm = normalize(pData.leadJob);
                    if (!branchPrefix || leadNorm.includes(normalize(branchPrefix))) {
                        allJobs.push(pData.leadJob);
                    }
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
        const normalizeCust = (s) => (s || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

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

        let includedOptionCount = 0;
        const skipReasons = [];

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
        const effectiveScopes = (overrideScope ? [overrideScope] : userScopes).map(s => (s || '').trim().toLowerCase());

        // Provision (Step 1922 Fix): Strictly identify if the user is a "Sub-Job User"
        // They are LIMITED if they have an editable job scope that DOES NOT include the root Lead Job.
        const rootJobs = jobsPool.filter(j => !j.parentId || j.parentId === '0' || j.parentId === 0);
        const hasRootAccess = rootJobs.some(rj => effectiveScopes.some(s => {
            const rName = (rj.itemName || rj.DivisionName || '').trim().toLowerCase();
            return rName === s || rName.includes(s) || s.includes(rName);
        }));

        const userDept = (currentUser?.Department || currentUser?.Division || '').trim().toLowerCase();
        const isStrictlyLimited = userDept && !['civil', 'admin'].includes(userDept) && !isAdmin;

        const hasLimitedAccess = !!overrideScope || isStrictlyLimited || (!data.access?.canEditAll && !hasRootAccess && userScopes.length > 0);

        const allowedQuoteIds = new Set();
        // Use unified jobsPool memo

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
        }

        const groups = {};

        // BRANCH ISOLATION (Step 2293)
        // Identify IDs that belong to the current Lead Job Prefix to avoid branch cross-contamination
        const branchIds = new Set();
        const activeTabObj = (calculatedTabs || []).find(t => String(t.id) === String(activeQuoteTab));
        const branchPrefixRaw = (activeTabObj?.label || activeTabObj?.name || enquiryData?.leadJobPrefix || '').toUpperCase();
        const branchPrefix = branchPrefixRaw.replace(/^(L\d+\s*-\s*)/, '').trim();

        let rootJob = null;
        if (activeTabObj?.realId) {
            rootJob = jobsPool.find(j => String(j.id || j.ItemID || j.ID) === String(activeTabObj.realId));
        } else if (branchPrefix && jobsPool.length > 0) {
            rootJob = jobsPool.find(j => {
                const name = (j.itemName || j.DivisionName || j.ItemName || '').toUpperCase();
                const clean = name.replace(/^(L\d+\s*-\s*)/, '').trim();
                return name === branchPrefix || clean === branchPrefix || name === branchPrefixRaw || clean === branchPrefixRaw || (j.leadJobCode && j.leadJobCode.toUpperCase() === branchPrefix);
            });
        }

        if (rootJob) {
            branchIds.add(String(rootJob.id || rootJob.ItemID || rootJob.ID));
            let changed = true;
            while (changed) {
                changed = false;
                jobsPool.forEach(j => {
                    const jId = String(j.id || j.ItemID || j.ID);
                    const pId = String(j.parentId || j.ParentID || j.ParentID);
                    if (jId && !branchIds.has(jId) && branchIds.has(pId)) {
                        branchIds.add(jId);
                        changed = true;
                    }
                });
            }
        }
        console.log('[calculateSummary] Branch Isolation:', { branchPrefix, branchIds: Array.from(branchIds) });

        // DEDUPLICATE OPTIONS (Step 1560 + Lead Job Fix)
        // Multiple options with the same name/itemName can exist for DIFFERENT lead jobs
        // (e.g. Option-1 for BMS under "Civil Project" lead vs "BMS" lead both stored against customer "Electrical").
        // The active lead job is in enquiryData.leadJobPrefix — we must prefer the option whose
        // leadJobName matches this to ensure the correct OptionID (and thus price) is used.
        // Resolve the actual Lead Job for this branch (Step 825 Fix)
        const actualLeadJob = (() => {
            if (!rootJob) return null;
            let curr = rootJob;
            const selPrefix = (enquiryData?.leadJobPrefix || '').toUpperCase();
            while (curr) {
                const name = (curr.itemName || curr.DivisionName || '').toUpperCase();
                const code = (curr.leadJobCode || curr.LeadJobCode || '').toUpperCase();
                // Match the lead job prefix from header
                if (code === selPrefix || name === selPrefix || (selPrefix && name.startsWith(selPrefix + ' -'))) return curr;
                // If it's a root job (no parent), it's the lead for its branch
                if (!curr.parentId || curr.parentId === '0' || curr.parentId === 0) return curr;
                curr = jobsPool.find(j => String(j.id || j.ItemID) === String(curr.parentId || curr.ParentID));
            }
            return null;
        })();

        const activeLead = actualLeadJob ? normalizeCust(actualLeadJob.itemName || actualLeadJob.DivisionName) : normalizeCust(branchPrefix);
        const activeLeadFull = actualLeadJob ? normalizeCust(actualLeadJob.itemName || actualLeadJob.DivisionName) : normalizeCust(branchPrefixRaw);
        const globalLead = normalizeCust(enquiryData?.leadJobPrefix || '');

        // RESOLVE VALUES FOR ACTIVE CUSTOMER (Step 1612 + 2293 Fix)
        // loadPricingData stores allValues[customerKey][leadKey][optionId_jobId] using normalize() for customer keys.
        // This path used normalizeCust-only lookups → empty buckets while data.values (already merged for the fetch) had the real rows.
        const activeCustKey = normalizeCust(activeCustomer);
        const mainKey = normalizeCust('Main');

        const resolveCustomerBucket = (cKeyRaw) => {
            const av = data.allValues || {};
            if (cKeyRaw === undefined || cKeyRaw === null) return {};
            const tries = [String(cKeyRaw), normalize(cKeyRaw), normalizeCust(cKeyRaw)]
                .filter((k, i, a) => k !== '' && a.indexOf(k) === i);
            for (const k of tries) {
                if (av[k]) return av[k];
            }
            const tNorm = normalize(cKeyRaw);
            const tCust = normalizeCust(cKeyRaw);
            for (const bk of Object.keys(av)) {
                if (normalize(bk) === tNorm || normalizeCust(bk) === tCust) return av[bk];
            }
            return {};
        };

        const getEffectiveBucket = (cKey) => {
            const custBucket = resolveCustomerBucket(cKey);
            const merged = {
                ...(custBucket['legacy'] || {}),
                ...(custBucket[normalize('Legacy')] || {}),
                ...(custBucket[activeLead] || {}),
                ...(custBucket[activeLeadFull] || {}),
                ...(custBucket[globalLead] || {}),
                ...(custBucket[normalize(data.leadJob || '')] || {}),
            };
            if (Object.keys(merged).length === 0 && custBucket && typeof custBucket === 'object') {
                const acc = {};
                Object.values(custBucket).forEach((sub) => {
                    if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
                        Object.assign(acc, sub);
                    }
                });
                return acc;
            }
            return merged;
        };

        const effectiveValuesLookup = {
            ...(data.allValues
                ? {
                    ...getEffectiveBucket(mainKey),
                    ...getEffectiveBucket(activeCustKey),
                    ...getEffectiveBucket(normalize('Main')),
                    ...getEffectiveBucket(normalize(activeCustomer || '')),
                }
                : {}),
            ...(data.values && typeof data.values === 'object' ? data.values : {}),
        };

        const scopedValuesFlat = data.values && typeof data.values === 'object' ? data.values : {};

        const optionHasScopedValueKey = (opt) => {
            const oid = String(opt.id || opt.ID || '');
            if (!oid) return false;
            return Object.keys(scopedValuesFlat).some((k) => k.startsWith(`${oid}_`) || k === oid);
        };

        // Helper to check if an option ID has any non-zero prices in current values
        const hasEffectivePrice = (optId) => {
            const checkVals = (vals) => {
                if (!vals) return false;
                return Object.values(vals).some(v => String(v.OptionID) === String(optId) && parseFloat(v.Price) > 0);
            };

            if (checkVals(scopedValuesFlat)) return true;
            if (checkVals(effectiveValuesLookup)) return true;

            // Also check all job names as potential internal customers
            if (data.allValues) {
                const jobNames = (jobsPool || []).map(j => normalizeCust(j.itemName || j.DivisionName));
                if (jobNames.some(name => checkVals(getEffectiveBucket(name)))) return true;
            }

            return false;
        };


        const uniqueOptions = [];
        const seenOptions = new Set();

        const sortedOptions = [...data.options].sort((a, b) => {
            const aHasPrice = hasEffectivePrice(a.id || a.ID);
            const bHasPrice = hasEffectivePrice(b.id || b.ID);

            const aLeadMatch = activeLead && normalizeCust(a.leadJobName) === activeLead;
            const bLeadMatch = activeLead && normalizeCust(b.leadJobName) === activeLead;

            const aCustMatch = normalizeCust(a.customerName) === normalizeCust(activeCustomer);
            const bCustMatch = normalizeCust(b.customerName) === normalizeCust(activeCustomer);
            if (aHasPrice && !bHasPrice) return -1;
            if (!aHasPrice && bHasPrice) return 1;

            if (aLeadMatch && !bLeadMatch) return -1;
            if (!aLeadMatch && bLeadMatch) return 1;

            if (aCustMatch && !bCustMatch) return -1;
            if (!aCustMatch && bCustMatch) return 1;
            return 0;
        });

        sortedOptions.forEach(opt => {
            const key = `${normalizeCust(opt.name)}_${normalizeCust(opt.itemName)}_${normalizeCust(opt.leadJobName || '')}_${normalizeCust(opt.customerName || '')}`;
            if (!seenOptions.has(key)) {
                uniqueOptions.push(opt);
                seenOptions.add(key);
            }
        });

        uniqueOptions.forEach(opt => {
            // LEAD JOB FILTER
            const optLead = normalizeCust(opt.leadJobName || '');
            const isLeadMatch = !opt.leadJobName || (optLead === activeLead || optLead === activeLeadFull || optLead === globalLead);

            if (opt.leadJobName && !isLeadMatch) {
                const optLeadJob = jobsPool.find(j => normalizeCust(j.itemName || j.DivisionName) === optLead);
                const optLeadId = optLeadJob ? (optLeadJob.id || optLeadJob.ItemID || optLeadJob.ID) : null;

                if (optLeadId && !branchIds.has(optLeadId)) {
                    const rootJobId = rootJob ? String(rootJob.id || rootJob.ItemID || rootJob.ID) : null;
                    const isAncestorOfRoot = (() => {
                        if (!rootJobId) return false;
                        if (rootJobId === optLeadId) return true;
                        let curr = rootJob;
                        while (curr && (curr.parentId || curr.ParentID)) {
                            const pid = String(curr.parentId || curr.ParentID);
                            if (pid === optLeadId) return true;
                            curr = jobsPool.find(pj => String(pj.id || pj.ItemID) === pid);
                        }
                        return false;
                    })();

                    if (!isAncestorOfRoot) {
                        if (import.meta.env.DEV) {
                            skipReasons.push({ name: opt.name, reason: 'branch_mismatch', leadJobName: opt.leadJobName });
                        }
                        console.log(`[calculateSummary] Skipping unrelated branch option "${opt.name}" (leadJobName="${opt.leadJobName}")`);
                        return;
                    }
                }
            }

            // 0. Customer Filter
            const optCust = normalizeCust(opt.customerName);
            const activeCust = normalizeCust(activeCustomer);
            const mainCust = normalizeCust(enquiryData?.customerName || enquiryData?.CustomerName || '');

            const isCustomerMatch = (!activeCust || !opt.customerName || optCust === activeCust || optCust === 'main' || optCust === mainCust || optionHasScopedValueKey(opt) || (() => {
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
                const isExternalCustomer = !jobsPool.some(j => normalizeCust(j.itemName || j.DivisionName) === activeCust);
                if (isExternalCustomer) {
                    const optJob = jobsPool.find(j => normalizeCust(j.itemName || j.DivisionName) === optCust);
                    if (optJob) return true;
                }
                return false;
            })());

            if (!isCustomerMatch) {
                if (import.meta.env.DEV) {
                    skipReasons.push({
                        name: opt.name,
                        reason: 'customer_mismatch',
                        optCustomer: opt.customerName,
                        activeCustomer,
                        hadScopedValueKey: optionHasScopedValueKey(opt),
                    });
                }
                console.log(`[calculateSummary] Filtered out (customer mismatch):`, opt.name, 'opt:', opt.customerName, 'active:', activeCustomer);
                return;
            }
            console.log(`[calculateSummary] Passed customer filter:`, opt.name);

            // 1. Visibility Filter
            let isVisible = false;

            // Resolve Job ID for this option
            const optJob = opt.itemName ? jobsPool.find(j => (j.itemName || j.ItemName || j.DivisionName || '').trim().toLowerCase() === opt.itemName.trim().toLowerCase()) : null;
            const optJobId = optJob ? (optJob.id || optJob.ItemID || optJob.ID) : null;

            // Visibility Logic:
            // 1. Full Access (Lead or Admin) -> Visible
            // 2. Branch Match (isLeadMatch) -> Visible
            // 3. Authorized Scope (allowedQuoteIds) -> Visible
            // 4. Manual Editable/Visible Context Check (Sub-Job Users)
            if ((data.access?.hasLeadAccess && !hasLimitedAccess) || isLeadMatch || (hasLimitedAccess && optJobId && allowedQuoteIds.has(optJobId))) {
                isVisible = true;
                console.log(`[calculateSumary] Visible (authorized scope or branch match):`, opt.name);
            } else if (opt.itemName) {
                // Fallback for sub-job users or cases where ID matching is tricky - check names
                const isEditable = data.access?.editableJobs?.some(scopeName => {
                    const scopeLower = (scopeName || '').trim().toLowerCase();
                    const optLower = (opt.itemName || '').trim().toLowerCase();
                    if (scopeLower === optLower || scopeLower.includes(optLower) || optLower.includes(scopeLower)) return true;
                    if (optJob) {
                        let curr = optJob;
                        while (curr && (curr.parentId || curr.ParentID)) {
                            const pid = String(curr.parentId || curr.ParentID);
                            const parent = jobsPool.find(pj => String(pj.id || pj.ItemID) === pid);
                            if (parent && (parent.itemName || '').trim().toLowerCase() === scopeLower) return true;
                            curr = parent;
                        }
                    }
                    return false;
                });
                const isVisibleJob = data.access?.visibleJobs?.some(scopeName => {
                    const scopeLower = (scopeName || '').trim().toLowerCase();
                    const optLower = (opt.itemName || '').trim().toLowerCase();
                    if (scopeLower === optLower || scopeLower.includes(optLower) || optLower.includes(scopeLower)) return true;
                    if (optJob) {
                        let curr = optJob;
                        while (curr && (curr.parentId || curr.ParentID)) {
                            const pid = String(curr.parentId || curr.ParentID);
                            const parent = jobsPool.find(pj => String(pj.id || pj.ItemID) === pid);
                            if (parent && (parent.itemName || '').trim().toLowerCase() === scopeLower) return true;
                            curr = parent;
                        }
                    }
                    return false;
                });
                isVisible = isEditable || isVisibleJob;
                console.log(`[calculateSumary] Visibility result for "${opt.name}": isEditable=${isEditable}, isVisibleJob=${isVisibleJob}, isVisible=${isVisible}`);
            } else if (!opt.itemName && data.access?.editableJobs?.length > 0) {
                isVisible = true;
                console.log(`[calculateSumary] Visible (no itemName, has editable jobs):`, opt.name);
            }

            if (!isVisible) {
                if (import.meta.env.DEV) {
                    skipReasons.push({ name: opt.name, reason: 'not_visible' });
                }
                console.log(`[calculateSummary] Filtered out (not visible):`, opt.name);
                return;
            }
            console.log(`[calculateSummary] Passed visibility filter:`, opt.name);
            includedOptionCount += 1;

            // Determine if this option's job is currently selected (for Total calculation)
            // If itemName is missing (General), we assume it is included unless specific logic says otherwise
            const isJobIncluded = !opt.itemName || activeJobs.includes(opt.itemName);

            // 2. Calculate Total
            let optionTotal = 0;
            if (data.jobs) {
                data.jobs.forEach(job => {
                    // STRICT SCOPE MATCHING: If option is specific to a job, ONLY sum against that job.
                    // This prevents "Civil Project" option from picking up "Sub Civil Job" values if they share ID or key.
                    if (opt.itemName) {
                        const optNorm = normalizeCust(opt.itemName);
                        const jobNorm = normalizeCust(job.itemName);
                        const isLeadMatch = (opt.itemName === 'Lead Job' && job.isLead);
                        const isSuffixMatch = opt.itemName.endsWith(' / Lead Job') && job.isLead;

                        // If names differ and it's not a generic "Lead Job" option, SKIP.
                        if (optNorm !== jobNorm && !isLeadMatch && !isSuffixMatch) {
                            return;
                        }
                    }

                    // Filter: If Limited Access, skip jobs outside scope
                    // FIX: Ensure editable jobs AND their descendants are visible (Robust Normalized Check) (Step 1310)
                    const normalizeName = (s) => (s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                    const editableNames = (data.access?.editableJobs || []).map(n => normalizeName(n));

                    // BRANCH FILTER: Skip jobs that do not belong to the selected Lead Job branch (Step 2293)
                    const jId = String(job.id || job.ItemID || job.ID);
                    if (branchIds.size > 0 && !branchIds.has(jId)) {
                        return;
                    }

                    const isEditableName = editableNames.includes(normalizeName(job.itemName));

                    const isEditableDescendant = (() => {
                        if (!hasLimitedAccess) return true;

                        // Rule (Step 1922): I can see myself and my children/descendants.
                        // I CANNOT see my parent or parent's parent.
                        const myJobNames = (data.access?.editableJobs || []).map(n => normalizeName(n));
                        const currentJobName = normalizeName(job.itemName);

                        // If current job is an ANCESTOR of any of my scopes, block it.
                        const isStrictParent = (data.access?.editableJobs || []).some(scopeName => {
                            const scopeJob = jobsPool.find(j => normalizeName(j.itemName || j.DivisionName) === normalizeName(scopeName));
                            if (!scopeJob) return false;

                            // Check if job is ancestor of scopeJob
                            let curr = scopeJob;
                            while (curr && (curr.parentId || curr.ParentID)) {
                                const pid = String(curr.parentId || curr.ParentID);
                                if (pid === String(job.id || job.ItemID)) return true;
                                curr = jobsPool.find(p => String(p.id || p.ItemID) === pid);
                            }
                            return false;
                        });
                        if (isStrictParent) return false;

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

                    // Also check allowedQuoteIds (which comes from initial scoping)
                    // But if isEditableName OR isEditableDescendant is true, we allow it.
                    if (hasLimitedAccess && !allowedQuoteIds.has(job.id) && !isEditableName && !isEditableDescendant) {
                        return;
                    }

                    // IMPACT: Resolves 'Hidden Price' (Step 1189) by checking explicit price first.
                    const key = `${opt.id}_${job.id}`;
                    const nameKey = `${opt.id}_${job.itemName}`;
                    let val = effectiveValuesLookup[key] || effectiveValuesLookup[nameKey];
                    let price = val ? parsePrice(val.Price || 0) : 0;

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
                    // IMPORTANT: For Base Price we do NOT auto-copy values from other customers.
                    // Default should remain 0 unless explicitly entered for that customer/job.
                    if (price <= 0 && data.allValues && opt.name !== 'Base Price') {
                        const fallbackCandidates = [];
                        let pId = job.parentId || job.ParentID;
                        while (pId && pId !== '0' && pId !== 0) {
                            const pJob = jobsPool.find(j => (j.id || j.ItemID) === pId);
                            if (pJob) {
                                fallbackCandidates.push((pJob.itemName || pJob.DivisionName).replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim());
                                pId = pJob.parentId || pJob.ParentID;
                            } else break;
                        }
                        jobsPool.forEach(j => {
                            const jName = (j.itemName || j.DivisionName || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                            if (jName && !fallbackCandidates.includes(jName)) fallbackCandidates.push(jName);
                        });
                        fallbackCandidates.push('Main');

                        // Strategy 1: Standard Candidates (Hierarchy, Main)
                        for (const candName of fallbackCandidates) {
                            const candKey = normalizeCust(candName);
                            const vals = getEffectiveBucket(candKey);
                            if (vals && Object.keys(vals).length > 0) {
                                const matchingOpts = data.options
                                    .filter(o => {
                                        const oNameNorm = normalizeCust(o.itemName || '');
                                        const jNameNorm = normalizeCust(job.itemName || '');
                                        return o.name === opt.name && (oNameNorm === jNameNorm || !o.itemName);
                                    })
                                    .sort((a, b) => {
                                        const aLead = normalizeCust(a.leadJobName);
                                        const bLead = normalizeCust(b.leadJobName);
                                        return (aLead === activeLead && bLead !== activeLead) ? -1 : (aLead !== activeLead && bLead === activeLead) ? 1 : 0;
                                    });

                                for (const iOpt of matchingOpts) {
                                    const vKey = `${iOpt.id}_${job.id}`;
                                    const vNameKey = `${iOpt.id}_${job.itemName}`;
                                    const iVal = vals[vKey] || vals[vNameKey];
                                    if (iVal && parsePrice(iVal.Price) > 0) {
                                        price = parsePrice(iVal.Price);
                                        console.log(`[calculateSummary] FALLBACK MATCH for job ${job.itemName}: Found price ${price} using Option ${iOpt.id} from candidate ${candKey}`);
                                        break;
                                    }
                                }
                                if (price > 0) break;
                            }
                        }

                        // Strategy 2: GLOBAL SCAN (Step 1136 FIX) - If still 0, look in ANY customer bucket
                        if (price <= 0) {
                            for (const bucketKey in data.allValues) {
                                const vals = getEffectiveBucket(bucketKey);
                                if (!vals || Object.keys(vals).length === 0) continue;

                                const matchingOpts = data.options
                                    .filter(o => {
                                        const oNameNorm = normalizeCust(o.itemName || '');
                                        const jNameNorm = normalizeCust(job.itemName || '');
                                        return o.name === opt.name && (oNameNorm === jNameNorm || !o.itemName);
                                    })
                                    .sort((a, b) => {
                                        const aLead = normalizeCust(a.leadJobName);
                                        const bLead = normalizeCust(b.leadJobName);
                                        return (aLead === activeLead && bLead !== activeLead) ? -1 : (aLead !== activeLead && bLead === activeLead) ? 1 : 0;
                                    });

                                for (const iOpt of matchingOpts) {
                                    const vKey = `${iOpt.id}_${job.id}`;
                                    const vNameKey = `${iOpt.id}_${job.itemName}`;
                                    const iVal = vals[vKey] || vals[vNameKey];
                                    if (iVal && parsePrice(iVal.Price) > 0) {
                                        price = parsePrice(iVal.Price);
                                        console.log(`[calculateSummary] GLOBAL FALLBACK for job ${job.itemName}: Found price ${price} in bucket ${bucketKey}`);
                                        break;
                                    }
                                }
                                if (price > 0) break;
                            }
                        }
                    }

                    // DISTRIBUTE TO JOB GROUP (Deduplicated Aggregate per Group)
                    const jobGroupName = job.itemName;
                    if (!groups[jobGroupName]) {
                        groups[jobGroupName] = { total: 0, items: [], hasOptional: false };
                    }

                    const existingItem = groups[jobGroupName].items.find(it => it.name === opt.name);
                    if (existingItem) {
                        if (price > existingItem.total) {
                            groups[jobGroupName].total += (price - existingItem.total);
                            existingItem.total = price;
                        }
                    } else {
                        groups[jobGroupName].items.push({ name: opt.name, total: price });
                        groups[jobGroupName].total += price;
                    }

                    if (opt.name === 'Optional' || opt.name === 'Option') {
                        groups[jobGroupName].hasOptional = true;
                        if (opt.name === 'Optional') foundPricedOptional = true;
                    } else if (opt.name === 'Base Price') {
                        const isThisJobActive = activeJobs.length === 0 || activeJobs.includes(job.itemName);
                        if (isThisJobActive && !existingItem) {
                            calculatedGrandTotal += price;
                        }
                    }
                    userHasEnteredPrice = true;
                });
            }
        });

        // POST-PROCESSING: Calculate NET Prices for Parent Jobs
        // If a Parent Job (e.g. Civil) includes the cost of its Children (e.g. Electrical),
        // and both are being displayed in the summary, we must subtract the Child's cost from the Parent
        // to avoid double counting and show the "Net" Parent cost.
        // POST-PROCESSING: Calculate NET Prices for Parent Jobs - DISABLED per User Request (Step 315)
        // User requested that Pricing Module and Quote Module match exactly what was entered.
        // If user enters 200 for Civil, they expect to see 200, regardless of subjobs.
        // if (data.jobs) {
        //     Object.keys(groups).forEach(parentName => {
        //         const parentGroup = groups[parentName];
        //         const parentJob = data.jobs.find(j => j.itemName === parentName);

        //         if (parentJob) {
        //             const children = data.jobs.filter(j => j.parentId === parentJob.id);
        //             children.forEach(childJob => {
        //                 const childGroup = groups[childJob.itemName];
        //                 if (childGroup) {
        //                     const childBase = childGroup.items.find(i => i.name === 'Base Price');
        //                     const parentBase = parentGroup.items.find(i => i.name === 'Base Price');

        //                     if (childBase && parentBase) {
        //                         // console.log(`[calculateSummary] Adjusting Net Price: ${parentName} (${parentBase.total}) - ${childJob.itemName} (${childBase.total})`);
        //                         // parentBase.total = Math.max(0, parentBase.total - childBase.total);
        //                         // parentGroup.total = Math.max(0, parentGroup.total - childBase.total);
        //                     }
        //                 }
        //             });
        //         }
        //     });
        // }

        // Flatten to summary array
        Object.keys(groups).forEach(name => {
            summary.push({ name: name, ...groups[name] });
        });

        // Sort by Hierarchy (Lead Job -> Sub Job -> ...)
        if (data.jobs && data.jobs.length > 0) {
            const jobs = data.jobs;

            // Build Adjacency List for Hierarchy with String IDs
            const childrenMap = {};
            const allIds = new Set(jobs.map(j => String(j.id || j.ID)));
            const roots = [];

            jobs.forEach(j => {
                const pIdRaw = j.parentId || j.ParentID;
                const pId = pIdRaw ? String(pIdRaw) : null;
                const jId = String(j.id || j.ID);

                // Determine if root: No parent, parent is 0, or parent ID not in list
                if (!pId || pId === '0' || !allIds.has(pId)) {
                    roots.push(j);
                } else {
                    if (!childrenMap[pId]) childrenMap[pId] = [];
                    childrenMap[pId].push(j);
                }
            });

            // Recursive Flatten to get Ordered Names
            const orderedNames = [];
            const traverse = (job) => {
                orderedNames.push(job.itemName);
                const jId = String(job.id || job.ID);
                if (childrenMap[jId]) {
                    // Sort siblings by name to ensure consistent sub-ordering
                    childrenMap[jId].sort((a, b) => (a.itemName || '').localeCompare(b.itemName || ''));
                    childrenMap[jId].forEach(child => traverse(child));
                }
            };

            // Sort roots: Priority to Lead Job Code (L1, L2...), then Alpha
            roots.sort((a, b) => {
                const codeA = a.leadJobCode || '';
                const codeB = b.leadJobCode || '';

                // Extract numeric L-code if present
                const matchA = codeA.match(/^L(\d+)$/i);
                const matchB = codeB.match(/^L(\d+)$/i);

                if (matchA && matchB) {
                    return parseInt(matchA[1], 10) - parseInt(matchB[1], 10);
                }
                if (matchA) return -1; // A has code, comes first
                if (matchB) return 1;  // B has code, comes first

                // Fallback: Use Item Name if no code (or both no code)
                return (a.itemName || '').localeCompare(b.itemName || '');
            });
            roots.forEach(root => traverse(root));

            // Apply Sort to Summary
            summary.sort((a, b) => {
                const nameA = (a.name || '').trim();
                const nameB = (b.name || '').trim();

                const idxA = orderedNames.findIndex(n => n.trim() === nameA);
                const idxB = orderedNames.findIndex(n => n.trim() === nameB);

                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1; // A is in hierarchy, comes first
                if (idxB !== -1) return 1;  // B is in hierarchy, comes first
                return nameA.localeCompare(nameB); // Fallback: Alpha
            });
        } else {
            summary.sort((a, b) => a.name.localeCompare(b.name));
        }

        setHasUserPricing(userHasEnteredPrice);
        setGrandTotal(calculatedGrandTotal);
        setHasPricedOptional(foundPricedOptional);
        // setPricingSummary(summary); // Moved to end of function to avoid duplicate updates

        if (import.meta.env.DEV) {
            console.log('[calculateSummary] effectiveValuesLookup keys:', Object.keys(effectiveValuesLookup).length, 'scoped data.values keys:', Object.keys(scopedValuesFlat).length);
            console.log('[calculateSummary] included options (post filters):', includedOptionCount, 'unique option rows:', uniqueOptions.length, 'skipReasons (sample):', skipReasons.slice(0, 20));
        }
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

            // INDIVIDUAL TOTALS REMOVED (Step 871 Fix)
            /*
            if (grp.items.length > 1) {
                tableHtml += `<tr><td style="padding:10px; border:1px solid #cbd5e1; text-align:right; font-weight:600;">Total ${cleanedName}</td><td style="padding:10px; border:1px solid #cbd5e1; text-align:right; font-weight:600;">BD ${grp.total.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td></tr>`;
            }
            */

            // Accumulate filtered total (Base Price Only for Grand Total)
            grp.items.forEach(item => {
                if (item.name === 'Base Price') {
                    htmlGrandTotal += item.total;
                }
            });
        });

        if (htmlGrandTotal > 0) {
            tableHtml += `<tr style="background:#f8fafc; font-weight:700;"><td style="padding:10px; border:1px solid #cbd5e1; text-align:right;">Grand Total (Base Price)</td><td style="padding:10px; border:1px solid #cbd5e1; text-align:right;">BD ${htmlGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td></tr>`;
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
                const listRes = await fetch(`${API_BASE}/api/quotes/config/templates`);
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

        // Removed restrictive view block to allow parent job users to view their subjob quotes
        // edit permissions are strictly handled by the canEdit() check on Save/Revise buttons.

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
        setToFax(quote.ToFax || '');

        // Auto-fill missing details for internal customers if they are blank in the saved quote
        if (!quote.ToAddress && enquiryData?.availableProfiles) {
            const profile = enquiryData.availableProfiles.find(p =>
                p.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim() === (quote.ToName || '').trim() ||
                (p.name && p.name.trim() === (quote.ToName || '').trim())
            );
            if (profile) {
                console.log('[loadQuote] Healing missing address from internal profile:', profile.itemName);
                if (!quote.ToAddress) setToAddress(profile.address || '');
                if (!quote.ToPhone) setToPhone(profile.phone || '');
                if (!quote.ToFax) setToFax(profile.fax || '');
                if (!quote.ToEmail) setToEmail(profile.email || '');
            }
        }

        // Set Attention Of (Prioritize saved value, fallback to Enquiry logic)
        if (quote.ToAttention) {
            setToAttention(quote.ToAttention);
        } else if (quote.ToName && enquiryData?.customerContacts) {
            const contact = enquiryData.customerContacts[quote.ToName.trim()];
            if (contact) {
                setToAttention(contact);
            } else {
                setToAttention(enquiryData?.enquiry?.ReceivedFrom || '');
            }
        } else {
            setToAttention(enquiryData?.enquiry?.ReceivedFrom || '');
        }

        // Always use Company Details for Footer, never the Customer (recipient) details
        // PROACTIVE FIX (Step 4488): Use the resolved profile if available in enquiryData (User-specific)
        const personalProfile = enquiryData?.availableProfiles?.find(p => p.isPersonalProfile);
        const resolvedProfile = personalProfile || enquiryData?.companyDetails;

        if (resolvedProfile) {
            setFooterDetails(resolvedProfile);
            setQuoteCompanyName(resolvedProfile.name);
            setQuoteLogo(resolvedProfile.logo);
        } else {
            // Fallback default
            setFooterDetails({
                name: 'Almoayyed Contracting',
                address: 'P.O. Box 32232, Manama, Kingdom of Bahrain',
                phone: '(+973) 17 400 407',
                fax: '(+973) 17 400 396',
                email: 'bms@almcg.com'
            });
            setQuoteCompanyName('Almoayyed Contracting');
            setQuoteLogo(null);
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
        setPendingFiles([]); // Clear any pending files from previous session
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

        const activeTabObj = calculatedTabs.find(t => String(t.id) === String(activeQuoteTab));
        if (!activeTabObj) return;

        const activeTabRealId = activeTabObj.realId;
        // Use global jobsPool memo (Step 1240)

        console.log('[AutoLoad] Checking quotes for tab:', activeTabObj.label, 'ID:', activeTabRealId);

        // Filter quotes for this tab (Replicating render logic)
        // Robust resolution of lead code for filtering (Walking up to root L-code)
        const currentLeadCode = (() => {
            // PRIORITY 1: Resolve via explicit selectedLeadId (Stable and Robust)
            if (selectedLeadId && pricingData?.jobs) {
                const root = pricingData.jobs.find(j => String(j.id || j.ItemID) === String(selectedLeadId));
                if (root) {
                    const rCode = (root.leadJobCode || root.LeadJobCode || '').toUpperCase();
                    // Prefer L-tag extraction (Step 2660 Fix)
                    if (rCode.match(/L\d+/)) return rCode.match(/L\d+/)[0];
                    if (rCode && rCode.match(/^L\d+/)) return rCode.split('-')[0].trim();
                    if (root.itemName?.toUpperCase().match(/L\d+/)) return root.itemName.toUpperCase().match(/L\d+/)[0];

                    // Fallback to searching up from the current leadId to find the true root
                    let searchRoot = root;
                    let safety = 0;
                    while (searchRoot && searchRoot.parentId && searchRoot.parentId !== '0' && searchRoot.parentId !== 0 && safety < 10) {
                        const parent = pricingData.jobs.find(p => String(p.id || p.ItemID) === String(searchRoot.parentId));
                        if (parent) searchRoot = parent;
                        else break;
                        safety++;
                    }
                    const sCode = (searchRoot.leadJobCode || searchRoot.LeadJobCode || '').toUpperCase();
                    if (sCode.match(/L\d+/)) return sCode.match(/L\d+/)[0];
                    if (searchRoot.itemName?.toUpperCase().match(/L\d+/)) return searchRoot.itemName.toUpperCase().match(/L\d+/)[0];
                }
            }

            // FALLBACK 2: Use established leadJobPrefix
            const prefix = (enquiryData?.leadJobPrefix || '').toUpperCase();
            if (!prefix) return '';
            if (prefix.match(/L\d+/)) return prefix.match(/L\d+/)[0];

            // Find item in pool and walk up
            let job = jobsPool.find(j => {
                const name = (j.itemName || j.DivisionName || j.ItemName || '').toUpperCase();
                const clean = name.replace(/^(L\d+\s*-\s*)/, '').trim();
                return name === prefix || clean === prefix || (j.leadJobCode && j.leadJobCode.toUpperCase() === prefix);
            });

            if (job) {
                let root = job;
                let safety = 0;
                while (root && root.parentId && root.parentId !== '0' && root.parentId !== 0 && safety < 10) {
                    const parent = jobsPool.find(p => String(p.id || p.ItemID) === String(root.parentId));
                    if (parent) root = parent;
                    else break;
                    safety++;
                }
                const foundCode = (root.leadJobCode || root.LeadJobCode || '').toUpperCase();
                if (foundCode.match(/L\d+/)) return foundCode.match(/L\d+/)[0];
                return prefix;
            }
            return prefix;
        })();

        const tabQuotes = existingQuotes.filter(q => {
            // Priority 1: OwnJob Match (The specific branch/tab this quote belongs to)
            const quoteOwnJob = (q.OwnJob || '').trim().toLowerCase();
            const tabJobName = (activeTabObj.label || '').trim().toLowerCase();

            const isTabMatch = quoteOwnJob === tabJobName ||
                (activeTabRealId && String(q.DepartmentID) === String(activeTabRealId));

            if (!isTabMatch) return false;

            // Priority 2: Customer Match (Normalized)
            const normalizedQuoteTo = normalize(q.ToName || '');
            const normalizedCurrentTo = normalize(toName || '');

            const isExactMatch = normalizedCurrentTo && normalizedQuoteTo === normalizedCurrentTo;
            const qJobObjByOwnJob = jobsPool.find(j => (j.itemName === q.OwnJob) || (j.ItemName === q.OwnJob));
            const isSelfMatch = normalize(qJobObjByOwnJob?.itemName || '') === normalizedCurrentTo;

            // Ancestor match for internal quoting
            const isAncestorMatch = (() => {
                const tabJob = jobsPool.find(j => String(j.id || j.ItemID || j.ID) === String(activeTabRealId));
                if (!tabJob) return false;
                let curr = tabJob;
                let safety = 0;
                let visited = new Set();
                while (curr && (curr.parentId || curr.ParentID) && safety < 20) {
                    const pId = String(curr.parentId || curr.ParentID);
                    if (visited.has(pId)) break;
                    visited.add(pId);
                    const p = jobsPool.find(pj => String(pj.id || pj.ItemID) === pId);
                    if (!p) break;
                    const pNameNorm = normalize(p.itemName || '');
                    if (pNameNorm === normalizedCurrentTo) return true;
                    curr = p;
                    safety++;
                }
                return false;
            })();

            if (!isExactMatch && !isAncestorMatch && !isSelfMatch) {
                console.log(`[AutoLoad] REJECTED: Customer mismatch. q:${normalizedQuoteTo} vs cur:${normalizedCurrentTo}`);
                return false;
            }

            // Priority 3: Division Code verification
            const parts = q.QuoteNumber?.split('/') || [];
            const qDivCode = parts[1]?.toUpperCase();
            const tabName = (activeTabObj.label || '').toUpperCase();
            const isTypeMatch = matchDivisionCode(qDivCode, tabName, activeTabObj.divisionCode);

            if (!isTypeMatch) {
                console.log(`[AutoLoad] REJECTED: Type mismatch. qDiv:${qDivCode} vs tabName:${tabName}`);
                return false;
            }

            return true;
        });

        if (tabQuotes.length > 0) {
            // Found quotes: Sort by Revision (Desc) and Load Latest
            const sorted = tabQuotes.sort((a, b) => b.RevisionNo - a.RevisionNo);
            const latest = sorted[0];

            // Only load if different (using closure's quoteId)
            if (quoteId !== latest.ID) {
                console.log('[AutoLoad] Loading latest quote:', latest.QuoteNumber, 'for branch:', currentLeadCode);
                loadQuote(latest);
            }
        } else {
            console.log('[AutoLoad] No quotes found for tab. Branch:', currentLeadCode);
            // SAFEGUARD: Don't clear if we just saved/revised or if it's already null
            // Check if the current quoteId is actually a valid quote that just hasn't been synced to existingQuotes properly
            const isJustSaved = existingQuotes.some(q => q.ID === quoteId && q.QuoteNumber === quoteNumber);

            if (quoteId !== null && !isJustSaved) {
                console.log('[AutoLoad] Resetting to blank form as no saved quotes match current tab/customer.');
                setQuoteId(null);
                setQuoteNumber('');
                setClauseContent(defaultClauses);
                setClauses({
                    showScopeOfWork: true, showBasisOfOffer: true, showExclusions: true,
                    showPricingTerms: true, showSchedule: true, showWarranty: true,
                    showResponsibilityMatrix: true, showTermsConditions: true, showAcceptance: true, showBillOfQuantity: true
                });
                setQuoteDate(new Date().toISOString().split('T')[0]);
                setValidityDays(30);
                setSubject(enquiryData?.enquiry?.ProjectName ? `Proposal for ${enquiryData.enquiry.ProjectName}` : '');
                setCustomerReference(enquiryData?.enquiry?.CustomerRefNo || enquiryData?.enquiry?.RequestNo || '');
            }

            // ALWAYS recalculate summary when switching tabs to ensure the sidebar summary matches the active branch,
            // even if no previous quote was found to load.
            if (pricingData) {
                console.log('[AutoLoad] Recalculating summary for branch-specific view on tab:', activeQuoteTab);
                calculateSummary(pricingData, selectedJobs, toName);
            }
        }
    }, [activeQuoteTab, calculatedTabs, existingQuotes, toName, selectedLeadId, pricingData, enquiryData]);



    // Generic Mandatory Field Validation
    const validateMandatoryFields = useCallback(() => {
        const missingFields = [];
        if (!quoteDate) missingFields.push('Quote Date');
        if (!validityDays || validityDays <= 0) missingFields.push('Validity (Days)');
        if (!toAttention || !toAttention.trim()) missingFields.push('Attention of');
        if (!subject || !subject.trim()) missingFields.push('Subject');
        if (!preparedBy || !preparedBy.trim()) missingFields.push('Prepared By');
        if (!signatory || !signatory.trim()) missingFields.push('Signatory');
        if (!customerReference || !customerReference.trim()) missingFields.push('Customer Reference');

        // Check for future date
        if (quoteDate) {
            const today = new Date();
            today.setHours(23, 59, 59, 999); // Allow today full
            if (new Date(quoteDate) > today) {
                missingFields.push('Quote Date (Future dates not allowed)');
            }
        }

        if (missingFields.length > 0) {
            alert(`Please fill the following mandatory fields before proceeding:\n\n• ${missingFields.join('\n• ')}`);
            return false;
        }
        return true;
    }, [quoteDate, validityDays, toAttention, subject, preparedBy, signatory, customerReference]);

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

                // Update local quotes list immediately so AutoLoad doesn't reset to Draft (Step 4488 FIX)
                setExistingQuotes(prev => [
                    ...prev,
                    {
                        ID: data.id,
                        QuoteNumber: data.quoteNumber,
                        ToName: toName,
                        RevisionNo: data.revisionNo || 0,
                        Status: 'Saved',
                        QuoteDate: quoteDate,
                        PreparedBy: preparedBy,
                        TotalAmount: grandTotal,
                        OwnJob: payload.ownJob, // CRITICAL for AutoLoad matching
                        LeadJob: payload.leadJob  // CRITICAL for AutoLoad matching
                    }
                ]);

                // Note: Metadata is NOT cleared anymore to allow immediate viewing/working with the new revision.
                // Re-calculating existing quotes will pull the latest list.


                // Wait a moment for DB commit, then refresh the quotes list
                console.log('[handleRevise] Waiting 500ms for DB commit...');
                await new Promise(resolve => setTimeout(resolve, 500));

                console.log('[handleRevise] Refreshing quotes list...');
                await fetchExistingQuotes(enquiryData.enquiry.RequestNo);

                // Upload any pending files now that we have a new Revision ID
                if (pendingFiles.length > 0) {
                    console.log('[handleRevise] Uploading pending files to new revision...', pendingFiles.length);
                    await uploadFiles(pendingFiles, data.id);
                    setPendingFiles([]); // Clear queue
                }

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
                quotes.forEach(q => console.log('  -', q.QuoteNumber, '| To:', q.ToName, '| OwnJob:', q.OwnJob, '| IdentityCode:', q.IdentityCode));
                setExistingQuotes(quotes);
            } else {
                console.error('[fetchExistingQuotes] Failed to fetch, status:', res.status);
            }
        } catch (err) {
            console.error('[fetchExistingQuotes] Error:', err);
        }
    }, []);

    // NEW: Auto-load latest revision for selected customer and lead job


    const handleSelectEnquiry = async (enq) => {
        setSearchTerm(enq.RequestNo);
        setSuggestions([]);
        setShowSuggestions(false);
        setLoading(true);
        setPricingData(null); // Reset pricing data to clear stale access rights
        setExistingQuotes([]);
        setPendingFiles([]); // Clear queue
        setToName('');
        setToAddress('');
        setToPhone('');
        setToEmail('');
        setToAttention('');
        setPreparedBy('');
        setSignatory('');
        setSignatoryDesignation('');
        setQuoteId(null);
        setQuoteNumber('');
        setSelectedLeadId(null);

        // --- LOCKED LOGIC: Clear Tab State Registry on New Enquiry ---
        tabStateRegistry.current = {};

        try {
            const userEmail = currentUser?.EmailId || '';
            const res = await fetch(`${API_BASE}/api/quotes/enquiry-data/${encodeURIComponent(enq.RequestNo)}?userEmail=${encodeURIComponent(userEmail)}`);
            if (res.ok) {
                const data = await res.json();
                setEnquiryData(data);
                fetchExistingQuotes(enq.RequestNo);

                // Fetch Pricing Data (even without customer) to get initial Access Rights & Hierarchy
                loadPricingData(enq.RequestNo, '');

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
                    console.log(`[Profile selection] User Dept: ${userDept}. Available profiles:`, data.availableProfiles.map(p => p.itemName));

                    // 1. Try to find an EXACT match for User Dept (Trimmed and Case-Insensitive)
                    const normalizedDept = userDept.trim().toLowerCase();
                    selectedProfile = data.availableProfiles.find(p => {
                        const pItemName = (p.itemName || '').trim().toLowerCase();
                        const pName = (p.name || '').trim().toLowerCase();
                        return pItemName === normalizedDept || pName === normalizedDept;
                    });

                    // 2. Try Heuristic Matches if no exact match
                    if (!selectedProfile) {
                        if (userDept.toLowerCase().includes('civil')) {
                            selectedProfile = data.availableProfiles.find(p =>
                                p.itemName?.toLowerCase().includes('civil') ||
                                p.code === 'ACC' ||
                                p.divisionCode === 'CVLP'
                            );
                        } else if (userDept.toLowerCase().includes('bms')) {
                            selectedProfile = data.availableProfiles.find(p =>
                                (p.itemName && p.itemName.toLowerCase().includes('bms')) ||
                                p.divisionCode === 'BMS' ||
                                p.divisionCode === 'BMP' ||
                                (p.name && p.name.toLowerCase().includes('bms'))
                            );
                        } else if (userDept.toLowerCase().includes('hv') || userDept.toLowerCase().includes('condition')) {
                            selectedProfile = data.availableProfiles.find(p =>
                                (p.itemName && (p.itemName.toLowerCase().includes('hv') || p.itemName.toLowerCase().includes('condition'))) ||
                                p.divisionCode === 'HVP' || p.divisionCode === 'AMM'
                            );
                        } else if (userDept.toLowerCase().includes('mep')) {
                            selectedProfile = data.availableProfiles.find(p =>
                                p.divisionCode === 'AAC' || p.divisionCode === 'ELP' || p.divisionCode === 'PLP'
                            );
                        }
                    }

                    // 3. Last Resort: Any personal profile if none matched above
                    if (!selectedProfile) {
                        selectedProfile = data.availableProfiles.find(p => p.isPersonalProfile);
                    }
                }

                // --- MANDATORY IDENTITY OVERRIDE (Step 4488) ---
                // "right side header company logo and footer comany address details should be based on current user's mail ID"
                // ALWAYS PRIORITIZE PERSONAL PROFILE FOR ENFORCED BRANDING
                const personalProfile = data.availableProfiles.find(p => p.isPersonalProfile);
                if (personalProfile) {
                    selectedProfile = personalProfile;
                    console.log(`[Profile selection] ✓ ENFORCING personal identity: ${selectedProfile.name}`);
                }

                if (selectedProfile) {
                    console.log(`[Profile selection] ENFORCING user profile: "${userDept}" ->`, selectedProfile);
                    setQuoteCompanyName(selectedProfile.name);
                    setQuoteLogo(selectedProfile.logo);
                    setFooterDetails(selectedProfile);

                    // Update the master enquiryData object to ensure payload generation uses these codes
                    data.companyDetails = { ...selectedProfile, isPersonalProfile: true };
                    // Explicitly set the logo/footer in the data object too as fallback
                    data.enquiryLogo = selectedProfile.logo;
                    data.enquiryCompanyName = selectedProfile.name;

                    setEnquiryData({ ...data });
                } else if (data.companyDetails) {
                    setQuoteCompanyName(data.companyDetails.name);
                    setQuoteLogo(data.companyDetails.logo);
                    setFooterDetails(data.companyDetails);
                    console.log(`[Profile selection] No specific user profile, using default identity: ${data.companyDetails.divisionCode}`);
                }

                // 3a. Auto-Select Lead Job
                console.log('[QuoteForm] Auto-Select Lead Job - divisions:', data.divisions);
                console.log('[QuoteForm] Auto-Select Lead Job - divisionsHierarchy:', data.divisionsHierarchy);

                // Use divisions if available, otherwise extract from divisionsHierarchy
                let availableDivisions = data.divisions || [];

                if (availableDivisions.length === 0 && data.divisionsHierarchy && data.divisionsHierarchy.length > 0) {
                    // Use ALL nodes in hierarchy as potential Lead Job context
                    availableDivisions = data.divisionsHierarchy.map(r => r.itemName || r.DivisionName);
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

                // Signatory and Prepared By calculations moved to Signatory state
                // Customer options are handled by the useEffect for consistency


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
                setValidityDays(30);
                setPreparedBy(currentUser?.FullName || currentUser?.name || '');
                setSignatory('');
                setSignatoryDesignation('');

                setCustomerReference(data.enquiry.CustomerRefNo || data.enquiry.RequestNo || ''); // Default to Cust Ref or Enquiry No
                setSubject(`Proposal for ${data.enquiry.ProjectName}`);

                // Reset Customer Selection to ensure a clean slate (User must select manually)
                const defaultCustomer = '';
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
                        const enqCustList = enqCustName.split(',').map(c => normalize(c.trim()));

                        // Check if the selected target is in the enquiry's customer list
                        if (enqCustList.includes(target) && data.customerDetails) {
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
                    setToName('');
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


                // System defaults for Prepared By / Signatory removed per User request Step 1440
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

    const uploadFiles = useCallback(async (files, targetQuoteId) => {
        // If targetQuoteId is EXPLICITLY passed (e.g. from Save/Revise), we upload.
        // If it is NOT passed, we use component's quoteId and DECIDE whether to upload.
        // Rule: If we have ANY quoteId (Saved State), we queue files to pending so they go to the NEXT Revise/Save.
        const isInternalCall = targetQuoteId !== undefined;
        const effectiveId = isInternalCall ? targetQuoteId : quoteId;

        if (!effectiveId || (!isInternalCall && quoteId)) {
            // New Behavior: Queue files as pending until saved (Fresh Quote or Revision required)
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
        // --- LOCKED LOGIC: Clear Tab State Registry on Reset ---
        tabStateRegistry.current = {};
        setExistingQuotes([]);
        setPendingFiles([]); // Clear queue
        setExpandedGroups({});
        setSearchTerm('');
        setSuggestions([]);
        setShowSuggestions(false);
        setEnquiryData(null);
        setPricingData(null);

        // Reset all metadata and clauses
        resetFormState();
        setQuoteCompanyName('Almoayyed Air Conditioning');
        setQuoteLogo(null);
        setCompanyProfiles([]);
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
        // --- LOGGED-IN USER DRIVEN CODE RESOLUTION (Step 4488 FIX) ---
        // 1. STICK TO USER'S OWN IDENTITY: Find the profile the server matched to this user's email
        let personalProfile = (enquiryData?.availableProfiles || []).find(p => p.isPersonalProfile);

        let effectiveDivisionCode;
        let effectiveDeptCode;
        let identitySource = 'Default'; // Track source for logging

        // 2. Fallback: Lookup by Department Name if server flag is missing but we have the name
        const userDept = (currentUser?.Department || '').trim();
        if (!personalProfile && userDept) {
            personalProfile = (enquiryData?.availableProfiles || []).find(p => {
                const pItem = (p.itemName || '').trim().toLowerCase();
                const pName = (p.name || '').trim().toLowerCase();
                const uDept = userDept.toLowerCase();
                return pItem === uDept || pName === uDept ||
                    (uDept.includes('bms') && (pItem.includes('bms') || pName.includes('bms')));
            });
            if (personalProfile) {
                identitySource = `MatchedByDeptName(${userDept})`;
            }
        }

        // 3. Fallback: Absolute hard-override for BMS users (Requested by User)
        if (!personalProfile && userDept.toUpperCase().includes('BMS')) {
            console.log('[getQuotePayload] HARD OVERRIDE: BMS user detected, forcing AAC/BMP identity');
            effectiveDivisionCode = 'BMP';
            effectiveDeptCode = 'AAC';
            identitySource = 'BMSHardOverride';
        } else {
            // Default assignment if no personal profile or BMS override
            effectiveDivisionCode = personalProfile ? personalProfile.divisionCode : (enquiryData.companyDetails?.divisionCode || 'AAC');
            effectiveDeptCode = personalProfile ? personalProfile.departmentCode : (enquiryData.companyDetails?.departmentCode || 'AAC');
            if (personalProfile && identitySource === 'Default') identitySource = 'PersonalProfile';
            else if (!personalProfile && identitySource === 'Default') identitySource = 'EnquiryCompanyDetails';
        }

        if (customDivisionCode) {
            effectiveDivisionCode = customDivisionCode;
            identitySource = `CustomDivisionCode(${customDivisionCode})`;
        }

        console.log(`[getQuotePayload] Final Identity: Dept=${effectiveDeptCode}, Div=${effectiveDivisionCode} (Source: ${identitySource})`);

        return {
            divisionCode: effectiveDivisionCode,
            departmentCode: effectiveDeptCode,

            leadJobPrefix: (() => {
                // PRIORITY 1: Resolve based on current interactive selection
                if (selectedLeadId && pricingData?.jobs) {
                    const node = pricingData.jobs.find(j => String(j.id || j.ItemID) === String(selectedLeadId));
                    if (node) {
                        let root = node;
                        let safe = 0;
                        let vis = new Set();
                        while (root && (root.parentId || root.ParentID) && (root.parentId || root.ParentID) !== '0' && (root.parentId || root.ParentID) !== 0 && safe < 20) {
                            if (vis.has(String(root.id || root.ItemID))) break;
                            vis.add(String(root.id || root.ItemID));
                            const pId = String(root.parentId || root.ParentID);
                            const p = pricingData.jobs.find(pj => String(pj.id || pj.ItemID) === pId);
                            if (p) root = p;
                            else break;
                            safe++;
                        }
                        const rCode = (root.leadJobCode || root.LeadJobCode || '').toUpperCase();
                        if (rCode && rCode.match(/^L\d+/)) return rCode.split('-')[0].trim();
                        if (root.itemName?.toUpperCase().match(/^L\d+/)) return root.itemName.split('-')[0].trim().toUpperCase();
                    }
                }

                // FALLBACK: Original logic using enquiryData.leadJobPrefix
                const curr = enquiryData.leadJobPrefix || '';
                if (!curr) return '';
                if (curr.match(/^L\d+/)) return curr.split('-')[0].trim();

                const hierarchy = enquiryData.divisionsHierarchy || [];
                const normalize = s => (s || '').toLowerCase().trim();
                const target = normalize(curr);

                const node = hierarchy.find(d => {
                    const name = normalize(d.itemName);
                    const clean = name.replace(/^(l\d+\s*-\s*)/, '').trim();
                    return name === target || clean === target;
                });

                if (node) {
                    let root = node;
                    let rootSafety = 0;
                    let rootVisited = new Set();
                    while ((root.parentId || root.ParentID) && (root.parentId || root.ParentID) !== '0' && (root.parentId || root.ParentID) !== 0 && rootSafety < 20) {
                        const rId = String(root.id || root.ItemID);
                        if (rootVisited.has(rId)) break;
                        rootVisited.add(rId);
                        const pId = String(root.parentId || root.ParentID);
                        const parent = hierarchy.find(p => String(p.id || p.ItemID) === pId);
                        if (parent) root = parent;
                        else break;
                        rootSafety++;
                    }
                    if (root.leadJobCode || root.LeadJobCode) return root.leadJobCode || root.LeadJobCode;
                    if (root.itemName && root.itemName.match(/^L\d+/)) {
                        return root.itemName.split('-')[0].trim();
                    }
                }
                return curr;
            })(),
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
            toFax,
            toAttention,
            leadJob: (() => {
                if (selectedLeadId && pricingData?.jobs) {
                    const found = pricingData.jobs.find(j => String(j.id || j.ItemID) === String(selectedLeadId));
                    if (found) return found.itemName || found.ItemName || found.DivisionName;
                }
                return enquiryData.leadJobPrefix || '';
            })(),
            ownJob: (() => {
                if (activeQuoteTab && calculatedTabs) {
                    const tab = calculatedTabs.find(t => String(t.id) === String(activeQuoteTab));
                    if (tab) return tab.name || tab.label || '';
                }
                return '';
            })(),
            status: 'Saved'
        };
    }, [enquiryData, selectedJobs, pricingSummary, currentUser, pricingData, validityDays, preparedBy, clauses, clauseContent, grandTotal, customClauses, orderedClauses, quoteDate, customerReference, subject, signatory, signatoryDesignation, toName, toAddress, toPhone, toEmail, toFax, toAttention, activeQuoteTab, calculatedTabs, selectedLeadId]);



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
            // 1. Get Base Payload first (Now handles its own robust division and lead job detection)
            const basePayload = getQuotePayload();
            const { divisionCode: effectiveDivisionCode, leadJobPrefix: effectiveLeadJobPrefix } = basePayload;

            console.log('[saveQuote] Derived context:', { effectiveDivisionCode, effectiveLeadJobPrefix });

            // Use the payload as-is for the actual save request
            const savePayload = { ...basePayload };

            if (!quoteId && existingQuotes.length > 0) {
                // Check if any existing quote has the same customer AND same lead job branch AND same division
                const sameCustomerQuote = existingQuotes.find(q => {
                    const matchCustomer = normalize(q.ToName) === normalize(toName);

                    // Branch Isolation: Match the prefix exactly
                    // q.QuoteNumber part 2 (Ref) is usually 'RequestNo-LCode' or just 'RequestNo'
                    const qRef = q.QuoteNumber?.split('/')[2]?.toUpperCase() || '';
                    const myRefSuffix = String(effectiveLeadJobPrefix || '').toUpperCase();
                    const enquiryNo = String(enquiryData.enquiry.RequestNo);

                    let matchLeadJob = false;
                    if (myRefSuffix) {
                        // If I have an L-code (e.g. L1), match 19-L1 or L1
                        matchLeadJob = qRef === `${enquiryNo}-${myRefSuffix}` || qRef === myRefSuffix;
                    } else {
                        // If I have no specific suffix, only match the bare enquiry number
                        matchLeadJob = qRef === enquiryNo;
                    }

                    // STRICT DIVISION MATCH (e.g. BMS, ELE...)
                    let matchDivision = false;
                    if (q.QuoteNumber) {
                        const quoteParts = q.QuoteNumber.split('/');
                        if (quoteParts.length >= 2) {
                            const existingQuoteDivision = quoteParts[1];
                            matchDivision = existingQuoteDivision === effectiveDivisionCode;
                        }
                    }

                    return matchCustomer && matchLeadJob && matchDivision;
                });

                if (sameCustomerQuote) {
                    if (!suppressCollisionAlert) {
                        const branchMsg = effectiveLeadJobPrefix ? `branch ${effectiveLeadJobPrefix}` : 'the primary project branch';
                        alert(`A quote (${sameCustomerQuote.QuoteNumber}) already exists for this enquiry, customer, division, and ${branchMsg}.\n\nPlease select and REVISE the existing quote instead of creating a new one.`);
                    }
                    if (!isAutoSave) setSaving(false);
                    return { isCollision: true, existingQuote: sameCustomerQuote };
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
                        QuoteDate: quoteDate,
                        PreparedBy: preparedBy,
                        TotalAmount: grandTotal,
                        OwnJob: savePayload.ownJob, // CRITICAL for AutoLoad matching
                        LeadJob: savePayload.leadJob  // CRITICAL for AutoLoad matching
                    }
                ]);

                console.log('[saveQuote] Success! Received data:', data);
                if (data.id) {
                    console.log('[saveQuote] Setting QuoteId:', data.id);
                    setQuoteId(data.id);
                    // Proactive Sync with Registry
                    if (activeQuoteTab) {
                        if (!tabStateRegistry.current[activeQuoteTab]) tabStateRegistry.current[activeQuoteTab] = {};
                        tabStateRegistry.current[activeQuoteTab].quoteId = data.id;
                        tabStateRegistry.current[activeQuoteTab].quoteNumber = data.quoteNumber;
                    }
                }
                if (data.quoteNumber) {
                    console.log('[saveQuote] Setting QuoteNumber:', data.quoteNumber);
                    setQuoteNumber(data.quoteNumber);
                }

                if (!isAutoSave) {
                    alert('Quote saved successfully!');
                }

                // --- TAB STATE SYNC: Ensure the new ID is stored in the registry immediately ---
                if (activeQuoteTab) {
                    if (!tabStateRegistry.current[activeQuoteTab]) tabStateRegistry.current[activeQuoteTab] = {};
                    tabStateRegistry.current[activeQuoteTab].quoteId = data.id;
                    tabStateRegistry.current[activeQuoteTab].quoteNumber = data.quoteNumber;
                }

                // Upload any pending files now that we have a Quote ID
                if (pendingFiles.length > 0) {
                    console.log('[saveQuote] Uploading pending files...', pendingFiles.length);
                    await uploadFiles(pendingFiles, data.id);
                    setPendingFiles([]); // Clear queue
                }

                // Wait a moment for DB commit before calling fetchExistingQuotes to prevent race condition
                console.log('[saveQuote] Waiting 500ms for DB sync...');
                await new Promise(resolve => setTimeout(resolve, 500));

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
            pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'h3', '.clause-content'] }
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


    const computedPreparedByOptions = React.useMemo(() => {
        if (!usersList || usersList.length === 0 || !enquiryData) return [];

        // 1. Resolve Active Division Name
        let activeFull = '';
        const activeTabObj = (calculatedTabs || []).find(t => String(t.id) === String(activeQuoteTab));
        const pool = (pricingData?.jobs && pricingData.jobs.length > 0 ? pricingData.jobs : (enquiryData?.divisionsHierarchy || []));

        if (activeTabObj) {
            const job = pool.find(j => String(j.id || j.ItemID || j.ID) === String(activeTabObj.realId));
            if (job) activeFull = (job.itemName || job.DivisionName || job.ItemName || '');
        }

        if (!activeFull) {
            const leadP = (enquiryData?.leadJobPrefix || '').toUpperCase();
            const leadJob = pool.find(j => {
                const name = (j.itemName || j.DivisionName || j.ItemName || '').toUpperCase();
                const code = (j.leadJobCode || j.LeadJobCode || '').toUpperCase();
                return (leadP && (name.startsWith(leadP) || code === leadP));
            });
            if (leadJob) activeFull = (leadJob.itemName || leadJob.DivisionName || leadJob.ItemName || '');
        }

        const activeLower = activeFull.toLowerCase();
        const activeClean = activeLower.replace(/^(l\d+|sub job)\s*-\s*/, '').replace(/-\d+$/, '').trim();
        const isInteriorsCtx = activeClean.includes('interiors');
        const isCivilCtx = activeClean.includes('civil') && !isInteriorsCtx;

        // 2. Strict Filter to matching department
        const results = usersList.filter(u => {
            const dNorm = (u.Department || '').trim().toLowerCase();

            // STRICT SEPARATION:
            if (isInteriorsCtx) return dNorm.includes('interiors');

            if (isCivilCtx) {
                const isMaintCtx = activeClean.includes('maint');
                const isProjectCtx = activeClean.includes('project');

                if (isMaintCtx) return dNorm.includes('civil') && dNorm.includes('maint');
                if (isProjectCtx) return dNorm.includes('civil') && dNorm.includes('project');

                return dNorm.includes('civil');
            }

            // Fallback for other divisions (BMS, Electrical, etc.)
            return dNorm && activeClean && (dNorm === activeClean || dNorm.includes(activeClean) || activeClean.includes(dNorm));
        });

        // Always include current user for safety
        const currentMail = (currentUser?.EmailId || '').toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim();
        const hasSelf = results.some(u => (u.EmailId || '').toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim() === currentMail);

        let finalOutput = results;
        if (!hasSelf && currentUser) {
            const self = usersList.find(u => (u.EmailId || '').toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim() === currentMail);
            if (self) finalOutput = [self, ...results];
        }

        return finalOutput.map(u => ({ value: u.FullName, label: u.FullName, type: 'OwnJob' }))
            .filter((v, i, a) => a.findIndex(t => (t.value === v.value)) === i);
    }, [usersList, currentUser, enquiryData, activeQuoteTab, calculatedTabs, pricingData]);

    const computedSignatoryOptions = React.useMemo(() => {
        if (!usersList || usersList.length === 0 || !enquiryData || !enquiryData.divisionEmails) return [];

        // 1. Resolve Active Division Context
        let activeFull = '';
        const activeTabObj = (calculatedTabs || []).find(t => String(t.id) === String(activeQuoteTab));
        const pool = (pricingData?.jobs && pricingData.jobs.length > 0 ? pricingData.jobs : (enquiryData?.divisionsHierarchy || []));

        if (activeTabObj) {
            const job = pool.find(j => String(j.id || j.ItemID || j.ID) === String(activeTabObj.realId));
            if (job) activeFull = (job.itemName || job.DivisionName || job.ItemName || '');
        }

        if (!activeFull) {
            const leadP = (enquiryData?.leadJobPrefix || '').toUpperCase();
            const leadJob = pool.find(j => {
                const name = (j.itemName || j.DivisionName || j.ItemName || '').toUpperCase();
                const code = (j.leadJobCode || j.LeadJobCode || '').toUpperCase();
                return (leadP && (name.startsWith(leadP) || code === leadP));
            });
            if (leadJob) activeFull = (leadJob.itemName || leadJob.DivisionName || leadJob.ItemName || '');
        }

        const activeLower = activeFull.toLowerCase();
        const activeClean = activeLower.replace(/^(l\d+|sub job)\s*-\s*/, '').replace(/-\d+$/, '').trim();
        const isAdmin = ['Admin', 'Admins'].includes(currentUser?.role || currentUser?.Roles);

        console.log('[Signatory Debug] Filtering for division:', activeClean);

        // 2. Extract CC Mails for this division branch
        let ccMailsList = [];
        enquiryData.divisionEmails.forEach(div => {
            const divDept = (div.departmentName || '').trim().toLowerCase();
            const divItem = (div.itemName || '').toLowerCase();

            let isMatch = isAdmin;
            if (!isMatch && activeClean) {
                const isElecCtx = activeClean.includes('elec') || activeClean.includes('elm');
                const isDivElec = divDept.includes('elec') || divItem.includes('elec') || divDept.includes('electrical');

                if (isElecCtx) {
                    // Electrical Maintenance context: Must match electrical indicators in div data
                    isMatch = isDivElec && (divDept.includes('ac maint') || divItem.includes('ac maint') || divDept.includes('elm'));
                } else if (activeClean.includes('ac maint')) {
                    // Pure AC Maint (HVAC) context: Should NOT match electrical entries
                    isMatch = (divDept.includes('ac maint') || divItem.includes('ac maint')) && !isDivElec;
                } else {
                    // Regular fallback match
                    isMatch = (divDept === activeClean) || divDept.includes(activeClean) || activeClean.includes(divDept) ||
                        divItem.includes(activeClean);
                }
            }

            if (!isMatch && activeClean) {
                if (activeClean.includes('interiors') && (divDept.includes('interiors') || divItem.includes('interiors'))) isMatch = true;
                if (activeClean.includes('civil') && (divDept.includes('civil') || divItem.includes('civil'))) isMatch = true;
            }

            if (isMatch && div.ccMailIds) {
                const mails = div.ccMailIds.toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').split(',').map(m => m.trim().toLowerCase()).filter(Boolean);
                ccMailsList.push(...mails);
            }
        });

        const uniqueCCMails = [...new Set(ccMailsList)];
        console.log('[Signatory Debug] Unique CC Mails mapped:', uniqueCCMails);

        const matchedItems = usersList.filter(u => {
            const uMail = (u.EmailId || '').toLowerCase().replace(/@almcg\.com/g, '@almoayyedcg.com').trim();
            const uName = (u.FullName || '').toLowerCase().trim();
            return (uMail && uniqueCCMails.includes(uMail)) || (uName && uniqueCCMails.includes(uName));
        }).map(u => ({ value: u.FullName, label: u.FullName, designation: u.Designation }));

        // Deduplicate and Prioritize Managers/Heads/Chiefs to ensure best default signatory
        const uniqueItems = matchedItems.filter((v, i, a) => a.findIndex(t => (t.value === v.value)) === i);

        const sortedItems = uniqueItems.sort((a, b) => {
            const aDes = (a.designation || '').toLowerCase();
            const bDes = (b.designation || '').toLowerCase();
            const isAManager = aDes.includes('manager') || aDes.includes('chief') || aDes.includes('head') || aDes.includes('director');
            const isBManager = bDes.includes('manager') || bDes.includes('chief') || bDes.includes('head') || bDes.includes('director');

            if (isAManager && !isBManager) return -1;
            if (!isAManager && isBManager) return 1;
            return 0;
        });

        console.log('[Signatory Debug] Final Sorted Signatories found:', sortedItems.length);
        return sortedItems;
    }, [enquiryData, usersList, currentUser, activeQuoteTab, calculatedTabs, pricingData]);

    // --- READ-ONLY TAB LOGIC ---
    const activeGlobalTabObj = (calculatedTabs || []).find(t => String(t.id) === String(activeQuoteTab));
    const isEditingRestricted = activeGlobalTabObj && !activeGlobalTabObj.isSelf;
    const activeGlobalTabName = activeGlobalTabObj ? (activeGlobalTabObj.name || activeGlobalTabObj.label) : 'Project';

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

                            {/* Lead Job Dropdown */}
                            <div style={{ flex: 1 }}>
                                <div style={{ position: 'relative' }}>
                                    {(() => {
                                        if (!enquiryData) return (
                                            <select disabled style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f1f5f9' }}>
                                                <option>Select Lead Job</option>
                                            </select>
                                        );

                                        // 1. Get all potential lead jobs (roots)
                                        let allLeadJobs = enquiryData.divisions || [];
                                        if (allLeadJobs.length === 0 && enquiryData.divisionsHierarchy && enquiryData.divisionsHierarchy.length > 0) {
                                            allLeadJobs = enquiryData.divisionsHierarchy
                                                .filter(j => !(j.parentId || j.ParentID) || (j.parentId || j.ParentID) == '0' || (j.parentId || j.ParentID) == 0)
                                                .map(r => r.itemName || r.DivisionName);
                                        } else if (enquiryData.divisionsHierarchy && enquiryData.divisionsHierarchy.length > 0) {
                                            const rootNames = new Set(
                                                enquiryData.divisionsHierarchy
                                                    .filter(j => !(j.parentId || j.ParentID) || (j.parentId || j.ParentID) == '0' || (j.parentId || j.ParentID) == 0)
                                                    .map(j => j.itemName || j.DivisionName)
                                            );
                                            const filtered = allLeadJobs.filter(name => rootNames.has(name));
                                            if (filtered.length > 0) allLeadJobs = filtered;
                                        }

                                        const uniqueLeadJobs = [...new Set(allLeadJobs)];

                                        // 2. Filter based on user access (Pricing Data)
                                        let visibleLeadJobs = [];
                                        if (pricingData && pricingData.access) {
                                            visibleLeadJobs = uniqueLeadJobs.filter(leadJob => {
                                                const leadJobName = leadJob.replace(/^L\d+\s*-\s*/, '').trim();
                                                const jobNameLower = leadJobName.toLowerCase();

                                                if (currentUser?.role === 'Admin' || currentUser?.Roles === 'Admin') return true;

                                                const userDept = (currentUser?.Department || '').trim().toLowerCase();

                                                // Hard Filter: Explicitly exclude civil from non-civil and vice-versa if it's a root mismatch
                                                if (userDept && userDept === 'civil' && !jobNameLower.includes('civil')) return false;

                                                // Find the actual root job object in pricingData
                                                const rootJob = (pricingData.jobs || []).find(j => {
                                                    const isRoot = !j.parentId || j.parentId == '0' || j.parentId == 0;
                                                    const name = (j.itemName || j.DivisionName || j.ItemName || '').toLowerCase();
                                                    return isRoot && (name === jobNameLower || name === leadJob.toLowerCase());
                                                });

                                                if (!rootJob) return false;

                                                // 2.1 Direct Visibility Match
                                                if (rootJob.visible || rootJob.editable) return true;

                                                // 2.2 Hierarchy Match (is any accessible job a descendant of THIS root?)
                                                const isDescendantOfRoot = (job) => {
                                                    const pId = String(job.parentId || '');
                                                    if (!pId || pId === '0' || pId === 'undefined') return false;
                                                    if (pId === String(rootJob.id)) return true;

                                                    const parent = pricingData.jobs.find(pj => String(pj.id) === pId);
                                                    if (parent) return isDescendantOfRoot(parent);
                                                    return false;
                                                };

                                                const hasAccessibleTarget = (pricingData.jobs || []).some(j => (j.visible || j.editable) && isDescendantOfRoot(j));
                                                return hasAccessibleTarget;
                                            });
                                        }

                                        // 3. Determine Selected Value
                                        let selectedValue = '';
                                        if (selectedLeadId && pricingData?.jobs) {
                                            const found = pricingData.jobs.find(j => String(j.id || j.ItemID) === String(selectedLeadId));
                                            if (found) {
                                                selectedValue = found.itemName || found.ItemName || found.DivisionName;
                                            }
                                        }

                                        if (!selectedValue && enquiryData.leadJobPrefix) {
                                            const prefix = String(enquiryData.leadJobPrefix).toLowerCase();
                                            const found = (visibleLeadJobs || []).find(v => {
                                                const vStr = String(v || '').toLowerCase();
                                                return vStr === prefix || vStr.startsWith(prefix);
                                            });
                                            if (found) selectedValue = found;
                                        }

                                        console.log('[Quote Lead Job Render] State:', {
                                            prefix: enquiryData.leadJobPrefix,
                                            options: visibleLeadJobs,
                                            selected: selectedValue
                                        });

                                        return (
                                            <select
                                                style={{
                                                    width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0',
                                                    background: 'white', color: '#334155', fontWeight: '500',
                                                    fontSize: '13px', appearance: 'none', paddingRight: '30px', cursor: 'pointer'
                                                }}
                                                value={selectedValue}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setQuoteId(null);
                                                    handleCustomerChange(null); // Clear customer selection on Lead Job change

                                                    // Find the corresponding Hub ID for strict isolation
                                                    const jobObj = (pricingData?.jobs || []).find(j => {
                                                        const isRoot = !j.parentId || j.parentId == '0' || j.parentId == 0;
                                                        return isRoot && (j.itemName === val || j.DivisionName === val);
                                                    });
                                                    if (jobObj) setSelectedLeadId(jobObj.id || jobObj.ItemID);

                                                    if (val.match(/^L\d+/)) {
                                                        const prefix = val.split('-')[0].trim();
                                                        setEnquiryData(prev => ({ ...prev, leadJobPrefix: prefix }));
                                                    } else {
                                                        setEnquiryData(prev => ({ ...prev, leadJobPrefix: val }));
                                                    }
                                                }}
                                            >
                                                <option value="" disabled>Select Lead Job</option>
                                                {visibleLeadJobs.map(div => {
                                                    const cleanName = div.replace(/^L\d+\s*-\s*/, '').trim();
                                                    return <option key={div} value={div}>{cleanName}</option>;
                                                })}
                                            </select>
                                        );
                                    })()}
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
                                    value={toName ? { label: toName, value: toName } : null}
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
                {enquiryData && enquiryData.leadJobPrefix && toName?.trim() && (
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>

                        {/* Left Actions: Clear, Save, Revision */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={handleClear} style={{ padding: '6px 8px', background: '#e2e8f0', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', color: '#475569', fontWeight: '600' }}>
                                Clear
                            </button>

                            {/* Save Button - Disabled if already saved (Revision only allowed) */}
                            <button
                                onClick={() => saveQuote()}
                                disabled={saving || !canEdit() || !!quoteId || isEditingRestricted}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    background: (!canEdit() || quoteId || isEditingRestricted) ? '#f1f5f9' : '#1e293b',
                                    color: (!canEdit() || quoteId || isEditingRestricted) ? '#94a3b8' : 'white',
                                    border: 'none',
                                    borderRadius: '44px',
                                    cursor: (!canEdit() || quoteId || isEditingRestricted) ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                    fontSize: '12px',
                                    opacity: saving ? 0.7 : 1
                                }}
                                title={isEditingRestricted ? "Editing is restricted for this tab" : !canEdit() ? "No permission to modify" : (quoteId ? "Quote is saved and cannot be edited. Create a revision instead." : "")}
                            >
                                <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                            </button>

                            {/* Revision Button */}
                            {quoteId && (
                                <button onClick={handleRevise} disabled={saving || !canEdit() || isEditingRestricted} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: (!canEdit() || isEditingRestricted) ? '#94a3b8' : '#0284c7', color: 'white', border: 'none', borderRadius: '4px', cursor: (!canEdit() || isEditingRestricted) ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '12px' }} title={isEditingRestricted ? "Editing is restricted for this tab" : !canEdit() ? "No permission to revise" : ""}>
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




                {/* Scrollable Content Area: Pricing & Information */}
                {enquiryData && enquiryData.leadJobPrefix && toName?.trim() ? (
                    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>


                        {/* Unified Previous Quotes & Pricing Summary Section */}
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
                                                    onClick={() => handleTabChange(tab.id)}
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
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: '1' }}>
                                                        <span>{tab.name || tab.label}</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>

                                        {/* Content for Active Tab */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {(() => {
                                                const activeTabObj = tabs.find(t => String(t.id) === String(activeQuoteTab)) || tabs[0];
                                                if (!activeTabObj) return null;

                                                const activeTabRealId = activeTabObj.realId;

                                                // Hierarchy filter removed (using global isDescendant)

                                                // Resolve current lead code for robust branch isolation
                                                const currentLeadCode = (() => {
                                                    // PRIORITY 1: Resolve via explicit selectedLeadId (Stable and Robust)
                                                    if (selectedLeadId && pricingData?.jobs) {
                                                        let root = pricingData.jobs.find(j => String(j.id || j.ItemID) === String(selectedLeadId));
                                                        if (root) {
                                                            const rCode = (root.leadJobCode || root.LeadJobCode || '').toUpperCase();
                                                            if (rCode && rCode.match(/^L\d+/)) return rCode.split('-')[0].trim();
                                                            if (root.itemName?.toUpperCase().match(/^L\d+/)) return root.itemName.split('-')[0].trim().toUpperCase();
                                                        }
                                                    }

                                                    // FALLBACK: Legacy name-based resolution
                                                    const prefix = (enquiryData.leadJobPrefix || '').toUpperCase();
                                                    if (!prefix) return '';
                                                    if (prefix.match(/^L\d+/)) return prefix.split('-')[0].trim().toUpperCase();

                                                    const hierarchy = enquiryData.divisionsHierarchy || [];
                                                    let job = hierarchy.find(j => {
                                                        const name = (j.itemName || j.ItemName || j.DivisionName || '').toUpperCase();
                                                        const clean = name.replace(/^(L\d+\s*-\s*)/, '').trim();
                                                        return name === prefix || clean === prefix || (j.leadJobCode && j.leadJobCode.toUpperCase() === prefix);
                                                    });

                                                    if (job) {
                                                        let root = job;
                                                        while (root && root.parentId && root.parentId !== '0' && root.parentId !== 0) {
                                                            const parent = hierarchy.find(p => String(p.id || p.ItemID) === String(root.parentId));
                                                            if (parent) root = parent;
                                                            else break;
                                                        }
                                                        if (root.leadJobCode || root.LeadJobCode) return (root.leadJobCode || root.LeadJobCode).toUpperCase();
                                                        if (root.itemName?.match(/^L\d+/)) return root.itemName.split('-')[0].trim().toUpperCase();
                                                    }
                                                    return prefix;
                                                })();

                                                // Filter and Render Previous Quotes
                                                const filteredQuotes = existingQuotes.filter(q => {
                                                    const normalizedQuoteTo = normalize(q.ToName || '');
                                                    const normalizedCurrentTo = normalize(toName || '');

                                                    const activeTabAncestors = [];
                                                    let currAnc = activeTabRealId ? jobsPool.find(j => String(j.id || j.ItemID || j.ID) === String(activeTabRealId)) : null;
                                                    let ancSafety = 0;
                                                    let ancVisited = new Set();
                                                    while (currAnc && (currAnc.parentId || currAnc.ParentID) && (currAnc.parentId || currAnc.ParentID) !== '0' && (currAnc.parentId || currAnc.ParentID) !== 0 && ancSafety < 20) {
                                                        const pId = String(currAnc.parentId || currAnc.ParentID);
                                                        if (ancVisited.has(pId)) break;
                                                        ancVisited.add(pId);
                                                        const parent = jobsPool.find(j => String(j.id || j.ItemID || j.ID) === pId);
                                                        if (parent) {
                                                            activeTabAncestors.push(normalize(parent.itemName || parent.ItemName || parent.DivisionName || ''));
                                                            currAnc = parent;
                                                            ancSafety++;
                                                        } else {
                                                            break;
                                                        }
                                                    }

                                                    // CUSTOMER FILTER: Match selection OR any ancestor (Internal Quoting)
                                                    const isExactMatch = normalizedCurrentTo && (normalizedQuoteTo === normalizedCurrentTo);
                                                    const isAncestorMatch = activeTabAncestors.includes(normalizedQuoteTo);

                                                    // STRICT REQUIREMENT: If No Customer is selected, do not show quotes in the list.
                                                    if (!normalizedCurrentTo) return false;

                                                    if (!isExactMatch && !isAncestorMatch) return false;

                                                    const parts = q.QuoteNumber?.split('/') || [];
                                                    const qDivCode = parts[1]?.toUpperCase();
                                                    // Robust L-tag extraction: Handles AAC/BMS/17-L1/36 or AAC/BMS/L1-17/36
                                                    const qLeadPart = parts[2] ? parts[2].toUpperCase() : '';
                                                    const qLeadCodeOnly = qLeadPart.match(/L\d+/) ? qLeadPart.match(/L\d+/)[0] : qLeadPart;

                                                    // STRICT PROJECT TYPE FILTER: Match quote's division code to this tab's project
                                                    const tabName = (activeTabObj.label || '').toUpperCase();
                                                    const isTypeMatch = matchDivisionCode(qDivCode, tabName, activeTabObj.divisionCode);

                                                    if (!isTypeMatch) return false;

                                                    // Branch Isolation: Ensure quote belongs to precisely this Lead/Subjob branch
                                                    const currentLeadCodeClean = currentLeadCode.match(/L\d+/) ? currentLeadCode.match(/L\d+/)[0] : currentLeadCode;

                                                    if (qLeadCodeOnly && currentLeadCodeClean && qLeadCodeOnly !== currentLeadCodeClean) return false;

                                                    // STRICT ISOLATION: Sub-users CANNOT see parent division quotes (Step 1922)
                                                    const userDept = (currentUser?.Department || currentUser?.Division || '').trim().toLowerCase();
                                                    const isSubUser = userDept && !['civil', 'admin'].includes(userDept) && !isAdmin;
                                                    if (isSubUser) {
                                                        const isParentCode = qDivCode === 'CVLP' || (qDivCode === 'AAC' && userDept !== 'air');
                                                        // If it's a parent code and not belonging to current tab, block it
                                                        const isMySpecificTab = isTypeMatch; // Already checked by isTypeMatch

                                                        if (isParentCode && !isMySpecificTab) return false;
                                                    }

                                                    return true;
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
                                                    .slice(0, 1) // Only one quote reference to appear strictly
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
                                                    const grpNameNorm = normalize(grp.name);
                                                    // Robustness (Step 4488): Check ALL jobs matching this name for hierarchy relevance
                                                    const matchingJobs = jobsPool.filter(j => normalize(j.itemName || j.DivisionName) === grpNameNorm);
                                                    if (matchingJobs.length === 0) return activeTabObj.isSelf || tabs.length === 1;

                                                    // Check if active tab is the Lead Job, who must see all pricing for compilation
                                                    const prefix = (enquiryData?.leadJobPrefix || '').toUpperCase();

                                                    // Resolve real name if it's "Own Job" (default tab)
                                                    const activeJobEntity = jobsPool.find(j => String(j.id || j.ItemID || j.ID) === String(activeTabRealId));
                                                    const rawTabName = activeJobEntity ? (activeJobEntity.itemName || activeJobEntity.DivisionName || '') : (activeTabObj.name || activeTabObj.label || '');

                                                    const activeTabName = rawTabName.toUpperCase();
                                                    const cleanActiveTabName = activeTabName.replace(/^(L\d+\s*-\s*)/, '').trim();
                                                    const isLeadJob = prefix && (activeTabName === prefix || cleanActiveTabName === prefix || activeTabName.includes(prefix));

                                                    const isRelevant = matchingJobs.some(job => {
                                                        const jId = job.id || job.ItemID || job.ID;
                                                        // HIERARCHY MATCH: Only include if explicitly the active tab OR a descendant of it
                                                        const isMatch = String(jId) === String(activeTabRealId) || isDescendant(jId, activeTabRealId, jobsPool);
                                                        if (!isMatch) return false;

                                                        // BRANCH ISOLATION: Must belong to the same Lead Job as the active tab
                                                        const getRootId = (id) => {
                                                            let curr = jobsPool.find(j => String(j.id || j.ItemID || j.ID) === String(id));
                                                            let visited = new Set();
                                                            while (curr && (curr.parentId || curr.ParentID) && (curr.parentId || curr.ParentID) !== '0' && !visited.has(curr.id || curr.ItemID)) {
                                                                visited.add(curr.id || curr.ItemID);
                                                                const parent = jobsPool.find(p => String(p.id || p.ItemID || p.ID) === String(curr.parentId || curr.ParentID));
                                                                if (!parent) break;
                                                                curr = parent;
                                                            }
                                                            return curr ? String(curr.id || curr.ItemID || curr.ID) : String(id);
                                                        };

                                                        const jobRootId = getRootId(jId);
                                                        const activeRootId = getRootId(activeTabRealId);
                                                        if (jobRootId !== activeRootId) return false;

                                                        return true;
                                                    });

                                                    if (!isRelevant) return false;

                                                    // STRICT VISIBILITY: Block ancestors if strictly limited
                                                    const userDept = (currentUser?.Department || currentUser?.Division || '').trim().toLowerCase();
                                                    const isStrictlyLimited = userDept && !['civil', 'admin', 'bms admin'].includes(userDept) && !isAdmin;

                                                    if (isStrictlyLimited) {
                                                        const isActualAncestor = matchingJobs.some(job => {
                                                            const jobIdStr = String(job.id || job.ItemID || job.ID);
                                                            let curr = activeTabRealId ? jobsPool.find(j => String(j.id || j.ItemID || j.ID) === String(activeTabRealId)) : null;
                                                            while (curr && (curr.parentId || curr.ParentID)) {
                                                                const pid = String(curr.parentId || curr.ParentID);
                                                                if (pid === jobIdStr) return true;
                                                                curr = jobsPool.find(pj => String(pj.id || pj.ItemID || pj.ID) === pid);
                                                            }
                                                            return false;
                                                        });
                                                        if (isActualAncestor) return false;
                                                    }

                                                    return true;
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
                                                                            .reduce((sum, g) => {
                                                                                // Sum only Base Price items
                                                                                const groupBase = g.items.reduce((s, i) => (i.name === 'Base Price' ? s + i.total : s), 0);
                                                                                return sum + groupBase;
                                                                            }, 0)
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

                        {/* LOCKED UI LOGIC: Hide Quote Details for non-Own Job tabs */}
                        {!isEditingRestricted && (
                            <div>
                                {/* Metadata Section (Quote Details) - Moved Below Pricing */}
                                <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>

                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#475569' }}>Quote Details:</h4>

                                    {/* Division is auto-selected based on user department - no manual selection needed */}

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Quote Date <span style={{ color: '#ef4444' }}>*</span></label>
                                        <DateInput
                                            value={quoteDate}
                                            onChange={(e) => setQuoteDate(e.target.value)}
                                            max={format(new Date(), 'yyyy-MM-dd')}
                                            style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                        />
                                    </div>



                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Validity (Days) <span style={{ color: '#ef4444' }}>*</span></label>
                                        <input type="number" value={validityDays} onChange={(e) => setValidityDays(parseInt(e.target.value) || 0)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                                    </div>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Customer Reference <span style={{ color: '#ef4444' }}>*</span></label>
                                        <input
                                            type="text"
                                            value={customerReference}
                                            onChange={(e) => setCustomerReference(e.target.value)}
                                            placeholder="Your Ref / LPO Number..."
                                            style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                                        />
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
                                            options={computedPreparedByOptions}
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
                                            options={computedSignatoryOptions}
                                            value={signatory ? { label: signatory, value: signatory } : null}
                                            placeholder="Select or Type Signatory..."
                                            styles={{
                                                control: (base) => ({ ...base, minHeight: '34px', fontSize: '13px' }),
                                                valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                                                input: (base) => ({ ...base, margin: 0, padding: 0 }),
                                            }}
                                        />
                                    </div>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Signatory Designation</label>
                                        <input
                                            type="text"
                                            value={signatoryDesignation}
                                            onChange={(e) => setSignatoryDesignation(e.target.value)}
                                            placeholder="Signatory's Title..."
                                            style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px' }}
                                        />
                                    </div>

                                    <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '15px 0' }} />
                                    <h5 style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recipient Info (Optional Override):</h5>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>To Address</label>
                                        <textarea
                                            value={toAddress}
                                            onChange={(e) => setToAddress(e.target.value)}
                                            rows={2}
                                            placeholder="Client Address..."
                                            style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', resize: 'vertical', fontSize: '12px' }}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Phone</label>
                                            <input
                                                type="text"
                                                value={toPhone}
                                                onChange={(e) => setToPhone(e.target.value)}
                                                style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                            />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Fax</label>
                                            <input
                                                type="text"
                                                value={toFax}
                                                onChange={(e) => setToFax(e.target.value)}
                                                style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                            />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Email</label>
                                            <input
                                                type="email"
                                                value={toEmail}
                                                onChange={(e) => setToEmail(e.target.value)}
                                                style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                            />
                                        </div>
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
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '40px',
                        textAlign: 'center',
                        color: '#64748b',
                        background: '#f8fafc'
                    }}>
                        <div style={{ marginBottom: '16px', color: '#cbd5e1' }}>
                            <FolderOpen size={48} />
                        </div>
                        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>No Customer Selected</h3>
                        <p style={{ fontSize: '13px', maxWidth: '200px' }}>
                            Please select a customer from the dropdown above to view pricing and create a quote.
                        </p>
                    </div>
                )
                }
            </div >

            {/* Resizer Handle */}
            < div
                onMouseDown={startResizing}
                title="Drag to resize sidebar"
                style={{
                    width: '10px',
                    backgroundColor: '#f1f5f9',
                    borderRight: '1px solid #e2e8f0',
                    borderLeft: '1px solid #e2e8f0',
                    cursor: 'col-resize',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10,
                    transition: 'background-color 0.2s'
                }}
            >
                <div style={{ width: '4px', height: '32px', backgroundColor: '#cbd5e1', borderRadius: '2px' }}></div>
            </div >

            {/* Right Panel - Quote Preview */}
            < div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
                {
                    loading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }} >
                            Loading enquiry data...
                        </div >
                    ) : !enquiryData ? (
                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                            {pendingQuotes.length > 0 ? (
                                (() => {
                                    const sortedPendingQuotes = [...pendingQuotes].sort((a, b) => {
                                        const { field, direction } = pendingQuotesSortConfig;
                                        let aVal = a[field];
                                        let bVal = b[field];
                                        if (field === 'DueDate' || field === 'EnquiryDate') {
                                            aVal = aVal ? new Date(aVal).getTime() : Infinity;
                                            bVal = bVal ? new Date(bVal).getTime() : Infinity;
                                        } else {
                                            aVal = (aVal || '').toString().toLowerCase();
                                            bVal = (bVal || '').toString().toLowerCase();
                                        }
                                        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
                                        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
                                        return 0;
                                    });
                                    const quoteSortField = pendingQuotesSortConfig.field;
                                    const quoteSortDir = pendingQuotesSortConfig.direction;
                                    const activeSortLabel = quoteSortField === 'DueDate' ? 'Due Date'
                                        : quoteSortField === 'RequestNo' ? 'Enquiry No.'
                                            : quoteSortField === 'ProjectName' ? 'Project Name'
                                                : quoteSortField === 'CustomerName' ? 'Customer'
                                                    : quoteSortField === 'ClientName' ? 'Client Name'
                                                        : quoteSortField === 'ConsultantName' ? 'Consultant Name'
                                                            : quoteSortField;
                                    const renderQSH = (field, label, style = {}) => {
                                        const isActive = quoteSortField === field;
                                        const isAsc = quoteSortDir === 'asc';
                                        return (
                                            <th
                                                key={field}
                                                onClick={() => setPendingQuotesSortConfig(prev =>
                                                    prev.field === field
                                                        ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
                                                        : { field, direction: 'asc' }
                                                )}
                                                style={{
                                                    padding: '10px 16px', textAlign: 'left', fontSize: '12px',
                                                    fontWeight: '600', color: isActive ? '#0284c7' : '#64748b',
                                                    borderBottom: '1px solid #e2e8f0', cursor: 'pointer',
                                                    userSelect: 'none', whiteSpace: 'nowrap', ...style
                                                }}
                                            >
                                                {label}{isActive ? (isAsc ? ' ▲' : ' ▼') : <span style={{ color: '#cbd5e1' }}> ⇅</span>}
                                            </th>
                                        );
                                    };
                                    return (
                                        <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', width: '100%', margin: '0 auto' }}>
                                            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <FileText size={20} className="text-blue-600" /> Pending Updates ({pendingQuotes.length})
                                                </h2>
                                                <span style={{ fontSize: '12px', color: '#64748b' }}>
                                                    Sorted by <strong>{activeSortLabel}</strong> {quoteSortDir === 'asc' ? '(Soonest first)' : '(Latest first)'}
                                                </span>
                                            </div>
                                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                    <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                                                        <tr>
                                                            {renderQSH('RequestNo', 'Enquiry No.', { width: '80px' })}
                                                            {renderQSH('ProjectName', 'Project Name', { minWidth: '234px' })}
                                                            {renderQSH('CustomerName', 'Customer Name')}
                                                            {renderQSH('DueDate', 'Due Date', { minWidth: '110px' })}
                                                            <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Subjob Prices (Base Price)</th>
                                                            {renderQSH('ClientName', 'Client Name', { minWidth: '200px' })}
                                                            {renderQSH('ConsultantName', 'Consultant Name', { minWidth: '200px' })}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {sortedPendingQuotes.map((enq, idx) => (
                                                            <tr
                                                                key={enq.RequestNo || idx}
                                                                style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                                                                onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                                onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                                                                onClick={() => handleSelectEnquiry(enq)}
                                                            >
                                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b', fontWeight: '500', verticalAlign: 'top' }}>{enq.RequestNo}</td>
                                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', minWidth: '234px' }}>{enq.ProjectName || '-'}</td>
                                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', minWidth: '250px' }}>
                                                                    {enq.CustomerName ? enq.CustomerName.split(',').map((cust, i) => {
                                                                        const cName = cust.trim();
                                                                        if (!cName) return null;

                                                                        // Skip the user's own division/job — they are the quoting party, not a customer
                                                                        const userDept = (currentUser?.Department || '').trim().toLowerCase();
                                                                        const cNorm = normalize(cName);
                                                                        const deptNorm = normalize(userDept);
                                                                        if (userDept && (cNorm === deptNorm || cNorm.includes(deptNorm) || deptNorm.includes(cNorm))) return null;

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
                                                                            <div key={i} style={{ marginBottom: '4px' }}>
                                                                                <span style={{ fontWeight: '500', color: '#334155', whiteSpace: 'nowrap' }}>{cName}</span>
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
                                    );
                                })()
                            ) : (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '14px', fontStyle: 'italic', background: 'white', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
                                    No pending updates found. Start by entering an enquiry number above.
                                </div>
                            )}
                        </div>
                    ) : (!enquiryData.leadJobPrefix || !toName?.trim()) ? (
                        <div style={{
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '40px',
                            textAlign: 'center',
                            color: '#64748b',
                            background: 'white',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0'
                        }}>
                            <div style={{ marginBottom: '16px', color: '#cbd5e1' }}>
                                <Plus size={48} />
                            </div>
                            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>New Quote Preview</h3>
                            <p style={{ fontSize: '13px', maxWidth: '300px' }}>
                                Once a customer and lead job are selected, you can preview the generated quote here.
                            </p>
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
                                minHeight: '280mm' // Ensures it looks like at least one page
                            }}>

                                {/* Page 1 Container */}
                                <div className="page-one" style={{
                                    minHeight: '260mm',
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
                                                {toPhone && <div style={{ fontSize: '13px', color: '#64748b' }}>Tel: {toPhone} {toFax ? ` | Fax: ${toFax}` : ''}</div>}
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
                                                            <div style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '2px' }}>
                                                                {quoteCompanyName.toLowerCase().includes('conditioning') ? 'المؤيد لتكييف الهواء' : 'المؤيد للمقاولات'}
                                                            </div>
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
                                    <div style={{ marginTop: 'auto', pageBreakInside: 'avoid' }}>

                                        {/* Signature Section */}
                                        <div style={{ marginTop: '30px' }}>
                                            <div style={{ marginBottom: '40px' }}>For {quoteCompanyName || enquiryData.companyDetails?.name || 'Almoayyed Contracting'},</div>
                                            <div style={{ fontWeight: '600' }}>{signatory || 'N/A'}</div>
                                            <div style={{ fontSize: '13px', color: '#64748b' }}>{signatoryDesignation || ''}</div>
                                        </div>

                                        {/* Footer */}
                                        <div className="footer-section" style={{ marginTop: '30px', paddingTop: '15px', borderTop: '1px solid #e2e8f0', fontSize: '11px', color: '#64748b', textAlign: 'right' }}>
                                            <div>{footerDetails?.name || enquiryData.companyDetails?.name || 'Almoayyed Contracting'}</div>
                                            <div>{footerDetails?.address || enquiryData.companyDetails?.address || 'P.O. Box 32232, Manama, Kingdom of Bahrain'}</div>
                                            <div>
                                                {footerDetails?.phone ? `Tel: ${footerDetails.phone}` : (enquiryData.companyDetails?.phone ? `Tel: ${enquiryData.companyDetails.phone}` : 'Tel: (+973) 17 400 407')}
                                                {' | '}
                                                Fax: {footerDetails?.fax || enquiryData.companyDetails?.fax || '(+973) 17 400 396'}
                                            </div>
                                            <div>E-mail: {footerDetails?.email || enquiryData.companyDetails?.email || 'bms@almcg.com'}</div>
                                        </div>
                                    </div>
                                </div> {/* End of Page 1 Container */}

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
                                            <div key={clause.key || clause.id} style={{ marginBottom: '20px', pageBreakInside: 'avoid' }}>
                                                <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '10px' }}>{index + 1}. {clause.title}</h3>
                                                <div
                                                    style={{ fontSize: '13px', lineHeight: '1.6', paddingLeft: '15px', whiteSpace: 'pre-wrap' }}
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
                    )
                }
            </div >
        </div >
    );
};

export default QuoteForm;
