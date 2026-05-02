import React, { useState, useEffect, useMemo } from 'react';
import Select from 'react-select';
import AsyncSelect from 'react-select/async'; // START_OF_FILE_MODIFICATION
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

/** Numeric net quoted for filters/sort (same rules as display cell). */
function getRowNetQuotedNumber(item, currentUser) {
    const userDept = (currentUser?.Department || currentUser?.Division || '').trim().toLowerCase();
    const isSubUser = userDept && userDept !== 'civil' && userDept !== 'admin' && currentUser?.Roles !== 'Admin' && currentUser?.role !== 'Admin';
    if (isSubUser && (!item.QuoteRefs || item.QuoteRefs.length === 0)) return null;
    if (!String(item.WonQuoteRef || '').trim()) return null;
    if (item.SelectedNetQuotedValue !== null && item.SelectedNetQuotedValue !== undefined && item.SelectedNetQuotedValue !== '') {
        return Number(item.SelectedNetQuotedValue);
    }
    if (item.NetQuotedValue !== null && item.NetQuotedValue !== undefined && item.NetQuotedValue !== '') {
        return Number(item.NetQuotedValue);
    }
    return null;
}

/** Same rules as inline UPDATE buttons in the Details column — single column uses this. */
function shouldShowUpdateButton(item, listMode) {
    const st = item.Status;
    if (st === 'Pending' || st === 'Enquiry') return false;
    if (st === 'Won') return true;
    if (st === 'Lost' && (listMode === 'Pending' || listMode === 'Lost')) return true;
    if (st === 'FollowUp' && (listMode === 'Pending' || listMode === 'FollowUp')) return true;
    if ((st === 'OnHold' || st === 'Cancelled' || st === 'Retendered') && (listMode === 'Pending' || listMode === 'Won')) return true;
    if (
        listMode === 'Pending' &&
        st !== 'Won' &&
        st !== 'FollowUp' &&
        st !== 'Lost' &&
        st !== 'OnHold' &&
        st !== 'Cancelled' &&
        st !== 'Retendered' &&
        st !== 'Pending' &&
        st !== 'Enquiry'
    ) {
        return true;
    }
    return false;
}

function compareEnquiryNo(a, b) {
    const sa = String(a ?? '');
    const sb = String(b ?? '');
    const na = Number(sa);
    const nb = Number(sb);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && String(na) === sa.trim() && String(nb) === sb.trim()) {
        return na - nb;
    }
    return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' });
}

const ProbabilityForm = () => {
    const { currentUser } = useAuth();
    const { masters } = useData();

    // --- View State ---
    const [divisionOptions, setDivisionOptions] = useState([]);
    const [selectedDivision, setSelectedDivision] = useState(() => localStorage.getItem('prob_division') || '');
    const [listMode, setListMode] = useState(() => localStorage.getItem('prob_listMode') || 'Pending'); // 'Pending', 'Won', 'Lost', 'OnHold', 'Cancelled', 'FollowUp', 'Retendered'
    const [fromDate, setFromDate] = useState(() => localStorage.getItem('prob_fromDate') || '');
    const [toDate, setToDate] = useState(() => localStorage.getItem('prob_toDate') || '');
    const [filterProbability, setFilterProbability] = useState(() => localStorage.getItem('prob_filterProbability') || '');

    const [loadingList, setLoadingList] = useState(false);
    const [updatingReqNo, setUpdatingReqNo] = useState(null); // Track which row is being updated
    const [updatedItems, setUpdatedItems] = useState({});
    const [historyReqNo, setHistoryReqNo] = useState('');
    const [historyHeader, setHistoryHeader] = useState({ projectName: '', leadJobName: '' });
    const [historyRows, setHistoryRows] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    /** Excel-style column filters: null = inactive (show all). */
    const [colFEnquiry, setColFEnquiry] = useState(null);
    const [colFProject, setColFProject] = useState(null);
    const [colFCustomer, setColFCustomer] = useState(null);
    const [colFStatus, setColFStatus] = useState(null);
    const [colFNet, setColFNet] = useState({ mode: 'all', v1: '', v2: '' });
    const [sortCol, setSortCol] = useState(null);
    const [sortAsc, setSortAsc] = useState(true);
    const [openColFilter, setOpenColFilter] = useState(null);
    const [draftMulti, setDraftMulti] = useState(() => new Set());
    const [draftNet, setDraftNet] = useState({ mode: 'all', v1: '', v2: '' });
    const [filterSearch, setFilterSearch] = useState('');

    // -- Persistence --
    useEffect(() => {
        localStorage.setItem('prob_division', selectedDivision);
        localStorage.setItem('prob_listMode', listMode);
        localStorage.setItem('prob_fromDate', fromDate);
        localStorage.setItem('prob_toDate', toDate);
        localStorage.setItem('prob_filterProbability', filterProbability);
    }, [selectedDivision, listMode, fromDate, toDate, filterProbability]);
    const [enquiriesList, setEnquiriesList] = useState([]);
    // Removed viewMode and detail states as per request



    useEffect(() => {
        const loadDivisions = async () => {
            if (!currentUser) return;
            try {
                const userEmail = currentUser?.EmailId || currentUser?.email || '';
                if (!userEmail) return;
                const res = await fetch(`${API_BASE}/api/probability/divisions?userEmail=${encodeURIComponent(userEmail)}`);
                if (!res.ok) return;
                const data = await res.json();
                const list = Array.isArray(data?.divisions) ? data.divisions.map((d) => String(d || '').trim()).filter(Boolean) : [];
                setDivisionOptions(list);
                if (!list.length) {
                    setSelectedDivision('');
                    return;
                }
                const existing = String(selectedDivision || '').trim().toLowerCase();
                const hit = list.find((d) => d.toLowerCase() === existing);
                setSelectedDivision(hit || data?.selectedDivision || list[0]);
            } catch (e) {
                console.error('ProbabilityForm: failed to load divisions', e);
                setDivisionOptions([]);
                setSelectedDivision('');
            }
        };
        loadDivisions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.EmailId, currentUser?.email]);

    // --- Fetch List ---
    useEffect(() => {
        if (currentUser && selectedDivision) {
            console.log('ProbabilityForm: Current User:', currentUser);
            fetchList();
        }
    }, [listMode, fromDate, toDate, filterProbability, selectedDivision, currentUser]);

    const fetchList = async () => {
        setLoadingList(true);
        try {
            const queryParams = new URLSearchParams({
                mode: listMode,
                fromDate: fromDate || '',
                toDate: toDate || '',
                probability: filterProbability || '',
                userEmail: currentUser?.EmailId || currentUser?.email || '',
                userDepartment: currentUser?.Department || '',
                division: selectedDivision || ''
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
                                // STRING_AGG format: "Ref|ToName|LeadJob[,QuoteDate]" — date is last segment when present
                                item.QuoteRefs = qRefsRaw.split(',').filter(Boolean).map(refStr => {
                                    const parts = refStr.includes('|') ? refStr.split('|') : [refStr, 'N/A', ''];
                                    const ref = (parts[0] || '').trim();
                                    const name = (parts[1] || 'N/A').trim();
                                    const lastSeg = (parts[parts.length - 1] || '').trim();
                                    const lastIsDate = /^\d{4}-\d{2}-\d{2}/.test(lastSeg) || (lastSeg && !Number.isNaN(Date.parse(lastSeg)));
                                    let quoteDate = null;
                                    let leadJob = '';
                                    if (parts.length >= 4 && lastIsDate) {
                                        quoteDate = lastSeg;
                                        leadJob = parts.slice(2, -1).join('|').trim();
                                    } else {
                                        leadJob = parts.slice(2).join('|').trim();
                                    }
                                    return {
                                        QuoteNumber: ref,
                                        ToName: name,
                                        LeadJob: String(leadJob || '').trim(),
                                        QuoteDate: quoteDate || null,
                                    };
                                }).sort((a, b) => {
                                    const extractLeadCode = (quoteNo) => {
                                        const m = String(quoteNo || '').toUpperCase().match(/\/L(\d+)\b/);
                                        return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
                                    };
                                    const aCode = extractLeadCode(a.QuoteNumber);
                                    const bCode = extractLeadCode(b.QuoteNumber);
                                    if (aCode !== bCode) return aCode - bCode;
                                    return String(a.QuoteNumber || '').localeCompare(String(b.QuoteNumber || ''));
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

                    /* 
                    // STRICT FILTER: Filter QuoteRefs based on user's department scope (Step 1922)
                    // REMOVED: This was incorrectly matching user department with customer name (ToName).
                    // Backend already filters FilteredQuoteRefs based on division/email access.
                    if (item.QuoteRefs && item.QuoteRefs.length > 0) {
                        const userDept = (currentUser?.Department || currentUser?.Division || '').trim().toLowerCase();
                        const isSubUser = userDept && userDept !== 'civil' && userDept !== 'admin' && currentUser?.Roles !== 'Admin' && currentUser?.role !== 'Admin';

                        if (isSubUser) {
                            item.QuoteRefs = item.QuoteRefs.filter(q => {
                                const toName = (q.ToName || '').toLowerCase();
                                return toName.includes(userDept) || userDept.includes(toName);
                            });
                        }
                    }
                    */


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

    const formatHistoryDateTime = (iso) => {
        if (!iso) return '';
        try {
            return format(new Date(iso), 'dd-MMM-yy hh:mm a', { locale: enUS });
        } catch {
            return '';
        }
    };

    /** Label next to project name: from WonCustomerName or the selected row in QuoteRefs (ToName). */
    const customerNameForQuoteRef = (item) => {
        const ref = String(item?.WonQuoteRef || '').trim();
        if (!ref) return '';
        let name = String(item?.WonCustomerName || '').trim();
        if (!name && Array.isArray(item?.QuoteRefs)) {
            const hit = item.QuoteRefs.find((q) => {
                const num = typeof q === 'string' ? String(q).trim() : String(q?.QuoteNumber || q?.value || '').trim();
                return num === ref;
            });
            if (hit && typeof hit === 'object') {
                name = String(hit.ToName || hit.customer || '').trim();
            }
        }
        return name;
    };

    const quoteRefLabelWithDate = (ref, dateVal) => {
        const r = String(ref || '').trim();
        if (!r) return '';
        const d = formatHistoryDateTime(dateVal);
        return d ? `${r} (${d})` : r;
    };

    const statusSelectStyle = (status) => {
        const s = String(status || '').trim().toLowerCase();
        return {
            fontWeight: 700,
            color: s === 'won' ? '#198754' : '#dc3545',
        };
    };

    const buildQuoteRefOptions = (item) =>
        (Array.isArray(item?.QuoteRefs) ? item.QuoteRefs : []).map((q) => {
            if (typeof q === 'string') {
                return {
                    value: q,
                    label: quoteRefLabelWithDate(q, null),
                    quoteDate: null,
                    customer: 'N/A',
                    leadJob: '',
                };
            }
            const v = q.QuoteNumber || q.value || '';
            const qd = q.QuoteDate || q.quoteDate || null;
            return {
                value: v,
                label: quoteRefLabelWithDate(v, qd),
                quoteDate: qd,
                customer: q.ToName || q.customer || '',
                leadJob: q.LeadJob || q.leadJob || '',
            };
        });

    const quoteRefSelectValue = (item) => {
        const ref = String(item?.WonQuoteRef || '').trim();
        if (!ref) return null;
        const opts = buildQuoteRefOptions(item);
        const sel = opts.find((o) => o.value === ref);
        let dt = sel?.quoteDate;
        if (item.WonQuoteRefDate != null && item.WonQuoteRefDate !== '') {
            dt = item.WonQuoteRefDate;
        }
        return {
            value: ref,
            label: quoteRefLabelWithDate(ref, dt),
            quoteDate: dt,
            customer: sel?.customer,
            leadJob: sel?.leadJob,
        };
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
            if (item.WonGrossProfit === null || item.WonGrossProfit === undefined || item.WonGrossProfit === '') {
                alert('GP % is mandatory for Won status.');
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
                projectName: item.ProjectName,
                leadJobName: item.LeadJobName || '',
                userEmail: currentUser?.EmailId || currentUser?.email || '',
                division: selectedDivision || '',
                toName: item.WonCustomerName || '',
                totalQuotedValue: item.SelectedTotalQuotedValue ?? item.TotalQuotedValue,
                netQuotedValue: item.SelectedNetQuotedValue ?? item.NetQuotedValue,
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

    const fetchHistory = async (item) => {
        const requestNo = item?.RequestNo;
        try {
            setHistoryReqNo(String(requestNo || ''));
            setHistoryHeader({
                projectName: item?.ProjectName || '',
                leadJobName: item?.LeadJobName || '',
            });
            setHistoryLoading(true);
            const userEmail = currentUser?.EmailId || currentUser?.email || '';
            const qs = new URLSearchParams({
                userEmail,
                division: selectedDivision || '',
            });
            const res = await fetch(`${API_BASE}/api/probability/history/${encodeURIComponent(requestNo)}?${qs.toString()}`);
            if (!res.ok) throw new Error('Failed to load history');
            const data = await res.json();
            const rows = Array.isArray(data) ? data : [];
            setHistoryRows(rows);
            if (rows.length > 0) {
                const top = rows[0];
                setHistoryHeader((h) => ({
                    projectName: (h.projectName && String(h.projectName).trim()) ? h.projectName : (top.ProjectName || ''),
                    leadJobName: (h.leadJobName && String(h.leadJobName).trim()) ? h.leadJobName : (top.LeadJobName || ''),
                }));
            }
        } catch (e) {
            console.error('Probability history load failed', e);
            setHistoryRows([]);
            alert('Failed to load probability history.');
        } finally {
            setHistoryLoading(false);
        }
    };

    const fetchQuoteDetails = async (quoteNumber) => {
        try {
            const userEmail = currentUser?.EmailId || currentUser?.email || '';
            const res = await fetch(`${API_BASE}/api/probability/quote-details/${encodeURIComponent(quoteNumber)}?userEmail=${encodeURIComponent(userEmail)}&division=${encodeURIComponent(selectedDivision || '')}`);
            if (res.ok) {
                return await res.json();
            }
        } catch (err) {
            console.error("Error fetching quote details:", err);
        }
        return null;
    };

    const handleInlineUpdate = async (item, field, value) => {
        if (field === 'WonQuoteRef' && !value) {
            handleUpdate(item, { WonQuoteRef: '', WonCustomerName: '', WonQuoteRefDate: '' });
            return;
        }
        if (field === 'WonQuoteRef' && value) {
            const details = await fetchQuoteDetails(value);
            if (details) {
                const updates = {
                    WonQuoteRef: value,
                    WonCustomerName: details.customerName,
                    WonQuoteRefDate: details.quoteDate,
                    WonOrderValue: details.totalAmount, // Default to total amount
                    SelectedTotalQuotedValue: details.totalQuotedValue,
                    SelectedNetQuotedValue: details.netQuotedValue,
                    QuotePreparedBy: details.preparedBy != null && details.preparedBy !== '' ? String(details.preparedBy) : '',
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

    const customerKey = (item) => {
        const s = String(customerNameForQuoteRef(item) || '').trim();
        return s || '—';
    };
    const projectKey = (item) => {
        const s = String(item.ProjectName || '').trim();
        return s || '—';
    };
    const statusKey = (item) => String(item.Status || '').trim() || '—';

    const columnUniques = useMemo(() => {
        const enquiry = new Set();
        const project = new Set();
        const customer = new Set();
        const status = new Set();
        for (const item of enquiriesList) {
            enquiry.add(String(item.RequestNo ?? ''));
            project.add(projectKey(item));
            customer.add(customerKey(item));
            status.add(statusKey(item));
        }
        return {
            enquiry: [...enquiry].sort(compareEnquiryNo),
            project: [...project].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
            customer: [...customer].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
            status: [...status].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
        };
    }, [enquiriesList]);

    const filteredSortedRows = useMemo(() => {
        let rows = [...enquiriesList];
        if (colFEnquiry !== null) {
            rows = rows.filter((r) => colFEnquiry.has(String(r.RequestNo ?? '')));
        }
        if (colFProject !== null) {
            rows = rows.filter((r) => colFProject.has(projectKey(r)));
        }
        if (colFCustomer !== null) {
            rows = rows.filter((r) => colFCustomer.has(customerKey(r)));
        }
        if (colFStatus !== null) {
            rows = rows.filter((r) => colFStatus.has(statusKey(r)));
        }
        if (colFNet && colFNet.mode !== 'all') {
            const v1 = parseFloat(String(colFNet.v1 ?? '').replace(/,/g, '').trim());
            const v2 = parseFloat(String(colFNet.v2 ?? '').replace(/,/g, '').trim());
            rows = rows.filter((r) => {
                const n = getRowNetQuotedNumber(r, currentUser);
                if (n === null || Number.isNaN(n)) return false;
                switch (colFNet.mode) {
                    case 'gt':
                        return !Number.isNaN(v1) && n > v1;
                    case 'lt':
                        return !Number.isNaN(v1) && n < v1;
                    case 'eq':
                        return !Number.isNaN(v1) && Math.abs(n - v1) < 1e-6;
                    case 'gte':
                        return !Number.isNaN(v1) && n >= v1;
                    case 'lte':
                        return !Number.isNaN(v1) && n <= v1;
                    case 'between':
                        if (Number.isNaN(v1) || Number.isNaN(v2)) return false;
                        return n >= Math.min(v1, v2) && n <= Math.max(v1, v2);
                    default:
                        return true;
                }
            });
        }
        if (sortCol) {
            const mul = sortAsc ? 1 : -1;
            rows.sort((a, b) => {
                let c = 0;
                switch (sortCol) {
                    case 'enquiry':
                        c = compareEnquiryNo(a.RequestNo, b.RequestNo);
                        break;
                    case 'project':
                        c = projectKey(a).localeCompare(projectKey(b), undefined, { sensitivity: 'base' });
                        break;
                    case 'customer':
                        c = customerKey(a).localeCompare(customerKey(b), undefined, { sensitivity: 'base' });
                        break;
                    case 'net': {
                        const na = getRowNetQuotedNumber(a, currentUser);
                        const nb = getRowNetQuotedNumber(b, currentUser);
                        const fa = na === null || Number.isNaN(na) ? -Infinity : na;
                        const fb = nb === null || Number.isNaN(nb) ? -Infinity : nb;
                        c = fa === fb ? 0 : fa < fb ? -1 : 1;
                        break;
                    }
                    case 'status':
                        c = statusKey(a).localeCompare(statusKey(b), undefined, { sensitivity: 'base' });
                        break;
                    default:
                        c = 0;
                }
                return c * mul;
            });
        }
        return rows;
    }, [enquiriesList, colFEnquiry, colFProject, colFCustomer, colFStatus, colFNet, sortCol, sortAsc, currentUser]);

    const listAggregates = useMemo(() => {
        let sumNet = 0;
        let sumJob = 0;
        let gpSum = 0;
        let gpCount = 0;
        for (const item of filteredSortedRows) {
            const n = getRowNetQuotedNumber(item, currentUser);
            if (n !== null && !Number.isNaN(n)) sumNet += n;
            if (item.Status === 'Won') {
                const rawJv = String(item.WonOrderValue ?? '').replace(/,/g, '').replace(/BD/g, '').trim();
                const jv = parseFloat(rawJv);
                if (!Number.isNaN(jv)) sumJob += jv;
                const gp = Number(item.WonGrossProfit);
                if (item.WonGrossProfit !== null && item.WonGrossProfit !== undefined && item.WonGrossProfit !== '' && !Number.isNaN(gp)) {
                    gpSum += gp;
                    gpCount += 1;
                }
            }
        }
        return {
            sumNet,
            sumJob,
            avgGp: gpCount > 0 ? gpSum / gpCount : null,
        };
    }, [filteredSortedRows, currentUser]);

    useEffect(() => {
        if (!openColFilter) return undefined;
        const onDoc = (e) => {
            if (e.target.closest('.prob-filter-panel') || e.target.closest('.prob-table-filter-header')) return;
            setOpenColFilter(null);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [openColFilter]);

    const openMultiDraft = (kind) => {
        const all =
            kind === 'enquiry'
                ? columnUniques.enquiry
                : kind === 'project'
                  ? columnUniques.project
                  : kind === 'customer'
                    ? columnUniques.customer
                    : columnUniques.status;
        const active =
            kind === 'enquiry'
                ? colFEnquiry
                : kind === 'project'
                  ? colFProject
                  : kind === 'customer'
                    ? colFCustomer
                    : colFStatus;
        setDraftMulti(active !== null ? new Set(active) : new Set(all));
        setFilterSearch('');
        setOpenColFilter(kind);
    };

    const applyMultiDraft = (kind) => {
        const all =
            kind === 'enquiry'
                ? columnUniques.enquiry
                : kind === 'project'
                  ? columnUniques.project
                  : kind === 'customer'
                    ? columnUniques.customer
                    : columnUniques.status;
        const next = new Set(draftMulti);
        const setter =
            kind === 'enquiry'
                ? setColFEnquiry
                : kind === 'project'
                  ? setColFProject
                  : kind === 'customer'
                    ? setColFCustomer
                    : setColFStatus;
        if (next.size === all.length) {
            setter(null);
        } else {
            setter(next);
        }
        setOpenColFilter(null);
    };

    const clearMultiFilter = (kind) => {
        const setter =
            kind === 'enquiry'
                ? setColFEnquiry
                : kind === 'project'
                  ? setColFProject
                  : kind === 'customer'
                    ? setColFCustomer
                    : setColFStatus;
        setter(null);
        setOpenColFilter(null);
    };

    const openNetDraft = () => {
        setDraftNet({ ...colFNet });
        setOpenColFilter('net');
    };

    const toggleMultiColumnFilter = (kind, e) => {
        if (e.target.closest('.prob-filter-panel')) return;
        if (e.target.closest('[data-sort-only="true"]')) return;
        if (openColFilter === kind) {
            setOpenColFilter(null);
        } else {
            openMultiDraft(kind);
        }
    };

    const toggleNetColumnFilter = (e) => {
        if (e.target.closest('.prob-filter-panel')) return;
        if (e.target.closest('[data-sort-only="true"]')) return;
        if (openColFilter === 'net') {
            setOpenColFilter(null);
        } else {
            openNetDraft();
        }
    };

    const applyNetDraft = () => {
        if (draftNet.mode === 'all') {
            setColFNet({ mode: 'all', v1: '', v2: '' });
        } else {
            setColFNet({ ...draftNet });
        }
        setOpenColFilter(null);
    };

    const clearNetFilter = () => {
        setColFNet({ mode: 'all', v1: '', v2: '' });
        setOpenColFilter(null);
    };

    const handleSortClick = (key) => {
        if (sortCol !== key) {
            setSortCol(key);
            setSortAsc(true);
        } else {
            setSortAsc((v) => !v);
        }
    };

    const sortIndicator = (key) => {
        if (sortCol !== key) return '⇅';
        return sortAsc ? '▲' : '▼';
    };

    const filterActiveClass = (kind) => {
        if (kind === 'net') {
            return colFNet && colFNet.mode !== 'all' ? 'text-primary' : 'text-secondary';
        }
        const s =
            kind === 'enquiry'
                ? colFEnquiry
                : kind === 'project'
                  ? colFProject
                  : kind === 'customer'
                    ? colFCustomer
                    : colFStatus;
        return s !== null ? 'text-primary' : 'text-secondary';
    };

    const clearAllColumnFilters = () => {
        setColFEnquiry(null);
        setColFProject(null);
        setColFCustomer(null);
        setColFStatus(null);
        setColFNet({ mode: 'all', v1: '', v2: '' });
        setSortCol(null);
        setSortAsc(true);
    };

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
        <div className="container-fluid pt-1 pb-4 bg-light min-vh-100 prob-probability-page d-flex flex-column">
            <div className="row justify-content-center flex-grow-1" style={{ minHeight: 0 }}>
                <div className="col-12 col-lg-10 d-flex flex-column" style={{ minHeight: 0, flex: '1 1 auto' }}>
                    <div className="card border-0 shadow-sm rounded-3 d-flex flex-column flex-grow-1" style={{ minHeight: 0 }}>
                        {/* Header & Filters */}
                        <div className="card-header bg-white border-bottom py-3" style={{ flexShrink: 0 }}>
                            <div className="d-flex flex-wrap align-items-center gap-3">
                                {/* Division Selector */}
                                <div style={{ width: '250px' }}>
                                    <label className="small text-muted fw-bold mb-1">Division</label>
                                    <select
                                        className="form-select"
                                        value={selectedDivision}
                                        onChange={(e) => setSelectedDivision(e.target.value)}
                                        disabled={divisionOptions.length <= 1}
                                    >
                                        {divisionOptions.length === 0 ? (
                                            <option value="">Select division</option>
                                        ) : (
                                            divisionOptions.map((div) => (
                                                <option key={div} value={div}>{div}</option>
                                            ))
                                        )}
                                    </select>
                                </div>

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

                                {/* Refresh & table column filters */}
                                <div className="ms-auto align-self-end d-flex gap-2">
                                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={clearAllColumnFilters} title="Clear column filters and sort">
                                        Clear table filters
                                    </button>
                                    <button className="btn btn-outline-primary" onClick={fetchList} disabled={loadingList}>
                                        {loadingList ? 'Loading...' : 'Refresh'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="card-body p-0 d-flex flex-column flex-grow-1" style={{ minHeight: 0 }}>
                            <div
                                className="prob-table-scroll-wrap border-top px-3 flex-grow-1"
                                style={{
                                    flex: '1 1 auto',
                                    minHeight: 0,
                                    overflow: 'auto',
                                    scrollbarGutter: 'stable',
                                }}
                            >
                                <table className="table table-hover mb-0 prob-probability-list-table" style={{ minWidth: '2312px', tableLayout: 'fixed' }}>
                                    <thead>
                                        <tr className="prob-summary-row">
                                            <th className="prob-summary-th" style={{ width: '72px' }} aria-hidden="true" />
                                            <th className="prob-summary-th" style={{ width: '50px' }} aria-hidden="true" />
                                            <th className="prob-summary-th" style={{ width: '100px' }} aria-hidden="true" />
                                            <th className="prob-summary-th" style={{ width: '200px' }} aria-hidden="true" />
                                            <th className="prob-summary-th" style={{ width: '160px' }} aria-hidden="true" />
                                            <th className="prob-summary-th prob-summary-net text-end pe-2" style={{ width: '140px' }}>
                                                {filteredSortedRows.length === 0 ? (
                                                    <span className="text-muted">—</span>
                                                ) : (
                                                    <>
                                                        <span className="prob-summary-muted">Total </span>
                                                        BD {listAggregates.sumNet.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                                    </>
                                                )}
                                            </th>
                                            <th className="prob-summary-th" style={{ width: '130px' }} aria-hidden="true" />
                                            <th className="prob-summary-th prob-summary-details" style={{ width: '1300px' }}>
                                                <div className="d-flex align-items-end" style={{ fontSize: '11px', fontWeight: 600, color: '#0c4a6e' }}>
                                                    <div style={{ width: '320px' }} aria-hidden="true" />
                                                    <div style={{ width: '130px' }} aria-hidden="true" />
                                                    <div style={{ width: '140px', textAlign: 'right' }} title="Job Value total (Won)">
                                                        {listAggregates.sumJob > 0 ? (
                                                            <>
                                                                <span className="prob-summary-muted">Total </span>
                                                                BD {listAggregates.sumJob.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                                            </>
                                                        ) : (
                                                            <span className="text-muted">—</span>
                                                        )}
                                                    </div>
                                                    <div style={{ width: '110px', textAlign: 'right' }} title="GP % average (Won)">
                                                        {listAggregates.avgGp != null ? (
                                                            <>
                                                                <span className="prob-summary-muted">Avg </span>
                                                                {listAggregates.avgGp.toFixed(2)}%
                                                            </>
                                                        ) : (
                                                            <span className="text-muted">—</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </th>
                                        </tr>
                                        <tr className="prob-thead-labels">
                                            <th className="px-2 py-1 align-bottom fw-bold" style={{ width: '72px', textAlign: 'left' }}>Update</th>
                                            <th className="px-2 py-1 align-bottom fw-bold" style={{ width: '50px', textAlign: 'left' }}>SL</th>
                                            <th
                                                className="px-2 py-1 align-bottom position-relative prob-table-filter-header"
                                                style={{ width: '100px', textAlign: 'left', cursor: 'pointer' }}
                                                onClick={(e) => toggleMultiColumnFilter('enquiry', e)}
                                            >
                                                <div className="d-flex align-items-end justify-content-between gap-1">
                                                    <span className="fw-bold">Enquiry</span>
                                                    <span className="d-flex align-items-center gap-1 flex-shrink-0">
                                                        <span className={`user-select-none ${filterActiveClass('enquiry')}`} style={{ fontSize: '10px', lineHeight: 1 }} title="Filter">▼</span>
                                                        <button
                                                            type="button"
                                                            data-sort-only="true"
                                                            className="btn btn-link p-0 text-decoration-none user-select-none"
                                                            style={{ fontSize: '11px', lineHeight: 1, color: '#0c4a6e' }}
                                                            title="Sort"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleSortClick('enquiry');
                                                            }}
                                                        >
                                                            {sortIndicator('enquiry')}
                                                        </button>
                                                    </span>
                                                </div>
                                                {openColFilter === 'enquiry' && (
                                                    <div className="prob-filter-panel border rounded shadow-sm bg-white p-2 mt-1 text-start text-dark normal-case fw-normal" style={{ position: 'absolute', left: 0, top: '100%', zIndex: 1060, minWidth: 260, maxHeight: 320, overflow: 'auto', fontSize: '11px' }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                                        <input className="form-control form-control-sm mb-2" placeholder="Search..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
                                                        <div className="d-flex gap-1 mb-2">
                                                            <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set(columnUniques.enquiry))}>All</button>
                                                            <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set())}>None</button>
                                                        </div>
                                                        <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                                                            {columnUniques.enquiry.filter((v) => !filterSearch || String(v).toLowerCase().includes(filterSearch.toLowerCase())).map((val) => (
                                                                <label key={String(val)} className="d-flex align-items-center gap-2 mb-1 text-truncate" style={{ cursor: 'pointer' }}>
                                                                    <input type="checkbox" checked={draftMulti.has(val)} onChange={() => { setDraftMulti((prev) => { const n = new Set(prev); if (n.has(val)) n.delete(val); else n.add(val); return n; }); }} />
                                                                    <span className="text-truncate">{val}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                        <div className="d-flex gap-1 mt-2 justify-content-end">
                                                            <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => clearMultiFilter('enquiry')}>Clear</button>
                                                            <button type="button" className="btn btn-sm btn-primary py-0" onClick={() => applyMultiDraft('enquiry')}>Apply</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </th>
                                            <th
                                                className="px-2 py-1 align-bottom position-relative prob-table-filter-header"
                                                style={{ width: '200px', textAlign: 'left', cursor: 'pointer' }}
                                                onClick={(e) => toggleMultiColumnFilter('project', e)}
                                            >
                                                <div className="d-flex align-items-end justify-content-between gap-1">
                                                    <span className="fw-bold">Project Name</span>
                                                    <span className="d-flex align-items-center gap-1 flex-shrink-0">
                                                        <span className={`user-select-none ${filterActiveClass('project')}`} style={{ fontSize: '10px', lineHeight: 1 }} title="Filter">▼</span>
                                                        <button
                                                            type="button"
                                                            data-sort-only="true"
                                                            className="btn btn-link p-0 text-decoration-none user-select-none"
                                                            style={{ fontSize: '11px', lineHeight: 1, color: '#0c4a6e' }}
                                                            title="Sort"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleSortClick('project');
                                                            }}
                                                        >
                                                            {sortIndicator('project')}
                                                        </button>
                                                    </span>
                                                </div>
                                                {openColFilter === 'project' && (
                                                    <div className="prob-filter-panel border rounded shadow-sm bg-white p-2 mt-1 text-start text-dark normal-case fw-normal" style={{ position: 'absolute', left: 0, top: '100%', zIndex: 1060, minWidth: 260, maxHeight: 320, overflow: 'auto', fontSize: '11px' }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                                        <input className="form-control form-control-sm mb-2" placeholder="Search..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
                                                        <div className="d-flex gap-1 mb-2">
                                                            <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set(columnUniques.project))}>All</button>
                                                            <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set())}>None</button>
                                                        </div>
                                                        <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                                                            {columnUniques.project.filter((v) => !filterSearch || String(v).toLowerCase().includes(filterSearch.toLowerCase())).map((val) => (
                                                                <label key={String(val)} className="d-flex align-items-center gap-2 mb-1 text-truncate" style={{ cursor: 'pointer' }}>
                                                                    <input type="checkbox" checked={draftMulti.has(val)} onChange={() => { setDraftMulti((prev) => { const n = new Set(prev); if (n.has(val)) n.delete(val); else n.add(val); return n; }); }} />
                                                                    <span className="text-truncate">{val}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                        <div className="d-flex gap-1 mt-2 justify-content-end">
                                                            <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => clearMultiFilter('project')}>Clear</button>
                                                            <button type="button" className="btn btn-sm btn-primary py-0" onClick={() => applyMultiDraft('project')}>Apply</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </th>
                                            <th
                                                className="px-2 py-1 align-bottom position-relative prob-table-filter-header"
                                                style={{ width: '160px', textAlign: 'left', cursor: 'pointer' }}
                                                onClick={(e) => toggleMultiColumnFilter('customer', e)}
                                            >
                                                <div className="d-flex align-items-end justify-content-between gap-1">
                                                    <span className="fw-bold">Customer Name</span>
                                                    <span className="d-flex align-items-center gap-1 flex-shrink-0">
                                                        <span className={`user-select-none ${filterActiveClass('customer')}`} style={{ fontSize: '10px', lineHeight: 1 }} title="Filter">▼</span>
                                                        <button
                                                            type="button"
                                                            data-sort-only="true"
                                                            className="btn btn-link p-0 text-decoration-none user-select-none"
                                                            style={{ fontSize: '11px', lineHeight: 1, color: '#0c4a6e' }}
                                                            title="Sort"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleSortClick('customer');
                                                            }}
                                                        >
                                                            {sortIndicator('customer')}
                                                        </button>
                                                    </span>
                                                </div>
                                                {openColFilter === 'customer' && (
                                                    <div className="prob-filter-panel border rounded shadow-sm bg-white p-2 mt-1 text-start text-dark normal-case fw-normal" style={{ position: 'absolute', left: 0, top: '100%', zIndex: 1060, minWidth: 260, maxHeight: 320, overflow: 'auto', fontSize: '11px' }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                                        <input className="form-control form-control-sm mb-2" placeholder="Search..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
                                                        <div className="d-flex gap-1 mb-2">
                                                            <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set(columnUniques.customer))}>All</button>
                                                            <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set())}>None</button>
                                                        </div>
                                                        <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                                                            {columnUniques.customer.filter((v) => !filterSearch || String(v).toLowerCase().includes(filterSearch.toLowerCase())).map((val) => (
                                                                <label key={String(val)} className="d-flex align-items-center gap-2 mb-1 text-truncate" style={{ cursor: 'pointer' }}>
                                                                    <input type="checkbox" checked={draftMulti.has(val)} onChange={() => { setDraftMulti((prev) => { const n = new Set(prev); if (n.has(val)) n.delete(val); else n.add(val); return n; }); }} />
                                                                    <span className="text-truncate">{val}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                        <div className="d-flex gap-1 mt-2 justify-content-end">
                                                            <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => clearMultiFilter('customer')}>Clear</button>
                                                            <button type="button" className="btn btn-sm btn-primary py-0" onClick={() => applyMultiDraft('customer')}>Apply</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </th>
                                            <th
                                                className="px-2 py-1 align-bottom position-relative prob-table-filter-header prob-net-quoted-th"
                                                style={{ width: '140px', textAlign: 'left', cursor: 'pointer' }}
                                                onClick={(e) => toggleNetColumnFilter(e)}
                                            >
                                                <div className="d-flex align-items-end justify-content-between gap-1">
                                                    <div className="d-flex flex-column align-items-start" style={{ minWidth: 0, textAlign: 'left' }}>
                                                        <span className="fw-bold">Net Quote</span>
                                                        <span className="prob-net-quoted-sub">(Excludes Subjobs)</span>
                                                    </div>
                                                    <span className="d-flex align-items-center gap-1 flex-shrink-0 align-self-end">
                                                        <span className={`user-select-none ${filterActiveClass('net')}`} style={{ fontSize: '10px', lineHeight: 1 }} title="Filter">
                                                            ▼
                                                        </span>
                                                        <button
                                                            type="button"
                                                            data-sort-only="true"
                                                            className="btn btn-link p-0 text-decoration-none user-select-none"
                                                            style={{ fontSize: '11px', lineHeight: 1, color: '#0c4a6e' }}
                                                            title="Sort"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleSortClick('net');
                                                            }}
                                                        >
                                                            {sortIndicator('net')}
                                                        </button>
                                                    </span>
                                                </div>
                                                {openColFilter === 'net' && (
                                                    <div className="prob-filter-panel border rounded shadow-sm bg-white p-2 mt-1 text-start text-dark normal-case fw-normal" style={{ position: 'absolute', right: 0, top: '100%', zIndex: 1060, minWidth: 240, fontSize: '11px' }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                                        <label className="form-label small mb-1">Condition</label>
                                                        <select className="form-select form-select-sm mb-2" value={draftNet.mode} onChange={(e) => setDraftNet((d) => ({ ...d, mode: e.target.value }))}>
                                                            <option value="all">All</option>
                                                            <option value="gt">Greater than</option>
                                                            <option value="lt">Less than</option>
                                                            <option value="eq">Equal to</option>
                                                            <option value="gte">Greater or equal</option>
                                                            <option value="lte">Less or equal</option>
                                                            <option value="between">Between</option>
                                                        </select>
                                                        <label className="form-label small mb-1">Value (BD)</label>
                                                        <input type="text" className="form-control form-control-sm mb-2" placeholder="e.g. 101.100" value={draftNet.v1} onChange={(e) => setDraftNet((d) => ({ ...d, v1: e.target.value }))} />
                                                        {draftNet.mode === 'between' && (
                                                            <>
                                                                <label className="form-label small mb-1">And (BD)</label>
                                                                <input type="text" className="form-control form-control-sm mb-2" placeholder="e.g. 200" value={draftNet.v2} onChange={(e) => setDraftNet((d) => ({ ...d, v2: e.target.value }))} />
                                                            </>
                                                        )}
                                                        <div className="d-flex gap-1 mt-2 justify-content-end">
                                                            <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={clearNetFilter}>Clear</button>
                                                            <button type="button" className="btn btn-sm btn-primary py-0" onClick={applyNetDraft}>Apply</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </th>
                                            <th
                                                className="px-2 py-1 align-bottom position-relative prob-table-filter-header"
                                                style={{ width: '130px', textAlign: 'left', cursor: 'pointer' }}
                                                onClick={(e) => toggleMultiColumnFilter('status', e)}
                                            >
                                                <div className="d-flex align-items-end justify-content-between gap-1">
                                                    <span className="fw-bold">Status</span>
                                                    <span className="d-flex align-items-center gap-1 flex-shrink-0">
                                                        <span className={`user-select-none ${filterActiveClass('status')}`} style={{ fontSize: '10px', lineHeight: 1 }} title="Filter">
                                                            ▼
                                                        </span>
                                                        <button
                                                            type="button"
                                                            data-sort-only="true"
                                                            className="btn btn-link p-0 text-decoration-none user-select-none"
                                                            style={{ fontSize: '11px', lineHeight: 1, color: '#0c4a6e' }}
                                                            title="Sort"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleSortClick('status');
                                                            }}
                                                        >
                                                            {sortIndicator('status')}
                                                        </button>
                                                    </span>
                                                </div>
                                                {openColFilter === 'status' && (
                                                    <div className="prob-filter-panel border rounded shadow-sm bg-white p-2 mt-1 text-start text-dark normal-case fw-normal" style={{ position: 'absolute', left: 0, top: '100%', zIndex: 1060, minWidth: 220, maxHeight: 280, overflow: 'auto', fontSize: '11px' }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                                                        <input className="form-control form-control-sm mb-2" placeholder="Search..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
                                                        <div className="d-flex gap-1 mb-2">
                                                            <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set(columnUniques.status))}>All</button>
                                                            <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setDraftMulti(new Set())}>None</button>
                                                        </div>
                                                        <div style={{ maxHeight: 140, overflowY: 'auto' }}>
                                                            {columnUniques.status.filter((v) => !filterSearch || String(v).toLowerCase().includes(filterSearch.toLowerCase())).map((val) => (
                                                                <label key={String(val)} className="d-flex align-items-center gap-2 mb-1 text-truncate" style={{ cursor: 'pointer' }}>
                                                                    <input type="checkbox" checked={draftMulti.has(val)} onChange={() => { setDraftMulti((prev) => { const n = new Set(prev); if (n.has(val)) n.delete(val); else n.add(val); return n; }); }} />
                                                                    <span className="text-truncate">{val}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                        <div className="d-flex gap-1 mt-2 justify-content-end">
                                                            <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => clearMultiFilter('status')}>Clear</button>
                                                            <button type="button" className="btn btn-sm btn-primary py-0" onClick={() => applyMultiDraft('status')}>Apply</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </th>
                                            <th className="px-2 py-1 align-bottom fw-bold" style={{ width: '1300px', textAlign: 'left' }}>
                                                Details
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loadingList ? (
                                            <tr>
                                                <td colSpan="8" className="text-center py-5">Loading...</td>
                                            </tr>
                                        ) : enquiriesList.length === 0 ? (
                                            <tr>
                                                <td colSpan="8" className="text-center py-5 text-muted">No records found.</td>
                                            </tr>
                                        ) : filteredSortedRows.length === 0 ? (
                                            <tr>
                                                <td colSpan="8" className="text-center py-5 text-muted">
                                                    No rows match the current column filters.{' '}
                                                    <button type="button" className="btn btn-link btn-sm p-0" onClick={clearAllColumnFilters}>
                                                        Clear filters
                                                    </button>
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredSortedRows.map((item, index) => (
                                                <tr key={item.RequestNo} className="border-b hover:bg-gray-50">
                                                    <td className="px-2 py-1 prob-td text-center">
                                                        {shouldShowUpdateButton(item, listMode) ? (
                                                            <button
                                                                type="button"
                                                                className={`btn btn-sm px-2 py-1 ${updatedItems[item.RequestNo] ? 'btn-success' : 'btn-primary'}`}
                                                                onClick={() => persistUpdate(item)}
                                                                disabled={updatingReqNo === item.RequestNo}
                                                                style={{ fontSize: '11px', fontWeight: 'bold', minWidth: '64px' }}
                                                            >
                                                                {updatingReqNo === item.RequestNo ? (
                                                                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                                                                ) : (updatedItems[item.RequestNo] ? 'SAVED' : 'UPDATE')}
                                                            </button>
                                                        ) : null}
                                                    </td>
                                                    <td className="px-2 pt-1 pb-2 font-medium text-primary prob-td">
                                                        {index + 1}
                                                    </td>
                                                    <td className="px-2 pt-1 pb-2 font-medium text-primary prob-td">
                                                        <div className="d-flex align-items-center gap-2">
                                                            <span>{item.RequestNo}</span>
                                                            <button
                                                                type="button"
                                                                className="btn btn-link p-0"
                                                                style={{ fontSize: '11px', textDecoration: 'underline' }}
                                                                onClick={() => fetchHistory(item)}
                                                            >
                                                                History
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="px-2 pt-1 pb-2 text-gray-700 prob-td">{item.ProjectName || ''}</td>
                                                    <td className="px-2 pt-1 pb-2 text-gray-700 prob-td" style={{ fontSize: '12px' }}>
                                                        {customerNameForQuoteRef(item)}
                                                    </td>
                                                    <td className="px-2 pt-1 pb-2 fw-medium prob-td prob-td-net" style={{ fontSize: '12px' }}>
                                                        {(() => {
                                                            const userDept = (currentUser?.Department || currentUser?.Division || '').trim().toLowerCase();
                                                            const isSubUser = userDept && userDept !== 'civil' && userDept !== 'admin' && currentUser?.Roles !== 'Admin' && currentUser?.role !== 'Admin';
                                                            if (isSubUser && (!item.QuoteRefs || item.QuoteRefs.length === 0)) return <span className="text-muted italic">Restricted</span>;
                                                            if (!String(item.WonQuoteRef || '').trim()) return '';
                                                            if (item.SelectedNetQuotedValue !== null && item.SelectedNetQuotedValue !== undefined && item.SelectedNetQuotedValue !== '') {
                                                                return 'BD ' + Number(item.SelectedNetQuotedValue).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
                                                            }
                                                            return item.NetQuotedValue !== null && item.NetQuotedValue !== undefined
                                                                ? 'BD ' + Number(item.NetQuotedValue).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
                                                                : '';
                                                        })()}
                                                    </td>
                                                    <td className="px-2 py-1 prob-td">
                                                        <select
                                                            className="form-select form-select-sm"
                                                            style={statusSelectStyle(item.Status)}
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
                                                    <td className="px-2 py-1 prob-td">
                                                        <div className="d-flex align-items-end gap-2 flex-wrap">
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
                                                                </>
                                                            )}
                                                            {/* Follow Up UI in 7th Column */}
                                                            {item.Status === 'FollowUp' && (
                                                                <>
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Quote Reference</span>
                                                                        <div style={{ width: '300px' }}>
                                                                            <Select
                                                                                className="basic-single"
                                                                                classNamePrefix="select"
                                                                                placeholder="Quote ref..."
                                                                                isSearchable={true}
                                                                                menuPortalTarget={document.body}
                                                                                value={quoteRefSelectValue(item)}
                                                                                onChange={async (option) => {
                                                                                    const nextRef = option ? option.value : '';
                                                                                    const nextLead = option?.leadJob || '';
                                                                                    if (!nextRef) {
                                                                                        handleUpdate(item, {
                                                                                            WonQuoteRef: '',
                                                                                            LeadJobName: '',
                                                                                            WonCustomerName: '',
                                                                                            WonQuoteRefDate: '',
                                                                                            SelectedTotalQuotedValue: null,
                                                                                            SelectedNetQuotedValue: null,
                                                                                            QuotePreparedBy: '',
                                                                                        });
                                                                                        return;
                                                                                    }
                                                                                    const details = await fetchQuoteDetails(nextRef);
                                                                                    handleUpdate(item, {
                                                                                        WonQuoteRef: nextRef,
                                                                                        LeadJobName: nextLead,
                                                                                        WonCustomerName: details?.customerName || item.WonCustomerName || '',
                                                                                        WonQuoteRefDate: details?.quoteDate ?? option?.quoteDate ?? null,
                                                                                        SelectedTotalQuotedValue: details?.totalQuotedValue ?? null,
                                                                                        SelectedNetQuotedValue: details?.netQuotedValue ?? null,
                                                                                        QuotePreparedBy: details?.preparedBy != null && details?.preparedBy !== '' ? String(details.preparedBy) : '',
                                                                                    });
                                                                                }}
                                                                                options={buildQuoteRefOptions(item)}
                                                                                formatOptionLabel={({ label, customer, leadJob }) => (
                                                                                    <div style={{ lineHeight: '1.2', padding: '2px 0' }}>
                                                                                        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{label}</div>
                                                                                        <div style={{ fontSize: '11px', color: '#666' }}>
                                                                                            {customer}{leadJob ? ` (Leadjob-${leadJob})` : ''}
                                                                                        </div>
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
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Prepared by</span>
                                                                        <div style={{ width: '200px' }}>
                                                                            <input
                                                                                type="text"
                                                                                readOnly
                                                                                className="form-control form-control-sm"
                                                                                value={item.QuotePreparedBy || ''}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </>
                                                            )}                                                                      {/* Won UI in 7th Column */}
                                                            {item.Status === 'Won' && (
                                                                <>
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Quote Reference</span>
                                                                        <div style={{ width: '320px' }}>
                                                                            <Select
                                                                                className="basic-single"
                                                                                classNamePrefix="select"
                                                                                placeholder="Quote ref..."
                                                                                isSearchable={true}
                                                                                menuPortalTarget={document.body}
                                                                                value={quoteRefSelectValue(item)}
                                                                                onChange={async (option) => {
                                                                                    console.log('[Debug] Selected Option:', option);
                                                                                    const nextRef = option ? option.value : '';
                                                                                    const nextLead = option?.leadJob || '';
                                                                                    if (!nextRef) {
                                                                                        handleUpdate(item, {
                                                                                            WonQuoteRef: '',
                                                                                            LeadJobName: '',
                                                                                            WonCustomerName: '',
                                                                                            WonQuoteRefDate: '',
                                                                                            SelectedTotalQuotedValue: null,
                                                                                            SelectedNetQuotedValue: null,
                                                                                            QuotePreparedBy: '',
                                                                                        });
                                                                                        return;
                                                                                    }
                                                                                    const details = await fetchQuoteDetails(nextRef);
                                                                                    handleUpdate(item, {
                                                                                        WonQuoteRef: nextRef,
                                                                                        LeadJobName: nextLead,
                                                                                        WonCustomerName: details?.customerName || item.WonCustomerName || '',
                                                                                        WonQuoteRefDate: details?.quoteDate ?? option?.quoteDate ?? null,
                                                                                        SelectedTotalQuotedValue: details?.totalQuotedValue ?? null,
                                                                                        SelectedNetQuotedValue: details?.netQuotedValue ?? null,
                                                                                        QuotePreparedBy: details?.preparedBy != null && details?.preparedBy !== '' ? String(details.preparedBy) : '',
                                                                                    });
                                                                                }}
                                                                                options={buildQuoteRefOptions(item)}
                                                                                formatOptionLabel={({ label, customer, leadJob }) => (
                                                                                    <div style={{ lineHeight: '1.2', padding: '2px 0' }}>
                                                                                        <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{label}</div>
                                                                                        <div style={{ fontSize: '11px', color: '#666' }}>
                                                                                            {customer}{leadJob ? ` (Leadjob-${leadJob})` : ''}
                                                                                        </div>
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
                                                                    <div className="d-flex flex-column prob-detail-field-num">
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
                                                                    <div className="d-flex flex-column prob-detail-field-num">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>GP % <span className="text-danger">*</span></span>
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
                                                                    <div className="d-flex flex-column">
                                                                        <span style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>Prepared by</span>
                                                                        <div style={{ width: '200px' }}>
                                                                            <input
                                                                                type="text"
                                                                                readOnly
                                                                                className="form-control form-control-sm"
                                                                                value={item.QuotePreparedBy || ''}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                        </div>
                                                                    </div>
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
            {historyReqNo ? (
                <div className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center" style={{ background: 'rgba(0,0,0,0.35)', zIndex: 2000 }}>
                    <div className="bg-white rounded shadow" style={{ width: '95%', maxWidth: '1200px', maxHeight: '85vh', overflow: 'hidden' }}>
                        <div className="d-flex justify-content-between align-items-start border-bottom p-3">
                            <div>
                                <h6 className="mb-2 fw-semibold">Probability Update History for</h6>
                                <div className="small text-dark" style={{ lineHeight: 1.65 }}>
                                    <div><span className="text-muted">Enquiry No.:</span> {historyReqNo}</div>
                                    <div>
                                        <span className="text-muted">Project Name:</span>{' '}
                                        <strong className="text-dark">{historyHeader.projectName || '—'}</strong>
                                    </div>
                                    <div><span className="text-muted">Leadjob Name:</span> {historyHeader.leadJobName || '—'}</div>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => {
                                    setHistoryReqNo('');
                                    setHistoryRows([]);
                                    setHistoryHeader({ projectName: '', leadJobName: '' });
                                }}
                            >
                                Close
                            </button>
                        </div>
                        <div className="p-2" style={{ maxHeight: '70vh', overflow: 'auto' }}>
                            <table className="table table-sm table-bordered mb-0" style={{ fontSize: '12px' }}>
                                <thead>
                                    <tr>
                                        <th>Updated</th>
                                        <th>Customer name</th>
                                        <th>Quote Ref</th>
                                        <th>Status</th>
                                        <th>Probability</th>
                                        <th>Remarks</th>
                                        <th>Probability Updated by</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyLoading ? (
                                        <tr><td colSpan="7" className="text-center py-3">Loading history...</td></tr>
                                    ) : historyRows.length === 0 ? (
                                        <tr><td colSpan="7" className="text-center py-3 text-muted">No history found.</td></tr>
                                    ) : [...historyRows]
                                        .sort((a, b) => {
                                            const ta = new Date(a.UpdatedDateTime || 0).getTime();
                                            const tb = new Date(b.UpdatedDateTime || 0).getTime();
                                            return tb - ta;
                                        })
                                        .map((r) => (
                                        <tr key={r.ID}>
                                            <td>{formatHistoryDateTime(r.UpdatedDateTime)}</td>
                                            <td>{r.ToName || ''}</td>
                                            <td>
                                                {r.QuoteRef || ''}
                                                {r.QuoteRefQuoteDate
                                                    ? ` (${formatHistoryDateTime(r.QuoteRefQuoteDate)})`
                                                    : ''}
                                            </td>
                                            <td
                                                style={{
                                                    fontWeight: 700,
                                                    color:
                                                        String(r.Status || '').trim().toLowerCase() === 'won'
                                                            ? '#198754'
                                                            : '#dc3545',
                                                }}
                                            >
                                                {r.Status || ''}
                                            </td>
                                            <td>{r.ProbabilityChance || ''}</td>
                                            <td>{r.Remarks || ''}</td>
                                            <td>{r.UpdatedByDisplayName || r.UpdatedBy || ''}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : null}
        </div >
    );
};

export default ProbabilityForm;
