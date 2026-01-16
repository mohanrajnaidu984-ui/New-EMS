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


    // Debounce timer
    const debounceRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);



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

                // AUTO-PROVISION TABS (Pricing Sheets)
                // Ensure ALL linked customers (Main + Extra) have pricing tabs.
                // If they are missing, auto-create "Base Price" for them.
                const linkedCustomers = [
                    data.enquiry.customerName,
                    ...(data.extraCustomers || [])
                ].filter(Boolean);

                const existingPricingCustomers = data.customers || [];

                // Find customers who need initialization
                const customersToInit = linkedCustomers.filter(c => !existingPricingCustomers.includes(c));

                if (customersToInit.length > 0) {
                    // Start Provisioning
                    try {
                        const allJobs = data.jobs || [];
                        const promises = [];

                        // Create Base Price for EACH Missing Customer for EACH Job
                        customersToInit.forEach(cName => {
                            allJobs.forEach(job => {
                                const payload = {
                                    requestNo: requestNo,
                                    optionName: 'Base Price',
                                    itemName: job.itemName,
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

                setPricingData(data);

                // Set selected customer (either requested or default from API)
                if (customerName) {
                    setSelectedCustomer(customerName);
                } else {
                    setSelectedCustomer(data.activeCustomer || '');
                }

                // Initialize values - ONLY set values that exist in DB with non-zero prices
                // Don't initialize empty entries - if a key doesn't exist in values state,
                // it means the user hasn't touched it yet
                const initialValues = {};
                if (data.options && data.jobs) {
                    data.options.forEach(opt => {
                        data.jobs.forEach(job => {
                            const key = `${opt.id}_${job.itemName}`;
                            const existing = data.values ? data.values[key] : null;
                            // Only set value if it exists and is non-zero
                            if (existing && existing.Price && parseFloat(existing.Price) > 0) {
                                initialValues[key] = existing.Price;
                            }
                            // Don't set anything for zero/null values - leave key absent
                        });
                    });
                }
                setValues(initialValues);
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

        const payload = {
            requestNo: pricingData.enquiry.requestNo,
            optionName: optionName.trim(),
            itemName: targetItemName,
            customerName: custName
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
    const handleValueChange = (optionId, jobName, value) => {
        const key = `${optionId}_${jobName}`;
        setValues(prev => ({
            ...prev,
            // Keep as string to preserve empty state, parse only when saving
            [key]: value === '' ? '' : (parseFloat(value) || '')
        }));
    };

    // Save all prices
    const saveAll = async () => {
        if (!pricingData) return;

        const requestNo = pricingData.enquiry.requestNo;
        const userName = currentUser?.name || currentUser?.FullName || 'Unknown';
        const editableJobs = pricingData.access.editableJobs || [];

        // Helper to get target job for an option - must match the key logic in render!
        const getTargetJob = (opt) => {
            const leadJob = pricingData.jobs.find(j => j.isLead);
            let targetJobName = opt.itemName;

            // Must match the same normalization logic used in render (lines 800-808)
            if (!targetJobName) {
                targetJobName = leadJob ? leadJob.itemName : pricingData.jobs[0]?.itemName;
            } else if (leadJob && (targetJobName === `${leadJob.itemName} / Lead Job` || targetJobName === 'Lead Job')) {
                // Fix for legacy/bugged options with display suffix
                targetJobName = leadJob.itemName;
            }

            return targetJobName;
        };

        // First, validate that there are non-zero values to save
        let valuesToSave = [];
        let skippedCount = 0;

        for (const opt of pricingData.options) {
            const targetJobName = getTargetJob(opt);

            // Is this job editable?
            if (!editableJobs.includes(targetJobName)) continue;

            const key = `${opt.id}_${targetJobName}`;
            let price = 0;

            // Logic for determining the price to save:
            // 1. If key exists in values state -> user has interacted with this field
            //    - Use their value (even if empty = means they cleared it = 0)
            // 2. If key doesn't exist in values state -> user hasn't touched this field
            //    - Fall back to DB value
            if (values.hasOwnProperty(key)) {
                // User has interacted with this field
                const userValue = values[key];
                if (userValue !== '' && userValue !== undefined && userValue !== null) {
                    price = parseFloat(userValue) || 0;
                } else {
                    // User cleared the field - treat as 0
                    price = 0;
                }
            } else {
                // User hasn't touched this field - use DB value if exists
                if (pricingData.values[key] && pricingData.values[key].Price) {
                    price = parseFloat(pricingData.values[key].Price) || 0;
                }
            }

            console.log('DEBUG SAVE CHECK:', { key, value: values[key], dbValue: pricingData.values[key]?.Price, finalPrice: price });

            // Check if value is zero or empty
            if (!price || price <= 0) {
                console.log('Will skip zero/empty value for:', opt.name, targetJobName);
                skippedCount++;
                continue;
            }

            // This is a valid value to save
            valuesToSave.push({
                optionId: opt.id,
                optionName: opt.name,
                enquiryForItem: targetJobName,
                price: price
            });
        }

        // If no valid values to save, show warning and reload to restore original values
        if (valuesToSave.length === 0) {
            alert('⚠️ Cannot save: All price values are empty or zero.\n\nPlease enter at least one valid price value greater than zero.');
            // Reload to restore original values from database
            loadPricing(pricingData.enquiry.requestNo, selectedCustomer);
            return;
        }

        // If some values were skipped, confirm with user
        if (skippedCount > 0) {
            const confirmSave = window.confirm(
                `${skippedCount} option(s) have empty or zero values and will NOT be saved.\n\n` +
                `Only ${valuesToSave.length} option(s) with valid prices will be saved.\n\n` +
                `Do you want to continue?`
            );
            if (!confirmSave) {
                // User cancelled - reload to restore original values
                loadPricing(pricingData.enquiry.requestNo, selectedCustomer);
                return;
            }
        }

        // Now actually save the valid values
        setSaving(true);
        const promises = [];

        try {
            for (const item of valuesToSave) {
                const p = fetch(`${API_BASE}/api/pricing/value`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        requestNo: requestNo,
                        optionId: item.optionId,
                        enquiryForItem: item.enquiryForItem,
                        price: item.price,
                        updatedBy: userName,
                        customerName: selectedCustomer
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
    const filteredOptions = pricingData ? pricingData.options.filter(o => {
        // Lead sees everything: Global (null) and Scoped (any)
        if (pricingData.access.hasLeadAccess) return true;

        // Sub-Job User:
        // Strictly show ONLY options scoped to their editable jobs.
        // Hide Global/Null options to provide "fresh" structure.
        if (o.itemName && pricingData.access.editableJobs.includes(o.itemName)) return true;

        return false;
    }) : [];

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

            {/* No Results */}
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
                                        onClick={() => loadPricing(pricingData.enquiry.requestNo, cust)}
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
                                            // Grouping Logic
                                            const groups = {};
                                            const leadJob = visibleJobs.find(j => j.isLead);
                                            // New Group Name: "ItemName / Lead Job"
                                            const leadJobDisplayName = leadJob ? `${leadJob.itemName} / Lead Job` : 'Lead Job';

                                            // Initialize groups for ALL visible jobs
                                            if (leadJob) groups[leadJobDisplayName] = [];

                                            visibleJobs.forEach(j => {
                                                if (!j.isLead) {
                                                    groups[j.itemName] = [];
                                                }
                                            });

                                            // Find max ID to identify the newest option
                                            const maxId = filteredOptions.reduce((max, opt) => (opt.id > max ? opt.id : max), 0);

                                            filteredOptions.forEach(opt => {
                                                let groupName = opt.itemName;

                                                // Map null or matching item name to the Lead Job Header
                                                if (!groupName || (leadJob && groupName === leadJob.itemName)) {
                                                    groupName = leadJobDisplayName;
                                                }

                                                // Zero-Value Filter Logic
                                                let rowTotal = 0;
                                                // FIX: Check ALL jobs to prevent hiding valid sub-job values
                                                pricingData.jobs.forEach(job => {
                                                    const key = `${opt.id}_${job.itemName}`;
                                                    let price = 0;
                                                    // Check pending changes - properly handle empty strings
                                                    if (values && values[key] !== undefined && values[key] !== '') {
                                                        price = parseFloat(values[key]) || 0;
                                                    }
                                                    // Fallback to saved data
                                                    else if (pricingData.values && pricingData.values[key] && pricingData.values[key].Price) {
                                                        price = parseFloat(pricingData.values[key].Price) || 0;
                                                    }
                                                    if (!isNaN(price)) {
                                                        rowTotal += price;
                                                    }
                                                });

                                                // Filter out empty rows (rows with zero/empty values)
                                                const isDefaultName = (opt.name === 'Price' || opt.name === 'Optional');
                                                const isEmpty = rowTotal <= 0.01; // Allow for float errors, treat < 0.01 as 0
                                                const isNotNewest = opt.id !== maxId;

                                                // Hide default rows that are empty and not the newest
                                                // BUT: Always show "Base Price" even if empty
                                                if (isDefaultName && isEmpty && isNotNewest) {
                                                    return; // Hide this row
                                                }

                                                // Also hide custom options with zero values from database (unless newest)
                                                // This prevents showing "0.00" values that shouldn't exist
                                                // EXCEPTION: Keep "Base Price" visible
                                                if (isEmpty && isNotNewest && opt.name !== 'Base Price') {
                                                    // Check if this row has any DB values (not just pending)
                                                    let hasDBValue = false;
                                                    pricingData.jobs.forEach(job => {
                                                        const key = `${opt.id}_${job.itemName}`;
                                                        if (pricingData.values[key] && parseFloat(pricingData.values[key].Price) > 0) {
                                                            hasDBValue = true;
                                                        }
                                                    });
                                                    // If no valid DB values and empty, hide it
                                                    if (!hasDBValue) {
                                                        return; // Hide this empty row
                                                    }
                                                }

                                                if (!groups[groupName]) groups[groupName] = [];
                                                groups[groupName].push(opt);
                                            });

                                            // Sort Groups: Lead Job first
                                            const sortedGroupNames = Object.keys(groups).sort((a, b) => {
                                                if (a === leadJobDisplayName) return -1;
                                                if (b === leadJobDisplayName) return 1;
                                                return a.localeCompare(b);
                                            });

                                            return sortedGroupNames.map(groupName => {
                                                // Resolve actual item name for permissions
                                                let actualItemName = groupName;
                                                if (groupName === leadJobDisplayName) {
                                                    actualItemName = leadJob ? leadJob.itemName : null;
                                                }

                                                // Check if user can edit this section
                                                const canEditSection = pricingData.access.editableJobs &&
                                                    (actualItemName ? pricingData.access.editableJobs.includes(actualItemName) : true);
                                                // If actualItemName is null (global), assume editable?
                                                // Actually, global options should probably be editable by lead.
                                                // If leadJob exists, actualItemName is leadJob.itemName.

                                                return (
                                                    <React.Fragment key={groupName}>
                                                        {/* Group Header */}
                                                        <tr style={{ background: '#e2e8f0' }}>
                                                            <td colSpan={2} style={{ padding: '8px 16px', fontWeight: 'bold', fontSize: '12px', color: '#475569', textTransform: 'uppercase' }}>
                                                                {groupName} Options
                                                            </td>
                                                        </tr>
                                                        {groups[groupName].map(option => {
                                                            // Resolve target job name correctly for permission checking
                                                            let targetJobName = option.itemName;

                                                            // Logic to handle both "BMS" and "BMS / Lead Job" stored values
                                                            if (!targetJobName) {
                                                                targetJobName = leadJob ? leadJob.itemName : visibleJobs[0]?.itemName;
                                                            } else if (leadJob && (targetJobName === `${leadJob.itemName} / Lead Job` || targetJobName === 'Lead Job')) {
                                                                // Fix for legacy/bugged options with display suffix
                                                                targetJobName = leadJob.itemName;
                                                            }

                                                            const key = `${option.id}_${targetJobName}`;
                                                            // Check permissions against the RAW job name
                                                            const canEditRow = pricingData.access.editableJobs && pricingData.access.editableJobs.includes(targetJobName);

                                                            return (
                                                                <tr key={option.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                                    <td style={{ padding: '12px 16px', fontWeight: '500', color: '#1e293b' }}>{option.name}</td>
                                                                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                                            <input
                                                                                type="number"
                                                                                value={values[key] || ''}
                                                                                onChange={(e) => handleValueChange(option.id, targetJobName, e.target.value)}
                                                                                disabled={!canEditRow}
                                                                                placeholder="0.00"
                                                                                step="0.01"
                                                                                style={{
                                                                                    width: '100%',
                                                                                    maxWidth: '150px',
                                                                                    padding: '8px 10px',
                                                                                    border: '1px solid #e2e8f0',
                                                                                    borderRadius: '4px',
                                                                                    fontSize: '14px',
                                                                                    textAlign: 'right',
                                                                                    background: canEditRow ? 'white' : '#f1f5f9',
                                                                                    cursor: canEditRow ? 'text' : 'not-allowed'
                                                                                }}
                                                                            />
                                                                            {/* Delete Button */}

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
                                                        {/* Add Option Row for this Group - Only if Editable */}
                                                        {canEditSection && (
                                                            <tr style={{ background: '#f8fafc' }}>
                                                                <td style={{ padding: '8px 16px' }}>
                                                                    <input
                                                                        type="text"
                                                                        placeholder={`Add ${groupName.replace(/\/ Lead Job|Lead Job \//, '').trim()} option...`}
                                                                        value={newOptionNames[groupName] || ''}
                                                                        onChange={(e) => setNewOptionNames(prev => ({ ...prev, [groupName]: e.target.value }))}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') {
                                                                                addOption(groupName);
                                                                            }
                                                                        }}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '6px 12px',
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
                                            // Calculate Total
                                            let grandTotal = 0;
                                            let hasPricedOptional = false;

                                            // Helper to get price
                                            const getPrice = (key) => {
                                                if (values && values[key] && values[key].Price !== undefined && values[key].Price !== '') {
                                                    return parseFloat(values[key].Price);
                                                }
                                                if (pricingData.values && pricingData.values[key]) {
                                                    return parseFloat(pricingData.values[key].Price || 0);
                                                }
                                                return 0;
                                            };

                                            filteredOptions.forEach(opt => {
                                                if (opt.name === 'Optional') {
                                                    // Check if priced
                                                    pricingData.jobs.forEach(job => {
                                                        const key = `${opt.id}_${job.itemName}`;
                                                        if (getPrice(key) > 0) hasPricedOptional = true;
                                                    });
                                                    return;
                                                }

                                                // Sum Non-Optional
                                                pricingData.jobs.forEach(job => {
                                                    const key = `${opt.id}_${job.itemName}`;
                                                    grandTotal += getPrice(key);
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
