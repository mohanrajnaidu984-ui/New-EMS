import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import excelIcon from '../../assets/excel_icon.png';
import DateInput from './DateInput';

const SearchEnquiry = ({ onOpen }) => {
    const { enquiries } = useData();
    const { currentUser } = useAuth();

    // Search filters
    const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('enquiry_searchQuery') || '');
    const [dateFrom, setDateFrom] = useState(() => localStorage.getItem('enquiry_searchDateFrom') || '');
    const [dateTo, setDateTo] = useState(() => localStorage.getItem('enquiry_searchDateTo') || '');

    // -- Persistence --
    useEffect(() => {
        localStorage.setItem('enquiry_searchQuery', searchQuery);
    }, [searchQuery]);
    useEffect(() => {
        if (dateFrom) localStorage.setItem('enquiry_searchDateFrom', dateFrom);
        else localStorage.removeItem('enquiry_searchDateFrom');
    }, [dateFrom]);
    useEffect(() => {
        if (dateTo) localStorage.setItem('enquiry_searchDateTo', dateTo);
        else localStorage.removeItem('enquiry_searchDateTo');
    }, [dateTo]);

    const [resetKey, setResetKey] = useState(0);

    const [results, setResults] = useState([]);
    const [filteredEnquiries, setFilteredEnquiries] = useState([]);
    const searchInputRef = useRef(null);
    /** After Clear, keep the table empty until the user runs a search again (text and/or both dates). */
    const resultsLockedEmptyRef = useRef(false);

    const currentUserName = (currentUser?.name || '').trim().toLowerCase();

    // Sort helper
    const sortEnquiries = (list) => {
        return [...list].sort((a, b) => {
            const dateA = new Date(a.CreatedAt || a.EnquiryDate);
            const dateB = new Date(b.CreatedAt || b.EnquiryDate);
            if (dateB - dateA !== 0) return dateB - dateA;
            return (b.RequestNo || '').localeCompare(a.RequestNo || '');
        });
    };

    // Date formatting helper: DD-MMM-YY
    const formatDate = (dateStr) => {
        if (!dateStr) return "-";
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;

        const day = String(date.getDate()).padStart(2, '0');
        const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        const month = months[date.getMonth()];
        const year = String(date.getFullYear()).slice(-2);

        return `${day}-${month}-${year}`;
    };

    // Custom sorting for Due Date (Default): Today/Future (Asc) then Past (Desc)
    const getPrioritySortedList = (list) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const currentFuture = [];
        const past = [];

        list.forEach(item => {
            if (!item.DueOn) {
                past.push(item);
                return;
            }
            const due = new Date(item.DueOn);
            due.setHours(0, 0, 0, 0);
            if (due >= today) {
                currentFuture.push(item);
            } else {
                past.push(item);
            }
        });

        // Today/Future: Ascending
        currentFuture.sort((a, b) => new Date(a.DueOn) - new Date(b.DueOn));
        // Past: Descending
        past.sort((a, b) => {
            if (!a.DueOn && !b.DueOn) return 0;
            if (!a.DueOn) return 1;
            if (!b.DueOn) return -1;
            return new Date(b.DueOn) - new Date(a.DueOn);
        });

        return [...currentFuture, ...past];
    };

    // Search lists all enquiries; blue "Edit" icon only for the enquiry creator (others use view + limited edit in form).
    useEffect(() => {
        if (!currentUser) return;

        const isCreator = (enq) =>
            !!(enq.CreatedBy && enq.CreatedBy.trim().toLowerCase() === currentUserName);

        const allowed = Object.values(enquiries).map(enq => ({
            ...enq,
            _canEdit: isCreator(enq)
        }));

        setFilteredEnquiries(allowed);
    }, [enquiries, currentUser, currentUserName]);

    const [sortConfig, setSortConfig] = useState({ key: 'EnquiryDate', direction: 'desc' });

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // Memoize and sort results
    const sortedResults = React.useMemo(() => {
        if (sortConfig.key === 'Default') {
            return getPrioritySortedList(results);
        }

        const sortableItems = [...results];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                let valA = a[sortConfig.key];
                let valB = b[sortConfig.key];

                // Special handling for nested/computed fields
                if (sortConfig.key === 'Customer') valA = a.SelectedCustomers?.join(', ') || a.CustomerName;
                if (sortConfig.key === 'Customer') valB = b.SelectedCustomers?.join(', ') || b.CustomerName;
                if (sortConfig.key === 'SE') valA = a.SelectedConcernedSEs?.join(', ') || a.ConcernedSE;
                if (sortConfig.key === 'SE') valB = b.SelectedConcernedSEs?.join(', ') || b.ConcernedSE;

                // Date handling
                if (sortConfig.key === 'EnquiryDate' || sortConfig.key === 'DueOn') {
                    const d1 = valA ? new Date(valA).getTime() : 0;
                    const d2 = valB ? new Date(valB).getTime() : 0;
                    if (d1 !== d2) {
                        return sortConfig.direction === 'asc' ? d1 - d2 : d2 - d1;
                    }
                    // Tie-breaker: RequestNo (Numeric)
                    const n1 = parseInt(a.RequestNo) || 0;
                    const n2 = parseInt(b.RequestNo) || 0;
                    return sortConfig.direction === 'asc' ? n1 - n2 : n2 - n1;
                }

                // Numeric handling for RequestNo
                if (sortConfig.key === 'RequestNo') {
                    const n1 = parseInt(valA) || 0;
                    const n2 = parseInt(valB) || 0;
                    return sortConfig.direction === 'asc' ? n1 - n2 : n2 - n1;
                }

                // String handling
                valA = valA ? String(valA).toLowerCase() : "";
                valB = valB ? String(valB).toLowerCase() : "";

                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;

                // Final Tie-breaker for all sorts: RequestNo (Numeric)
                const nr1 = parseInt(a.RequestNo) || 0;
                const nr2 = parseInt(b.RequestNo) || 0;
                return nr2 - nr1; // Always latest for equal strings
            });
        }
        return sortableItems;
    }, [results, sortConfig]);

    const handleSearch = useCallback(() => {
        const q = String(searchQuery || '').trim();
        const hasDateRange = Boolean(dateFrom && dateTo);
        if (!q && !hasDateRange) {
            setResults([]);
            return;
        }

        let filtered = [...filteredEnquiries];

        // Enquiry date range — only when both From and To are set (inclusive, by calendar day)
        if (dateFrom && dateTo) {
            let from = new Date(dateFrom);
            let to = new Date(dateTo);
            if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
                /* ignore invalid */
            } else {
                if (from > to) {
                    const swap = from;
                    from = to;
                    to = swap;
                }
                from.setHours(0, 0, 0, 0);
                to.setHours(23, 59, 59, 999);
                filtered = filtered.filter((e) => {
                    const raw = e.EnquiryDate || e.CreatedAt;
                    if (!raw) return false;
                    const d = new Date(raw);
                    if (Number.isNaN(d.getTime())) return false;
                    return d >= from && d <= to;
                });
            }
        }

        // Search text filter
        if (q) {
            const lowerText = q.toLowerCase();
            filtered = filtered.filter(e =>
                e.RequestNo?.toLowerCase().includes(lowerText) ||
                e.CustomerName?.toLowerCase().includes(lowerText) ||
                (e.SelectedCustomers && e.SelectedCustomers.join(',').toLowerCase().includes(lowerText)) ||
                e.ClientName?.toLowerCase().includes(lowerText) ||
                e.ProjectName?.toLowerCase().includes(lowerText) ||
                (e.SelectedConcernedSEs && e.SelectedConcernedSEs.join(',').toLowerCase().includes(lowerText)) ||
                e.CreatedBy?.toLowerCase().includes(lowerText)
            );
        }

        setResults(filtered);
    }, [filteredEnquiries, searchQuery, dateFrom, dateTo]);

    const runSearch = useCallback(() => {
        resultsLockedEmptyRef.current = false;
        handleSearch();
    }, [handleSearch]);

    // Live search when text or date range changes (skipped while table is cleared until user filters again)
    useEffect(() => {
        if (resultsLockedEmptyRef.current) {
            const hasFilter = Boolean(String(searchQuery || '').trim()) || Boolean(dateFrom && dateTo);
            if (hasFilter) {
                resultsLockedEmptyRef.current = false;
                handleSearch();
            }
            return;
        }
        handleSearch();
    }, [handleSearch, searchQuery, dateFrom, dateTo]);

    const handleClear = () => {
        resultsLockedEmptyRef.current = true;
        setSearchQuery('');
        setDateFrom('');
        setDateTo('');
        setSortConfig({ key: 'EnquiryDate', direction: 'desc' });
        setResetKey((prev) => prev + 1);
        if (searchInputRef.current) {
            searchInputRef.current.value = '';
        }
        setResults([]);
    };

    const handleExport = () => {
        if (sortedResults.length === 0) {
            alert("No data to export");
            return;
        }

        const headers = ["Enquiry No.", "Enquiry Date", "Customer Name / Contractor Name", "Client", "Project", "Source", "Due Date", "Sales Engineer / Estimation Engineer / Quantity Surveyor", "Status", "Created By"];

        const csvContent = [
            headers.join(","),
            ...sortedResults.map(r => {
                const row = [
                    r.RequestNo,
                    formatDate(r.EnquiryDate),
                    (r.SelectedCustomers?.join('; ') || r.CustomerName || ''),
                    (r.ClientName || ''),
                    (r.ProjectName || ''),
                    (r.SourceOfInfo || ''),
                    formatDate(r.DueOn),
                    (r.SelectedConcernedSEs?.join('; ') || r.ConcernedSE || ''),
                    r.Status || 'Enquiry',
                    r.CreatedBy || '-'
                ];
                return row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(",");
            })
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `Enquiry_Export_${new Date().toISOString().slice(0, 10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return <i className="bi bi-arrow-down-up ms-1 text-muted" style={{ fontSize: '10px' }}></i>;
        return sortConfig.direction === 'asc'
            ? <i className="bi bi-arrow-up ms-1 text-primary"></i>
            : <i className="bi bi-arrow-down ms-1 text-primary"></i>;
    };

    return (
        <div
            className="px-3 px-lg-4"
            style={{ position: 'relative', zIndex: 100, boxSizing: 'border-box' }}
        >
            {/* Sticky under app header (100px) so this bar stays visible while scrolling results */}
            <div
                style={{
                    position: 'sticky',
                    top: '100px',
                    zIndex: 200,
                    backgroundColor: '#ffffff',
                    paddingTop: '4px',
                    paddingBottom: '12px',
                    marginBottom: '12px',
                    borderBottom: '1px solid #e0e0e0',
                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.06)',
                }}
            >
            <div
                className="d-flex align-items-center flex-wrap gap-2"
                style={{
                    position: 'relative',
                    zIndex: 1000,
                    pointerEvents: 'auto',
                    rowGap: '8px',
                }}
            >
                <div className="d-flex align-items-center flex-wrap gap-2" style={{ fontSize: '12px', color: '#475569' }}>
                    <span className="text-nowrap fw-semibold">From</span>
                    <div style={{ width: '132px' }}>
                        <DateInput
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            placeholder="DD-MMM-YYYY"
                            style={{ fontSize: '12px', padding: '6px 8px', height: '36px' }}
                        />
                    </div>
                    <span className="text-nowrap fw-semibold">To</span>
                    <div style={{ width: '132px' }}>
                        <DateInput
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            placeholder="DD-MMM-YYYY"
                            style={{ fontSize: '12px', padding: '6px 8px', height: '36px' }}
                        />
                    </div>
                </div>

                {/* Search Text */}
                <div style={{ flex: '1 1 220px', minWidth: '180px', maxWidth: '480px' }} key={`search-${resetKey}`}>
                    <input
                        id="globalSearchInput"
                        ref={searchInputRef}
                        name={`search_field_${resetKey}`}
                        type="text"
                        className="form-control"
                        autoComplete="off"
                        placeholder="Search anything..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                        style={{ fontSize: '12.5px', borderRadius: '4px', border: '1px solid #d1d5db', height: '36px' }}
                    />
                </div>

                {/* Buttons Group */}
                <button
                    type="button"
                    className="btn btn-primary py-0 search-btn-hover"
                    onClick={runSearch}
                    style={{
                        fontSize: '12px',
                        borderRadius: '4px',
                        fontWeight: '600',
                        height: '36px',
                        minWidth: '70px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1001,
                        pointerEvents: 'auto'
                    }}
                >
                    SEARCH
                </button>
                <button
                    type="button"
                    className="btn btn-outline-secondary py-0 clear-btn-hover"
                    onClick={handleClear}
                    style={{
                        fontSize: '12px',
                        borderRadius: '4px',
                        fontWeight: '600',
                        height: '36px',
                        minWidth: '70px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#fff',
                        border: '1px solid #d1d5db',
                        color: '#4b5563',
                        zIndex: 1001,
                        pointerEvents: 'auto'
                    }}
                >
                    CLEAR
                </button>
                <button
                    type="button"
                    className="btn p-0 ms-2"
                    onClick={handleExport}
                    title="Export to Excel"
                    style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#198754', // Bootstrap success color
                        zIndex: 1001,
                        pointerEvents: 'auto',
                        transition: 'transform 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <img src={excelIcon} alt="Export to Excel" style={{ height: '24px', width: 'auto' }} />
                </button>
            </div>
            {dateFrom && dateTo ? (
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                    Filtering by enquiry date between selected dates (inclusive). Clear dates to show all dates again.
                </div>
            ) : (dateFrom || dateTo) ? (
                <div style={{ fontSize: '11px', color: '#b45309', marginTop: '6px' }}>
                    Select both From and To dates to filter the list by enquiry date.
                </div>
            ) : null}
            </div>

            <style>
                {`
                .search-btn-hover:hover {
                    box-shadow: 0 4px 12px rgba(13, 110, 253, 0.25);
                    transform: translateY(-1px);
                    background-color: #0b5ed7 !important;
                }
                .clear-btn-hover:hover {
                    background-color: #f8f9fa !important;
                    color: #444 !important;
                    border-color: #6c757d !important;
                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
                }
                .search-btn-hover:active, .clear-btn-hover:active {
                    transform: scale(0.98);
                }
                .action-icon-hover:hover {
                    background-color: rgba(13, 110, 253, 0.25) !important;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                }
                .sortable-header {
                    cursor: pointer;
                    user-select: none;
                    white-space: nowrap;
                }
                .header-content {
                    display: inline-flex;
                    align-items: center;
                    width: 100%;
                }
                .sortable-header:hover {
                    background-color: #f0f4f8;
                }
                tbody tr.enquiry-search-row-open {
                    cursor: pointer;
                }
                tbody tr.enquiry-search-row-open:hover {
                    background-color: #eff6ff !important;
                }
                `}
            </style>

            {/* Results Table */}
            <div className="table-responsive">
                <table className="table table-sm table-hover align-middle" style={{ fontSize: '13px' }}>
                    <thead className="table-light">
                        <tr>
                            <th style={{ whiteSpace: 'nowrap' }}>Action</th>
                            <th className="sortable-header" onClick={() => handleSort('RequestNo')}>
                                <div className="header-content">Enquiry No. <SortIcon column="RequestNo" /></div>
                            </th>
                            <th className="sortable-header" onClick={() => handleSort('EnquiryDate')}>
                                <div className="header-content">Enquiry Date <SortIcon column="EnquiryDate" /></div>
                            </th>
                            <th className="sortable-header" onClick={() => handleSort('Customer')}>
                                <div className="header-content">Customer Name / Contractor Name <SortIcon column="Customer" /></div>
                            </th>
                            <th className="sortable-header" onClick={() => handleSort('ClientName')}>
                                <div className="header-content">Client <SortIcon column="ClientName" /></div>
                            </th>
                            <th className="sortable-header" onClick={() => handleSort('ProjectName')}>
                                <div className="header-content">Project <SortIcon column="ProjectName" /></div>
                            </th>
                            <th className="sortable-header" onClick={() => handleSort('SourceOfInfo')}>
                                <div className="header-content">Source <SortIcon column="SourceOfInfo" /></div>
                            </th>
                            <th className="sortable-header" onClick={() => handleSort('DueOn')} style={{ width: '104px' }}>
                                <div className="header-content">Due <SortIcon column="DueOn" /></div>
                            </th>
                            <th className="sortable-header" onClick={() => handleSort('SE')}>
                                <div className="header-content">Sales Engineer / Estimation Engineer / Quantity Surveyor <SortIcon column="SE" /></div>
                            </th>
                            <th className="sortable-header" onClick={() => handleSort('Status')}>
                                <div className="header-content">Status <SortIcon column="Status" /></div>
                            </th>
                            <th className="sortable-header" onClick={() => handleSort('CreatedBy')}>
                                <div className="header-content">Created By <SortIcon column="CreatedBy" /></div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedResults.length === 0 ? (
                            <tr><td colSpan="11" className="text-muted text-center">No results.</td></tr>
                        ) : (
                            sortedResults.map((r, idx) => (
                                <tr
                                    key={`${r.RequestNo}-${idx}`}
                                    className="enquiry-search-row-open"
                                    tabIndex={0}
                                    role="button"
                                    title={r._canEdit ? 'Open enquiry (edit)' : 'Open enquiry (view)'}
                                    onClick={() => r.RequestNo && onOpen(r.RequestNo)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            if (r.RequestNo) onOpen(r.RequestNo);
                                        }
                                    }}
                                >
                                    <td className="position-relative">
                                        <div
                                            aria-hidden
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '6px',
                                                transition: 'all 0.2s',
                                                backgroundColor: r._canEdit ? 'rgba(13, 110, 253, 0.1)' : 'rgba(108, 117, 125, 0.1)',
                                                color: r._canEdit ? '#0d6efd' : '#6c757d'
                                            }}
                                            className="action-icon-hover"
                                        >
                                            {r._canEdit ? (
                                                <i className="bi bi-pencil-square" style={{ fontSize: '16px' }}></i>
                                            ) : (
                                                <i className="bi bi-eye" style={{ fontSize: '16px' }}></i>
                                            )}
                                        </div>
                                    </td>
                                    <td>{r.RequestNo}</td>
                                    <td>{formatDate(r.EnquiryDate)}</td>
                                    <td>{r.SelectedCustomers?.join(', ') || r.CustomerName}</td>
                                    <td>{r.ClientName}</td>
                                    <td>{r.ProjectName}</td>
                                    <td>{r.SourceOfInfo}</td>
                                    <td style={{ width: '104px' }}>{formatDate(r.DueOn)}</td>
                                    <td>{r.SelectedConcernedSEs?.join(', ') || r.ConcernedSE}</td>
                                    <td>{r.Status || 'Enquiry'}</td>
                                    <td>{r.CreatedBy || '-'}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default SearchEnquiry;
