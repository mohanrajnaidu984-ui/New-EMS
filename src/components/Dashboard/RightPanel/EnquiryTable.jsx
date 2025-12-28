import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronRight, ChevronDown, MapPin, Calendar, User, Info, AlertCircle, ArrowUp, ArrowDown, ArrowUpDown, Search, X } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, isSameDay } from 'date-fns';

const DateShortcutBtn = ({ label, isActive, onClick }) => {
    const [isHovered, setIsHovered] = useState(false);
    return (
        <button
            type="button"
            className={`btn btn-sm rounded-pill px-3 fw-bold text-capitalize ${isActive ? 'bg-white shadow-sm text-primary' : 'text-muted border-0'}`}
            style={{
                backgroundColor: !isActive && isHovered ? 'rgba(255,255,255,0.5)' : undefined,
                transition: 'all 0.2s'
            }}
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {label}
        </button>
    );
};

const EnquiryTable = ({ data, onRowClick, filters, setFilters, selectedDate }) => {

    // Helper to format date: DD-MMM-YY
    const formatDate = (dateStr) => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        const day = String(d.getDate()).padStart(2, '0');
        const month = d.toLocaleString('default', { month: 'short' }).toUpperCase();
        const year = String(d.getFullYear()).slice(-2);
        return `${day}-${month}-${year}`;
    };

    const [expandedRows, setExpandedRows] = useState(new Set());
    const [hoveredField, setHoveredField] = useState(null);
    const [searchText, setSearchText] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Suggestion Logic
    const handleSearchChange = (e) => {
        const val = e.target.value;
        setSearchText(val);

        if (!val.trim() || val.trim().length < 3) {
            setSuggestions([]);
            setShowSuggestions(false);
            setFilters(prev => ({ ...prev, search: '' }));
            return;
        }

        const lowerVal = val.toLowerCase();

        // Update global filters to trigger server search
        setFilters(prev => ({ ...prev, search: val }));

        const matches = new Set();
        const fields = ['ProjectName', 'CustomerName', 'RequestNo', 'ClientName', 'ConsultantName', 'EnquiryFor', 'ConcernedSE', 'EnquiryDetails'];

        for (const row of data) {
            if (matches.size >= 10) break; // Limit suggestions

            for (const field of fields) {
                const fieldValue = row[field] ? String(row[field]) : '';
                if (fieldValue.toLowerCase().includes(lowerVal)) {
                    // Start checking from the match index to extract relevant substring or just use the full value?
                    // User probably wants the full value like "Project A" if they type "Proj"
                    // But if EnquiryDetails is long, maybe not. 
                    // Let's stick to full field values for names/IDs, maybe truncate details?
                    // Actually, usually suggestions are distinct values found.
                    matches.add(fieldValue);
                    if (matches.size >= 10) break;
                }
            }
        }
        setSuggestions(Array.from(matches));
        setShowSuggestions(true);
    };

    const handleSuggestionClick = (val) => {
        setSearchText(val);
        setFilters(prev => ({ ...prev, search: val }));
        setShowSuggestions(false);
    };

    // Handle Date Shortcuts
    const handleDateShortcut = (type) => {
        const today = new Date();
        let from = '';
        let to = '';
        let mode = '';

        switch (type) {
            case 'today':
                from = format(today, 'yyyy-MM-dd');
                to = format(today, 'yyyy-MM-dd');
                break;
            case 'tomorrow':
                const tom = addDays(today, 1);
                from = format(tom, 'yyyy-MM-dd');
                to = format(tom, 'yyyy-MM-dd');
                break;
            case 'week':
                from = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'); // Monday start
                to = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
                break;
            case 'month':
                from = format(startOfMonth(today), 'yyyy-MM-dd');
                to = format(endOfMonth(today), 'yyyy-MM-dd');
                break;
            case 'all':
                mode = 'all';
                break;
            default:
                break;
        }

        setFilters(prev => ({
            ...prev,
            fromDate: from,
            toDate: to,
            mode: mode,
            dateType: prev.dateType || 'Enquiry Date', // Use existing or default
            date: null
        }));
    };



    // Sorting State
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    const handleSort = (key) => {
        setSortConfig((prev) => {
            if (prev.key === key) {
                // Toggle direction
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'asc' };
        });
    };

    // Memoized Sorted Data (Client-side filtering removed as Server handles search)
    const processedData = useMemo(() => {
        let result = [...data];

        // 2. Sorting
        if (sortConfig.key) {
            result.sort((a, b) => {
                const valA = a[sortConfig.key];
                const valB = b[sortConfig.key];

                // Handle Dates
                if (['EnquiryDate', 'DueDate', 'SiteVisitDate'].includes(sortConfig.key)) {
                    const dateA = valA ? new Date(valA) : new Date(0);
                    const dateB = valB ? new Date(valB) : new Date(0);
                    return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
                }

                // Handle Strings/Numbers
                if (valA === null || valA === undefined) return 1; // Move nulls to bottom
                if (valB === null || valB === undefined) return -1;

                if (typeof valA === 'string') {
                    return sortConfig.direction === 'asc'
                        ? valA.localeCompare(valB)
                        : valB.localeCompare(valA);
                }

                return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
            });
        }

        return result;
    }, [data, sortConfig, searchText]);

    const toggleRow = (e, id) => {
        e.stopPropagation();
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // STRICT COLOR LOGIC
    // Enquiry: Blue
    // Due Today: Orange
    // Overdue: Red
    // Site Visit: Green
    const getRowColor = (dueDate, status, siteVisitDate) => {
        // Normalize today
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let due = null;
        if (dueDate) {
            due = new Date(dueDate);
            due.setHours(0, 0, 0, 0);
        }

        let visit = null;
        if (siteVisitDate) {
            visit = new Date(siteVisitDate);
            visit.setHours(0, 0, 0, 0);
        }

        // Priority 1: Overdue (Red)
        if (due && due < today && status !== 'Closed') return '#ef4444';

        // Priority 2: Due Today (Orange)
        if (due && due.getTime() === today.getTime() && status !== 'Closed') return '#f97316';

        // Priority 3: Site Visit (Green)
        // If there is a site visit in future or today? Prompt says "Site Visit -> Green".
        // Let's assume upcoming/today site visits trigger this.
        if (visit && visit >= today) return '#22c55e';

        // Default: Enquiry (Blue)
        return '#3b82f6';
    };

    // Column Resizing Logic
    const [colWidths, setColWidths] = useState({
        col1: 150,
        col2: 180,
        col3: 200,
        col4: 300,
        col5: 120,
        col6: 120
    });

    const resizingRef = useRef({ col: null, startX: 0, startWidth: 0 });

    const startResize = (e, col) => {
        e.preventDefault();
        resizingRef.current = {
            col,
            startX: e.pageX,
            startWidth: colWidths[col]
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
    };

    const handleMouseMove = (e) => {
        if (!resizingRef.current.col) return;
        const { col, startX, startWidth } = resizingRef.current;
        const diff = e.pageX - startX;
        setColWidths(prev => ({
            ...prev,
            [col]: Math.max(50, startWidth + diff) // Min width 50px
        }));
    };

    const handleMouseUp = () => {
        resizingRef.current = { col: null, startX: 0, startWidth: 0 };
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
    };

    // Resizer Component
    const Resizer = ({ col }) => (
        <div
            style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: '5px',
                cursor: 'col-resize',
                userSelect: 'none',
                zIndex: 20
            }}
            onMouseDown={(e) => startResize(e, col)}
        />
    );

    // Helper for Header Styling
    const getHeaderStyle = (field) => {
        const isHovered = hoveredField === field;
        return {
            transition: 'all 0.2s ease',
            transform: isHovered ? 'scale(1.1) translateX(5px)' : 'scale(1)',
            fontWeight: isHovered ? '800' : '600',
            color: isHovered ? '#111827' : 'inherit', // Dark black on hover
            display: 'block', // Ensure transform works
            width: 'fit-content' // Don't take full width so scale looks natural
        };
    };

    // Helper for Row Value Events
    const hoverEvents = (field) => ({
        onMouseEnter: () => setHoveredField(field),
        onMouseLeave: () => setHoveredField(null)
    });

    // Sortable Header Component
    const SortableHeader = ({ label, fieldKey }) => {
        const isHovered = hoveredField === fieldKey;
        const isSorted = sortConfig.key === fieldKey;

        return (
            <div
                onClick={() => handleSort(fieldKey)}
                onMouseEnter={() => setHoveredField(fieldKey)}
                onMouseLeave={() => setHoveredField(null)}
                style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.2s ease',
                    // Only apply scale/transform on hover if needed, or keep it subtle
                    transform: isHovered ? 'translateX(2px)' : 'none',
                    fontWeight: isHovered || isSorted ? '800' : '600',
                    color: isHovered || isSorted ? '#111827' : 'inherit',
                    width: 'fit-content'
                }}
                className="mb-1"
            >
                {label}
                <span className="d-flex align-items-center text-muted" style={{ opacity: isSorted || isHovered ? 1 : 0.3 }}>
                    {isSorted ? (
                        sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                    ) : (
                        <ArrowUpDown size={12} />
                    )}
                </span>
            </div>
        );
    };

    return (
        <div className="d-flex flex-column h-100 bg-white rounded shadow-sm overflow-hidden" style={{ minHeight: 0 }}>


            {/* Table Content */}
            < div className="flex-grow-1" style={{ overflow: 'auto', border: '1px solid #dee2e6' }}>
                <table className="table table-hover mb-0" style={{ fontSize: '0.85rem', tableLayout: 'fixed', minWidth: '100%', width: 'max-content' }}>
                    <thead className="sticky-top" style={{ zIndex: 10, top: 0, backgroundColor: '#eff6ff' }}>
                        <tr className="border-bottom">
                            {/* Column 1 Header */}
                            <th className="p-2 text-secondary small position-relative" style={{ width: colWidths.col1, minWidth: '100px', verticalAlign: 'top', backgroundColor: '#eff6ff' }}>
                                <SortableHeader label="Enquiry No" fieldKey="RequestNo" />
                                <SortableHeader label="Enquiry Date" fieldKey="EnquiryDate" />
                                <SortableHeader label="Due Date" fieldKey="DueDate" />
                                <Resizer col="col1" />
                            </th>

                            {/* Column 2 Header */}
                            <th className="p-2 text-secondary small position-relative" style={{ width: colWidths.col2, minWidth: '100px', verticalAlign: 'top', backgroundColor: '#eff6ff' }}>
                                <SortableHeader label="Project Name" fieldKey="ProjectName" />
                                <SortableHeader label="Division" fieldKey="EnquiryFor" />
                                <SortableHeader label="Sales Engineer" fieldKey="ConcernedSE" />
                                <Resizer col="col2" />
                            </th>

                            {/* Column 3 Header */}
                            <th className="p-2 text-secondary small position-relative" style={{ width: colWidths.col3, minWidth: '100px', verticalAlign: 'top', backgroundColor: '#eff6ff' }}>
                                <SortableHeader label="Customer" fieldKey="CustomerName" />
                                <SortableHeader label="Client" fieldKey="ClientName" />
                                <SortableHeader label="Consultant" fieldKey="ConsultantName" />
                                <Resizer col="col3" />
                            </th>

                            <th className="p-2 text-secondary small fw-bold position-relative" style={{ width: colWidths.col4, minWidth: '150px', verticalAlign: 'top', backgroundColor: '#eff6ff' }}>
                                <SortableHeader label="Enquiry Details" fieldKey="EnquiryDetails" />
                                <Resizer col="col4" />
                            </th>
                            <th className="p-2 text-secondary small fw-bold position-relative" style={{ width: colWidths.col5, minWidth: '100px', verticalAlign: 'top', backgroundColor: '#eff6ff' }}>
                                <SortableHeader label="Site Visit Date" fieldKey="SiteVisitDate" />
                                <Resizer col="col5" />
                            </th>
                            <th className="p-2 text-secondary small fw-bold position-relative" style={{ width: colWidths.col6, minWidth: '100px', verticalAlign: 'top', backgroundColor: '#eff6ff' }}>
                                <SortableHeader label="Remarks" fieldKey="Status" />
                                <Resizer col="col6" />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {processedData.length > 0 ? (
                            processedData.map((row, idx) => {
                                const isExpanded = expandedRows.has(row.RequestNo);
                                const contentClass = isExpanded ? "text-wrap text-break" : "text-truncate";
                                const cellStyle = { verticalAlign: 'top' };
                                const rowColor = getRowColor(row.DueDate, row.Status, row.SiteVisitDate);

                                return (
                                    <tr key={idx}
                                        onClick={() => onRowClick(row.RequestNo)}
                                        style={{ cursor: 'pointer', borderLeft: `4px solid ${rowColor}` }}
                                    >
                                        {/* Column 1: Enquiry No / Date / Due */}
                                        <td className="p-2" style={cellStyle}>
                                            <div className="d-flex align-items-center gap-2 mb-1" {...hoverEvents('Enquiry No')} style={{ width: 'fit-content' }}>
                                                <button
                                                    className="btn btn-sm btn-link p-0 text-muted"
                                                    onClick={(e) => toggleRow(e, row.RequestNo)}
                                                >
                                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                </button>
                                                <span className="fw-bold text-dark">{row.RequestNo}</span>
                                            </div>
                                            <div className="ps-4 mb-1" {...hoverEvents('Enquiry Date')} style={{ width: 'fit-content' }}>
                                                <span className="badge bg-light text-secondary border fw-normal" style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                                    {formatDate(row.EnquiryDate)}
                                                </span>
                                            </div>
                                            <div className="ps-4" {...hoverEvents('Due Date')} style={{ width: 'fit-content' }}>
                                                <span
                                                    className={`badge border fw-normal ${new Date(row.DueDate) < new Date() ? 'bg-danger bg-opacity-10 text-danger border-danger border-opacity-25' : 'bg-light text-dark'}`}
                                                    style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                                                >
                                                    {formatDate(row.DueDate)}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Column 2: Project / Division / SE */}
                                        <td className="p-2" style={cellStyle}>
                                            <div {...hoverEvents('Project Name')} style={{ width: 'fit-content' }}>
                                                <div className={`fw-bold text-dark mb-1 ${contentClass}`} title={row.ProjectName}>{row.ProjectName || '-'}</div>
                                            </div>
                                            <div {...hoverEvents('Division')} style={{ width: 'fit-content' }}>
                                                <div className="d-flex flex-wrap gap-1 align-items-center mb-1">
                                                    <span className="badge border fw-normal text-secondary bg-light">{row.EnquiryFor || '-'}</span>
                                                </div>
                                            </div>
                                            <div {...hoverEvents('Sales Engineer')} style={{ width: 'fit-content' }}>
                                                <div className="d-flex align-items-center gap-1 text-secondary small">
                                                    <User size={13} />
                                                    <span className={contentClass} title={row.ConcernedSE}>{row.ConcernedSE || '-'}</span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Column 3: Parties */}
                                        <td className="p-2" style={cellStyle}>
                                            <div {...hoverEvents('Customer')} style={{ width: 'fit-content' }}>
                                                <div className={`fw-bold text-dark mb-1 ${contentClass}`} title={row.CustomerName}>{row.CustomerName || '-'}</div>
                                            </div>

                                            <div {...hoverEvents('Client')} style={{ width: 'fit-content' }}>
                                                <div className={`small text-secondary mb-1 ${contentClass}`} title={row.ClientName}>
                                                    {row.ClientName || '-'}
                                                </div>
                                            </div>
                                            <div {...hoverEvents('Consultant')} style={{ width: 'fit-content' }}>
                                                <div className={`small text-muted ${contentClass}`} title={row.ConsultantName}>
                                                    {row.ConsultantName || '-'}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Column 4: Enquiry Details */}
                                        <td className="p-2" style={cellStyle}>
                                            <div className={`text-secondary ${contentClass}`} style={!isExpanded ? { maxHeight: '60px', overflow: 'hidden' } : {}}>
                                                {row.EnquiryDetails || '-'}
                                            </div>
                                        </td>

                                        {/* Column 5: Site Visit */}
                                        <td className="p-2" style={cellStyle}>
                                            {row.SiteVisitDate ? (
                                                <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 fw-normal d-inline-flex align-items-center gap-1" style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                                    <Calendar size={12} />
                                                    {formatDate(row.SiteVisitDate)}
                                                </span>
                                            ) : '-'}
                                        </td>

                                        {/* Column 6: Remarks */}
                                        <td className="p-2" style={cellStyle}>
                                            <span className="badge bg-light text-dark border rounded-pill fw-normal d-inline-flex align-items-center gap-1 px-2">
                                                {row.Status === 'Closed' ? <div className="rounded-circle bg-success" style={{ width: 6, height: 6 }} /> :
                                                    <div className="rounded-circle bg-warning" style={{ width: 6, height: 6 }} />}
                                                {row.Status || 'Open'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan="6" className="text-center py-5 text-muted">
                                    <div className="py-2">No records found</div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div >
        </div >
    );
};

export default EnquiryTable;
