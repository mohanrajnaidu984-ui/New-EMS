import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Trash2, Save, FileText, ChevronDown, ChevronUp, FileSpreadsheet, X } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext';


const API_BASE = 'http://localhost:5001';

const PricingForm = () => {
    const { currentUser } = useAuth();


    // Search state
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [pendingRequests, setPendingRequests] = useState([]); // Pending List State
    const [pendingSortConfig, setPendingSortConfig] = useState({ field: 'DueDate', direction: 'asc' }); // Default: soonest due date on top
    const searchRef = useRef(null);

    // Pricing state
    const [selectedEnquiry, setSelectedEnquiry] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [pricingData, setPricingData] = useState(null);
    const [values, setValues] = useState({});
    const [newOptionNames, setNewOptionNames] = useState({});
    const [focusedCell, setFocusedCell] = useState(null); // tracks which price input is focused

    // Customer state
    const [selectedCustomer, setSelectedCustomer] = useState('');
    const [addingCustomer, setAddingCustomer] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState('');
    const [customerSuggestions, setCustomerSuggestions] = useState([]);
    const [selectedLeadId, setSelectedLeadId] = useState(null); // Filter by Lead Job ID


    // Debounce timer
    const debounceRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);

        // Fetch Pending Requests
        const userEmail = currentUser?.email || currentUser?.EmailId || '';
        if (userEmail) {
            // Note: Backend expects 'userEmail' as query param, matching the variable used here.
            fetch(`${API_BASE}/api/pricing/list/pending?userEmail=${encodeURIComponent(userEmail)}`)
                .then(res => res.json())
                .then(data => setPendingRequests(data || []))
                .catch(err => console.error('Error fetching pending requests:', err));
        }

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [currentUser]);



    // Fetch suggestions as user types
    const handleSearchInput = (value) => {
        setSearchTerm(value);
        setSuggestions([]);
        // We only clear searchResults if the value is cleared
        if (!value.trim()) {
            setSearchResults([]);
            setPricingData(null);
        }

        if (debounceRef.current) clearTimeout(debounceRef.current);

        // Allow suggestions from 1 character for numbers (Enquiry No) or 2+ for text
        const shouldSuggest = value.trim().length >= 1;

        if (shouldSuggest) {
            debounceRef.current = setTimeout(async () => {
                try {
                    const userEmail = currentUser?.email || currentUser?.EmailId || '';
                    // Note: Use pendingOnly=false for search bar to find everything
                    const res = await fetch(`${API_BASE}/api/pricing/list?search=${encodeURIComponent(value.trim())}&userEmail=${encodeURIComponent(userEmail)}&pendingOnly=false`);
                    if (res.ok) {
                        const data = await res.json();
                        setSuggestions(data.slice(0, 10));
                        setShowSuggestions(data.length > 0);
                    }
                } catch (err) {
                    console.error('Suggestion error:', err);
                }
            }, 300);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

    // Select a suggestion
    const handleSelectSuggestion = (enq) => {
        setSearchTerm(enq.RequestNo);
        setSuggestions([]);
        setShowSuggestions(false);
        setSearchResults([enq]); // Show only the selected enquiry
    };

    // Manual search
    const handleSearch = async () => {
        if (!searchTerm.trim()) return;
        setShowSuggestions(false);
        setSearching(true);
        setPricingData(null);

        try {
            const userEmail = currentUser?.email || currentUser?.EmailId || '';
            const res = await fetch(`${API_BASE}/api/pricing/list?search=${encodeURIComponent(searchTerm.trim())}&userEmail=${encodeURIComponent(userEmail)}&pendingOnly=false`);
            if (res.ok) {
                const data = await res.json();
                setSearchResults(data);
                setSuggestions([]);
            }
        } catch (err) {
            console.error('Manual search error:', err);
            alert('Search failed. Please try again.');
        } finally {
            setSearching(false);
        }
    };

    // Clear search
    const handleClear = () => {
        setSearchTerm('');
        setSuggestions([]);
        setShowSuggestions(false);
        setSearchResults([]);
        setPricingData(null);
        setSelectedEnquiry(null);
        setValues({});
        setSelectedCustomer('');
        setAddingCustomer(false);
        setNewCustomerName('');
    };

    // Load pricing for selected enquiry
    const loadPricing = async (requestNo, customerName = null, preserveValues = null) => {
        setLoading(true);
        setSelectedEnquiry(requestNo);

        try {
            const userEmail = currentUser?.email || currentUser?.EmailId || '';
            const url = `${API_BASE}/api/pricing/${encodeURIComponent(requestNo)}?userEmail=${encodeURIComponent(userEmail)}${customerName ? `&customerName=${encodeURIComponent(customerName)}` : ''}`;
            const res = await fetch(url);

            if (!res.ok) {
                const errData = await res.json();
                console.error('Failed to load pricing:', errData);
                if (res.status === 404) {
                    setPricingData({
                        enquiry: errData.enquiry || { RequestNo: requestNo },
                        jobs: [],
                        options: [],
                        values: [],
                        customers: [],
                        access: { canEditAll: false, visibleJobs: [], editableJobs: [], hasLeadAccess: false }
                    });
                } else {
                    setError(errData.error || 'Failed to load pricing');
                }
            } else {
                const data = await res.json();

                // SANITIZATION: Globally Trim Customer Names to prevent mismatch (Step 944)
                if (data.customers) data.customers = data.customers.map(c => c.trim());
                if (data.activeCustomer) data.activeCustomer = data.activeCustomer.trim();
                // Note: data.enquiry.customerName might be CSV, don't trim internal commas here, handled by split logic
                if (data.extraCustomers) data.extraCustomers = data.extraCustomers.map(c => c.trim());
                if (data.options) data.options.forEach(o => { if (o.customerName) o.customerName = o.customerName.trim(); });
                // NOTE: data.values Sanitization is redundant with line 240 logic but safe to keep for consistency
                if (Array.isArray(data.values)) data.values.forEach(v => { if (v.CustomerName) v.CustomerName = v.CustomerName.trim(); });

                // ---------------------------------------------------------
                // HIERARCHY LOGIC: Treat Parent Jobs as Customers
                // ---------------------------------------------------------
                const internalParentCustomers = [];
                if (data.jobs && data.access && data.access.editableJobs) {
                    data.access.editableJobs.forEach(jobName => {
                        const job = data.jobs.find(j => j.itemName === jobName);
                        if (job && job.parentId) {
                            const parent = data.jobs.find(p => p.id === job.parentId);
                            if (parent) {
                                // Clean the parent name (remove L1/L2 prefixes) to use as Customer Name
                                const cleanParent = parent.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                                if (!internalParentCustomers.includes(cleanParent)) {
                                    internalParentCustomers.push(cleanParent);
                                }
                            }
                        }
                    });
                }

                // Add these internal customers to the main list immediately for display
                if (data.customers) {
                    internalParentCustomers.forEach(pc => {
                        if (!data.customers.includes(pc)) data.customers.push(pc);
                    });
                }
                // ---------------------------------------------------------

                // AUTO-PROVISION TABS (Pricing Sheets)
                // Ensure ALL linked customers (Main + Extra + Internal Parents) have pricing tabs.
                // Sync ALL unique options (e.g. "Base Price", "Option-1") across all customers to ensure consistency.
                const linkedCustomers = [
                    ...(data.enquiry?.customerName || '').split(','),
                    ...(data.extraCustomers || []).flatMap(c => (c || '').split(',')),
                    ...internalParentCustomers // Include internal parents
                ].map(s => s.trim())
                    .filter(s => s && s.length > 0 && s !== '(Not Assigned)')
                    .filter(s => {
                        // STRICT FILTER: Only include if explicitly in Master/Extra OR is an Internal Parent
                        const isMaster = (data.enquiry.customerName || '').includes(s);
                        const isExtra = (data.extraCustomers || []).some(ec => ec.includes(s));
                        const isInternal = internalParentCustomers.includes(s);
                        return isMaster || isExtra || isInternal;
                    });

                // 1. Collect all unique (ItemName, OptionName) tuples from existing options
                // This ensures that if "Option-1" exists for BMS in one customer, it is propagated to all customers.
                const uniqueOptions = [];
                if (data.options) {
                    data.options.forEach(o => {
                        if (!uniqueOptions.some(uo => uo.itemName === o.itemName && uo.name === o.name)) {
                            uniqueOptions.push({ itemName: o.itemName, name: o.name });
                        }
                    });
                }
                // Ensure 'Base Price' is always in the list for all Jobs
                if (data.jobs) {
                    data.jobs.forEach(j => {
                        if (!uniqueOptions.some(uo => uo.itemName === j.itemName && uo.name === 'Base Price')) {
                            uniqueOptions.push({ itemName: j.itemName, name: 'Base Price' });
                        }
                    });
                }

                // 2. Identify missing options for each Linked Customer
                const optionsToCreate = [];

                // Build a helper to find the lead job for a given itemName
                // A job is a lead job if it has no parentId (root job)
                const findLeadJobName = (itemName) => {
                    if (!data.jobs) return null;
                    const job = data.jobs.find(j => j.itemName === itemName);
                    if (!job) return null;
                    // Walk up to root to find lead job
                    let current = job;
                    while (current.parentId) {
                        const parent = data.jobs.find(j => j.id === current.parentId);
                        if (!parent) break;
                        current = parent;
                    }
                    // current is now the root (lead) job
                    return current.itemName;
                };

                linkedCustomers.forEach(custName => {
                    uniqueOptions.forEach(uo => {
                        // Check if this customer already has this option
                        const exists = data.options && data.options.some(o =>
                            o.customerName === custName &&
                            o.itemName === uo.itemName &&
                            o.name === uo.name
                        );

                        if (!exists) {
                            // Derive leadJobName for this option's item
                            const derivedLeadJobName = findLeadJobName(uo.itemName);
                            optionsToCreate.push({
                                customerName: custName,
                                itemName: uo.itemName,
                                optionName: uo.name,
                                leadJobName: derivedLeadJobName   // ← include so filter works
                            });
                        }
                    });
                });

                if (optionsToCreate.length > 0) {
                    // Start Provisioning
                    try {
                        // Track originating optionsToCreate entry so we can backfill from it
                        const promises = optionsToCreate.map((opt, idx) => {
                            const payload = {
                                requestNo: requestNo,
                                optionName: opt.optionName,
                                itemName: opt.itemName,
                                customerName: opt.customerName,
                                leadJobName: opt.leadJobName || null   // ← include derived leadJobName
                            };
                            return fetch(`${API_BASE}/api/pricing/option`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            }).then(r => r.ok ? r.json().then(json => ({ json, srcOpt: opt })) : null);
                        });

                        const results = await Promise.all(promises);

                        // Update local data
                        if (!data.options) data.options = [];
                        if (!data.customers) data.customers = []; // Ensure initialized

                        results.forEach(item => {
                            if (!item || !item.json) return;
                            const res = item.json;   // { success, option: { ID, OptionName, ItemName, CustomerName, LeadJobName } }
                            const srcOpt = item.srcOpt;
                            // API returns the DB row nested under res.option
                            const optRow = res.option || res;
                            const realId = optRow.ID || optRow.id;
                            const realName = optRow.OptionName || optRow.optionName || srcOpt.optionName;
                            const realItem = optRow.ItemName || optRow.itemName || srcOpt.itemName;
                            const realCustomer = optRow.CustomerName || optRow.customerName || srcOpt.customerName;
                            const realLeadJob = optRow.LeadJobName || optRow.leadJobName || srcOpt.leadJobName;

                            if (realId) {
                                data.options.push({
                                    id: realId,
                                    name: realName,
                                    itemName: realItem,
                                    customerName: realCustomer,
                                    leadJobName: realLeadJob
                                });
                            }
                            // Add to active customers list if not already there
                            if (realCustomer && !data.customers.includes(realCustomer)) {
                                data.customers.push(realCustomer);
                            }
                        });

                        // If no customer is currently active (e.g. fresh load), select the Main one or first new one
                        if (!data.activeCustomer && data.customers.length > 0) {
                            data.activeCustomer = data.enquiry.customerName || data.customers[0];
                        }

                    } catch (autoErr) {
                        console.error('Auto-provision failed:', autoErr);
                    }
                }

                // --- KEY MIGRATION & CUSTOMER GROUPING ---
                // Process Raw Array into Nested Map: [CustomerName][Key] = Value
                const groupedValues = {}; // { 'Nass': { '204_280': ... }, 'Ahmed': { ... } }

                // Create a Map of OptionID -> CustomerName for robust lookup
                const optionCustomerMap = {};
                if (data.options) {
                    data.options.forEach(o => {
                        if (o.id) optionCustomerMap[o.id] = o.customerName; // Assume Option's Customer is Truth
                    });
                }

                if (Array.isArray(data.values) && data.jobs) {
                    data.values.forEach(v => {
                        // FIX: Resolve Customer from Option Definition first (Defense against DB having NULL CustomerName on Values)
                        let rawCust = 'Main';
                        if (optionCustomerMap[v.OptionID]) {
                            rawCust = optionCustomerMap[v.OptionID];
                        } else {
                            // Fallback to Value's stored customer or Enquiry default
                            rawCust = v.CustomerName || data.enquiry.customerName || 'Main';
                        }

                        const cust = rawCust.trim(); // Ensure clean customer name match (Step 937)

                        if (!groupedValues[cust]) groupedValues[cust] = {};

                        // Derive Keys
                        // 1. Strict ID Key
                        if (v.EnquiryForID) {
                            const idKey = `${v.OptionID}_${v.EnquiryForID}`;
                            // Priority Logic: If key already exists, overwrite ONLY if this value is "Better Match"?
                            // Currently we partition by `cust` so collisions are rare within same customer bucket.
                            // BUT, if we have "Main" falling back into "Noorwood" bucket due to Option Map logic?
                            // No, `optionCustomerMap` forces it.

                            // Standard Assignment
                            groupedValues[cust][idKey] = v;
                        }

                        // 2. Name / Legacy Keys (Backfill)
                        if (v.EnquiryForItem) {
                            // Try to find job by ID first if possible
                            let job = null;
                            const jobId = v.EnquiryForID;
                            if (jobId) job = data.jobs.find(j => j.id == jobId);

                            if (job) {
                                // We have Job Object, generate robustness keys
                                const nameKey = `${v.OptionID}_${job.itemName}`;
                                groupedValues[cust][nameKey] = v;

                                const cleanName = job.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                                const cleanKey = `${v.OptionID}_${cleanName}`;
                                groupedValues[cust][cleanKey] = v;
                            } else {
                                // Legacy/Orphan Value (No Job ID linked, or Job missing)
                                // Just use stored ItemName
                                const nameKey = `${v.OptionID}_${v.EnquiryForItem}`;
                                groupedValues[cust][nameKey] = v;
                            }
                        }
                    });
                }

                // Store global map
                data.allValues = groupedValues;

                // Set active values for current view
                const activeCust = data.activeCustomer || (data.customers && data.customers[0]);
                data.values = groupedValues[activeCust] || {};



                // Deduplicate Options (Backend sometimes sends duplicates due to joins)
                if (data.options) {
                    const seen = new Set();
                    data.options = data.options.filter(o => {
                        const key = `${o.name}|${o.itemName}|${o.customerName}`;
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                }

                // Cleanup: Filter out malformed customer names (containing commas) from display
                if (data.customers) {
                    data.customers = data.customers.filter(c => c && typeof c === 'string' && !c.includes(','));

                    // STRICT DISPLAY FILTER: 
                    // Ensure displayed customers are ONLY those currently valid in Enquiry or Internal Parents
                    // This hides stale customers that might still exist in the options table
                    data.customers = data.customers.filter(s => {
                        const isMaster = (data.enquiry?.customerName || '').includes(s);
                        const isExtra = (data.extraCustomers || []).some(ec => ec && typeof ec === 'string' && ec.includes(s));
                        const isInternal = (internalParentCustomers || []).includes(s);
                        return isMaster || isExtra || isInternal;
                    });
                }

                // ---------------------------------------------------------
                // VISIBILITY FILTER: Restrict Tabs based on User Scope
                // ---------------------------------------------------------
                // Rule: Users see a Customer Tab ONLY if:
                // 1. It is the Main Enquiry Customer.
                // 2. The Tab Name matches their own Job Name (Internal Customer).
                // 3. They have a Pricing Option (Row) explicitly assigned to their Job in that Tab.
                // 4. They are an Admin/Manager (canEditAll).

                // ---------------------------------------------------------
                // VISIBILITY FILTER: Strict Role-Based View
                // ---------------------------------------------------------
                // ---------------------------------------------------------
                // VISIBILITY FILTER: Dynamic filtering moved to useMemo (Step 1727)
                // ---------------------------------------------------------

                // ---------------------------------------------------------
                // ---------------------------------------------------------

                setPricingData(data);

                // Set selected customer (Ensure it's valid after filtering)
                let validCustomer = customerName;
                if (!validCustomer || validCustomer.includes(',') || !data.customers.includes(validCustomer)) {
                    validCustomer = data.activeCustomer;
                    if (!data.customers.includes(validCustomer)) {
                        validCustomer = data.customers[0] || '';
                    }
                }
                setSelectedCustomer(validCustomer);

                // Initialize state values using ID-based keys with Legacy Fallback
                const initialValues = {};
                // Pre-calculate Visible Set for Hybrid Aggregation
                // Logic MUST Match 'visibleJobs' calculation below:
                // Lead Job + Direct Children.
                const visibleIds = new Set();

                if (data.jobs && data.access && data.access.visibleJobs) {
                    data.access.visibleJobs.forEach(vName => {
                        const vJob = data.jobs.find(j => j.itemName === vName);
                        if (vJob) visibleIds.add(vJob.id);
                    });
                }

                if (data.options && data.jobs) {
                    // Recursive Aggregation Logic
                    const getRecursivePrice = (rootOptionId, jobId, visited = new Set()) => {
                        if (visited.has(jobId)) return 0;
                        visited.add(jobId);

                        // 1. Identify "Active" Option ID for this Job level
                        // Because "Base Price" might exist as distinct Option IDs for different jobs (e.g. ID 9 for BMS, ID 11 for Electrical)
                        let activeOptionId = rootOptionId;

                        const rootOpt = data.options.find(o => o.id === rootOptionId);
                        if (rootOpt) {
                            const job = data.jobs.find(j => j.id === jobId);
                            if (job) {
                                // Find specific option for this job with same name
                                let specificOpt = data.options.find(o =>
                                    o.name === rootOpt.name &&
                                    o.customerName === rootOpt.customerName &&
                                    (o.itemName === job.itemName)
                                );
                                if (!specificOpt) {
                                    // Fallback to Clean Name lookup
                                    const cleanJobName = job.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                                    specificOpt = data.options.find(o =>
                                        o.name === rootOpt.name &&
                                        o.customerName === rootOpt.customerName &&
                                        (o.itemName === cleanJobName)
                                    );
                                }
                                if (specificOpt) activeOptionId = specificOpt.id;
                            }
                        }

                        // 2. Calculate Self Price using the Resolved Option ID
                        const idKey = `${activeOptionId}_${jobId}`;
                        let selfPrice = 0;

                        // Check strict match (Allow 0 to be displayed)
                        if (data.values && data.values[idKey] && parseFloat(data.values[idKey].Price) >= 0) {
                            selfPrice = parseFloat(data.values[idKey].Price);
                        } else {
                            // Fallbacks (Name/Clean)
                            const job = data.jobs.find(j => j.id === jobId);
                            if (job) {
                                const nameKey = `${activeOptionId}_${job.itemName}`;
                                if (data.values && data.values[nameKey] && parseFloat(data.values[nameKey].Price) >= 0) {
                                    selfPrice = parseFloat(data.values[nameKey].Price);
                                } else {
                                    const cleanName = job.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                                    const cleanKey = `${activeOptionId}_${cleanName}`;
                                    if (data.values && data.values[cleanKey] && parseFloat(data.values[cleanKey].Price) >= 0) {
                                        selfPrice = parseFloat(data.values[cleanKey].Price);
                                    }
                                }
                            }
                        }

                        // 3. Sum Children (Pass the ORIGINAL Root Option Name logic down)
                        const children = data.jobs.filter(j => j.parentId === jobId);
                        let childrenSum = 0;
                        children.forEach(c => {
                            // Hybrid Aggregation: Only sum HIDDEN children. 
                            // If a child is part of the "Visible Jobs" list, it has its own input row, so we exclude it (Component Pricing model).
                            // But we need to know if it's visible. 
                            // data.jobs doesn't have 'visible' prop yet.
                            // We can use the 'targetJobs' logic or pass visible IDs.

                            // For Initial Load, we assume the standard visibility logic: 
                            // Lead Job + Direct Children (Level 1/2) are Visible.
                            // Since we don't have the View State calculated yet, we approximate:
                            // If Child is likely to be displayed (L2), skip it.

                            // Better: Calculate 'visibleIds' set first in loadPricing.
                            if (visibleIds.has(c.id)) {
                                return; // Skip Visible Child
                            }

                            // We pass rootOptionId again, let the next recursion resolve its own best ID
                            childrenSum += getRecursivePrice(rootOptionId, c.id, new Set(visited));
                        });

                        return selfPrice + childrenSum;
                    };


                    data.options.forEach(opt => {
                        data.jobs.forEach(job => {
                            // Calculate Aggregated Price
                            const aggregatedPrice = getRecursivePrice(opt.id, job.id);

                            // Determine if we should show this value (Show if > 0 OR if explicitly set to 0 in DB)
                            const exactKey = `${opt.id}_${job.id}`;
                            const hasExplicitRow = data.values && (
                                data.values[exactKey] ||
                                (data.values[`${opt.id}_${job.itemName}`]) // Check legacy key too
                            );

                            if (aggregatedPrice > 0 || (aggregatedPrice === 0 && hasExplicitRow)) {
                                const idKey = `${opt.id}_${job.id}`;
                                initialValues[idKey] = aggregatedPrice;
                            }
                        });
                    });
                }
                if (preserveValues) {
                    setValues({ ...initialValues, ...preserveValues });
                } else {
                    setValues(initialValues);
                }

                // Auto-Select First VISIBLE Lead Job
                if (data.jobs) {
                    const visibleScope = data.access?.visibleJobs || [];
                    const hasPrefix = data.jobs.some(j => !j.parentId && /^L\d+\s-\s/.test(j.itemName));

                    // Helper for tree visibility (recursive check matching render logic)
                    const isTreeVisible = (jobId) => {
                        const job = data.jobs.find(j => j.id == jobId);
                        if (!job) return false;
                        // Strict scope check: item MUST be in visibleScope
                        if (visibleScope.includes(job.itemName)) return true;

                        const children = data.jobs.filter(j => j.parentId == jobId);
                        return children.some(c => isTreeVisible(c.id));
                    };

                    const roots = data.jobs.filter(j =>
                        !j.parentId &&
                        (visibleScope.length === 0 || isTreeVisible(j.id)) &&
                        (!hasPrefix || /^L\d+\s-\s/.test(j.itemName))
                    );

                    if (roots.length > 0) {
                        // Priority: Auto-select a root the user is explicitly assigned to
                        const myJobs = (data.access && data.access.editableJobs) || [];
                        const myRoot = roots.find(r => myJobs.includes(r.itemName));
                        const targetRoot = myRoot || roots[0];

                        // Only auto-select if not already set or invalid (Step 865)
                        if (!selectedLeadId || !data.jobs.find(j => j.id === selectedLeadId)) {
                            setSelectedLeadId(targetRoot.id);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Error loading pricing:', err);
        } finally {
            setLoading(false);
        }
    };

    // Add new option row
    const addOption = async (targetScope, explicitName = null, explicitCustomer = null) => {
        const currentValues = { ...values }; // Capture current state
        const optionName = explicitName || newOptionNames[targetScope] || '';
        if (!optionName.trim() || !pricingData) return;

        let targetItemName = targetScope;
        const leadJob = pricingData.jobs.find(j => j.isLead);

        // Resolve display name back to raw ItemName
        // Logic: specific job names are used as keys. If key matches lead job display name, map to lead item.
        if (
            targetScope.includes(' / Lead Job') ||
            targetScope === 'Lead Job' ||
            (leadJob && targetScope === `${leadJob.itemName} / Lead Job`) ||
            (leadJob && targetScope === `${leadJob.itemName} (Lead Job)`) ||  // Fix: groupName uses "(Lead Job)" format
            targetScope.endsWith(' (Lead Job)')  // Generic fallback for any lead job label
        ) {
            targetItemName = leadJob ? leadJob.itemName : null;
        }

        // Determine customer name for payload
        // Always send the active customer name to ensure specific binding
        const custName = explicitCustomer || selectedCustomer;

        // Determine Lead Job Context (Step 1013)
        const activeLeadJob = pricingData.jobs.find(j => j.id == selectedLeadId);
        const leadJobName = activeLeadJob ? activeLeadJob.itemName : null;

        const payload = {
            requestNo: pricingData.enquiry.requestNo,
            optionName: optionName.trim(),
            itemName: targetItemName,
            customerName: custName,
            leadJobName: leadJobName // Bind Option to current Lead Job Scope
        };

        try {
            const res = await fetch(`${API_BASE}/api/pricing/option`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setNewOptionNames(prev => ({ ...prev, [targetScope]: '' }));
                // Reload with the newly active customer
                loadPricing(pricingData.enquiry.requestNo, explicitCustomer || selectedCustomer, currentValues);
            } else {
                console.error('Add Option: Failed', res.status, res.statusText);
            }
        } catch (err) {
            console.error('Error adding option:', err);
        }
    };

    // Delete option row
    const deleteOption = async (optionId) => {
        if (!window.confirm('Delete this option row?')) return;

        const currentValues = { ...values }; // Capture current state

        try {
            const res = await fetch(`${API_BASE}/api/pricing/option/${optionId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                // Remove the deleted option's values from currentValues to prevent stale keys
                const cleanedValues = Object.keys(currentValues).reduce((acc, key) => {
                    if (!key.startsWith(`${optionId}_`)) {
                        acc[key] = currentValues[key];
                    }
                    return acc;
                }, {});

                loadPricing(pricingData.enquiry.requestNo, selectedCustomer, cleanedValues);
            }
        } catch (err) {
            console.error('Error deleting option:', err);
        }
    };

    // Format a numeric value as ###,###,###.### (up to 3 decimal places, no trailing zeros)
    const formatPrice = (val) => {
        if (val === '' || val === undefined || val === null) return '';
        const num = parseFloat(val);
        if (isNaN(num)) return '';
        // Use locale string with max 3 decimal places, no trailing zeros
        return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
    };

    // Update cell value — always strip commas and store as plain float
    const handleValueChange = (optionId, jobId, value) => {
        const key = `${optionId}_${jobId}`;
        const stripped = String(value).replace(/,/g, ''); // remove commas the user may paste
        const floatVal = parseFloat(stripped);
        setValues(prev => ({
            ...prev,
            [key]: stripped === '' ? '' : (isNaN(floatVal) ? '' : floatVal)
        }));
    };

    // Save all prices
    const saveAll = async () => {
        if (!pricingData) return;

        const requestNo = pricingData.enquiry.requestNo;
        const userName = currentUser?.name || currentUser?.FullName || 'Unknown';
        const editableJobs = pricingData.access.editableJobs || []; // Contains Names

        // Determine all keys that have data (State + DB)
        const allKeys = new Set([
            ...Object.keys(values),
            ...Object.keys(pricingData.values || {})
        ]);

        let valuesToSave = [];
        let skippedCount = 0;

        allKeys.forEach(key => {
            const parts = key.split('_');
            if (parts.length < 2) return;

            // Skip simulated option keys (e.g. 'simulated_base_1708450547000_jobId')
            // These are frontend-only placeholders; real DB options should be used instead.
            if (key.startsWith('simulated')) return;

            const optionId = parseInt(parts[0]);
            const jobId = parseInt(parts[1]); // Assuming Job ID is int

            // Find Job and Option
            const job = pricingData.jobs.find(j => j.id === jobId);
            const opt = pricingData.options.find(o => o.id === optionId);

            if (!job || !opt) return;

            // Permission Check (based on Job Name still)
            if (!editableJobs.includes(job.itemName)) return;

            // Determine Price
            let displayPrice = 0;
            if (values.hasOwnProperty(key)) {
                const userValue = values[key];
                if (userValue !== '' && userValue !== undefined && userValue !== null) {
                    displayPrice = parseFloat(userValue) || 0;
                }
            } else if (pricingData.values[key] && pricingData.values[key].Price) {
                // If using DB value, check if it was aggregated?? No, DB stores Self.
                // Wait, if we never touched 'values[key]', then we display DB value?
                // But DB value is Self.
                // If we don't have it in state, it means user didn't edit it.
                // But render is showing Aggregated. initialValues puts Aggregated into State.
                // So state ALWAYS has Aggregated.
                if (values[key] === undefined) {
                    // This case happens if initialValues didn't populate for some reason, or key missing.
                    // Fallback to DB self price.
                    displayPrice = parseFloat(pricingData.values[key].Price) || 0;
                }
            }

            // --- REVERSE AGGREGATION LOGIC (Subtract Hidden Children) ---
            // Re-calculate the sum of *Hidden* children for this specific Option & Job
            // We reuse the recursive logic but EXCLUDE self.

            const getHiddenChildrenSum = (rootOptionId, rootJobId) => {
                // Clone of logic in loadPricing, but focusing on Children only

                // 1. Identify Root Option "Instance"
                let activeOptionId = rootOptionId;
                const rootOpt = pricingData.options.find(o => o.id === rootOptionId);
                const rootJob = pricingData.jobs.find(j => j.id === rootJobId);

                if (rootOpt && rootJob) {
                    let specificOpt = pricingData.options.find(o =>
                        o.name === rootOpt.name &&
                        o.customerName === rootOpt.customerName &&
                        (o.itemName === rootJob.itemName)
                    );
                    if (!specificOpt) {
                        const cleanJobName = rootJob.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                        specificOpt = pricingData.options.find(o =>
                            o.name === rootOpt.name &&
                            o.customerName === rootOpt.customerName &&
                            (o.itemName === cleanJobName)
                        );
                    }
                    if (specificOpt) activeOptionId = specificOpt.id;
                }

                // Recursive Sum
                let sum = 0;
                const children = pricingData.jobs.filter(j => j.parentId === rootJobId);

                children.forEach(child => {
                    // VISIBILITY CHECK:
                    // If Child is VISIBLE in current view, it is NOT hidden. Do not subtract it.
                    // (Because render didn't add it in the first place).
                    // However, 'visibleJobs' variable is local to render. 
                    // We need to reconstruct the visibility scope here or access it.
                    // Fortunatley, 'targetJobs' logic in Render relies on selectedLeadId + strict Scope.

                    // We can approxVisibility check:
                    // If child is a Direct Child of Root (L2), it is likely Visible if Root is L1.
                    // Logic: L1 is Lead. L2 are Visible inputs. L3 are Hidden inputs.
                    // So:
                    // If RootJob == LeadJob -> Children (L2) are VISIBLE. Sum = 0 (Don't subtract).
                    // If RootJob != LeadJob (it's L2) -> Children (L3) are HIDDEN. Sum = L3 Aggregates.

                    // FIX: Hybrid Aggregation - Subtract ONLY Hidden Children.
                    // If Child is Visible, the User Input (DisplayPrice) does NOT include it (Component Pricing).
                    // So we do NOT subtract it.

                    const isVisible = pricingData.access.visibleJobs.includes(child.itemName);

                    if (isVisible) {
                        // Children are visible L2 rows. Do NOT subtract them.
                        return;
                    } else {
                        // Children are hidden L3 rows. Subtract them!
                        // We need the AGGREGATED price of the Child (Self + Its Children).
                        // Because the User Input (DisplayPrice) includes Child (Aggregate).
                        // We need to call getRecursivePrice view-emulator?

                        // Wait, we need the EXACT Same logic as Render.
                        // Let's copy-paste a helper or use recursion here.

                        // Helper to get total price of a child node (Aggregated)
                        const getChildAggregate = (optId, chId) => {
                            let childActiveOptId = optId;
                            // Re-resolve Option ID properly (Inheritance Logic)
                            const pOpt = pricingData.options.find(o => o.id === optId);
                            const pJob = pricingData.jobs.find(j => j.id === chId);
                            if (pOpt && pJob) {
                                // Try Exact Match first
                                let sOpt = pricingData.options.find(o =>
                                    o.name === pOpt.name && o.customerName === pOpt.customerName && o.itemName === pJob.itemName
                                );
                                // Try Clean Match
                                if (!sOpt) {
                                    const cleanPJobName = pJob.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                                    sOpt = pricingData.options.find(o =>
                                        o.name === pOpt.name && o.customerName === pOpt.customerName && o.itemName === cleanPJobName
                                    );
                                }
                                if (sOpt) childActiveOptId = sOpt.id;
                            }

                            const key = `${childActiveOptId}_${chId}`;
                            let val = 0;
                            // Priority 1: Check Current State (User Edits)
                            if (values[key] !== undefined && values[key] !== '') {
                                val = parseFloat(values[key]) || 0;
                            }
                            // Priority 2: Check Database Values (Pre-loaded)
                            else if (pricingData.values[key]) {
                                val = parseFloat(pricingData.values[key].Price) || 0;
                            }

                            // Fallbacks (Name based keys)
                            if (val === 0 && pJob) {
                                const nKey = `${childActiveOptId}_${pJob.itemName}`;
                                if (values[nKey] !== undefined && values[nKey] !== '') val = parseFloat(values[nKey]);
                                else if (pricingData.values[nKey]) val = parseFloat(pricingData.values[nKey].Price);
                            }

                            let gcSum = 0;
                            const gKids = pricingData.jobs.filter(x => x.parentId === chId);
                            gKids.forEach(mk => gcSum += getChildAggregate(optId, mk.id));
                            return val + gcSum;
                        };

                        sum += getChildAggregate(rootOptionId, child.id);
                    }
                });
                return sum;
            };



            const hiddenSum = getHiddenChildrenSum(optionId, jobId);

            // CASCADING ZERO LOGIC:
            // If User Explicitly set 0, and HiddenChildren have value, we must CLEAR them.
            const userInitiatedZero = (values.hasOwnProperty(key) && parseFloat(values[key]) === 0);

            if (userInitiatedZero && hiddenSum > 0) {
                // Automatically clear hidden children (No Confirm - assume intent)

                // Collect all hidden descendants recursively
                const collectWipableNodes = (optId, chId) => {
                    const isVisible = pricingData.access.visibleJobs.includes(pricingData.jobs.find(j => j.id === chId)?.itemName);
                    if (isVisible) return;

                    let childActiveOptId = optId;
                    const pOpt = pricingData.options.find(o => o.id === optId);
                    const pJob = pricingData.jobs.find(j => j.id === chId);
                    if (pOpt && pJob) {
                        let sOpt = pricingData.options.find(o =>
                            o.name === pOpt.name && o.customerName === pOpt.customerName && o.itemName === pJob.itemName
                        );
                        if (!sOpt) {
                            const cleanPJobName = pJob.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                            sOpt = pricingData.options.find(o =>
                                o.name === pOpt.name && o.customerName === pOpt.customerName && o.itemName === cleanPJobName
                            );
                        }
                        if (sOpt) childActiveOptId = sOpt.id;

                        valuesToSave.push({
                            optionId: childActiveOptId,
                            optionName: pOpt.name,
                            enquiryForItem: pJob.itemName,
                            enquiryForId: chId,
                            price: 0,
                            customerName: pOpt.customerName,
                            leadJobName: pOpt.leadJobName
                        });
                    }

                    const gKids = pricingData.jobs.filter(x => x.parentId === chId);
                    gKids.forEach(mk => collectWipableNodes(optId, mk.id));
                };

                const children = pricingData.jobs.filter(j => j.parentId === jobId);
                children.forEach(c => collectWipableNodes(optionId, c.id));

                // Force Self Price to 0 (override hiddenSum subtraction)
                // Because if we wipe hiddenSum, it becomes 0.
                // So SelfPrice = Display(0) - NewHiddenSum(0) = 0.
            }

            // If we wiped children, treat hiddenSum as 0.
            const effectiveHiddenSum = (userInitiatedZero && hiddenSum > 0) ? 0 : hiddenSum;

            const finalSelfPrice = displayPrice - effectiveHiddenSum;

            // Actually, if finalSelfPrice is effectively the Component Cost.

            let priceToSave = finalSelfPrice;
            if (priceToSave < 0 && displayPrice > 0) {
                // Edge case: User entered 10, but Hidden Children sum is 20.
                // This implies they want to reduce the package cost.
                // We can't reduce Hidden Children automatically.
                // We have to set Self to 0? Or negative?
                // Let's set to 0.
                priceToSave = 0;
            } else if (priceToSave < 0) {
                // if display was 0, save 0.
                priceToSave = 0;
            }

            // NEW SKIP LOGIC (Robust Dirty Check):
            const dbValRow = pricingData.values[key];
            const currentDbPrice = dbValRow ? (parseFloat(dbValRow.Price) || 0) : 0;
            const hasExplicitDbRow = !!dbValRow;
            const isNoChange = Math.abs(priceToSave - currentDbPrice) < 0.01;

            if (isNoChange) {
                // Skip if already explicit in DB, or if implicit (0) and untouched by user
                if (hasExplicitDbRow || !values.hasOwnProperty(key)) {
                    skippedCount++;
                    return;
                }
                // If implicit 0 but User explicitly touched/typed 0, we PROCEED to save (Create Explicit 0 Row)
            }

            valuesToSave.push({
                optionId: optionId,
                optionName: opt.name,
                enquiryForItem: job.itemName, // Send Name for legacy compat/logging
                enquiryForId: job.id,         // Send ID for strict linking
                price: priceToSave,           // SAVE NET SELF PRICE
                customerName: opt.customerName, // Include Customer Name
                leadJobName: opt.leadJobName    // Include Lead Job Name (Step 1078 - from Option)
            });
        });

        if (valuesToSave.length === 0) {
            alert('⚠️ Cannot save: All price values are empty or zero.\n\nPlease enter at least one valid price value greater than zero.');
            loadPricing(pricingData.enquiry.requestNo, selectedCustomer);
            return;
        }

        if (skippedCount > 0) {
            if (!window.confirm(`${skippedCount} items with zero values will be skipped. Save ${valuesToSave.length} valid items?`)) {
                loadPricing(pricingData.enquiry.requestNo, selectedCustomer);
                return;
            }
        }

        setSaving(true);
        const promises = [];

        try {
            // Batch saving (Concurrent requests)
            for (const item of valuesToSave) {
                const p = fetch(`${API_BASE}/api/pricing/value`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        requestNo: requestNo,
                        optionId: item.optionId,
                        enquiryForItem: item.enquiryForItem,
                        enquiryForId: item.enquiryForId, // NEW FIELD
                        price: item.price,
                        updatedBy: userName,
                        customerName: item.customerName, // Use item-specific customer name
                        leadJobName: item.leadJobName    // Use item-specific lead job name (Step 1078)
                    })
                });
                promises.push(p);
            }

            await Promise.all(promises);
            alert('✓ Pricing saved successfully!');
            loadPricing(pricingData.enquiry.requestNo, selectedCustomer);
        } catch (err) {
            console.error('Error saving:', err);
            alert('Failed to save pricing');
        } finally {
            setSaving(false);
        }
    };

    // Delete customer pricing
    const deleteCustomer = async (custName) => {
        if (!window.confirm(`Are you sure you want to delete all pricing for "${custName}"?`)) return;

        try {
            const res = await fetch(`${API_BASE}/api/pricing/customer`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }, // Fetch keeps body on DELETE
                body: JSON.stringify({
                    requestNo: pricingData.enquiry.requestNo,
                    customerName: custName
                })
            });

            if (res.ok) {
                const newActive = pricingData.enquiry.customerName || '';
                loadPricing(pricingData.enquiry.requestNo, newActive);
            } else {
                alert('Failed to delete customer pricing');
            }
        } catch (err) {
            console.error('Error deleting customer:', err);
            alert('Error deleting customer');
        }
    };

    // Dynamic Customer Tabs Filter (Step 1727)
    const displayedCustomers = React.useMemo(() => {
        if (!pricingData) return [];
        // Admins/Managers see everything
        if (pricingData.access?.canEditAll) return pricingData.customers || [];

        const myJobs = pricingData.access.editableJobs || [];
        const selectedJob = pricingData.jobs?.find(j => j.id == selectedLeadId);
        if (!selectedJob) return pricingData.customers || [];

        // 1. Identify External Customers (Main + Extra)
        const externalCustomers = [
            ...(pricingData.enquiry?.customerName || '').split(','),
            ...(pricingData.extraCustomers || []).flatMap(c => (c || '').split(','))
        ].map(s => s.trim()).filter(Boolean);

        // 2. Identify Role for THIS selection
        const isLeadForThisSelection = myJobs.includes(selectedJob.itemName);

        // 3. Identify Parent Customers (subjob logic)
        const parentCustomers = new Set();
        if (!isLeadForThisSelection) {
            myJobs.forEach(myJobName => {
                const jobObj = pricingData.jobs.find(j => j.itemName === myJobName);
                if (jobObj) {
                    // Check if descendant of selectedLeadJob
                    let isDescendant = false;
                    let curr = jobObj;
                    while (curr && curr.parentId) {
                        if (curr.parentId == selectedLeadId) {
                            isDescendant = true;
                            break;
                        }
                        curr = pricingData.jobs.find(j => j.id == curr.parentId);
                    }

                    if (isDescendant) {
                        const parentObj = pricingData.jobs.find(p => p.id == jobObj.parentId);
                        if (parentObj) {
                            // Clean name as per heuristic (Step 1727)
                            const cleanP = parentObj.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                            parentCustomers.add(cleanP);
                        }
                    }
                }
            });
        }

        // 4. Return filtered list: External (if Lead) OR Parent (if Sub)
        return (pricingData.customers || []).filter(cName => {
            const cleanC = cName.trim();
            // LEAD ACCESS: If user has lead access (global or assigned to any root), show all external customers
            if (isLeadForThisSelection || pricingData.access?.hasLeadAccess) {
                return externalCustomers.includes(cleanC);
            } else if (parentCustomers.size > 0) {
                // INTERNAL VIEW: Show parent jobs as customers (Sales to other divisions)
                return parentCustomers.has(cleanC);
            }
            return false;
        });
    }, [pricingData, selectedLeadId]);

    // Sync selectedCustomer with displayed tabs
    useEffect(() => {
        if (displayedCustomers.length > 0 && pricingData && !loading) {
            if (!selectedCustomer || !displayedCustomers.includes(selectedCustomer)) {
                console.log('Syncing selectedCustomer to first available tab:', displayedCustomers[0]);
                loadPricing(pricingData.enquiry.requestNo, displayedCustomers[0], values);
            }
        }
    }, [displayedCustomers]);

    // Get visible jobs
    const visibleJobs = pricingData ? pricingData.jobs.filter(j => j.visible !== false) : [];

    // Filter Options based on Custom Scope Logic
    // Filter Options based on Custom Scope Logic
    const filteredOptions = React.useMemo(() => {
        if (!pricingData || !pricingData.options) return [];

        const seenKeys = new Set();
        const editable = pricingData.access.editableJobs || [];

        // Calculate Scope of Active Lead Job (for Filtering)
        let leadScope = new Set();
        let activeLeadName = null;

        if (selectedLeadId && pricingData.jobs) {
            const leadJob = pricingData.jobs.find(j => j.id == selectedLeadId);
            if (leadJob) {
                activeLeadName = leadJob.itemName;

                // Recurse to find all children keys
                const getChildren = (pId) => {
                    const children = pricingData.jobs.filter(j => j.parentId === pId);
                    children.forEach(c => {
                        leadScope.add(c.itemName);
                        getChildren(c.id);
                    });
                };
                leadScope.add(leadJob.itemName);
                getChildren(leadJob.id);
            }
        }

        // Helper to check if option belongs to a child of an editable job
        const isRelatedToEditable = (optItemName) => {
            if (!optItemName) return false;
            // 1. Direct Match
            if (editable.includes(optItemName)) return true;

            // 2. Child Match (e.g. User has 'Electrical', Option is 'BMS')
            // Find job object for the option's item name
            const optJob = pricingData.jobs.find(j => j.itemName === optItemName);
            if (!optJob) return false;

            // Check if its parent is in editable list
            if (optJob.parentId) {
                const parentJob = pricingData.jobs.find(p => p.id === optJob.parentId);
                if (parentJob && editable.includes(parentJob.itemName)) return true;
            }

            // 3. Special Case: Electrical <-> BMS
            if (optItemName.includes('BMS') && editable.some(e => e.includes('Electrical'))) return true;

            return false;
        };

        const results = pricingData.options.filter(o => {
            // LEAD JOB SCOPING (Step 1013)
            // Ensure option belongs to the currently viewed Lead Job logic
            if (activeLeadName) {
                if (o.leadJobName) {
                    // Strict Match (New Data)
                    if (o.leadJobName !== activeLeadName) return false;
                } else {
                    // Legacy Fallback: Tree Match
                    // If option item is NOT in the current Lead Job's hierarchy, hide it
                    // This prevents "BMS" from L1 appearing in L2 if L2 matches "BMS" 
                    // (Actually, if Shared Sub-Job, it might legitimately appear? 
                    //  User wants SEPARATION. So we enforce strict tree.)
                    if (o.itemName && !leadScope.has(o.itemName)) return false;
                }
            }

            // Sub-Job User: Show options if they are Editable OR if they are part of the current View Hierarchy (Read-Only)
            const isScopeMatch = pricingData.access.hasLeadAccess || isRelatedToEditable(o.itemName) || (activeLeadName && leadScope.has(o.itemName));

            // Strict Customer Match (Option must belong to the active tab)
            const isCustomerMatch = o.customerName === selectedCustomer;

            if (isScopeMatch && isCustomerMatch) {
                // Deduplicate for Display (Double safety)
                const dedupKey = `${o.name}-${o.itemName}-${o.customerName}-${o.leadJobName || 'Legacy'}`;
                if (seenKeys.has(dedupKey)) return false;
                seenKeys.add(dedupKey);
                return true;
            }

            return false;
        });

        // ENSURE "Base Price" row is ALWAYS present for the lead job in the active customer tab
        const leadJob = pricingData.jobs?.find(j => j.id == selectedLeadId);
        if (leadJob && selectedCustomer && !results.some(o => o.name === 'Base Price' && o.itemName === leadJob.itemName)) {
            results.push({
                id: 'simulated_base_' + Date.now(),
                name: 'Base Price',
                itemName: leadJob.itemName,
                customerName: selectedCustomer,
                isSimulated: true
            });
        }

        return results;
    }, [pricingData, selectedCustomer, selectedLeadId]);

    return (
        <div style={{ padding: '20px', background: '#f5f7fa', minHeight: 'calc(100vh - 80px)' }}>
            {/* Search Bar with Autocomplete */}
            <div style={{ background: 'white', padding: '16px 20px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }} ref={searchRef}>
                    <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                        <input
                            type="text"
                            placeholder="Search by Enquiry No., Project, or Customer..."
                            value={searchTerm}
                            onChange={(e) => handleSearchInput(e.target.value)}
                            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                fontSize: '14px'
                            }}
                        />
                        {/* Suggestions Dropdown */}
                        {showSuggestions && suggestions.length > 0 && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                background: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                zIndex: 1000,
                                maxHeight: '300px',
                                overflowY: 'auto',
                                marginTop: '4px'
                            }}>
                                {suggestions.map((enq, idx) => (
                                    <div
                                        key={enq.RequestNo || idx}
                                        onClick={() => handleSelectSuggestion(enq)}
                                        style={{
                                            padding: '10px 14px',
                                            cursor: 'pointer',
                                            borderBottom: idx < suggestions.length - 1 ? '1px solid #f1f5f9' : 'none',
                                            transition: 'background 0.15s'
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                                        onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                                    >
                                        <div style={{ fontWeight: '600', fontSize: '13px', color: '#1e293b' }}>
                                            {enq.RequestNo}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                                            {enq.ProjectName || 'No project'} • {enq.CustomerName || 'No customer'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleSearch}
                        disabled={searching}
                        style={{
                            padding: '10px 20px',
                            background: 'white',
                            color: '#1e293b',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            fontWeight: '600',
                            cursor: 'pointer'
                        }}
                    >
                        SEARCH
                    </button>
                    <button
                        onClick={handleClear}
                        style={{
                            padding: '10px 20px',
                            background: 'white',
                            color: '#64748b',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            fontWeight: '600',
                            cursor: 'pointer'
                        }}
                    >
                        CLEAR
                    </button>
                </div>
            </div>

            {/* Searching Indicator */}
            {searching && (
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', textAlign: 'center', color: '#64748b', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    Searching for enquiries...
                </div>
            )}

            {/* Search Results Table */}
            {
                searchResults.length > 0 && !pricingData && (
                    <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: '20px' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h3 style={{ margin: 0, fontSize: '15px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Search size={16} /> Search Results ({searchResults.length})
                            </h3>
                            <button onClick={() => setSearchResults([])} style={{ fontSize: '12px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>Close Results</button>
                        </div>
                        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                                    <tr>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0', width: '80px' }}>Enquiry No.</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Project Name</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Customer Name</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Client Name</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Consultant Name</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0', width: '120px' }}>Enquiry Date</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Subjob Prices (Base Price)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {searchResults.map((enq, idx) => (
                                        <tr
                                            key={enq.RequestNo || idx}
                                            style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                                            onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                                            onClick={() => loadPricing(enq.RequestNo)}
                                        >
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b', fontWeight: '500', verticalAlign: 'top' }}>{enq.RequestNo}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top' }}>{enq.ProjectName || '-'}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top' }}>{enq.CustomerName || '-'}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top' }}>{enq.ClientName || '-'}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top' }}>{enq.ConsultantName || '-'}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top' }}>{enq.EnquiryDate ? format(new Date(enq.EnquiryDate), 'dd-MMM-yyyy') : '-'}</td>
                                            <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                                                {enq.SubJobPrices && enq.SubJobPrices.split(';;').filter(Boolean).map((s, i) => {
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

                                                    // Format Date
                                                    let displayDate = '';
                                                    if (rawDate) {
                                                        try {
                                                            displayDate = format(new Date(rawDate), 'dd-MMM-yy hh:mm a');
                                                        } catch (e) {
                                                            console.error('Date parse error:', e);
                                                        }
                                                    }

                                                    return (
                                                        <div key={i} style={{
                                                            fontSize: '11px',
                                                            marginBottom: '4px',
                                                            marginLeft: `${level * 20}px`,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            whiteSpace: 'nowrap'
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
                                                })}
                                                {(!enq.SubJobPrices) && <span style={{ fontSize: '11px', color: '#94a3b8 italic' }}>No assigned jobs</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            }

            {/* Pending Requests List - Display when no search and no pricing loaded */}
            {
                !pricingData && searchResults.length === 0 && !searchTerm && pendingRequests.length > 0 && (() => {
                    // --- Sort Logic ---
                    const sortedPending = [...pendingRequests].sort((a, b) => {
                        const { field, direction } = pendingSortConfig;
                        let aVal = a[field];
                        let bVal = b[field];
                        // Date fields
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

                    const SortableHeader = ({ field, label, style = {} }) => {
                        const isActive = pendingSortConfig.field === field;
                        const isAsc = pendingSortConfig.direction === 'asc';
                        return (
                            <th
                                onClick={() => setPendingSortConfig(prev =>
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
                                {label}
                                {isActive
                                    ? (isAsc ? ' ▲' : ' ▼')
                                    : <span style={{ color: '#cbd5e1' }}> ⇅</span>
                                }
                            </th>
                        );
                    };

                    return (
                        <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: '20px' }}>
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <h3 style={{ margin: 0, fontSize: '15px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <FileText size={16} /> Pending Updates ({pendingRequests.length})
                                </h3>
                                <span style={{ fontSize: '12px', color: '#64748b' }}>
                                    Sorted by <strong>{pendingSortConfig.field === 'DueDate' ? 'Due Date' : pendingSortConfig.field === 'RequestNo' ? 'Enquiry No.' : pendingSortConfig.field === 'ProjectName' ? 'Project Name' : pendingSortConfig.field === 'CustomerName' ? 'Customer' : pendingSortConfig.field}</strong> {pendingSortConfig.direction === 'asc' ? '(Soonest first)' : '(Latest first)'}
                                </span>
                            </div>
                            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                                        <tr>
                                            <SortableHeader field="RequestNo" label="Enquiry No." style={{ width: '80px' }} />
                                            <SortableHeader field="ProjectName" label="Project Name" />
                                            <SortableHeader field="CustomerName" label="Customer Name" />
                                            <SortableHeader field="ClientName" label="Client Name" />
                                            <SortableHeader field="ConsultantName" label="Consultant Name" />
                                            <SortableHeader field="DueDate" label="Due Date" style={{ width: '120px' }} />
                                            <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Subjob Prices (Base Price)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedPending.map((enq, idx) => (
                                            <tr
                                                key={enq.RequestNo || idx}
                                                style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                                                onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                                                onClick={() => loadPricing(enq.RequestNo)}
                                            >
                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b', fontWeight: '500', verticalAlign: 'top' }}>{enq.RequestNo}</td>
                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top' }}>{enq.ProjectName || '-'}</td>
                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top' }}>{enq.CustomerName || '-'}</td>
                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top' }}>{enq.ClientName || '-'}</td>
                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top' }}>{enq.ConsultantName || '-'}</td>
                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#dc2626', fontWeight: '500', verticalAlign: 'top' }}>{enq.DueDate ? format(new Date(enq.DueDate), 'dd-MMM-yyyy') : '-'}</td>
                                                <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                                                    {enq.SubJobPrices && enq.SubJobPrices.split(';;').filter(Boolean).map((s, i) => {
                                                        const parts = s.split('|');
                                                        const name = parts[0];
                                                        const rawPrice = parts[1];
                                                        const rawDate = parts[2]; // ISODate
                                                        const rawLevel = parts[3]; // Level (Depth)

                                                        const level = parseInt(rawLevel) || 0;
                                                        const isUpdated = rawPrice && rawPrice !== 'Not Updated' && parseFloat(rawPrice) > 0;

                                                        // Format price if numeric
                                                        let displayPrice = rawPrice;
                                                        if (isUpdated) {
                                                            const num = parseFloat(rawPrice);
                                                            if (!isNaN(num)) displayPrice = num.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
                                                        }

                                                        // Format Date
                                                        let displayDate = '';
                                                        if (rawDate) {
                                                            try {
                                                                displayDate = format(new Date(rawDate), 'dd-MMM-yy hh:mm a');
                                                            } catch (e) {
                                                                console.error('Date parse error:', e);
                                                            }
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
                                                    })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })()
            }

            {/* No Results (Only show if truly no results and no pending list default) */}
            {
                searchResults.length === 0 && searchTerm && !searching && !pricingData && !showSuggestions && (
                    <div style={{ background: 'white', padding: '40px', borderRadius: '8px', textAlign: 'center', color: '#64748b' }}>
                        No results. Type to search or select from suggestions.
                    </div>
                )
            }

            {/* Loading */}
            {
                loading && (
                    <div style={{ background: 'white', padding: '40px', borderRadius: '8px', textAlign: 'center', color: '#64748b' }}>
                        Loading pricing data...
                    </div>
                )
            }

            {/* Pricing Grid */}
            {
                pricingData && !loading && (
                    <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                        {/* Enquiry Info Header */}
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '16px', color: '#1e293b' }}>
                                    {pricingData.enquiry.projectName}
                                    <span style={{ fontWeight: '400', color: '#64748b', marginLeft: '8px' }}>({pricingData.enquiry.requestNo})</span>
                                </h3>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span style={{
                                    padding: '4px 12px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: '600',
                                    background: pricingData.access.hasLeadAccess ? '#dcfce7' : '#fef3c7',
                                    color: pricingData.access.hasLeadAccess ? '#166534' : '#92400e'
                                }}>
                                    {pricingData.access.hasLeadAccess ? 'Lead Job Access' : 'Sub Job Access'}
                                </span>
                                <button
                                    onClick={() => { setPricingData(null); setSelectedEnquiry(null); }}
                                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Lead Job Selector (Filter by User Access) */}
                        {(() => {
                            if (!pricingData) return null;

                            // Filter roots based on visible assignments (e.g., Department Scope)
                            const visibleScope = pricingData.access?.visibleJobs || [];
                            // Heuristic: If hierarchy uses "L# -" prefixes, only show those as roots (hide orphans)
                            const hasPrefix = pricingData.jobs.some(j => !j.parentId && /^L\d+\s-\s/.test(j.itemName));

                            // Recursive check: Visible if Node is visible OR any Descendant is visible
                            const isTreeVisible = (jobId) => {
                                const job = pricingData.jobs.find(j => j.id == jobId); // Relaxed check
                                if (!job) return false;
                                // Strict scope check: item MUST be in visibleScope (no fallback for empty scope)
                                if (visibleScope.includes(job.itemName)) return true;

                                const children = pricingData.jobs.filter(j => j.parentId == jobId); // Relaxed check
                                return children.some(c => isTreeVisible(c.id));
                            };

                            const roots = pricingData.jobs.filter(j => {
                                // 1. Must be a Root
                                if (j.parentId) return false;
                                // 2. Must match Prefix Heuristic
                                if (hasPrefix && !/^L\d+\s-\s/.test(j.itemName)) return false;
                                // 3. Must be Visible (Strict Scope)
                                if (!isTreeVisible(j.id)) return false;

                                // 4. HEURISTIC REMOVED: Show all visible roots regardless of content to allow data entry.

                                return true;
                            });

                            console.log(`Pricing Render: ${roots.length} Lead Jobs identified.`);

                            if (roots.length === 0) return null;

                            return (
                                <div style={{ padding: '12px 20px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Select Lead Job:</span>
                                    <select
                                        disabled={false}
                                        value={selectedLeadId || ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            console.log('Lead Job Selected (Change):', val);
                                            setSelectedLeadId(val ? parseInt(val) : null);
                                        }}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '4px',
                                            border: '1px solid #cbd5e1',
                                            fontSize: '13px',
                                            minWidth: '200px',
                                            backgroundColor: 'white',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <option value="">Select Lead Job...</option>
                                        {roots.map(r => {
                                            // Fix regex to remove prefix (replace with empty string)
                                            const cleanName = r.itemName.replace(/^(L\d+\s-\s)+/, '');
                                            return <option key={r.id} value={r.id}>{cleanName || r.itemName}</option>;
                                        })}
                                    </select>
                                </div>
                            );
                        })()}

                        {/* Customer Selection Tabs */}
                        <div style={{ padding: '0 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', overflow: addingCustomer ? 'visible' : 'auto' }}>
                            <div style={{ display: 'flex', alignItems: 'center', minWidth: 'min-content' }}>
                                {displayedCustomers && displayedCustomers.map((cust, idx) => (
                                    <div
                                        key={`${cust}-${idx}`}
                                        onClick={() => {
                                            // Ensure we don't reload if already active
                                            if (cust === selectedCustomer) return;
                                            // FIX: Reload pricing data for the selected customer while PRESERVING current edits.
                                            // This ensures 'pricingData.values' updates to the new customer's DB values,
                                            // preventing headers/footers from showing 0s visually.
                                            // Passing 'values' ensures unsaved changes from the previous tab are kept in state.
                                            loadPricing(pricingData.enquiry.requestNo, cust, values);
                                        }}
                                        style={{
                                            padding: '10px 16px',
                                            background: selectedCustomer === cust ? 'white' : 'transparent',
                                            color: selectedCustomer === cust ? '#0284c7' : '#64748b',
                                            borderTop: selectedCustomer === cust ? '3px solid #0284c7' : '3px solid transparent',
                                            borderLeft: selectedCustomer === cust ? '1px solid #e2e8f0' : 'none',
                                            borderRight: selectedCustomer === cust ? '1px solid #e2e8f0' : 'none',
                                            borderBottom: 'none',
                                            fontWeight: selectedCustomer === cust ? '600' : '500',
                                            cursor: 'pointer',
                                            fontSize: '13px',
                                            marginTop: '4px',
                                            whiteSpace: 'nowrap',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}
                                    >
                                        <span>{cust || 'Default Customer'}</span>
                                    </div>
                                ))}

                                { /* Add New Customer Button Removed */}
                            </div>
                        </div>

                        {/* Pricing Table Content */}
                        {visibleJobs.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                No EnquiryFor items found for this enquiry.
                            </div>
                        ) : (
                            <>
                                <table style={{ width: 'auto', minWidth: '600px', borderCollapse: 'collapse' }}>
                                    <tbody>
                                        {(() => {
                                            // Grouping Logic: Keyed by Job ID
                                            const groupMap = {}; // { jobId: { job, options: [] } }

                                            // LEAD JOB FILTERING LOGIC
                                            let targetJobs = visibleJobs;
                                            if (selectedLeadId && pricingData && pricingData.jobs) {
                                                // EXPANDED: Include ALL descendants (L1, L2, L3...)
                                                const getFullScope = (rootId, all) => {
                                                    const set = new Set([rootId]);
                                                    let changed = true;
                                                    while (changed) {
                                                        changed = false;
                                                        all.forEach(j => {
                                                            if (j.parentId && set.has(j.parentId) && !set.has(j.id)) {
                                                                set.add(j.id);
                                                                changed = true;
                                                            }
                                                        });
                                                    }
                                                    return set;
                                                };

                                                const validIds = getFullScope(selectedLeadId, pricingData.jobs);
                                                targetJobs = visibleJobs.filter(j => validIds.has(j.id));
                                            }

                                            // Initialize Groups for Target Jobs
                                            // LOGIC UPDATE: Context-Aware Visibility
                                            // If User is viewing an External Tab (Not their own Internal Tab), hide Descendants.
                                            // Only show Editable Jobs in External/Parent Tabs.
                                            // Admin/Manager (hasLeadAccess) sees all.

                                            // Step 1: Resolve Tab Context (Which Job is this tab about?)
                                            const cleanTabNameSearch = (name) => name.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                                            const contextJob = pricingData.jobs.find(j =>
                                                cleanTabNameSearch(j.itemName) === selectedCustomer || j.itemName === selectedCustomer
                                            );

                                            // Step 2: Identify Allowed IDs in this Tab (Tree Match)
                                            let tabAllowedIds = null;
                                            if (contextJob) {
                                                tabAllowedIds = new Set([contextJob.id]);
                                                let changed = true;
                                                while (changed) {
                                                    changed = false;
                                                    pricingData.jobs.forEach(j => {
                                                        if (!tabAllowedIds.has(j.id) && tabAllowedIds.has(j.parentId)) {
                                                            tabAllowedIds.add(j.id);
                                                            changed = true;
                                                        }
                                                    });
                                                }
                                            }

                                            // Step 3: Identify User Scope (What can this user see in general?)
                                            // Provision (Step 1857): Even if user has hasLeadAccess, if they are NOT the lead for this specific selection,
                                            // we restrict them to their assigned scope.
                                            const myJobs = pricingData.access.editableJobs || [];
                                            const selectedJobObj = pricingData.jobs?.find(j => j.id == selectedLeadId);
                                            const isLeadForThisSelection = selectedJobObj && myJobs.includes(selectedJobObj.itemName);

                                            // Always include descendants of editable jobs for "Subjob View"
                                            const getMyTotalScope = (names) => {
                                                const ids = new Set();
                                                const startJobs = pricingData.jobs.filter(j => names.includes(j.itemName));
                                                startJobs.forEach(sj => {
                                                    ids.add(sj.id);
                                                    let changedInner = true;
                                                    while (changedInner) {
                                                        changedInner = false;
                                                        pricingData.jobs.forEach(child => {
                                                            if (!ids.has(child.id) && ids.has(child.parentId)) {
                                                                ids.add(child.id);
                                                                changedInner = true;
                                                            }
                                                        });
                                                    }
                                                });
                                                return ids;
                                            };

                                            const myScopeIds = (pricingData.access.canEditAll || isLeadForThisSelection)
                                                ? null // Admins or True Lead Jobs have global scope
                                                : getMyTotalScope(myJobs);

                                            // Step 4: Final Filter: Intersection of LeadJobScope, TabScope, and UserScope
                                            let contextFilteredJobs = targetJobs.filter(j => {
                                                // A. Tab Filter: If we are in an internal/parent tab, only show that job and its children
                                                if (tabAllowedIds && !tabAllowedIds.has(j.id)) return false;

                                                // B. Scope Filter: Non-admins only see their assigned tree
                                                if (myScopeIds && !myScopeIds.has(j.id)) return false;

                                                return true;
                                            });

                                            contextFilteredJobs.forEach(job => {
                                                groupMap[job.id] = { job: job, options: [] };
                                            });

                                            // Determine Lead Job for sorting
                                            const activeLeadJob = pricingData.jobs.find(j => j.id === selectedLeadId) || targetJobs.find(j => j.isLead);

                                            // Assign Options to Groups
                                            // NOTE: Exclude simulated options (e.g. 'Base Price' placeholder with Date.now() id)
                                            // from maxId, otherwise every real option becomes 'isNotNewest' and gets hidden.
                                            const maxId = filteredOptions.reduce((max, opt) => {
                                                if (opt.isSimulated || typeof opt.id !== 'number') return max;
                                                return opt.id > max ? opt.id : max;
                                            }, 0);

                                            filteredOptions.forEach(opt => {
                                                contextFilteredJobs.forEach(job => {
                                                    let match = false;
                                                    const activeLeadJobName = activeLeadJob ? activeLeadJob.itemName : null;

                                                    if (!opt.itemName) {
                                                        match = (job.id === selectedLeadId); // Null scope -> Matches Current Lead
                                                    } else if (opt.itemName === 'Lead Job') {
                                                        match = (job.id === selectedLeadId);
                                                    } else if (opt.itemName === job.itemName) {
                                                        match = true;
                                                    } else if (activeLeadJobName && opt.itemName === `${activeLeadJobName} / Lead Job`) {
                                                        match = true;
                                                    }

                                                    if (match) {
                                                        // Calculate Row Total (Visibility Check)
                                                        // Calculate Row Total (Visibility Check)
                                                        // Calculate Row Total (Visibility Check)
                                                        // Calculate Row Total (Visibility Check)
                                                        const key = `${opt.id}_${job.id}`;
                                                        let price = null; // Default to NULL (Missing) to differentiate from 0
                                                        let hasExplicitValue = false;

                                                        if (values[key] !== undefined && values[key] !== '') {
                                                            price = parseFloat(values[key]) || 0;
                                                            hasExplicitValue = true;
                                                        } else {
                                                            // Standard Lookup (Current Tab)
                                                            const lookupValue = (dataSet) => {
                                                                if (!dataSet) return null; // Return NULL if not found
                                                                if (dataSet[key] && dataSet[key].Price !== undefined) return parseFloat(dataSet[key].Price);

                                                                const nameKey = `${opt.id}_${job.itemName}`;
                                                                if (dataSet[nameKey] && dataSet[nameKey].Price !== undefined) return parseFloat(dataSet[nameKey].Price);

                                                                const cleanName = job.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                                                                const cleanKey = `${opt.id}_${cleanName}`;
                                                                if (dataSet[cleanKey] && dataSet[cleanKey].Price !== undefined) return parseFloat(dataSet[cleanKey].Price);

                                                                return null; // Return NULL if truly missing
                                                            };

                                                            price = lookupValue(pricingData.values);
                                                            if (price !== null) hasExplicitValue = true;
                                                        }

                                                        // Default to 0 for math if still null, but keep flag
                                                        const effectivePriceForCalc = (price === null) ? 0 : price;

                                                        // FALLBACK / OVERRIDE: Cross-Tab Lookup for Descendants in External Tabs
                                                        // MOVED OUTSIDE if/else to ensure it runs even if direct value exists (Override behavior)
                                                        const contextJob = pricingData.jobs.find(j =>
                                                            j.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim() === selectedCustomer ||
                                                            j.itemName === selectedCustomer
                                                        );
                                                        const isExternalContext = !contextJob;

                                                        // If External Tab && Sub-Job (Not Lead) && NOT MY SCOPE, we FORCE internal price (VIEW ONLY mode for Parent).
                                                        // If it IS my scope, I must be able to edit the Direct Quote to the External Customer.
                                                        const isMyScope = pricingData.access && pricingData.access.editableJobs && pricingData.access.editableJobs.includes(job.itemName);
                                                        const isMyInternalTab = contextJob && pricingData.access && pricingData.access.editableJobs && pricingData.access.editableJobs.includes(contextJob.itemName);
                                                        const shouldForceInternal = isExternalContext && !job.isLead && !isMyScope;

                                                        // LOGIC CHANGE: Only fallback if value is MISSING (price === null) OR if we are forced to internal view.
                                                        // If price === 0 (Explicit), we respecting it unless ForceInternal is true.
                                                        const isMissing = (price === null);

                                                        if ((isMissing || shouldForceInternal) && !isMyInternalTab && pricingData.allValues) {
                                                            // Check if this job is a child of one of my scopes
                                                            const parentJob = pricingData.jobs.find(j => j.id === job.parentId);
                                                            if (parentJob) {
                                                                const parentName = parentJob.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                                                                const rawParentName = parentJob.itemName.trim();

                                                                const internalOption = pricingData.options.find(o =>
                                                                    o.name === opt.name &&
                                                                    o.itemName === job.itemName &&
                                                                    (o.customerName === parentName || o.customerName === rawParentName)
                                                                );

                                                                if (internalOption) {
                                                                    let internalValues = pricingData.allValues[parentName];
                                                                    if (!internalValues) internalValues = pricingData.allValues[rawParentName];

                                                                    if (internalValues) {
                                                                        const lookupInternal = (dataSet, optionId) => {
                                                                            if (!dataSet) return 0;
                                                                            const iKey = `${optionId}_${job.id}`;
                                                                            if (dataSet[iKey] && dataSet[iKey].Price !== undefined) return parseFloat(dataSet[iKey].Price);
                                                                            const iNameKey = `${optionId}_${job.itemName}`;
                                                                            if (dataSet[iNameKey] && dataSet[iNameKey].Price !== undefined) return parseFloat(dataSet[iNameKey].Price);
                                                                            const iCleanKey = `${optionId}_${job.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim()}`;
                                                                            if (dataSet[iCleanKey] && dataSet[iCleanKey].Price !== undefined) return parseFloat(dataSet[iCleanKey].Price);
                                                                            return 0;
                                                                        };

                                                                        const internalPrice = lookupInternal(internalValues, internalOption.id);

                                                                        // If internal price found, use it as fallback
                                                                        if (internalPrice > 0) {
                                                                            price = internalPrice;
                                                                            hasExplicitValue = true; // Treat as explicit for display
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }

                                                        // Finalize Price for Display Logic
                                                        if (price === null) price = 0;

                                                        // Hide if Empty, Not Newest, Not Base Price
                                                        // ONLY suppress legacy default options ('Price', 'Optional') when they
                                                        // are empty AND not the newest — user-created named options always show.
                                                        const isDefault = (opt.name === 'Price' || opt.name === 'Optional');
                                                        const isEmpty = (price <= 0.01 && !hasExplicitValue); // Treat 0 as empty ONLY if implicit
                                                        const isNotNewest = opt.id !== maxId;

                                                        if (isDefault && isEmpty && isNotNewest) return;
                                                        // NOTE: Do NOT blanket-hide custom options just because they have
                                                        // no price yet — that caused 2nd/3rd options to appear "replaced".

                                                        // Push cloned option with effective Price for display
                                                        groupMap[job.id].options.push({ ...opt, effectivePrice: price });
                                                    }
                                                });
                                            });

                                            // HIERARCHICAL SORTING LOGIC
                                            const hierarchyResults = [];
                                            const processedIds = new Set();
                                            const groupList = Object.values(groupMap);

                                            // Identify Roots (Jobs with no parent in the filtered set)
                                            // The filtered set is `contextFilteredJobs`
                                            // We build a map of ID -> Children
                                            const idMap = new Map();
                                            contextFilteredJobs.forEach(j => idMap.set(j.id, j));

                                            const childrenMap = new Map();
                                            contextFilteredJobs.forEach(j => {
                                                if (j.parentId && idMap.has(j.parentId)) {
                                                    if (!childrenMap.has(j.parentId)) childrenMap.set(j.parentId, []);
                                                    childrenMap.get(j.parentId).push(j);
                                                }
                                            });

                                            // Recursive function to build hierarchy list
                                            const buildList = (job, level) => {
                                                if (processedIds.has(job.id)) return;
                                                processedIds.add(job.id);

                                                const group = groupMap[job.id];
                                                if (group) {
                                                    group.level = level;
                                                    hierarchyResults.push(group);
                                                }

                                                const children = childrenMap.get(job.id) || [];
                                                children.sort((a, b) => a.id - b.id); // Stable sort by ID
                                                children.forEach(c => buildList(c, level + 1));
                                            };

                                            // Start with Roots
                                            contextFilteredJobs.forEach(j => {
                                                if (!j.parentId || !idMap.has(j.parentId)) {
                                                    buildList(j, 0);
                                                }
                                            });

                                            // Handle any orphans (loops or disconnected parts not found by roots?)
                                            if (hierarchyResults.length < groupList.length) {
                                                groupList.forEach(g => {
                                                    if (!processedIds.has(g.job.id)) {
                                                        g.level = 0;
                                                        hierarchyResults.push(g);
                                                    }
                                                });
                                            }

                                            return hierarchyResults.map(group => {
                                                const job = group.job;
                                                // Group Display (Job Header)

                                                // Determine Heading Name (Show "Lead Job" if it is the Lead, else ItemName)
                                                let groupName = job.itemName;
                                                if (job.isLead) {
                                                    groupName = `${job.itemName} (Lead Job)`;
                                                }

                                                // Determine Editable Status (Step 1816)
                                                // Provision: Enter own price ONLY. Sub-jobs are VIEW ONLY.
                                                // Logic: must be in editableJobs to actually modify.
                                                const isExplicityEditable = pricingData.access.editableJobs.includes(job.itemName);
                                                const canEditSection = pricingData.access.hasLeadAccess || isExplicityEditable;

                                                return (
                                                    <React.Fragment key={job.id}>
                                                        {/* Group Header */}
                                                        <tr style={{ background: '#e2e8f0' }}>
                                                            <td colSpan={2} style={{
                                                                padding: '6px 12px',
                                                                fontWeight: 'bold',
                                                                fontSize: '11px',
                                                                color: '#475569',
                                                                textTransform: 'uppercase',
                                                                paddingLeft: `${(group.level || 0) * 20 + 12}px`
                                                            }}>
                                                                {group.level > 0 && <span style={{ marginRight: '6px', color: '#dc2626', fontWeight: 'bold', fontSize: '16px' }}>↳</span>}
                                                                {groupName} Options
                                                            </td>
                                                        </tr>
                                                        {group.options.map(option => {
                                                            const key = `${option.id}_${job.id}`;
                                                            const canEditRow = canEditSection; // Simplified

                                                            // Determine Display Value: Use Effective Price if Calculated (Fallback), else State
                                                            let displayValue = '';
                                                            if (option.effectivePrice && option.effectivePrice > 0.01) {
                                                                displayValue = option.effectivePrice;
                                                            } else {
                                                                displayValue = values[key] !== undefined ? values[key] : '';
                                                            }

                                                            return (
                                                                <tr key={`${option.id}_${job.id}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                                    <td style={{ padding: '6px 12px', fontWeight: '500', color: '#1e293b', fontSize: '13px' }}>{option.name}</td>
                                                                    <td style={{ padding: '4px 8px', textAlign: 'left', width: '150px' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '4px', marginLeft: '0px' }}>
                                                                            <input
                                                                                type="text"
                                                                                inputMode="decimal"
                                                                                // Show formatted value when not focused, raw value when focused
                                                                                value={
                                                                                    focusedCell === `${option.id}_${job.id}`
                                                                                        ? (displayValue === '' ? '' : String(displayValue))
                                                                                        : formatPrice(displayValue)
                                                                                }
                                                                                onFocus={() => setFocusedCell(`${option.id}_${job.id}`)}
                                                                                onBlur={() => setFocusedCell(null)}
                                                                                onChange={(e) => handleValueChange(option.id, job.id, e.target.value)}
                                                                                disabled={!canEditRow}
                                                                                placeholder="0"
                                                                                style={{
                                                                                    width: '100%',
                                                                                    maxWidth: '130px',
                                                                                    padding: '4px 6px',
                                                                                    border: '1px solid #e2e8f0',
                                                                                    borderRadius: '4px',
                                                                                    fontSize: '13px',
                                                                                    textAlign: 'right',
                                                                                    backgroundColor: canEditRow ? '#fff' : '#f1f5f9',
                                                                                    color: '#1e293b',
                                                                                    opacity: 1,
                                                                                    cursor: canEditRow ? 'text' : 'not-allowed'
                                                                                }}
                                                                            />
                                                                            {canEditRow && (
                                                                                <button
                                                                                    onClick={() => deleteOption(option.id)}
                                                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                                                                                >
                                                                                    <Trash2 size={16} />
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                        {/* Add Option Row for this Group */}
                                                        {canEditSection && (
                                                            <tr style={{ background: '#f8fafc' }}>
                                                                <td style={{ padding: '4px 12px' }}>
                                                                    <input
                                                                        type="text"
                                                                        placeholder={`Add ${groupName.replace(/\/ Lead Job|Lead Job \//, '').trim()} option...`}
                                                                        value={newOptionNames[groupName] || ''}
                                                                        onChange={(e) => setNewOptionNames(prev => ({ ...prev, [groupName]: e.target.value }))}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') {
                                                                                addOption(groupName); // addOption still uses Name
                                                                            }
                                                                        }}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '4px 8px',
                                                                            border: '1px solid #cbd5e1',
                                                                            borderRadius: '4px',
                                                                            fontSize: '13px'
                                                                        }}
                                                                    />
                                                                </td>
                                                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                                    <button
                                                                        onClick={() => addOption(groupName)}
                                                                        disabled={!newOptionNames[groupName]}
                                                                        style={{
                                                                            padding: '6px 12px',
                                                                            background: newOptionNames[groupName] ? 'white' : '#f1f5f9',
                                                                            color: newOptionNames[groupName] ? '#0284c7' : '#94a3b8',
                                                                            border: '1px solid #cbd5e1',
                                                                            borderRadius: '4px',
                                                                            cursor: newOptionNames[groupName] ? 'pointer' : 'default',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px',
                                                                            fontSize: '12px'
                                                                        }}
                                                                    >
                                                                        <Plus size={14} /> Add
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        )}
                                                        {/* Spacer Row */}
                                                        <tr><td colSpan={2} style={{ height: '8px' }}></td></tr>
                                                    </React.Fragment>
                                                );
                                            });
                                        })()}
                                    </tbody>
                                </table>
                                {/* Actions Footer - Cleaned up */}
                                <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-start', alignItems: 'center', background: '#f8fafc' }}>
                                    <button
                                        onClick={saveAll}
                                        disabled={saving}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '10px 20px',
                                            background: 'white',
                                            color: '#1e293b',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontWeight: '600'
                                        }}
                                    >
                                        <Save size={16} /> {saving ? 'Saving...' : 'Save All Prices'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )
            }
        </div>
    );
};

export default PricingForm;
