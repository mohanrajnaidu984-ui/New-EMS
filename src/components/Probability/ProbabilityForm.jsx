import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import AsyncSelect from 'react-select/async'; // START_OF_FILE_MODIFICATION
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { format } from 'date-fns';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';

const API_BASE = 'http://localhost:5001';

const ProbabilityForm = () => {
    const { currentUser } = useAuth();
    const { masters } = useData();

    // --- View State ---
    const [listMode, setListMode] = useState('Pending'); // 'Pending', 'Won', 'Lost', 'OnHold', 'Cancelled', 'FollowUp', 'Retendered'

    // --- Filter State ---
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [filterProbability, setFilterProbability] = useState(''); // For FollowUp mode

    const [loadingList, setLoadingList] = useState(false);
    const [updatingReqNo, setUpdatingReqNo] = useState(null); // Track which row is being updated
    const [updatedItems, setUpdatedItems] = useState({});
    const [enquiriesList, setEnquiriesList] = useState([]);
    // Removed viewMode and detail states as per request



    // --- Fetch List ---
    useEffect(() => {
        if (currentUser) {
            console.log('ProbabilityForm: Current User:', currentUser);
            fetchList();
        }
    }, [listMode, fromDate, toDate, filterProbability, currentUser]);

    const fetchList = async () => {
        setLoadingList(true);
        try {
            const queryParams = new URLSearchParams({
                mode: listMode,
                fromDate: fromDate || '',
                toDate: toDate || '',
                probability: filterProbability || '',
                userEmail: currentUser?.EmailId || currentUser?.email || ''
            });

            const url = `${API_BASE}/api/probability/list?${queryParams}`;
            console.log('ProbabilityForm: Fetching list from:', url);
            const res = await fetch(url);
            if (res.ok) {
                const data = (await res.json()).map((item, index) => {
                    if (item.QuoteOptions && typeof item.QuoteOptions === 'string') {
                        if (item.QuoteOptions.includes('::')) {
                            // Parse custom delimited string: OptionName::Price##OptionName2::Price2
                            item.QuoteOptions = item.QuoteOptions.split('##').map(opt => {
                                const parts = opt.split('::');
                                // Handle potential multiple :: if name contains it, though unlikely. 
                                // Better: last part is price, rest is name.
                                const priceVal = parts.pop();
                                const nameVal = parts.join('::');
                                return { name: nameVal || '', price: parseFloat(priceVal) || 0 };
                            });
                        } else {
                            try {
                                item.QuoteOptions = JSON.parse(item.QuoteOptions);
                            } catch (e) {
                                item.QuoteOptions = [];
                            }
                        }
                    } else if (!Array.isArray(item.QuoteOptions)) {
                        item.QuoteOptions = [];
                    }

                    console.log(`Enquiry ${item.RequestNo} API Data:`, { FilteredQuoteRefs: item.FilteredQuoteRefs, FinalQuoteRefsTarget: item.FinalQuoteRefsTarget });
                    // Handle QuoteRefsData from new FilteredQuoteRefs or legacy fields
                    let qRefsRaw = item.FilteredQuoteRefs || item.FinalQuoteRefsTarget || item.FinalQuoteRefTarget || item.QuoteRefsData;

                    if (qRefsRaw) {
                        if (typeof qRefsRaw === 'string') {
                            // If it starts with [ it's JSON from previous attempt or different version
                            if (qRefsRaw.trim().startsWith('[')) {
                                try {
                                    item.QuoteRefs = JSON.parse(qRefsRaw);
                                } catch (e) {
                                    item.QuoteRefs = qRefsRaw.split(',').filter(Boolean);
                                }
                            } else {
                                // STRING_AGG format: "Ref1|Name1,Ref2|Name2"
                                item.QuoteRefs = qRefsRaw.split(',').filter(Boolean).map(refStr => {
                                    const [ref, name] = refStr.includes('|') ? refStr.split('|') : [refStr, 'N/A'];
                                    return { QuoteNumber: ref.trim(), ToName: name.trim() };
                                }).sort((a, b) => {
                                    const nameA = a.ToName.toLowerCase(), nameB = b.ToName.toLowerCase();
                                    if (nameA !== nameB) return nameA.localeCompare(nameB);
                                    return b.QuoteNumber.localeCompare(a.QuoteNumber);
                                });
                            }
                        } else if (Array.isArray(qRefsRaw)) {
                            item.QuoteRefs = qRefsRaw;
                        } else {
                            item.QuoteRefs = [];
                        }
                    } else {
                        item.QuoteRefs = [];
                    }


                    // Robust Quoted Values
                    item.TotalQuotedValue = item.TotalQuotedValue || item.totalquotedvalue;
                    item.NetQuotedValue = item.NetQuotedValue || item.netquotedvalue;

                    if (item.QuoteRefs && item.QuoteRefs.length > 0) {
                        console.log(`Enquiry ${item.RequestNo} QuoteRefs:`, item.QuoteRefs);
                    }
                    return item;
                });
                setEnquiriesList(data);
            } else {
                console.error("Failed to fetch list");
                setEnquiriesList([]);
            }
        } catch (err) {
            console.error("Error fetching list:", err);
            setEnquiriesList([]);
        } finally {
            setLoadingList(false);
        }
    };

    // --- Handlers ---

    // New: Handle Status Change in List (specifically for FollowUp)
    // --- Handlers ---

    // Generic Inline State Update (Does NOT save to backend)
    const handleUpdate = (item, updates) => {
        // Update local state ONLY
        const updatedItem = { ...item, ...updates };
        setEnquiriesList(prev => prev.map(e =>
            e.RequestNo === item.RequestNo ? updatedItem : e
        ));
        // Reset updated status on edit
        if (updatedItems && updatedItems[item.RequestNo]) {
            setUpdatedItems(prev => {
                const newState = { ...prev };
                delete newState[item.RequestNo];
                return newState;
            });
        }
    };

    // PERSISTence handler called by Update button
    const persistUpdate = async (item) => {
        // 1. Mandatory Validation for "Won" status
        if (item.Status === 'Won') {
            if (!item.WonQuoteRef) {
                alert('Quote Reference is mandatory for Won status.');
                return;
            }
            // Clean value for check
            const rawVal = String(item.WonOrderValue || '').replace(/,/g, '').replace(/BD/g, '').trim();
            if (!item.WonOrderValue || isNaN(rawVal) || Number(rawVal) <= 0) {
                alert('Valid Job Value is mandatory for Won status.');
                return;
            }
            if (!item.WonJobNo || !item.WonJobNo.trim()) {
                alert('ERP Job No. is mandatory for Won status.');
                return;
            }
            if (!item.ExpectedOrderDate) {
                alert('Booked Date is mandatory for Won status.');
                return;
            }
        }

        // 2. Mandatory Validation for "FollowUp" status
        // 2. Mandatory Validation for "FollowUp" status
        if (item.Status === 'FollowUp' || item.Status === 'Follow-up') {
            // Mandatory for ALL FollowUp scenarios
            if (!item.WonQuoteRef || String(item.WonQuoteRef).trim() === '') {
                alert('Quote Reference is mandatory for Follow Up.');
                return;
            }
            if (!item.ProbabilityOption || String(item.ProbabilityOption).trim() === '') {
                alert('Probability is mandatory for Follow Up.');
                return;
            }

            // specific validation for High probabilities
            const prob = String(item.ProbabilityOption || '');
            const isHigh = prob.includes('90%') || prob.includes('99%');

            if (isHigh) {
                const dateVal = item.ExpectedOrderDate;
                if (!dateVal || String(dateVal).trim() === '' || String(dateVal) === 'null' || String(dateVal) === 'undefined' || String(dateVal) === '0000-00-00') {
                    alert('Expected Order Date is mandatory for ' + prob);
                    return;
                }
            }
        }

        setUpdatingReqNo(item.RequestNo);
        try {
            // For Follow-up status, use NetQuotedValue as CustomerPreferredPrice if not explicitly set
            let customerPreferredPrice = item.CustomerPreferredPrice;
            if ((item.Status === 'FollowUp' || item.Status === 'Follow-up') && !customerPreferredPrice && item.NetQuotedValue) {
                customerPreferredPrice = String(item.NetQuotedValue).replace(/,/g, '').replace(/BD/g, '').trim();
            }

            const payload = {
                enquiryNo: item.RequestNo,
                status: item.Status,
                probabilityOption: item.ProbabilityOption,
                remarks: item.ProbabilityRemarks,
                wonDetails: {
                    customerName: item.WonCustomerName,
                    orderValue: String(item.WonOrderValue || '').replace(/,/g, '').replace(/BD/g, '').trim(),
                    jobNo: item.WonJobNo,
                    wonQuoteRef: item.WonQuoteRef,
                    wonOption: item.WonOption,
                    grossProfit: item.WonGrossProfit != null && item.WonGrossProfit !== '' ? parseFloat(item.WonGrossProfit) : null,
                },
                customerPreferredPrice: customerPreferredPrice,
                expectedDate: item.ExpectedOrderDate,
                lostDetails: {
                    customer: item.LostCompetitor,
                    reason: item.LostReason,
                    competitorPrice: String(item.LostCompetitorPrice || '').replace(/,/g, '').replace(/BD/g, '').trim(),
                    lostDate: item.LostDate
                }
            };

            const res = await fetch(`${API_BASE}/api/probability/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                // alert(`Enquiry ${item.RequestNo} updated successfully. Saved Date: ${item.ExpectedOrderDate || 'None'}`);
                setUpdatedItems(prev => ({ ...prev, [item.RequestNo]: true }));

                // Optionally refresh list if it moves out of current mode (e.g. Pending -> Won)
                if (listMode === 'Pending') {
                    fetchList();
                }
            } else {
                const errData = await res.json();
                alert(`Update failed: ${errData.error || 'Server error'}`);
            }
        } catch (err) {
            console.error("Error saving probability:", err);
            alert("Connection error while saving.");
        } finally {
            setUpdatingReqNo(null);
        }
    };

    const handleStatusChange = (item, newStatus) => {
        handleUpdate(item, { Status: newStatus });
    };

    const fetchQuoteDetails = async (quoteNumber) => {
        try {
            const res = await fetch(`${API_BASE}/api/probability/quote-details/${encodeURIComponent(quoteNumber)}`);
            if (res.ok) {
                return await res.json();
            }
        } catch (err) {
            console.error("Error fetching quote details:", err);
        }
        return null;
    };

    const handleInlineUpdate = async (item, field, value) => {
        if (field === 'WonQuoteRef' && value) {
            const details = await fetchQuoteDetails(value);
            if (details) {
                const updates = {
                    WonQuoteRef: value,
                    WonCustomerName: details.customerName,
                    WonOrderValue: details.totalAmount, // Default to total amount
                };

                // If there are options, we don't auto-fill WonOrderValue yet, 
                // or we fill it if there's only one? User said "if optional price is not available directly fill the quoted value"
                // So if options exist, we might want to clear WonOrderValue or wait for option selection.
                // Let's store options in the item for the UI to pick up.
                updates.QuoteOptions = details.options || [];

                handleUpdate(item, updates);
                return;
            }
        }

        // Handle Option selection
        if (field === 'WonOption' && value) {
            const selectedOpt = (item.QuoteOptions || []).find(o => o.name === value);
            if (selectedOpt) {
                handleUpdate(item, { WonOption: value, WonOrderValue: selectedOpt.price });
                return;
            }
        }

        handleUpdate(item, { [field]: value });
    };

    // Removed handleSelectEnquiry, fetchQuotes, handleProbabilityChange, handleDetailsChange, handleSubmit

    // --- Render Logic ---

    // Detail View
    if (false) {
        return (
            <div className="container-fluid pt-4 pb-4 bg-light min-vh-100">
                <div className="row justify-content-center">
                    <div className="col-12 col-lg-8">
                        <div className="card border-0 shadow-sm rounded-3">
                            <div className="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
                                <div className="d-flex align-items-center gap-3">
                                    <button onClick={() => setViewMode('list')} className="btn btn-light btn-sm rounded-circle border p-2">
                                        <ArrowLeft size={18} />
                                    </button>
                                    <h5 className="mb-0 text-primary fw-bold">Update Probability: {formData.enquiryNo}</h5>
                                </div>
                                <div className="d-flex align-items-center gap-2">
                                    <span className="badge bg-info text-dark">{formData.status}</span>
                                    <button onClick={handleSubmit} className="btn btn-primary d-flex align-items-center gap-2">
                                        <Save size={18} /> Update
                                    </button>
                                </div>
                            </div>

                            <div className="card-body p-4">
                                {/* Top Info */}
                                <div className="row mb-4">
                                    <div className="col-md-6">
                                        <label className="small text-secondary fw-bold">Project Name</label>
                                        <div className="fw-medium">{formData.projectName}</div>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="small text-secondary fw-bold">Enquiry Date</label>
                                        <div className="fw-medium">{formData.enquiryDate ? new Date(formData.enquiryDate).toLocaleDateString() : '-'}</div>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="small text-secondary fw-bold">Quote No</label>
                                        <select className="form-select form-select-sm" value={quoteNo} onChange={e => setQuoteNo(e.target.value)}>
                                            {quotesList.map(q => <option key={q.QuoteNumber} value={q.QuoteNumber}>{q.QuoteNumber}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <hr className="text-muted opacity-25" />

                                <div className="row g-4">
                                    {/* Left Col */}
                                    <div className="col-md-6">
                                        {/* Probability Selector */}
                                        <div className="mb-3">
                                            <label className="form-label small fw-bold">Probability / Status</label>
                                            <select
                                                className="form-select"
                                                value={formData.probabilityOption}
                                                onChange={(e) => handleProbabilityChange(e.target.value)}
                                            >
                                                <option value="No Chance (0%)">No Chance (0%)</option>
                                                <option value="Low Chance (25%)">Low Chance (25%)</option>
                                                <option value="50-50 Chance (50%)">50-50 Chance (50%)</option>
                                                <option value="Medium Chance (75%)">Medium Chance (75%)</option>
                                                <option value="High Chance (90%)">High Chance (90%)</option>
                                                <option value="Very High Chance (99%)">Very High Chance (99%)</option>
                                            </select>
                                        </div>




                                    </div>

                                    {/* Right Col */}
                                    <div className="col-md-6">
                                        <div className="mb-3">
                                            <label className="form-label small fw-bold">Booked Date</label>
                                            <input type="date" className="form-control" value={formData.expectedDate} onChange={e => setFormData(p => ({ ...p, expectedDate: e.target.value }))} />
                                        </div>
                                        <div className="mb-3">
                                            <label className="form-label small fw-bold">Remarks</label>
                                            <textarea className="form-control" rows="4" value={formData.remarks} onChange={e => setFormData(p => ({ ...p, remarks: e.target.value }))}></textarea>
                                        </div>
                                    </div>
                                </div>

                                {/* Conditional Sections */}

                                {formData.status === 'Won' && (
                                    <div className="mt-4 border border-success rounded p-3 bg-success bg-opacity-10">
                                        <h6 className="text-success fw-bold mb-3">Won Details</h6>
                                        <div className="row g-3">
                                            <div className="col-md-6">
                                                <label className="small fw-bold">ERP Job No.</label>
                                                <input type="text" className="form-control" value={formData.wonDetails.jobNo} onChange={e => handleDetailsChange('wonDetails', 'jobNo', e.target.value)} />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="small fw-bold">Job Value</label>
                                                <input type="text" className="form-control" value={formData.wonDetails.orderValue} onChange={e => handleDetailsChange('wonDetails', 'orderValue', e.target.value)} />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="small fw-bold">Customer Name</label>
                                                <input type="text" className="form-control" value={formData.wonDetails.customerName} onChange={e => handleDetailsChange('wonDetails', 'customerName', e.target.value)} />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="small fw-bold">Contact Name</label>
                                                <input type="text" className="form-control" value={formData.wonDetails.contactName} onChange={e => handleDetailsChange('wonDetails', 'contactName', e.target.value)} />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="small fw-bold">Contact No</label>
                                                <input type="text" className="form-control" value={formData.wonDetails.contactNo} onChange={e => handleDetailsChange('wonDetails', 'contactNo', e.target.value)} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {formData.status === 'Lost' && (
                                    <div className="mt-4 border border-danger rounded p-3 bg-danger bg-opacity-10">
                                        <h6 className="text-danger fw-bold mb-3">Lost Details</h6>
                                        <div className="row g-3">
                                            <div className="col-md-6">
                                                <label className="small fw-bold">Winning Competitor</label>
                                                <input type="text" className="form-control" value={formData.lostDetails.customer} onChange={e => handleDetailsChange('lostDetails', 'customer', e.target.value)} />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="small fw-bold">Reason</label>
                                                <select className="form-select" value={formData.lostDetails.reason} onChange={e => handleDetailsChange('lostDetails', 'reason', e.target.value)}>
                                                    <option value="">Select...</option>
                                                    <option value="Price High">Price High</option>
                                                    <option value="Delivery">Delivery</option>
                                                    <option value="Spec">Technical Spec</option>
                                                </select>
                                            </div>
                                            <div className="col-md-6">
                                                <label className="small fw-bold">Competitor Price</label>
                                                <input type="text" className="form-control" value={formData.lostDetails.competitorPrice} onChange={e => handleDetailsChange('lostDetails', 'competitorPrice', e.target.value)} />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="small fw-bold">Lost Date</label>
                                                <input type="date" className="form-control" value={formData.lostDetails.lostDate ? formData.lostDetails.lostDate.split('T')[0] : ''} onChange={e => handleDetailsChange('lostDetails', 'lostDate', e.target.value)} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {formData.status === 'Retendered' && (
                                    <div className="mt-4 border border-warning rounded p-3 bg-warning bg-opacity-10">
                                        <h6 className="text-dark fw-bold mb-3">Retender Details</h6>
                                        <div className="mb-3">
                                            <label className="small fw-bold">Retender Date</label>
                                            <input type="date" className="form-control" value={formData.retenderDate} onChange={e => setFormData(p => ({ ...p, retenderDate: e.target.value }))} />
                                        </div>
                                    </div>
                                )}

                                {formData.status === 'OnHold' && (
                                    <div className="mt-4 border border-warning rounded p-3 bg-warning bg-opacity-10">
                                        <h6 className="text-dark fw-bold mb-3">On Hold Details</h6>
                                        <div className="mb-3">
                                            <label className="small fw-bold">On Hold Date</label>
                                            <input type="date" className="form-control" value={formData.onHoldDate} onChange={e => setFormData(p => ({ ...p, onHoldDate: e.target.value }))} />
                                        </div>
                                    </div>
                                )}

                                {formData.status === 'Cancelled' && (
                                    <div className="mt-4 border border-secondary rounded p-3 bg-secondary bg-opacity-10">
                                        <h6 className="text-dark fw-bold mb-3">Cancellation Details</h6>
                                        <div className="mb-3">
                                            <label className="small fw-bold">Cancellation Date</label>
                                            <input type="date" className="form-control" value={formData.cancellationDate} onChange={e => setFormData(p => ({ ...p, cancellationDate: e.target.value }))} />
                                        </div>
                                    </div>
                                )}

                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // List View
    return (
        <div className="container-fluid pt-1 pb-4 bg-light min-vh-100">
            <div className="row justify-content-center">
                <div className="col-12 col-lg-10">
                    <div className="card border-0 shadow-sm rounded-3">
                        {/* Header & Filters */}
                        <div className="card-header bg-white border-bottom py-3">
                            <div className="d-flex flex-wrap align-items-center gap-3">
                                {/* Mode Selector */}
                                <div style={{ width: '250px' }}>
                                    <label className="small text-muted fw-bold mb-1">View Mode</label>
                                    <select
                                        className="form-select"
                                        value={listMode}
                                        onChange={(e) => {
                                            setListMode(e.target.value);
                                            // Reset filters when mode changes
                                            setFromDate('');
                                            setToDate('');
                                            setFilterProbability('');
                                        }}
                                    >
                                        <option value="Pending">Pending Update</option>
                                        <option value="Won">Won</option>
                                        <option value="Lost">Lost</option>
                                        <option value="FollowUp">Follow Up</option>
                                        <option value="OnHold">On Hold</option>
                                        <option value="Cancelled">Cancelled</option>
                                        <option value="Retendered">Retendered</option>
                                    </select>
                                </div>

                                {/* Date Filters (Not for Pending) */}
                                {listMode !== 'Pending' && listMode !== 'FollowUp' && (
                                    <>
                                        <div>
                                            <label className="small text-muted fw-bold mb-1">From</label>
                                            <input type="date" className="form-control" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                                        </div>
                                        <div>
                                            <label className="small text-muted fw-bold mb-1">To</label>
                                            <input type="date" className="form-control" value={toDate} onChange={e => setToDate(e.target.value)} />
                                        </div>
                                    </>
                                )}

                                {/* FollowUp Probability Filter */}
                                {listMode === 'FollowUp' && (
                                    <div style={{ width: '200px' }}>
                                        <label className="small text-muted fw-bold mb-1">Probability</label>
                                        <select className="form-select" value={filterProbability} onChange={e => setFilterProbability(e.target.value)}>
                                            <option value="">All</option>
                                            <option value="Low Chance (25%)">Low Chance (25%)</option>
                                            <option value="50-50 Chance (50%)">50-50 Chance (50%)</option>
                                            <option value="Medium Chance (75%)">Medium Chance (75%)</option>
                                            <option value="High Chance (90%)">High Chance (90%)</option>
                                            <option value="Very High Chance (99%)">Very High Chance (99%)</option>
                                            <option value="No Chance (0%)">No Chance (0%)</option>
                                        </select>
                                    </div>
                                )}

                                {/* Refresh Button */}
                                <div className="ms-auto align-self-end">
                                    <button className="btn btn-outline-primary" onClick={fetchList} disabled={loadingList}>
                                        {loadingList ? 'Loading...' : 'Refresh'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="card-body p-0">
                            <div className="table-responsive">
                                <table className="table table-hover mb-0 align-bottom" style={{ minWidth: '2100px', tableLayout: 'fixed' }}>
                                    <thead className="bg-light text-secondary text-uppercase" style={{ fontSize: '0.7rem' }}>
                                        <tr>
                                            <th className="px-2 py-1" style={{ width: '50px', textAlign: 'left', verticalAlign: 'bottom' }}>SL</th>
                                            <th className="px-2 py-1" style={{ width: '80px', textAlign: 'left', verticalAlign: 'bottom' }}>Enquiry No.</th>
                                            <th className="px-2 py-1" style={{ width: '200px', textAlign: 'left', verticalAlign: 'bottom' }}>Project Name</th>
                                            <th className="px-2 py-1" style={{ width: '100px', textAlign: 'left', verticalAlign: 'bottom', whiteSpace: 'normal' }}>Total Quoted</th>
                                            <th className="px-2 py-1" style={{ width: '100px', textAlign: 'left', verticalAlign: 'bottom', whiteSpace: 'normal' }}>Net Quoted</th>
                                            <th className="px-2 py-1" style={{ width: '130px', textAlign: 'left', verticalAlign: 'bottom' }}>Status</th>
                                            <th className="px-2 py-1" style={{ width: '1300px', textAlign: 'left', verticalAlign: 'bottom' }}>Details</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loadingList ? (
                                            <tr>
                                                <td colSpan="7" className="text-center py-5">Loading...</td>
                                            </tr>
                                        ) : enquiriesList.length === 0 ? (
                                            <tr>
                                                <td colSpan="7" className="text-center py-5 text-muted">No records found.</td>
                                            </tr>
                                        ) : (
                                            enquiriesList.map((item, index) => (
                                                <tr key={item.RequestNo} className="border-b hover:bg-gray-50">
                                                    <td className="px-2 pt-1 pb-2 font-medium text-primary align-bottom">
                                                        {index + 1}
                                                    </td>
                                                    <td className="px-2 pt-1 pb-2 font-medium text-primary align-bottom">
                                                        {item.RequestNo}
                                                    </td>
                                                    <td className="px-2 pt-1 pb-2 text-gray-700 align-bottom">{item.ProjectName}</td>
                                                    <td className="px-2 pt-1 pb-2 text-right fw-medium align-bottom" style={{ fontSize: '12px' }}>
                                                        {item.TotalQuotedValue === 'Refer quote' ? (
                                                            <span className="text-danger italic">Refer quote</span>
                                                        ) : (
                                                            item.TotalQuotedValue !== null && item.TotalQuotedValue !== undefined ?
                                                                'BD ' + Number(item.TotalQuotedValue).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
                                                                : 'BD 0'
                                                        )}
                                                    </td>
                                                    <td className="px-2 pt-1 pb-2 text-right fw-medium align-bottom" style={{ fontSize: '12px' }}>
                                                        {item.NetQuotedValue === 'Refer quote' ? (
                                                            <span className="text-danger italic">Refer quote</span>
                                                        ) : (
                                                            item.NetQuotedValue !== null && item.NetQuotedValue !== undefined ?
                                                                'BD ' + Number(item.NetQuotedValue).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
                                                                : 'BD 0'
                                                        )}
                                                    </td>
                                                    <td className="px-2 py-1 text-center">
                                                        <select
                                                            className="form-select form-select-sm"
                                                            value={item.Status}
                                                            onChange={(e) => handleStatusChange(item, e.target.value)}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <option value="Pending">Pending</option>
                                                            <option value="FollowUp">Follow Up</option>
                                                            <option value="Won">Won</option>
                                                            <option value="Lost">Lost</option>
                                                            <option value="OnHold">On Hold</option>
                                                            <option value="Cancelled">Cancelled</option>
                                                            <option value="Retendered">Retendered</option>
                                                        </select>
                                                    </td>
                                                    <td className="px-2 py-1">
                                                        <div className="d-flex align-items-center gap-2">
                                                            {item.Status === 'Lost' && (
                                                                <>
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Lost To</span>
                                                                        <div style={{ width: '220px' }}>
                                                                            <AsyncSelect
                                                                                className="basic-single"
                                                                                classNamePrefix="select"
                                                                                placeholder="Lost to..."
                                                                                isSearchable={true}
                                                                                menuPortalTarget={document.body}
                                                                                value={item.LostCompetitor ? { value: item.LostCompetitor, label: item.LostCompetitor } : null}
                                                                                onChange={(option) => handleInlineUpdate(item, 'LostCompetitor', option ? option.value : '')}
                                                                                defaultOptions={(Array.isArray(item.QuoteRefs) ? item.QuoteRefs : [])
                                                                                    .map(q => ({
                                                                                        value: q.ToName || 'N/A',
                                                                                        label: q.ToName || 'N/A',
                                                                                        type: 'Quoted'
                                                                                    }))
                                                                                    .filter((v, i, a) => a.findIndex(t => t.value === v.value) === i)}
                                                                                loadOptions={(inputValue, callback) => {
                                                                                    const normalize = (str) => (str || '').toLowerCase();
                                                                                    const term = normalize(inputValue);

                                                                                    // 1. Quoted (Always available)
                                                                                    const quotedRaw = (Array.isArray(item.QuoteRefs) ? item.QuoteRefs : []).map(q => ({
                                                                                        value: q.ToName || 'N/A',
                                                                                        label: q.ToName || 'N/A',
                                                                                        type: 'Quoted'
                                                                                    }));
                                                                                    const quoted = quotedRaw.filter((v, i, a) => a.findIndex(t => t.value === v.value) === i);

                                                                                    // Filter Quoted by input if filtered results are desired from quoted list too
                                                                                    const filteredQuoted = term ? quoted.filter(q => normalize(q.label).includes(term)) : quoted;

                                                                                    // 2. Global (Only if term exists)
                                                                                    let globals = [];
                                                                                    if (term && masters?.customers) {
                                                                                        globals = masters.customers
                                                                                            .filter(c => normalize(c.CompanyName).includes(term))
                                                                                            .map(c => ({ value: c.CompanyName, label: c.CompanyName, type: 'Global' }))
                                                                                            .slice(0, 50);
                                                                                    }

                                                                                    // 3. Dedup
                                                                                    const existing = new Set(filteredQuoted.map(q => q.value));
                                                                                    const final = [...filteredQuoted, ...globals.filter(g => !existing.has(g.value))];

                                                                                    callback(final);
                                                                                }}
                                                                                styles={{
                                                                                    control: (base) => ({
                                                                                        ...base,
                                                                                        minHeight: '31px',
                                                                                        height: '31px',
                                                                                        fontSize: '12px'
                                                                                    }),
                                                                                    menuPortal: (base) => ({ ...base, zIndex: 9999 })
                                                                                }}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Reason for losing</span>
                                                                        <div style={{ width: '180px' }}>
                                                                            <select
                                                                                className="form-select form-select-sm"
                                                                                value={item.LostReason || ''}
                                                                                onChange={(e) => handleInlineUpdate(item, 'LostReason', e.target.value)}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            >
                                                                                <option value="">Select Reason...</option>
                                                                                <option value="Price high">Price high</option>
                                                                                <option value="Main contractor has own team">Main contractor has own team</option>
                                                                                <option value="Client has own team">Client has own team</option>
                                                                                <option value="Client prefers competitor">Client prefers competitor</option>
                                                                                <option value="Submission error">Submission error</option>
                                                                                <option value="Eligibility criteria">Eligibility criteria</option>
                                                                            </select>
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Competitor's price</span>
                                                                        <div className="input-group input-group-sm" style={{ width: '120px' }}>
                                                                            <span className="input-group-text px-1 text-muted" style={{ fontSize: '10px' }}>BD</span>
                                                                            <input
                                                                                type="number"
                                                                                className="form-control form-control-sm"
                                                                                placeholder="0"
                                                                                value={item.LostCompetitorPrice || ''}
                                                                                onChange={(e) => handleInlineUpdate(item, 'LostCompetitorPrice', e.target.value)}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Lost Date</span>
                                                                        <div style={{ width: '130px' }}>
                                                                            <input
                                                                                type="date"
                                                                                className="form-control form-control-sm"
                                                                                value={item.LostDate ? (typeof item.LostDate === 'string' ? item.LostDate.split('T')[0] : format(new Date(item.LostDate), 'yyyy-MM-dd')) : ''}
                                                                                onChange={(e) => handleInlineUpdate(item, 'LostDate', e.target.value)}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                style={{ fontSize: '12px', height: '31px' }}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Remarks</span>
                                                                        <div style={{ width: '200px' }}>
                                                                            <textarea
                                                                                className="form-control form-control-sm"
                                                                                rows="1"
                                                                                placeholder="Remarks"
                                                                                value={item.ProbabilityRemarks || ''}
                                                                                onChange={(e) => handleUpdate(item, { ProbabilityRemarks: e.target.value })}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    {(listMode === 'Pending' || listMode === 'Lost') && item.Status !== 'Pending' && item.Status !== 'Enquiry' && (
                                                                        <button
                                                                            className={`btn btn-sm px-3 py-1 ${updatedItems[item.RequestNo] ? 'btn-success' : 'btn-primary'}`}
                                                                            onClick={() => persistUpdate(item)}
                                                                            disabled={updatingReqNo === item.RequestNo}
                                                                            style={{ fontSize: '11px', fontWeight: 'bold', height: '31px', alignSelf: 'flex-end', marginBottom: '1px' }}
                                                                        >
                                                                            {updatingReqNo === item.RequestNo ? (
                                                                                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                                                            ) : (updatedItems[item.RequestNo] ? 'SAVED' : 'UPDATE')}
                                                                        </button>
                                                                    )}
                                                                </>
                                                            )}
                                                            {/* Follow Up UI in 7th Column */}
                                                            {item.Status === 'FollowUp' && (
                                                                <>
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Quote Reference</span>
                                                                        <div style={{ width: '220px' }}>
                                                                            <Select
                                                                                className="basic-single"
                                                                                classNamePrefix="select"
                                                                                placeholder="Quote ref..."
                                                                                isSearchable={true}
                                                                                menuPortalTarget={document.body}
                                                                                value={item.WonQuoteRef ? { value: item.WonQuoteRef, label: item.WonQuoteRef } : null}
                                                                                onChange={(option) => {
                                                                                    handleInlineUpdate(item, 'WonQuoteRef', option ? option.value : '');
                                                                                }}
                                                                                options={(Array.isArray(item.QuoteRefs) ? item.QuoteRefs : []).map(q => {
                                                                                    if (typeof q === 'string') {
                                                                                        return { value: q, label: q, customer: 'N/A' };
                                                                                    }
                                                                                    return {
                                                                                        value: q.QuoteNumber || q.value || '',
                                                                                        label: q.QuoteNumber || q.label || '',
                                                                                        customer: q.ToName || q.customer || ''
                                                                                    };
                                                                                })}
                                                                                formatOptionLabel={({ label, customer }) => (
                                                                                    <div style={{ lineHeight: '1.2', padding: '2px 0' }}>
                                                                                        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{label}</div>
                                                                                        <div style={{ fontSize: '11px', color: '#666' }}>{customer}</div>
                                                                                    </div>
                                                                                )}
                                                                                styles={{
                                                                                    control: (base) => ({
                                                                                        ...base,
                                                                                        minHeight: '31px',
                                                                                        height: '31px',
                                                                                        fontSize: '12px'
                                                                                    }),
                                                                                    valueContainer: (base) => ({
                                                                                        ...base,
                                                                                        padding: '0 8px'
                                                                                    }),
                                                                                    indicatorsContainer: (base) => ({
                                                                                        ...base,
                                                                                        height: '31px'
                                                                                    }),
                                                                                    menuPortal: (base) => ({
                                                                                        ...base,
                                                                                        zIndex: 9999
                                                                                    })
                                                                                }}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Probability</span>
                                                                        <div style={{ width: '180px' }}>
                                                                            <select
                                                                                className="form-select form-select-sm"
                                                                                value={item.ProbabilityOption || ''}
                                                                                onChange={(e) => handleInlineUpdate(item, 'ProbabilityOption', e.target.value)}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            >
                                                                                <option value="">Select Probability...</option>
                                                                                <option value="Low Chance (25%)">Low Chance (25%)</option>
                                                                                <option value="50-50 Chance (50%)">50-50 Chance (50%)</option>
                                                                                <option value="Medium Chance (75%)">Medium Chance (75%)</option>
                                                                                <option value="High Chance (90%)">High Chance (90%)</option>
                                                                                <option value="Very High Chance (99%)">Very High Chance (99%)</option>
                                                                                <option value="No Chance (0%)">No Chance (0%)</option>
                                                                            </select>
                                                                        </div>
                                                                    </div>
                                                                    {item.ProbabilityOption && (item.ProbabilityOption.includes('90%') || item.ProbabilityOption.includes('99%')) && (
                                                                        <div className="d-flex flex-column">
                                                                            <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Expected Date</span>
                                                                            <div style={{ width: '130px' }}>
                                                                                <DatePicker
                                                                                    selected={item.ExpectedOrderDate ? new Date(item.ExpectedOrderDate) : null}
                                                                                    onChange={(date) => {
                                                                                        const dateStr = date ? format(date, 'yyyy-MM-dd') : '';
                                                                                        handleInlineUpdate(item, 'ExpectedOrderDate', dateStr);
                                                                                    }}
                                                                                    dateFormat="dd-MMM-yyyy"
                                                                                    className="form-control form-control-sm"
                                                                                    placeholderText="dd-MMM-yyyy"
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    onKeyDown={(e) => e.stopPropagation()}
                                                                                    wrapperClassName="w-100"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Remarks</span>
                                                                        <div style={{ width: '250px' }}>
                                                                            <textarea
                                                                                className="form-control form-control-sm"
                                                                                rows="1"
                                                                                placeholder="Follow-up Remarks"
                                                                                value={item.ProbabilityRemarks || ''}
                                                                                onChange={(e) => handleUpdate(item, { ProbabilityRemarks: e.target.value })}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    {(listMode === 'Pending' || listMode === 'FollowUp') && item.Status !== 'Pending' && item.Status !== 'Enquiry' && (
                                                                        <button
                                                                            className={`btn btn-sm px-3 py-1 ${updatedItems[item.RequestNo] ? 'btn-success' : 'btn-primary'}`}
                                                                            onClick={() => persistUpdate(item)}
                                                                            disabled={updatingReqNo === item.RequestNo}
                                                                            style={{ fontSize: '11px', fontWeight: 'bold', height: '31px', alignSelf: 'flex-end', marginBottom: '1px' }}
                                                                        >
                                                                            {updatingReqNo === item.RequestNo ? (
                                                                                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                                                            ) : (updatedItems[item.RequestNo] ? 'SAVED' : 'UPDATE')}
                                                                        </button>
                                                                    )}
                                                                </>
                                                            )}                                                                      {/* Won UI in 7th Column */}
                                                            {item.Status === 'Won' && (
                                                                <>
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Quote Reference</span>
                                                                        <div style={{ width: '260px' }}>
                                                                            <Select
                                                                                className="basic-single"
                                                                                classNamePrefix="select"
                                                                                placeholder="Quote ref..."
                                                                                isSearchable={true}
                                                                                menuPortalTarget={document.body}
                                                                                value={item.WonQuoteRef ? { value: item.WonQuoteRef, label: item.WonQuoteRef } : null}
                                                                                onChange={(option) => {
                                                                                    console.log('[Debug] Selected Option:', option);
                                                                                    handleInlineUpdate(item, 'WonQuoteRef', option ? option.value : '');
                                                                                }}
                                                                                options={(Array.isArray(item.QuoteRefs) ? item.QuoteRefs : []).map(q => {
                                                                                    if (typeof q === 'string') {
                                                                                        return { value: q, label: q, customer: 'N/A' };
                                                                                    }
                                                                                    return {
                                                                                        value: q.QuoteNumber || q.value || '',
                                                                                        label: q.QuoteNumber || q.label || '',
                                                                                        customer: q.ToName || q.customer || ''
                                                                                    };
                                                                                })}
                                                                                formatOptionLabel={({ label, customer }) => (
                                                                                    <div style={{ lineHeight: '1.2', padding: '2px 0' }}>
                                                                                        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{label}</div>
                                                                                        <div style={{ fontSize: '11px', color: '#666' }}>{customer}</div>
                                                                                    </div>
                                                                                )}
                                                                                styles={{
                                                                                    control: (base) => ({
                                                                                        ...base,
                                                                                        minHeight: '31px',
                                                                                        height: '31px',
                                                                                        fontSize: '12px'
                                                                                    }),
                                                                                    valueContainer: (base) => ({
                                                                                        ...base,
                                                                                        padding: '0 8px'
                                                                                    }),
                                                                                    indicatorsContainer: (base) => ({
                                                                                        ...base,
                                                                                        height: '31px'
                                                                                    }),
                                                                                    menuPortal: (base) => ({
                                                                                        ...base,
                                                                                        zIndex: 9999
                                                                                    })
                                                                                }}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>



                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>ERP Job No.</span>
                                                                        <div style={{ width: '130px' }}>
                                                                            <input
                                                                                type="text"
                                                                                className="form-control form-control-sm"
                                                                                placeholder="ERP Job No."
                                                                                value={item.WonJobNo || ''}
                                                                                onChange={(e) => handleInlineUpdate(item, 'WonJobNo', e.target.value)}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Job Value</span>
                                                                        <div className="input-group input-group-sm" style={{ width: '140px' }}>
                                                                            <span className="input-group-text px-1 text-muted" style={{ fontSize: '10px' }}>BD</span>
                                                                            <input
                                                                                type="number"
                                                                                className="form-control form-control-sm"
                                                                                placeholder="0"
                                                                                value={item.WonOrderValue || ''}
                                                                                onChange={(e) => handleInlineUpdate(item, 'WonOrderValue', e.target.value)}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>GP %</span>
                                                                        <div className="input-group input-group-sm" style={{ width: '110px' }}>
                                                                            <input
                                                                                type="number"
                                                                                className="form-control form-control-sm"
                                                                                placeholder="0.00"
                                                                                min="0"
                                                                                max="100"
                                                                                step="0.01"
                                                                                value={item.WonGrossProfit ?? ''}
                                                                                onChange={(e) => handleInlineUpdate(item, 'WonGrossProfit', e.target.value)}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                            <span className="input-group-text px-1 text-muted" style={{ fontSize: '10px' }}>%</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Booked Date</span>
                                                                        <div style={{ width: '130px' }}>
                                                                            <DatePicker
                                                                                selected={item.ExpectedOrderDate ? new Date(item.ExpectedOrderDate) : null}
                                                                                onChange={(date) => {
                                                                                    const dateStr = date ? format(date, 'yyyy-MM-dd') : '';
                                                                                    handleInlineUpdate(item, 'ExpectedOrderDate', dateStr);
                                                                                }}
                                                                                dateFormat="dd-MMM-yyyy"
                                                                                className="form-control form-control-sm"
                                                                                placeholderText="dd-MMM-yyyy"
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                onKeyDown={(e) => e.stopPropagation()}
                                                                                wrapperClassName="w-100"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Remarks</span>
                                                                        <div style={{ width: '250px' }}>
                                                                            <textarea
                                                                                className="form-control form-control-sm"
                                                                                rows="1"
                                                                                placeholder="Won Remarks"
                                                                                value={item.ProbabilityRemarks || ''}
                                                                                onChange={(e) => handleUpdate(item, { ProbabilityRemarks: e.target.value })}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        className={`btn btn-sm px-3 py-1 ${updatedItems[item.RequestNo] ? 'btn-success' : 'btn-primary'}`}
                                                                        onClick={() => persistUpdate(item)}
                                                                        disabled={updatingReqNo === item.RequestNo}
                                                                        style={{ fontSize: '11px', fontWeight: 'bold', height: '31px', alignSelf: 'flex-end', marginBottom: '1px' }}
                                                                    >
                                                                        {updatingReqNo === item.RequestNo ? (
                                                                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                                                        ) : (updatedItems[item.RequestNo] ? 'SAVED' : 'UPDATE')}
                                                                    </button>
                                                                </>
                                                            )}

                                                            {/* OnHold/Cancelled/Retendered UI */}
                                                            {(item.Status === 'OnHold' || item.Status === 'Cancelled' || item.Status === 'Retendered') && (
                                                                <>
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Reason</span>
                                                                        <div style={{ width: '220px' }}>
                                                                            <input
                                                                                type="text"
                                                                                className="form-control form-control-sm"
                                                                                placeholder="Reason"
                                                                                value={item.LostReason || ''}
                                                                                onChange={(e) => handleInlineUpdate(item, 'LostReason', e.target.value)}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Remarks</span>
                                                                        <div style={{ width: '250px' }}>
                                                                            <textarea
                                                                                className="form-control form-control-sm"
                                                                                rows="1"
                                                                                placeholder="Remarks"
                                                                                value={item.ProbabilityRemarks || ''}
                                                                                onChange={(e) => handleUpdate(item, { ProbabilityRemarks: e.target.value })}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    {(listMode === 'Pending' || listMode === 'Won') && item.Status !== 'Pending' && item.Status !== 'Enquiry' && (
                                                                        <button
                                                                            className={`btn btn-sm px-3 py-1 ${updatedItems[item.RequestNo] ? 'btn-success' : 'btn-primary'}`}
                                                                            onClick={() => persistUpdate(item)}
                                                                            disabled={updatingReqNo === item.RequestNo}
                                                                            style={{ fontSize: '11px', fontWeight: 'bold', height: '31px', alignSelf: 'flex-end', marginBottom: '1px' }}
                                                                        >
                                                                            {updatingReqNo === item.RequestNo ? (
                                                                                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                                                            ) : (updatedItems[item.RequestNo] ? 'SAVED' : 'UPDATE')}
                                                                        </button>
                                                                    )}
                                                                </>
                                                            )}

                                                            {/* Pending/Other UI in 7th Column - Still show update button if not Pending */}
                                                            {listMode === 'Pending' && (item.Status !== 'Won' && item.Status !== 'FollowUp' && item.Status !== 'Lost' && item.Status !== 'OnHold' && item.Status !== 'Cancelled' && item.Status !== 'Retendered' && item.Status !== 'Pending' && item.Status !== 'Enquiry') && (
                                                                <>
                                                                    <button
                                                                        className={`btn btn-sm px-3 py-1 ${updatedItems[item.RequestNo] ? 'btn-success' : 'btn-primary'}`}
                                                                        onClick={() => persistUpdate(item)}
                                                                        disabled={updatingReqNo === item.RequestNo}
                                                                        style={{ fontSize: '11px', fontWeight: 'bold', height: '31px' }}
                                                                    >
                                                                        {updatingReqNo === item.RequestNo ? (
                                                                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                                                        ) : (updatedItems[item.RequestNo] ? 'SAVED' : 'UPDATE')}
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>

                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div >
        </div >
    );
};

export default ProbabilityForm;
