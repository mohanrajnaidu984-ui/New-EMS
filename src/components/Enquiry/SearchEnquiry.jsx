import React, { useState, useEffect, useRef } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import excelIcon from '../../assets/excel_icon.png';

const SearchEnquiry = ({ onOpen }) => {
    const { enquiries, masters } = useData();
    const { currentUser } = useAuth();

    // Search filters
    const [searchQuery, setSearchQuery] = useState('');

    const [resetKey, setResetKey] = useState(0);

    const [results, setResults] = useState([]);
    const [filteredEnquiries, setFilteredEnquiries] = useState([]);
    const searchInputRef = useRef(null);

    // Determine user role and permissions once
    const roleString = currentUser?.role || currentUser?.Roles || '';
    const userRoles = typeof roleString === 'string'
        ? roleString.split(',').map(r => r.trim().toLowerCase())
        : (Array.isArray(roleString) ? roleString.map(r => r.toLowerCase()) : []);
    const isAdmin = userRoles.includes('admin') || userRoles.includes('system');
    const userEmail = (currentUser?.email || currentUser?.EmailId || '').toLowerCase();
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

    // Initialize filtered enquiries based on permissions
    useEffect(() => {
        if (!currentUser) return;

        // Filter Function
        const isVisible = (enq) => {
            if (isAdmin) return true;

            // 1. Created By Me
            if (enq.CreatedBy && enq.CreatedBy.trim().toLowerCase() === currentUserName) return true;

            // 2. Concerned SE is Me
            if (enq.ConcernedSE && enq.ConcernedSE.trim().toLowerCase() === currentUserName) return true;
            if (enq.SelectedConcernedSEs && enq.SelectedConcernedSEs.some(se => se.trim().toLowerCase() === currentUserName)) return true;

            // 3. Division/Department Coworker (via EnquiryFor -> Email Check)
            if (masters.enqItems && enq.SelectedEnquiryFor) {
                const selectedItems = (Array.isArray(enq.SelectedEnquiryFor)
                    ? enq.SelectedEnquiryFor
                    : enq.SelectedEnquiryFor.split(',')
                ).map(i => i.trim().toLowerCase());

                const relevantItems = masters.enqItems.filter(item =>
                    item.ItemName && selectedItems.includes(item.ItemName.trim().toLowerCase())
                );

                for (const item of relevantItems) {
                    const allEmails = [
                        ...(item.CommonMailIds ? item.CommonMailIds.split(/[,;]/) : []),
                        ...(item.CCMailIds ? item.CCMailIds.split(/[,;]/) : [])
                    ].map(e => e.trim().toLowerCase()).filter(Boolean);

                    if (userEmail && allEmails.includes(userEmail)) {
                        return true;
                    }
                }
            }
            return false;
        };

        // Edit Permission Function
        const canEdit = (enq) => {
            if (isAdmin) return true;
            if (enq.CreatedBy && enq.CreatedBy.trim().toLowerCase() === currentUserName) return true;

            if (masters.enqItems && enq.SelectedEnquiryFor) {
                const selectedItems = (Array.isArray(enq.SelectedEnquiryFor)
                    ? enq.SelectedEnquiryFor
                    : enq.SelectedEnquiryFor.split(',')
                ).map(i => i.trim().toLowerCase());

                const relevantItems = masters.enqItems.filter(item =>
                    item.ItemName && selectedItems.includes(item.ItemName.trim().toLowerCase())
                );

                for (const item of relevantItems) {
                    const ccEmails = (item.CCMailIds ? item.CCMailIds.split(/[,;]/) : [])
                        .map(e => e.trim().toLowerCase()).filter(Boolean);

                    if (userEmail && ccEmails.includes(userEmail)) return true;
                }
            }
            return false;
        };

        const allowed = Object.values(enquiries)
            .filter(isVisible)
            .map(enq => ({ ...enq, _canEdit: canEdit(enq) }));

        setFilteredEnquiries(allowed);
        setResults(allowed);
    }, [enquiries, currentUser, masters, isAdmin, currentUserName, userEmail]);

    const [sortConfig, setSortConfig] = useState({ key: 'Default', direction: 'priority' });

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
                if (['EnquiryDate', 'DueOn'].includes(sortConfig.key)) {
                    const d1 = valA ? new Date(valA).getTime() : 0;
                    const d2 = valB ? new Date(valB).getTime() : 0;
                    return sortConfig.direction === 'asc' ? d1 - d2 : d2 - d1;
                }

                // String handling
                valA = valA ? String(valA).toLowerCase() : "";
                valB = valB ? String(valB).toLowerCase() : "";

                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [results, sortConfig]);

    const handleSearch = () => {
        let sourceList = isAdmin
            ? Object.values(enquiries).map(e => ({ ...e, _canEdit: true }))
            : filteredEnquiries;

        let filtered = [...sourceList];

        // Search text filter
        if (searchQuery) {
            const lowerText = searchQuery.toLowerCase();
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
    };

    // Live Search: Automatically search when filters change
    useEffect(() => {
        handleSearch();
    }, [searchQuery]);

    const handleClear = () => {
        console.log("SearchEnquiry: Clear Button Clicked");

        // 1. Reset all state variables
        setSearchQuery("");
        setSortConfig({ key: 'RequestNo', direction: 'desc' });

        // 2. Increment key to force remount of input fields (extra safety)
        setResetKey(prev => prev + 1);

        // 3. Clear the DOM ref directly as well
        if (searchInputRef.current) {
            searchInputRef.current.value = "";
        }

        // 4. Reset the results list
        setResults([...filteredEnquiries]);

        console.log("SearchEnquiry: All filters and states successfully reset.");
    };

    const handleExport = () => {
        if (sortedResults.length === 0) {
            alert("No data to export");
            return;
        }

        const headers = ["Enquiry No.", "Enquiry Date", "Customer", "Client", "Project", "Source", "Due Date", "SE(s)", "Status", "Created By"];

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
        <div style={{ position: 'relative', zIndex: 100 }}>
            {/* Search Filters Row - Clean & Simple */}
            {/* Search Filters Row - Single Line */}
            <div className="d-flex align-items-center gap-2 mb-4" style={{
                position: 'relative',
                zIndex: 1000,
                pointerEvents: 'auto'
            }}>
                {/* Search Text */}
                <div style={{ width: '400px' }} key={`search-${resetKey}`}>
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
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        style={{ fontSize: '12.5px', borderRadius: '4px', border: '1px solid #d1d5db', height: '36px' }}
                    />
                </div>

                {/* Buttons Group */}
                <button
                    type="button"
                    className="btn btn-primary py-0 search-btn-hover"
                    onClick={handleSearch}
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
                                <div className="header-content">Customer <SortIcon column="Customer" /></div>
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
                            <th className="sortable-header" onClick={() => handleSort('DueOn')}>
                                <div className="header-content">Due <SortIcon column="DueOn" /></div>
                            </th>
                            <th className="sortable-header" onClick={() => handleSort('SE')}>
                                <div className="header-content">SE(s) <SortIcon column="SE" /></div>
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
                            sortedResults.map(r => (
                                <tr key={r.RequestNo}>
                                    <td className="position-relative">
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                console.log(`SearchEnquiry: ${r._canEdit ? 'Edit' : 'View'} clicked for`, r.RequestNo);
                                                onOpen(r.RequestNo);
                                            }}
                                            style={{
                                                cursor: 'pointer',
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
                                            title={r._canEdit ? 'Edit Enquiry' : 'View Enquiry'}
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
                                    <td>{formatDate(r.DueOn)}</td>
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
