import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Trash2, Save, FileText, ChevronDown, ChevronUp, FileSpreadsheet, X } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext';


const API_BASE = 'http://localhost:5000';

const PricingForm = () => {
    const { currentUser } = useAuth();


    // Search state
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [pendingRequests, setPendingRequests] = useState([]); // Pending List State
    const searchRef = useRef(null);

    // Pricing state
    const [selectedEnquiry, setSelectedEnquiry] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [pricingData, setPricingData] = useState(null);
    const [values, setValues] = useState({});
    const [newOptionNames, setNewOptionNames] = useState({});

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
        setSearchResults([]);
        setPricingData(null);

        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (value.trim().length >= 2) {
            debounceRef.current = setTimeout(async () => {
                try {
                    const res = await fetch(`${API_BASE}/api/enquiries?search=${encodeURIComponent(value.trim())}`);
                    if (res.ok) {
                        const data = await res.json();
                        // Filter to show only matching results
                        const filtered = data.filter(enq => {
                            const searchLower = value.toLowerCase().trim();
                            return (enq.RequestNo || '').toLowerCase().includes(searchLower) ||
                                (enq.ProjectName || '').toLowerCase().includes(searchLower) ||
                                (enq.CustomerName || '').toLowerCase().includes(searchLower);
                        });
                        setSuggestions(filtered.slice(0, 8));
                        setShowSuggestions(filtered.length > 0);
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
    const handleSearch = () => {
        if (!searchTerm.trim()) return;
        setShowSuggestions(false);

        // If we already have a selected result in searchResults, keep it
        if (searchResults.length === 1) return;

        // Otherwise search from suggestions
        if (suggestions.length > 0) {
            setSearchResults(suggestions);
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
    const loadPricing = async (requestNo, customerName = null) => {
        setLoading(true);
        setSelectedEnquiry(requestNo);

        try {
            const userEmail = currentUser?.email || currentUser?.EmailId || '';
            const url = `${API_BASE}/api/pricing/${encodeURIComponent(requestNo)}?userEmail=${encodeURIComponent(userEmail)}${customerName ? `&customerName=${encodeURIComponent(customerName)}` : ''}`;
            const res = await fetch(url);

            if (res.ok) {
                const data = await res.json();

                // SANITIZATION: Globally Trim Customer Names to prevent mismatch (Step 944)
                if (data.customers) data.customers = data.customers.map(c => c.trim());
                if (data.activeCustomer) data.activeCustomer = data.activeCustomer.trim();
                // Note: data.enquiry.customerName might be CSV, don't trim internal commas here, handled by split logic
                if (data.extraCustomers) data.extraCustomers = data.extraCustomers.map(c => c.trim());
                if (data.options) data.options.forEach(o => { if (o.customerName) o.customerName = o.customerName.trim(); });
                // Note: data.values Sanitization is redundant with line 240 logic but safe to keep for consistency
                if (Array.isArray(data.values)) data.values.forEach(v => { if (v.CustomerName) v.CustomerName = v.CustomerName.trim(); });

                // AUTO-PROVISION TABS (Pricing Sheets)
                // Ensure ALL linked customers (Main + Extra) have pricing tabs.
                // If they are missing, auto-create "Base Price" for them.
                const linkedCustomers = [
                    ...(data.enquiry.customerName || '').split(','),
                    ...(data.extraCustomers || []).flatMap(c => (c || '').split(','))
                ].map(s => s.trim()).filter(s => s && s.length > 0); // Strict filter for empty strings

                const existingPricingCustomers = data.customers || [];

                // Find customers who need initialization (Either completely new, OR missing specific Job Options)
                const customersToInit = linkedCustomers.filter(c => {
                    // Check 1: Is customer fully missing?
                    if (!existingPricingCustomers.includes(c)) return true;

                    // Check 2: Does customer have 'Base Price' for ALL jobs?
                    if (data.jobs && data.options) {
                        const distinctItemNames = [...new Set(data.jobs.map(j => j.itemName))];
                        const customerOptions = data.options.filter(o => o.customerName === c);

                        // If any job is missing a 'Base Price' option for this customer, we need to init
                        const missingJob = distinctItemNames.some(jobName =>
                            !customerOptions.some(o => o.itemName === jobName && o.name === 'Base Price')
                        );
                        return missingJob;
                    }
                    return false;
                });

                if (customersToInit.length > 0) {
                    // Start Provisioning
                    try {
                        const allJobs = data.jobs || [];
                        const promises = [];

                        // Create Base Price for EACH Missing Customer for EACH UNIQUE ItemName
                        const distinctItemNames = [...new Set(allJobs.map(j => j.itemName))];

                        customersToInit.forEach(cName => {
                            // Filter to Find ONLY the jobs that are missing Base Price for this customer
                            const existingOps = data.options.filter(o => o.customerName === cName && o.name === 'Base Price');
                            const existingJobNames = existingOps.map(o => o.itemName);

                            const missingItems = distinctItemNames.filter(jobName => !existingJobNames.includes(jobName));

                            missingItems.forEach(itemName => {
                                const payload = {
                                    requestNo: requestNo,
                                    optionName: 'Base Price',
                                    itemName: itemName,
                                    customerName: cName
                                };
                                promises.push(
                                    fetch(`${API_BASE}/api/pricing/option`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify(payload)
                                    }).then(r => r.ok ? r.json() : null)
                                );
                            });
                        });

                        const results = await Promise.all(promises);

                        // Update local data
                        if (!data.options) data.options = [];
                        if (!data.customers) data.customers = []; // Ensure initialized

                        results.forEach(res => {
                            if (res) {
                                // Add to options if successful
                                data.options.push({
                                    id: res.optionId || res.id,
                                    name: 'Base Price',
                                    itemName: res.itemName // Use returned item name
                                });
                                // Add to active customers list if not already there
                                if (!data.customers.includes(res.customerName)) {
                                    data.customers.push(res.customerName);
                                }
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

                if (Array.isArray(data.values) && data.jobs) {
                    data.values.forEach(v => {
                        const rawCust = v.CustomerName || data.enquiry.customerName || 'Main';
                        const cust = rawCust.trim(); // Ensure clean customer name match (Step 937)

                        if (!groupedValues[cust]) groupedValues[cust] = {};

                        // Derive Keys
                        // 1. Strict ID Key
                        if (v.EnquiryForID) {
                            const idKey = `${v.OptionID}_${v.EnquiryForID}`;
                            groupedValues[cust][idKey] = v;
                        }

                        // 2. Name / Legacy Keys (Backfill)
                        if (v.EnquiryForItem) {
                            // Try to find job by ID first if possible
                            let job = null;
                            if (v.EnquiryForID) job = data.jobs.find(j => j.id == v.EnquiryForID);

                            if (job) {
                                // We have Job Object, generate robustness keys
                                const nameKey = `${v.OptionID}_${job.itemName}`;
                                groupedValues[cust][nameKey] = v;

                                const cleanName = job.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                                if (cleanName !== job.itemName) {
                                    const cleanKey = `${v.OptionID}_${cleanName}`;
                                    groupedValues[cust][cleanKey] = v;
                                }
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
                    data.customers = data.customers.filter(c => !c.includes(','));
                }

                setPricingData(data);

                // Set selected customer
                if (customerName && !customerName.includes(',')) {
                    setSelectedCustomer(customerName);
                } else {
                    setSelectedCustomer(data.activeCustomer || '');
                }

                // Initialize state values using ID-based keys with Legacy Fallback
                const initialValues = {};
                if (data.options && data.jobs) {
                    data.options.forEach(opt => {
                        data.jobs.forEach(job => {
                            const idKey = `${opt.id}_${job.id}`; // Strict ID Key

                            // Try strict match first
                            let existing = data.values ? data.values[idKey] : null;

                            // 4. Update initialValues to try Clean Name Match (Step 869)
                            const cleanName = job.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();

                            // Try Name-based key (Legacy)
                            if (!existing && data.values) {
                                const nameKey = `${opt.id}_${job.itemName}`;
                                existing = data.values[nameKey];
                            }

                            // Try Clean Name-based key (Fallback)
                            if (!existing && data.values && cleanName !== job.itemName) {
                                const cleanKey = `${opt.id}_${cleanName}`;
                                existing = data.values[cleanKey];
                            }

                            if (existing && existing.Price && parseFloat(existing.Price) > 0) {
                                initialValues[idKey] = existing.Price;
                            }
                        });
                    });
                }
                setValues(initialValues);

                // Auto-Select First VISIBLE Lead Job
                if (data.jobs) {
                    const visibleScope = data.access?.visibleJobs || [];
                    const hasPrefix = data.jobs.some(j => !j.parentId && /^L\d+\s-\s/.test(j.itemName));

                    const roots = data.jobs.filter(j =>
                        !j.parentId &&
                        (visibleScope.length === 0 || visibleScope.includes(j.itemName)) &&
                        (!hasPrefix || /^L\d+\s-\s/.test(j.itemName))
                    );
                    if (roots.length > 0) {
                        // Only auto-select if not already set or invalid
                        if (!selectedLeadId || !data.jobs.find(j => j.id === selectedLeadId)) {
                            setSelectedLeadId(roots[0].id);
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
        const optionName = explicitName || newOptionNames[targetScope] || '';
        if (!optionName.trim() || !pricingData) return;

        let targetItemName = targetScope;
        const leadJob = pricingData.jobs.find(j => j.isLead);

        // Resolve display name back to raw ItemName
        // Logic: specific job names are used as keys. If key matches lead job display name, map to lead item.
        if (targetScope.includes(' / Lead Job') || targetScope === 'Lead Job' || (leadJob && targetScope === `${leadJob.itemName} / Lead Job`)) {
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
                loadPricing(pricingData.enquiry.requestNo, explicitCustomer || selectedCustomer);
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

        try {
            const res = await fetch(`${API_BASE}/api/pricing/option/${optionId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                loadPricing(pricingData.enquiry.requestNo, selectedCustomer);
            }
        } catch (err) {
            console.error('Error deleting option:', err);
        }
    };

    // Update cell value
    const handleValueChange = (optionId, jobId, value) => {
        // Allow numeric and empty check
        const key = `${optionId}_${jobId}`;
        setValues(prev => ({
            ...prev,
            [key]: value === '' ? '' : (parseFloat(value) || '')
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

            const optionId = parseInt(parts[0]);
            const jobId = parseInt(parts[1]); // Assuming Job ID is int

            // Find Job and Option
            const job = pricingData.jobs.find(j => j.id === jobId);
            const opt = pricingData.options.find(o => o.id === optionId);

            if (!job || !opt) return;

            // Permission Check (based on Job Name still)
            if (!editableJobs.includes(job.itemName)) return;

            // Determine Price
            let price = 0;
            if (values.hasOwnProperty(key)) {
                const userValue = values[key];
                if (userValue !== '' && userValue !== undefined && userValue !== null) {
                    price = parseFloat(userValue) || 0;
                }
            } else if (pricingData.values[key] && pricingData.values[key].Price) {
                price = parseFloat(pricingData.values[key].Price) || 0;
            }

            if (price <= 0) {
                skippedCount++;
                return;
            }

            valuesToSave.push({
                optionId: optionId,
                optionName: opt.name,
                enquiryForItem: job.itemName, // Send Name for legacy compat/logging
                enquiryForId: job.id,         // Send ID for strict linking
                price: price,
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

    // Check if job is editable
    const canEditJob = (job) => job && job.editable;

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

        return pricingData.options.filter(o => {
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

            // Sub-Job User: Strictly show ONLY options scoped to their editable jobs OR related children.
            const isScopeMatch = pricingData.access.hasLeadAccess || isRelatedToEditable(o.itemName);

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

            {/* Search Results Table */}
            {
                searchResults.length > 0 && !pricingData && (
                    <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: '20px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>

                            <tbody>
                                {searchResults.map((enq, idx) => (
                                    <tr
                                        key={enq.RequestNo || idx}
                                        style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }}
                                        onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                                        onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                                    >
                                        <td style={{ padding: '12px 16px' }}>
                                            <button
                                                onClick={() => loadPricing(enq.RequestNo)}
                                                style={{
                                                    padding: '6px 12px',
                                                    background: 'white',
                                                    color: '#1e293b',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '4px',
                                                    fontSize: '12px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                            >
                                                <FileSpreadsheet size={14} /> Pricing
                                            </button>
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1e293b' }}>{enq.RequestNo}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{enq.EnquiryDate ? format(new Date(enq.EnquiryDate), 'dd-MMM-yyyy') : '-'}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{enq.DueDate ? format(new Date(enq.DueDate), 'dd-MMM-yyyy') : '-'}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{enq.CustomerName || '-'}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b' }}>{enq.ProjectName || '-'}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                                            <span style={{
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                fontWeight: '600',
                                                background: enq.EnquiryStatus === 'Completed' ? '#dcfce7' : '#fef3c7',
                                                color: enq.EnquiryStatus === 'Completed' ? '#166534' : '#92400e'
                                            }}>
                                                {enq.EnquiryStatus || 'Pending'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            }

            {/* Pending Requests List - Display when no search and no pricing loaded */}
            {
                !pricingData && searchResults.length === 0 && !searchTerm && pendingRequests.length > 0 && (
                    <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom: '20px' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h3 style={{ margin: 0, fontSize: '15px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FileText size={16} /> Pending Updates ({pendingRequests.length})
                            </h3>
                            <span style={{ fontSize: '12px', color: '#64748b' }}>Sorted by Due Date</span>
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
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0', width: '120px' }}>Due Date</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Subjob Prices</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pendingRequests.map((enq, idx) => (
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
                                                            fontSize: '12px',
                                                            marginBottom: '4px',
                                                            whiteSpace: 'nowrap',
                                                            paddingLeft: `${level * 20}px`
                                                        }}>
                                                            {level > 0 && <span style={{ color: '#94a3b8', marginRight: '4px' }}>↳</span>}
                                                            <span style={{ fontWeight: '600', color: '#475569' }}>{name}:</span>
                                                            <span style={{
                                                                color: isUpdated ? '#166534' : '#94a3b8',
                                                                marginLeft: '6px',
                                                                fontStyle: isUpdated ? 'normal' : 'italic',
                                                                background: isUpdated ? '#dcfce7' : '#f1f5f9',
                                                                padding: '1px 6px',
                                                                borderRadius: '4px',
                                                                fontSize: '11px'
                                                            }}>
                                                                {isUpdated ? displayPrice : 'Not Updated'}
                                                            </span>
                                                            {isUpdated && displayDate && (
                                                                <span style={{ marginLeft: '8px', color: '#64748b', fontSize: '11px' }}>
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
                )
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

                        {/* Customer Selection Tabs */}
                        <div style={{ padding: '0 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', overflow: addingCustomer ? 'visible' : 'auto' }}>
                            <div style={{ display: 'flex', alignItems: 'center', minWidth: 'min-content' }}>
                                {pricingData.customers && pricingData.customers.map(cust => (
                                    <div
                                        key={cust}
                                        onClick={() => setSelectedCustomer(cust)}
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
                                        {/* Show delete for ALL customers */}
                                        {cust && (
                                            <span
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    deleteCustomer(cust);
                                                }}
                                                title="Remove this Customer"
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: selectedCustomer === cust ? '#0284c7' : '#94a3b8',
                                                    opacity: 0.6,
                                                    transition: 'opacity 0.2s',
                                                }}
                                                onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                                                onMouseOut={(e) => e.currentTarget.style.opacity = '0.6'}
                                            >
                                                <X size={14} />
                                            </span>
                                        )}
                                    </div>
                                ))}

                                {/* Add New Customer Button */}
                                {!addingCustomer ? (
                                    <button
                                        onClick={() => setAddingCustomer(true)}
                                        style={{
                                            marginLeft: '8px',
                                            padding: '6px',
                                            background: '#f1f5f9',
                                            color: '#64748b',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            flexShrink: 0
                                        }}
                                        title="Add Price for another Customer"
                                    >
                                        <Plus size={14} />
                                    </button>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px', padding: '4px' }}>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                type="text"
                                                value={newCustomerName}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setNewCustomerName(val);

                                                    if (val.length >= 2) {
                                                        fetch(`${API_BASE}/api/pricing/search-customers?q=${encodeURIComponent(val)}`)
                                                            .then(r => r.json())
                                                            .then(data => setCustomerSuggestions(data))
                                                            .catch(console.error);
                                                    } else {
                                                        setCustomerSuggestions([]);
                                                    }
                                                }}
                                                onFocus={() => {
                                                    if (!newCustomerName) {
                                                        // Show default related parties
                                                        const list = [
                                                            pricingData.enquiry.customerName,
                                                            pricingData.enquiry.clientName,
                                                            pricingData.enquiry.consultantName,
                                                            ...(pricingData.extraCustomers || [])
                                                        ].filter(Boolean);
                                                        // remove already active tabs and duplicates
                                                        const available = list.filter(n => !pricingData.customers.includes(n));
                                                        setCustomerSuggestions([...new Set(available)]);
                                                    }
                                                }}
                                                placeholder="Search Global Customer..."
                                                style={{ padding: '6px 8px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', width: '220px' }}
                                                autoFocus
                                            />

                                            {/* Suggestions Dropdown */}
                                            {customerSuggestions.length > 0 && (
                                                <div style={{
                                                    position: 'absolute', top: '100%', left: 0, width: '100%',
                                                    background: 'white', border: '1px solid #e2e8f0', borderRadius: '4px',
                                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', zIndex: 100,
                                                    maxHeight: '200px', overflowY: 'auto'
                                                }}>
                                                    {customerSuggestions.map((name, i) => (
                                                        <div
                                                            key={i}
                                                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', borderBottom: '1px solid #f1f5f9', color: '#334155' }}
                                                            onMouseDown={(e) => {
                                                                e.preventDefault(); // Prevent blur
                                                                setNewCustomerName(name);
                                                                setCustomerSuggestions([]);
                                                            }}
                                                            onMouseOver={(e) => e.target.style.background = '#f8fafc'}
                                                            onMouseOut={(e) => e.target.style.background = 'white'}
                                                        >
                                                            {name}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={async () => {
                                                if (newCustomerName.trim()) {
                                                    const name = newCustomerName.trim();
                                                    setSearching(true);

                                                    // --- VALIDATION START ---
                                                    // 1. Check if it's a known linked customer
                                                    const knownLinked = [
                                                        pricingData.enquiry.customerName,
                                                        pricingData.enquiry.clientName,
                                                        pricingData.enquiry.consultantName,
                                                        ...(pricingData.extraCustomers || [])
                                                    ].filter(Boolean);

                                                    const isLinked = knownLinked.some(k => k.toLowerCase() === name.toLowerCase());

                                                    if (!isLinked) {
                                                        // 2. Check Global DB via API
                                                        try {
                                                            const res = await fetch(`${API_BASE}/api/pricing/search-customers?q=${encodeURIComponent(name)}`);
                                                            const validNames = await res.json();
                                                            const match = validNames.find(n => n.toLowerCase() === name.toLowerCase());

                                                            if (!match) {
                                                                alert('Customer not found in the Global Database.\nPlease select a valid existing customer.');
                                                                setSearching(false);
                                                                return;
                                                            }
                                                        } catch (err) {
                                                            console.error('Validation check failed', err);
                                                            alert('Error validating customer. Please try again.');
                                                            setSearching(false);
                                                            return;
                                                        }
                                                    }
                                                    // --- VALIDATION END ---

                                                    // Auto-create "Base Price" for ALL jobs
                                                    const allJobs = pricingData.jobs || [];
                                                    const promises = allJobs.map(job => {
                                                        const payload = {
                                                            requestNo: pricingData.enquiry.requestNo,
                                                            optionName: 'Base Price',
                                                            itemName: job.itemName,
                                                            customerName: name // Use original casing ideally, but verify?
                                                        };
                                                        return fetch(`${API_BASE}/api/pricing/option`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify(payload)
                                                        });
                                                    });

                                                    await Promise.all(promises);

                                                    // Use loadPricing to refresh and switch to new tab
                                                    await loadPricing(pricingData.enquiry.requestNo, name);

                                                    setAddingCustomer(false);
                                                    setNewCustomerName('');
                                                    setSearching(false);
                                                }
                                            }}
                                            style={{ padding: '4px 8px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                                        >
                                            Add
                                        </button>
                                        <button
                                            onClick={() => {
                                                setAddingCustomer(false);
                                                setNewCustomerName('');
                                            }}
                                            style={{ padding: '4px', background: 'none', color: '#64748b', border: 'none', cursor: 'pointer' }}
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                )}
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

                            if (roots.length === 0) return null;

                            return (
                                <div style={{ padding: '12px 20px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Select Lead Job:</span>
                                    <select
                                        value={selectedLeadId || ''}
                                        onChange={(e) => setSelectedLeadId(parseInt(e.target.value))}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '4px',
                                            border: '1px solid #cbd5e1',
                                            fontSize: '13px',
                                            minWidth: '200px'
                                        }}
                                    >
                                        {roots.map(r => (
                                            <option key={r.id} value={r.id}>{r.itemName}</option>
                                        ))}
                                    </select>
                                </div>
                            );
                        })()}

                        {/* Pricing Table Content */}
                        {visibleJobs.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                No EnquiryFor items found for this enquiry.
                            </div>
                        ) : (
                            <>
                                <table style={{ width: '40%', borderCollapse: 'collapse' }}>

                                    <tbody>
                                        {(() => {
                                            // Grouping Logic: Keyed by Job ID
                                            const groupMap = {}; // { jobId: { job, options: [] } }

                                            // LEAD JOB FILTERING LOGIC
                                            let targetJobs = visibleJobs;
                                            if (selectedLeadId && pricingData && pricingData.jobs) {
                                                const getDescendants = (rootId, all) => {
                                                    const set = new Set([rootId]);
                                                    let changed = true;
                                                    while (changed) {
                                                        changed = false;
                                                        all.forEach(j => {
                                                            if (!set.has(j.id) && set.has(j.parentId)) {
                                                                set.add(j.id);
                                                                changed = true;
                                                            }
                                                        });
                                                    }
                                                    return set;
                                                };
                                                const validIds = getDescendants(selectedLeadId, pricingData.jobs);
                                                targetJobs = visibleJobs.filter(j => {
                                                    // Map visibleJob (name) to ID. But wait, visibleJobs logic in 'PricingForm' relies on name filtering?
                                                    // Actually 'visibleJobs' earlier in file uses pricingData.filter...
                                                    // Wait, visibleJobs I defined earlier IS job objects.
                                                    // So j is a Job Object.
                                                    return validIds.has(j.id);
                                                });
                                            }

                                            // Initialize Groups for Target Jobs
                                            targetJobs.forEach(job => {
                                                groupMap[job.id] = { job: job, options: [] };
                                            });

                                            // Determine Lead Job for sorting
                                            const activeLeadJob = pricingData.jobs.find(j => j.id === selectedLeadId) || targetJobs.find(j => j.isLead);

                                            // Assign Options to Groups
                                            const maxId = filteredOptions.reduce((max, opt) => (opt.id > max ? opt.id : max), 0);

                                            filteredOptions.forEach(opt => {
                                                targetJobs.forEach(job => {
                                                    let match = false;
                                                    if (!opt.itemName) match = (job.isLead); // Null scope -> Lead Job
                                                    else if (opt.itemName === 'Lead Job' && job.isLead) match = true;
                                                    else if (opt.itemName === job.itemName) match = true;
                                                    else if (opt.itemName === `${job.itemName} / Lead Job`) match = true; // Legacy

                                                    if (match) {
                                                        // Calculate Row Total (Visibility Check)
                                                        // Calculate Row Total (Visibility Check)
                                                        const key = `${opt.id}_${job.id}`;
                                                        let price = 0;
                                                        if (values[key] !== undefined && values[key] !== '') {
                                                            price = parseFloat(values[key]) || 0;
                                                        } else {
                                                            // Check Strict Key first
                                                            if (pricingData.values[key] && pricingData.values[key].Price) {
                                                                price = parseFloat(pricingData.values[key].Price) || 0;
                                                            }
                                                            // Fallback to Name Key if Strict Key is missing (Step 827 Fix)
                                                            else {
                                                                const nameKey = `${opt.id}_${job.itemName}`;
                                                                if (pricingData.values[nameKey] && pricingData.values[nameKey].Price) {
                                                                    price = parseFloat(pricingData.values[nameKey].Price) || 0;
                                                                }
                                                                // Fallback to Clean Name Key (Step 848 Fix)
                                                                else {
                                                                    const cleanName = job.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                                                                    const cleanKey = `${opt.id}_${cleanName}`;
                                                                    if (pricingData.values[cleanKey] && pricingData.values[cleanKey].Price) {
                                                                        price = parseFloat(pricingData.values[cleanKey].Price) || 0;
                                                                    }
                                                                }
                                                            }
                                                        }

                                                        // Hide if Empty, Not Newest, Not Base Price
                                                        const isDefault = (opt.name === 'Price' || opt.name === 'Optional');
                                                        const isEmpty = price <= 0.01;
                                                        const isNotNewest = opt.id !== maxId;

                                                        if (isDefault && isEmpty && isNotNewest) return;
                                                        if (isEmpty && isNotNewest && opt.name !== 'Base Price') {
                                                            // Check DB value existence strictly?
                                                            // If DB has value, show it.
                                                            if (!pricingData.values[key] || parseFloat(pricingData.values[key].Price) <= 0) {
                                                                return;
                                                            }
                                                        }

                                                        groupMap[job.id].options.push(opt);
                                                    }
                                                });
                                            });

                                            // Sort Groups: Lead Job first, then Alphabetical
                                            const sortedGroups = Object.values(groupMap).sort((a, b) => {
                                                if (a.job.id === activeLeadJob?.id) return -1;
                                                if (b.job.id === activeLeadJob?.id) return 1;
                                                return a.job.itemName.localeCompare(b.job.itemName);
                                            });

                                            return sortedGroups.map(group => {
                                                const job = group.job;
                                                // Group Display Name
                                                const groupName = job.isLead ? `${job.itemName} / Lead Job` : job.itemName;
                                                const canEditSection = pricingData.access.editableJobs && pricingData.access.editableJobs.includes(job.itemName);

                                                return (
                                                    <React.Fragment key={job.id}>
                                                        {/* Group Header */}
                                                        <tr style={{ background: '#e2e8f0' }}>
                                                            <td colSpan={2} style={{ padding: '6px 12px', fontWeight: 'bold', fontSize: '11px', color: '#475569', textTransform: 'uppercase' }}>
                                                                {groupName} Options
                                                            </td>
                                                        </tr>
                                                        {group.options.map(option => {
                                                            const key = `${option.id}_${job.id}`;
                                                            const canEditRow = canEditSection; // Simplified

                                                            return (
                                                                <tr key={`${option.id}_${job.id}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                                    <td style={{ padding: '6px 12px', fontWeight: '500', color: '#1e293b', fontSize: '13px' }}>{option.name}</td>
                                                                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                                            <input
                                                                                type="number"
                                                                                // Use state value OR fallback to DB value (Clean/Legacy) if state is empty (Step 869)
                                                                                value={values[key] !== undefined ? values[key] : (() => {
                                                                                    // Resolution Logic for Display
                                                                                    if (pricingData.values[key] && pricingData.values[key].Price) return pricingData.values[key].Price;

                                                                                    const nameKey = `${option.id}_${job.itemName}`;
                                                                                    if (pricingData.values[nameKey] && pricingData.values[nameKey].Price) return pricingData.values[nameKey].Price;

                                                                                    // Case-Sensitive Clean Name (Must match loadPricing logic)
                                                                                    const cleanName = job.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                                                                                    const cleanKey = `${option.id}_${cleanName}`;



                                                                                    if (pricingData.values[cleanKey] && pricingData.values[cleanKey].Price) return pricingData.values[cleanKey].Price;
                                                                                    return '';
                                                                                })()}
                                                                                onChange={(e) => handleValueChange(option.id, job.id, e.target.value)}
                                                                                disabled={!canEditRow}
                                                                                placeholder="0.00"
                                                                                step="0.01"
                                                                                style={{
                                                                                    width: '100%',
                                                                                    maxWidth: '150px',
                                                                                    padding: '4px 8px',
                                                                                    border: '1px solid #e2e8f0',
                                                                                    borderRadius: '4px',
                                                                                    fontSize: '13px',
                                                                                    textAlign: 'right',
                                                                                    background: canEditRow ? 'white' : '#f1f5f9',
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
                                                    </React.Fragment>
                                                );
                                            });
                                        })()
                                        }

                                        {/* Total Row */}
                                        {(() => {
                                            // Recalculate Target Jobs for Total
                                            let targetJobs = visibleJobs;
                                            if (selectedLeadId && pricingData && pricingData.jobs) {
                                                const getDescendants = (rootId, all) => {
                                                    const set = new Set([rootId]);
                                                    let changed = true;
                                                    while (changed) {
                                                        changed = false;
                                                        all.forEach(j => {
                                                            if (!set.has(j.id) && set.has(j.parentId)) {
                                                                set.add(j.id);
                                                                changed = true;
                                                            }
                                                        });
                                                    }
                                                    return set;
                                                };
                                                const validIds = getDescendants(selectedLeadId, pricingData.jobs);
                                                targetJobs = visibleJobs.filter(j => validIds.has(j.id));
                                            }

                                            // Calculate Total
                                            let grandTotal = 0;
                                            let hasPricedOptional = false;

                                            // Helper to get price
                                            const getPrice = (key) => {
                                                if (values && values.hasOwnProperty(key)) {
                                                    const val = values[key];
                                                    return (val === '' || val === null) ? 0 : (parseFloat(val) || 0);
                                                }
                                                if (pricingData.values && pricingData.values[key]) {
                                                    return parseFloat(pricingData.values[key].Price || 0);
                                                }
                                                return 0;
                                            };

                                            filteredOptions.forEach(opt => {
                                                if (opt.name === 'Optional') {
                                                    // Check if priced
                                                    targetJobs.forEach(job => {
                                                        const key = `${opt.id}_${job.id}`;
                                                        if (getPrice(key) > 0) hasPricedOptional = true;
                                                    });
                                                    return;
                                                }

                                                // Sum Non-Optional
                                                targetJobs.forEach(job => {
                                                    // VISIBILITY CHECK: Only match options that are actually rendered for this job (Step 904)
                                                    let match = false;
                                                    if (!opt.itemName) match = (job.isLead);
                                                    else if (opt.itemName === 'Lead Job' && job.isLead) match = true;
                                                    else if (opt.itemName === job.itemName) match = true;
                                                    else if (opt.itemName === `${job.itemName} / Lead Job`) match = true;

                                                    if (match) {
                                                        const key = `${opt.id}_${job.id}`;
                                                        grandTotal += getPrice(key);
                                                    }
                                                });
                                            });

                                            // Render Total Row
                                            if (grandTotal > 0 && !hasPricedOptional) {
                                                return (
                                                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                                                        <td style={{ padding: '12px 16px', fontWeight: 'bold', color: '#1e293b', textAlign: 'left' }}>Total</td>
                                                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                                <div style={{ width: '100%', maxWidth: '150px', textAlign: 'right', fontWeight: 'bold', color: '#1e293b' }}>
                                                                    {grandTotal.toFixed(2)}
                                                                </div>
                                                                {/* Spacer to match Delete Button width */}
                                                                <div style={{ width: '16px' }}></div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            }
                                            return null;
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
        </div >
    );
};

export default PricingForm;
