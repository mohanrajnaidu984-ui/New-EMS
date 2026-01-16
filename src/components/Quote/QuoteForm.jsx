import React, { useState, useEffect, useRef } from 'react';
import { FileText, Save, Printer, Mail, Plus, ChevronDown, ChevronUp, X, Trash2, FolderOpen } from 'lucide-react';
import CreatableSelect from 'react-select/creatable';
import { format } from 'date-fns';
import DateInput from '../Enquiry/DateInput';
import { useAuth } from '../../context/AuthContext';

const API_BASE = 'http://localhost:5000';

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

    pricingTerms: `4.1.Our[Lump sum price / total quotation amount]for the scope mentioned above shall be[Amount in figures and words].
4.2.Our quoted amount excludes any Value Added Tax(VAT), which shall be charged additional, as applicable.
4.3.A detailed Bill of Quantity is provided in Annexure B, detailing the Itemized Pricing.
4.4.Payment Terms:
4.4.1.Advance Payment: [Percentage] % upon signing the agreement
4.4.2.Progress Payments: [Percentage] % as per completion milestones
4.4.3.Final Payment: [Percentage] % upon project completion and acceptance`,

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

const tableStyles = `
    .clause - content table {
    width: 100 % !important;
    border - collapse: collapse!important;
    margin - bottom: 16px!important;
    font - size: 12px!important;
}
    .clause - content table th, .clause - content table td {
    border: 1px solid #cbd5e1!important;
    padding: 6px 8px!important;
    text - align: left!important;
}
    .clause - content table th {
    background - color: #f8fafc!important;
    font - weight: 600!important;
}
`;

const QuoteForm = () => {
    const { currentUser } = useAuth();

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

    // Print Settings
    const [printWithHeader, setPrintWithHeader] = useState(true);

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
    const [totalAmount, setTotalAmount] = useState(0);

    // Expanded clause for editing
    const [expandedClause, setExpandedClause] = useState(null);
    const [expandedGroups, setExpandedGroups] = useState({});

    // Company Header Info
    const [quoteLogo, setQuoteLogo] = useState(null);
    const [quoteCompanyName, setQuoteCompanyName] = useState('Almoayyed Air Conditioning');
    const [footerDetails, setFooterDetails] = useState(null);

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

    // Templates State
    const [templates, setTemplates] = useState([]);
    const [savedTemplateName, setSavedTemplateName] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState('');

    // Ordered Clauses (Standard + Custom)
    const [orderedClauses, setOrderedClauses] = useState([
        'showScopeOfWork', 'showBasisOfOffer', 'showExclusions', 'showPricingTerms',
        'showBillOfQuantity', 'showSchedule', 'showWarranty', 'showResponsibilityMatrix', 'showTermsConditions', 'showAcceptance'
    ]);

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
        if (!quoteId) return true; // New quote can always be saved
        if (!currentUser) return false;

        const selectedQuote = existingQuotes.find(q => q.ID === quoteId);
        if (!selectedQuote) return true;

        const userEmail = (currentUser.email || currentUser.EmailId || '').toLowerCase().trim();
        const preparedByEmail = (selectedQuote.PreparedByEmail || '').toLowerCase().trim();

        // 1. Check if user is the creator
        if (userEmail === preparedByEmail) return true;

        // 2. Check if user is in CC list of any division for this enquiry
        if (enquiryData?.divisionEmails) {
            const isInCC = enquiryData.divisionEmails.some(div => {
                const ccEmails = (div.ccMailIds || '').split(',').map(e => e.trim().toLowerCase());
                return ccEmails.includes(userEmail);
            });
            if (isInCC) return true;
        }

        // 3. Admin check
        if (currentUser.Roles === 'Admin' || currentUser.role === 'Admin') return true;

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
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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

            // Update Header/Footer details to match the selected Customer (as per user request)
            setFooterDetails({
                name: cust.CompanyName,
                address: `${cust.Address1 || ''} \n${cust.Address2 || ''} `.trim(),
                phone: cust.Phone1 || '',
                fax: cust.FaxNo || '',
                email: cust.EmailId || ''
            });
        }

        // Reload pricing for selected customer
        if (enquiryData) {
            loadPricingData(enquiryData.enquiry.RequestNo, selectedName);
        }
    };

    // New handler for CreatableSelect
    const handleCustomerChange = (selectedOption) => {
        const selectedName = selectedOption ? selectedOption.value : '';
        setToName(selectedName);

        if (!selectedName) {
            setToAddress('');
            setToPhone('');
            setToEmail('');
            if (enquiryData) {
                loadPricingData(enquiryData.enquiry.RequestNo, '');
            }
            return;
        }

        const cust = customersList.find(c => c.CompanyName === selectedName);
        if (cust) {
            setToAddress(`${cust.Address1 || ''} \n${cust.Address2 || ''} `.trim());
            setToPhone(`${cust.Phone1 || ''} ${cust.Phone2 ? '/ ' + cust.Phone2 : ''} `.trim());
            setToEmail(cust.EmailId || '');

            setFooterDetails({
                name: cust.CompanyName,
                address: `${cust.Address1 || ''} \n${cust.Address2 || ''} `.trim(),
                phone: cust.Phone1 || '',
                fax: cust.FaxNo || '',
                email: cust.EmailId || ''
            });
        }

        // Reload pricing for selected customer
        if (enquiryData) {
            console.log('Customer changed to:', selectedName, 'Reloading pricing...');
            loadPricingData(enquiryData.enquiry.RequestNo, selectedName);
        }
    };

    // Helper to load pricing data (Component Level)
    const loadPricingData = async (reqNo, cxName) => {
        console.log('--- loadPricingData START ---');
        console.log('Req:', reqNo, 'Cx:', cxName);
        try {
            const url = `${API_BASE}/api/pricing/${encodeURIComponent(reqNo)}?userEmail=${encodeURIComponent(currentUser?.email || currentUser?.EmailId || '')}&customerName=${encodeURIComponent(cxName || '')}`;
            console.log('Fetching URL:', url);

            const pricingRes = await fetch(url);
            if (pricingRes.ok) {
                const pData = await pricingRes.json();
                console.log('Pricing Data Received:', pData);
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

                // We need to calculate summary based on all jobs initially
                calculateSummary(pData, allJobs, cxName);
            } else {
                console.error('Pricing API Error:', pricingRes.status);
                setPricingData(null);
                setPricingSummary([]);
                setHasUserPricing(false);
            }
        } catch (err) {
            console.error('Error fetching pricing:', err);
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
    const calculateSummary = (data = pricingData, currentSelectedJobs = selectedJobs, activeCustomer = toName) => {
        if (!data || !data.options || !data.values) return;

        const summary = [];
        let userHasEnteredPrice = false;
        let calculatedGrandTotal = 0;
        let foundPricedOptional = false;

        // Ensure selectedJobs is array
        const activeJobs = Array.isArray(currentSelectedJobs) ? currentSelectedJobs : [];

        const groups = {};

        data.options.forEach(opt => {
            // 0. Customer Filter
            if (opt.customerName && activeCustomer && opt.customerName !== activeCustomer) return;

            // 1. Visibility Filter
            let isVisible = false;
            // Check if option is associated with a job, and if that job IS SELECTED
            if (data.access?.hasLeadAccess) {
                isVisible = true;
            } else if (opt.itemName && data.access?.editableJobs?.includes(opt.itemName)) {
                isVisible = true;
            }

            if (!isVisible) return;

            // Determine if this option's job is currently selected (for Total calculation)
            // If itemName is missing (General), we assume it is included unless specific logic says otherwise
            const isJobIncluded = !opt.itemName || activeJobs.includes(opt.itemName);

            // 2. Calculate Total
            let optionTotal = 0;
            if (data.jobs) {
                data.jobs.forEach(job => {
                    const key = `${opt.id}_${job.id}`;
                    const val = data.values[key];
                    const price = val ? parseFloat(val.Price || 0) : 0;
                    optionTotal += price;
                });
            }

            // 3. Zero Value Filter
            if (optionTotal <= 0) return;

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

        // Generate Pricing Terms Content with Table
        let tableHtml = '<table style="width:100%; border-collapse:collapse; margin-bottom:16px;">';
        tableHtml += '<thead><tr style="background:#f8fafc; border:1px solid #cbd5e1;"><th style="padding:10px; border:1px solid #cbd5e1; text-align:left;">Description</th><th style="padding:10px; border:1px solid #cbd5e1; text-align:right;">Amount (BHD)</th></tr></thead>';
        tableHtml += '<tbody>';
        summary.forEach(grp => {
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

            // Add Group Total
            tableHtml += `<tr><td style="padding:10px; border:1px solid #cbd5e1; text-align:right; font-weight:600;">Total ${cleanedName}</td><td style="padding:10px; border:1px solid #cbd5e1; text-align:right; font-weight:600;">BD ${grp.total.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td></tr>`;
        });

        if (!foundPricedOptional && calculatedGrandTotal > 0) {
            tableHtml += `<tr style="background:#f8fafc; font-weight:700;"><td style="padding:10px; border:1px solid #cbd5e1; text-align:right;">Grand Total</td><td style="padding:10px; border:1px solid #cbd5e1; text-align:right;">BD ${calculatedGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td></tr>`;
        }
        tableHtml += '</tbody></table>';

        // Update Pricing Terms Text with Dynamic Total
        let pricingText = defaultClauses.pricingTerms || '';
        if (calculatedGrandTotal > 0 && !foundPricedOptional) {
            const formattedTotal = calculatedGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
            const words = numberToWordsBHD(calculatedGrandTotal);
            const totalString = `BD ${formattedTotal} (${words})`;

            pricingText = pricingText.replace('[Amount in figures and words]', totalString);
        }

        setClauseContent(prev => ({
            ...prev,
            pricingTerms: tableHtml + pricingText
        }));
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
                const ccEmails = (div.ccMailIds || '').split(',').map(e => e.trim().toLowerCase());
                return ccEmails.includes(userEmail);
            });
        }

        // 3. Admin check
        const isAdmin = currentUser.Roles === 'Admin' || currentUser.role === 'Admin';

        if (!isCreator && !isInCC && !isAdmin) {
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

        if (quote.ToName) {
            const cust = customersList.find(c => c.CompanyName === quote.ToName);
            if (cust) {
                setFooterDetails({
                    name: cust.CompanyName,
                    address: `${cust.Address1 || ''} \n${cust.Address2 || ''} `.trim(),
                    phone: cust.Phone1 || '',
                    fax: cust.FaxNo || '',
                    email: cust.EmailId || ''
                });
            } else if (enquiryData?.companyDetails) {
                setFooterDetails(enquiryData.companyDetails);
            }
        } else if (enquiryData?.companyDetails) {
            setFooterDetails(enquiryData.companyDetails);
        }

        setClauses({
            showScopeOfWork: !!quote.ShowScopeOfWork,
            showBasisOfOffer: !!quote.ShowBasisOfOffer,
            showExclusions: !!quote.ShowExclusions,
            showPricingTerms: !!quote.ShowPricingTerms,
            showSchedule: !!quote.ShowSchedule,
            showWarranty: !!quote.ShowWarranty,
            showResponsibilityMatrix: !!quote.ShowResponsibilityMatrix,
            showTermsConditions: !!quote.ShowTermsConditions,
            showAcceptance: !!quote.ShowAcceptance,
            showBillOfQuantity: !!quote.ShowBillOfQuantity
        });

        setClauseContent({
            scopeOfWork: quote.ScopeOfWork || '',
            basisOfOffer: quote.BasisOfOffer || '',
            exclusions: quote.Exclusions || '',
            pricingTerms: quote.PricingTerms || '',
            schedule: quote.Schedule || '',
            warranty: quote.Warranty || '',
            responsibilityMatrix: quote.ResponsibilityMatrix || '',
            termsConditions: quote.TermsConditions || '',
            acceptance: quote.Acceptance || '',
            billOfQuantity: quote.BillOfQuantity || ''
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

        setTotalAmount(quote.TotalAmount || 0);
        setExpandedClause(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };



    const handleRevise = async () => {
        if (!quoteId) return;
        if (!window.confirm('Are you sure you want to create a new revision based on this quote?')) return;

        setSaving(true);
        try {
            const payload = getQuotePayload();
            const res = await fetch(`${API_BASE}/api/quotes/${quoteId}/revise`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                alert('Revision created successfully!');
                // We keep the enquiry data same, but update quote ID and list
                setQuoteId(data.id);
                setQuoteNumber(data.quoteNumber);
                fetchExistingQuotes(enquiryData.enquiry.RequestNo);
            } else {
                const err = await res.json();
                alert('Error: ' + (err.error || 'Failed to revise quote'));
            }
        } catch (err) {
            console.error('Error revising quote:', err);
            alert('Fatal error revising quote');
        } finally {
            setSaving(false);
        }
    };

    // Select enquiry

    const fetchExistingQuotes = async (requestNo) => {
        try {
            const res = await fetch(`${API_BASE}/api/quotes/${encodeURIComponent(requestNo)}`);
            if (res.ok) {
                const quotes = await res.json();
                setExistingQuotes(quotes);
            }
        } catch (err) {
            console.error('Error fetching existing quotes:', err);
        }
    };


    const handleSelectEnquiry = async (enq) => {
        setSearchTerm(enq.RequestNo);
        setSuggestions([]);
        setShowSuggestions(false);
        setLoading(true);
        setExistingQuotes([]);

        try {
            const res = await fetch(`${API_BASE}/api/quotes/enquiry-data/${encodeURIComponent(enq.RequestNo)}`);
            if (res.ok) {
                const data = await res.json();
                setEnquiryData(data);
                fetchExistingQuotes(enq.RequestNo);
                setQuoteNumber(data.quoteNumber);
                setQuoteId(null); // New quote

                if (data.companyDetails) {
                    setQuoteCompanyName(data.companyDetails.name || 'Almoayyed Air Conditioning');
                    setQuoteLogo(data.companyDetails.logo);
                    setFooterDetails(data.companyDetails);
                }

                setPreparedByOptions(data.preparedByOptions || []);
                // Map customer options for CreatableSelect
                setEnquiryCustomerOptions((data.customerOptions || []).map(c => ({ value: c, label: c })));


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
                setCustomerReference(data.enquiry.RequestNo || ''); // Default to Enquiry No
                setSubject(`Proposal for ${data.enquiry.ProjectName}`);
                setToName(data.enquiry.CustomerName || '');

                setCustomerReference(data.enquiry.RequestNo || ''); // Default to Enquiry No
                setSubject(`Proposal for ${data.enquiry.ProjectName}`);
                setToName(data.enquiry.CustomerName || '');

                if (data.enquiry.CustomerName) {
                    const cust = customersList.find(c => c.CompanyName === data.enquiry.CustomerName);
                    if (cust) {
                        setToAddress(data.customerDetails?.Address || `${cust.Address1 || ''}\n${cust.Address2 || ''}`.trim() || '');
                        setToPhone(`${data.customerDetails?.Phone1 || ''} ${data.customerDetails?.Phone2 ? '/ ' + data.customerDetails?.Phone2 : ''}`.trim() || `${cust.Phone1 || ''} ${cust.Phone2 ? '/ ' + cust.Phone2 : ''}`.trim() || '');
                        setToEmail(data.customerDetails?.EmailId || cust.EmailId || '');
                    } else {
                        // Even if not in master list, use fetched details
                        setToAddress(data.customerDetails?.Address || '');
                        setToPhone(`${data.customerDetails?.Phone1 || ''} ${data.customerDetails?.Phone2 ? '/ ' + data.customerDetails?.Phone2 : ''}`.trim());
                        setToEmail(data.customerDetails?.EmailId || '');
                    }
                } else {
                    setToAddress(data.customerDetails?.Address || '');
                    setToPhone(`${data.customerDetails?.Phone1 || ''} ${data.customerDetails?.Phone2 ? '/ ' + data.customerDetails?.Phone2 : ''}`.trim());
                    setToEmail(data.customerDetails?.EmailId || '');
                }

                // Default to enquiry customer for pricing load
                const initialCustomer = data.enquiry.CustomerName || '';
                loadPricingData(data.enquiry.RequestNo, initialCustomer);


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
        setSelectedJobs([]); // Clear selected jobs
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
    };

    // Toggle clause visibility
    const toggleClause = (clauseKey) => {
        setClauses(prev => ({ ...prev, [clauseKey]: !prev[clauseKey] }));
    };

    // Update clause content
    const updateClauseContent = (key, value) => {
        setClauseContent(prev => ({ ...prev, [key]: value }));
    };

    const getQuotePayload = () => {
        return {
            divisionCode: enquiryData.companyDetails?.divisionCode || 'AAC',
            departmentCode: enquiryData.companyDetails?.departmentCode || '',
            leadJobPrefix: enquiryData.leadJobPrefix || '',
            requestNo: enquiryData.enquiry.RequestNo,
            validityDays,
            preparedBy: preparedBy,
            preparedByEmail: currentUser?.email || currentUser?.EmailId,
            ...clauses,
            ...clauseContent,
            totalAmount,
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
    };

    // Save quote
    const saveQuote = async () => {
        if (!enquiryData) return;

        setSaving(true);
        try {
            const savePayload = getQuotePayload();

            if (!quoteId && existingQuotes.length > 0) {
                // Check if any existing quote has the same customer
                const sameCustomerQuote = existingQuotes.find(q => q.ToName === toName);
                if (sameCustomerQuote) {
                    if (!window.confirm(`A quote (${sameCustomerQuote.QuoteNumber}) already exists for this enquiry and customer. It is recommended to revise the existing quote instead of creating a new quote number. \n\nDo you still want to create a NEW quote number?`)) {
                        setSaving(false);
                        return;
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
                if (data.id) setQuoteId(data.id);
                if (data.quoteNumber) setQuoteNumber(data.quoteNumber);
                {
                    alert('Quote saved successfully!');
                    if (enquiryData) fetchExistingQuotes(enquiryData.enquiry.RequestNo);
                }
            }
        } catch (err) {
            console.error('Error saving quote:', err);
            alert('Failed to save quote');
        } finally {
            setSaving(false);
        }
    };

    // Print quote
    const printQuote = () => {
        const printContent = document.getElementById('quote-preview');
        if (printContent) {
            const printWindow = window.open('', '_blank');
            printWindow.document.write(`
                <html>
                <head>
                    <title>Quote - ${quoteNumber}</title>
                    <title>Quote - ${quoteNumber}</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 40px; -webkit-print-color-adjust: exact; }
                        /* Print Visibility Control */
                        ${!printWithHeader ? `
                            .print-logo-section, .footer-section { display: none !important; }
                            .page-one { min-height: auto !important; } 
                            body { padding: 20px !important; }
                        ` : ''}

                        @media print {
                            body { padding: 0; }
                            .page-break { page-break-before: always; }
                            @page { margin: 10mm; }
                        }
                    </style>
                </head>
                <body>
                    ${printContent.innerHTML}
                </body>
                </html>
            `);
            printWindow.document.close();
            printWindow.print();
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
            <div style={{ width: '480px', background: 'white', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
                {/* Search Section */}
                <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', position: 'relative', zIndex: 2000 }}>
                    <div style={{ position: 'relative' }} ref={searchRef}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                placeholder="Search Enquiry..."
                                value={searchTerm}
                                onChange={(e) => handleSearchInput(e.target.value)}
                                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                                style={{
                                    flex: 1,
                                    padding: '10px 12px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    fontSize: '14px',
                                    position: 'relative',
                                    zIndex: 10,
                                    backgroundColor: '#fff'
                                }}
                            />
                            <button
                                onClick={() => searchTerm.trim() && handleSearchInput(searchTerm)}
                                style={{
                                    padding: '10px 16px',
                                    background: 'white',
                                    color: '#1e293b',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: '500'
                                }}
                            >
                                Search
                            </button>
                        </div>
                        {showSuggestions && suggestions.length > 0 && (
                            <div style={{
                                position: 'absolute', top: '100%', left: 0, right: 0,
                                background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1002, marginTop: '4px',
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
                </div>

                {/* Action Buttons & Clear Selection */}
                {enquiryData && (
                    <div style={{ padding: '6px 12px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>

                        {/* Left Actions: Clear, Save, Revision */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={handleClear} style={{ padding: '6px 8px', background: '#e2e8f0', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', color: '#475569', fontWeight: '600' }}>
                                Clear
                            </button>

                            {/* Save Button */}
                            <button onClick={saveQuote} disabled={saving || !canEdit()} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: !canEdit() ? '#f1f5f9' : '#1e293b', color: !canEdit() ? '#94a3b8' : 'white', border: 'none', borderRadius: '4px', cursor: !canEdit() ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '12px', opacity: saving ? 0.7 : 1 }} title={!canEdit() ? "No permission to modify" : ""}>
                                <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                            </button>

                            {/* Revision Button */}
                            {quoteId && (
                                <button onClick={handleRevise} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}>
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
                        {/* Customer Selection Section - Standalone */}
                        <div style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', background: 'white' }}>
                            {/* <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569' }}>Customer Selection:</h4> */}
                            {/* Removed redundant label "To (Customer)" as per request */}

                            <CreatableSelect
                                styles={customStyles}
                                options={enquiryCustomerOptions}
                                value={enquiryCustomerOptions.find(opt => opt.value === toName)}
                                onChange={(selected) => handleCustomerChange(selected)}
                                placeholder="Select Customer..."
                                formatCreateLabel={(inputValue) => `Use "${inputValue}"`}
                                isClearable
                            />
                        </div>

                        {/* Previous Quotes Section */}
                        {toName && existingQuotes.filter(q => q.ToName === toName).length > 0 && (
                            <div style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569' }}>Previous Quotes / Revisions:</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {(() => {
                                        // Group by QuoteNo
                                        const groups = existingQuotes.filter(q => q.ToName === toName).reduce((acc, q) => {
                                            const key = q.QuoteNo;
                                            if (!acc[key]) acc[key] = [];
                                            acc[key].push(q);
                                            return acc;
                                        }, {});

                                        return Object.entries(groups)
                                            .sort(([a], [b]) => b - a) // Latest quote sequence first
                                            .map(([quoteNo, revisions]) => {
                                                const sortedRevisions = revisions.sort((a, b) => b.RevisionNo - a.RevisionNo);
                                                const latest = sortedRevisions[0];
                                                const isExpanded = expandedGroups[quoteNo];

                                                return (
                                                    <div key={quoteNo} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        {/* Main Card (Latest) */}
                                                        <div
                                                            onClick={() => loadQuote(latest)}
                                                            style={{
                                                                padding: '8px',
                                                                background: quoteId === latest.ID ? '#f0f9ff' : 'white',
                                                                border: `1px solid ${quoteId === latest.ID ? '#0ea5e9' : '#e2e8f0'}`,
                                                                borderRadius: '8px',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.2s',
                                                                boxShadow: quoteId === latest.ID ? '0 2px 4px rgba(14, 165, 233, 0.1)' : 'none'
                                                            }}
                                                            onMouseOver={(e) => { if (quoteId !== latest.ID) e.currentTarget.style.borderColor = '#0ea5e9'; }}
                                                            onMouseOut={(e) => { if (quoteId !== latest.ID) e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                                        >
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontWeight: '700', fontSize: '14px', color: '#0f172a' }}>{latest.QuoteNumber}</span>
                                                                <span style={{
                                                                    fontSize: '11px',
                                                                    padding: '2px 8px',
                                                                    borderRadius: '999px',
                                                                    fontWeight: '600',
                                                                    background: latest.Status === 'Draft' ? '#f1f5f9' : '#dcfce7',
                                                                    color: latest.Status === 'Draft' ? '#64748b' : '#15803d',
                                                                    border: `1px solid ${latest.Status === 'Draft' ? '#e2e8f0' : '#bbf7d0'}`
                                                                }}>{latest.Status}</span>
                                                            </div>



                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '8px' }}>
                                                                <div style={{ fontSize: '11px', color: '#64748b' }}>
                                                                    <div style={{ fontWeight: '500', color: '#475569' }}>{latest.PreparedBy}</div>
                                                                    <div>{format(new Date(latest.QuoteDate), 'dd-MMM-yyyy')}</div>
                                                                </div>
                                                                {sortedRevisions.length > 1 && (
                                                                    <div
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setExpandedGroups(prev => ({ ...prev, [quoteNo]: !prev[quoteNo] }));
                                                                        }}
                                                                        style={{
                                                                            fontSize: '10px',
                                                                            color: '#0ea5e9',
                                                                            fontWeight: '600',
                                                                            background: '#f0f9ff',
                                                                            padding: '2px 8px',
                                                                            borderRadius: '4px',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px',
                                                                            border: '1px solid #bae6fd'
                                                                        }}
                                                                    >
                                                                        {sortedRevisions.length - 1} More Revisions {isExpanded ? '▲' : '▼'}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Expandable History Request - Show R0, R1 etc if expanded */}
                                                        {isExpanded && sortedRevisions.slice(1).map(rev => (
                                                            <div
                                                                key={rev.ID}
                                                                onClick={() => loadQuote(rev)}
                                                                style={{
                                                                    padding: '10px 12px 10px 24px',
                                                                    background: quoteId === rev.ID ? '#f8fafc' : '#f1f5f9',
                                                                    border: `1px solid ${quoteId === rev.ID ? '#334155' : '#e2e8f0'}`,
                                                                    borderLeft: '4px solid #94a3b8',
                                                                    borderRadius: '6px',
                                                                    cursor: 'pointer',
                                                                    fontSize: '13px',
                                                                    marginLeft: '12px',
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center'
                                                                }}
                                                            >
                                                                <div>
                                                                    <span style={{ fontWeight: '600' }}>{rev.QuoteNumber}</span>
                                                                    <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '8px' }}>
                                                                        {format(new Date(rev.QuoteDate), 'dd-MMM-yyyy')}
                                                                    </span>
                                                                </div>
                                                                <span style={{ fontSize: '11px', color: '#64748b' }}>{rev.Status}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                );
                                            });
                                    })()}
                                </div>
                            </div>
                        )}

                        {/* Show rest ONLY if a quote is selected OR it's a completely new enquiry - AND customer is selected */}
                        {toName && (quoteId || existingQuotes.filter(q => q.ToName === toName).length === 0) && (
                            <>

                                {/* Pricing Summary */}
                                <div style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', background: '#f0fdf4' }}>
                                    <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', color: '#166534' }}>Pricing Summary</h4>

                                    {/* Pricing Checkboxes - MOVED to prefix division name below */}
                                    {/* {pricingData && pricingData.jobs && pricingData.jobs.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                                            {pricingData.jobs.map(job => (
                                                <label key={job.itemName} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer', background: 'white', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedJobs.includes(job.itemName)}
                                                        onChange={() => handleJobToggle(job.itemName)}
                                                        style={{ cursor: 'pointer' }}
                                                    />
                                                    {job.itemName}
                                                </label>
                                            ))}
                                        </div>
                                    )} */}

                                    {pricingSummary.length > 0 ? (
                                        <div>
                                            {pricingSummary.map((grp, i) => (
                                                <div key={i} style={{ marginBottom: '8px' }}>
                                                    <h5 style={{ margin: '0 0 4px 0', fontSize: '11px', color: '#166534', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        {((pricingData && pricingData.jobs && pricingData.jobs.some(j => j.itemName === grp.name)) || (pricingData && pricingData.leadJob && pricingData.leadJob === grp.name) || (pricingData && grp.name.includes(pricingData.leadJob))) && (
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedJobs.includes(grp.name)}
                                                                onChange={() => handleJobToggle(grp.name)}
                                                                style={{ cursor: 'pointer' }}
                                                            />
                                                        )}
                                                        {grp.name}
                                                    </h5>
                                                    <div style={{ opacity: selectedJobs.includes(grp.name) ? 1 : 0.5 }}>
                                                        {grp.items.map((item, idx) => (
                                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', padding: '2px 0' }}>
                                                                <span>{item.name}:</span>
                                                                <span>BD {item.total.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                                                            </div>
                                                        ))}
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#1e293b', padding: '4px 0', borderTop: '1px dashed #bbf7d0', marginTop: '2px' }}>
                                                            <span style={{ fontWeight: '600' }}>Total:</span>
                                                            <span style={{ fontWeight: '600' }}>BD {grp.total.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            {grandTotal > 0 && !hasPricedOptional && (
                                                <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '2px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px', color: '#1e293b' }}>
                                                    <span>Total:</span>
                                                    <span>BD {grandTotal.toLocaleString()}</span>
                                                </div>
                                            )}
                                            {!hasUserPricing && (
                                                <div style={{ marginTop: '8px', color: '#dc2626', fontSize: '12px', fontStyle: 'italic' }}>
                                                    * You must enter pricing for your division to proceed.
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: '13px', color: '#64748b' }}>No pricing data found.</div>
                                    )}
                                </div>

                                {/* Metadata Section (Quote Details) - Moved Below Pricing */}
                                <div style={{ padding: '16px', borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>

                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#475569' }}>Quote Details:</h4>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Quote Date</label>
                                        <DateInput value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                                    </div>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Your Ref (Customer Ref)</label>
                                        <input type="text" value={customerReference} onChange={(e) => setCustomerReference(e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                                    </div>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Validity (Days)</label>
                                        <input type="number" value={validityDays} onChange={(e) => setValidityDays(parseInt(e.target.value) || 0)} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
                                    </div>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Subject</label>
                                        <textarea value={subject} onChange={(e) => setSubject(e.target.value)} rows={2} style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', resize: 'vertical' }} />
                                    </div>

                                    <div style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Prepared By</label>
                                        <CreatableSelect
                                            isClearable
                                            onChange={(newValue) => setPreparedBy(newValue ? newValue.value : '')}
                                            onInputChange={(inputValue) => setPreparedBy(inputValue)}
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
                                        <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Signatory</label>
                                        <CreatableSelect
                                            isClearable
                                            onChange={(newValue) => {
                                                setSignatory(newValue ? newValue.value : '');
                                                // Update designation if selected from list
                                                if (newValue && newValue.designation) {
                                                    setSignatoryDesignation(newValue.designation);
                                                }
                                            }}
                                            onInputChange={(inputValue) => setSignatory(inputValue)}
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
                                                        <div
                                                            contentEditable
                                                            onInput={(e) => {
                                                                const val = e.currentTarget.innerHTML;
                                                                if (isCustom) updateCustomClause(id, 'content', val);
                                                                else updateClauseContent(contentKey, val);
                                                            }}
                                                            dangerouslySetInnerHTML={{ __html: isCustom ? customClause.content : clauseContent[contentKey] }}
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

            {/* Right Panel - Quote Preview */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
                        Loading enquiry data...
                    </div>
                ) : (!enquiryData || (existingQuotes.length > 0 && !quoteId)) ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' }}>
                        <div style={{ textAlign: 'center' }}>
                            <FileText size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                            <div>
                                {!enquiryData
                                    ? "Search and select an enquiry to generate a quote"
                                    : "Please select a quote revision from the left panel to preview"}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <style>{tableStyles}</style>
                        <div id="quote-preview" style={{ background: 'white', padding: '40px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: '800px', margin: '0 auto' }}>

                            {/* Page 1 Container */}
                            <div className="page-one" style={{ minHeight: '980px', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ flex: 1 }}>

                                    {/* Header */}
                                    <div className="header-section" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px', alignItems: 'flex-start' }}>
                                        {/* To Section (Left) - Adjusted margin to align with Quote Info Table */}
                                        <div style={{ flex: 1, marginTop: '80px', paddingRight: '20px' }}>
                                            <div style={{ fontWeight: '600', marginBottom: '8px', fontSize: '14px', color: '#334155' }}>To,</div>
                                            <div style={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '4px', fontSize: '14px' }}>{toName}</div>
                                            {toAddress && <div style={{ fontSize: '13px', color: '#64748b', whiteSpace: 'pre-line', lineHeight: '1.5', marginBottom: '4px' }}>{toAddress}</div>}
                                            {toPhone && <div style={{ fontSize: '13px', color: '#64748b' }}>Tel: {toPhone}</div>}
                                            {toEmail && <div style={{ fontSize: '13px', color: '#64748b' }}>Email: {toEmail}</div>}
                                        </div>

                                        {/* Header & Quote Info (Right) */}
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                            {/* Identity */}
                                            <div className="print-logo-section" style={{ marginBottom: '24px', textAlign: 'right' }}>
                                                {quoteLogo ? (
                                                    <img
                                                        src={`${API_BASE}/${encodeURI(quoteLogo)}`}
                                                        alt="Company Logo"
                                                        style={{ height: '80px', width: 'auto', maxWidth: '250px', objectFit: 'contain' }}
                                                    />
                                                ) : (
                                                    <>
                                                        <div style={{ fontSize: '16px', color: '#94a3b8', marginBottom: '4px' }}>المؤيد للمقاولات</div>
                                                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0284c7', letterSpacing: '-0.5px' }}>{quoteCompanyName}</div>
                                                    </>
                                                )}
                                            </div>
                                            <table style={{ fontSize: '13px', borderCollapse: 'collapse', textAlign: 'left' }}>
                                                <tbody>
                                                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                                        <td style={{ padding: '8px 16px', fontWeight: 'bold', color: '#334155' }}>Quote Ref:</td>
                                                        <td style={{ padding: '8px 16px', fontWeight: 'bold', color: '#0f172a' }}>{quoteNumber}</td>
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
                                                <td style={{ padding: '8px 12px', fontWeight: '500' }}>{enquiryData.enquiry.ReceivedFrom || 'N/A'}</td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    {/* Dear Sir/Madam */}
                                    <div style={{ marginBottom: '20px' }}>
                                        <p>Dear Sir/Madam,</p>
                                        <p>Thank you for providing us with this opportunity to submit our offer for the below-mentioned inclusions. We are pleased to submit our quotation as per the details mentioned below. It is our pleasure to serve you and we assure you that our best efforts will always be made to meet your needs.</p>
                                        <p>We hope you will find our offer competitive and kindly revert to us for any clarifications.</p>
                                    </div>
                                </div> {/* End of Flex-1 Content */}

                                {/* Bottom Section (Signature + Footer) */}
                                <div style={{ marginTop: 'auto' }}>

                                    {/* Signature Section */}
                                    <div style={{ marginTop: '50px' }}>
                                        <div style={{ marginBottom: '40px' }}>For {footerDetails?.name || enquiryData.companyDetails?.name || 'Almoayyed Contracting'},</div>
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
                            <div className="page-break" style={{ marginTop: '40px' }}>
                                {/* Visual Divider (Screen Only) */}
                                <div className="no-print" style={{
                                    height: '1px',
                                    borderTop: '2px dashed #94a3b8',
                                    margin: '40px 0',
                                    position: 'relative',
                                    opacity: 0.5
                                }}>
                                    <span style={{
                                        position: 'absolute',
                                        top: '-10px',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        background: 'white',
                                        padding: '0 10px',
                                        color: '#64748b',
                                        fontSize: '12px',
                                        fontWeight: '500'
                                    }}>
                                        Start of Page 2 (Clauses)
                                    </span>
                                </div>

                                {orderedClauses
                                    .map(id => {
                                        const isCustom = id.startsWith('custom_');
                                        const customClause = isCustom ? customClauses.find(c => c.id === id) : null;
                                        const standardClause = !isCustom ? clauseDefinitions.find(c => c.key === id) : null;

                                        if (!customClause && !standardClause) return null; // Should not happen

                                        return isCustom ?
                                            { ...customClause, type: 'custom' } :
                                            { ...standardClause, type: 'standard', isChecked: clauses[id], content: clauseContent[standardClause.contentKey] };
                                    })
                                    .filter(clause => clause && clause.isChecked) // Only show checked
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
                            </div>


                        </div>
                    </>
                )}
            </div>
        </div >
    );
};

export default QuoteForm;
