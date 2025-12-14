import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

const EnquiryTable = ({ data, onRowClick, filters, setFilters, selectedDate }) => {

    // Helper to format date: DD - MMM - YY
    const formatDate = (dateStr) => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        const day = String(d.getDate()).padStart(2, '0');
        const month = d.toLocaleString('default', { month: 'short' });
        const year = String(d.getFullYear()).slice(-2);
        return `${day} - ${month} - ${year}`;
    };

    const [expandedRows, setExpandedRows] = useState(new Set());

    const toggleRow = (e, id) => {
        e.stopPropagation();
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div className="d-flex flex-column h-100 bg-white rounded shadow-sm overflow-hidden" style={{ minHeight: 0 }}>
            {/* Header / Table Filters */}
            <div className="p-3 border-bottom d-flex align-items-center justify-content-between bg-white sticky-top" style={{ zIndex: 10 }}>
                <div>
                    <h6 className="fw-bold mb-0 text-dark">Enquiries</h6>
                    {selectedDate ? (
                        <div className="small text-muted mt-1">
                            Filtered by Date: <span className="fw-bold text-dark">{formatDate(selectedDate)}</span>
                            <span
                                className="badge rounded-pill bg-primary bg-opacity-10 text-primary border border-primary border-opacity-10 ms-2"
                                style={{ cursor: 'pointer' }}
                                onClick={() => setFilters({ ...filters, date: null, mode: 'all', fromDate: '', toDate: '' })}
                            >
                                Clear Date
                            </span>
                        </div>
                    ) : (
                        <div className="small text-muted mt-1">Showing upcoming dues & site visits</div>
                    )}
                </div>

                {/* Filters (Only if no specific calendar date selected) */}
                {!selectedDate && (
                    <div className="d-flex align-items-center gap-2 flex-wrap justify-content-end">
                        <div className="d-flex align-items-center gap-1 bg-light p-1 rounded">
                            <input
                                type="date"
                                className="form-control form-control-sm border-0 bg-transparent"
                                style={{ width: '130px', fontSize: '0.8rem' }}
                                value={filters.fromDate || ''}
                                onChange={(e) => setFilters(prev => ({ ...prev, fromDate: e.target.value, mode: '' }))}
                            />
                            <span className="text-muted small">-</span>
                            <input
                                type="date"
                                className="form-control form-control-sm border-0 bg-transparent"
                                style={{ width: '130px', fontSize: '0.8rem' }}
                                value={filters.toDate || ''}
                                onChange={(e) => setFilters(prev => ({ ...prev, toDate: e.target.value, mode: '' }))}
                            />
                        </div>

                        <div className="btn-group btn-group-sm bg-light p-1 rounded" role="group">
                            {['today', 'all'].map(mode => (
                                <button
                                    key={mode}
                                    type="button"
                                    className={`btn btn-sm rounded-pill px-3 fw-bold text-capitalize ${filters.mode === mode && !filters.fromDate ? 'bg-white shadow-sm text-primary' : 'text-muted border-0'}`}
                                    onClick={() => setFilters(prev => ({ ...prev, mode: mode, fromDate: '', toDate: '' }))}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>

                        {(filters.fromDate || filters.toDate || filters.mode !== 'all') && (
                            <span
                                className="badge rounded-pill bg-danger bg-opacity-10 text-danger border border-danger border-opacity-10 ms-2"
                                style={{ cursor: 'pointer' }}
                                onClick={() => setFilters({ ...filters, date: null, mode: 'all', fromDate: '', toDate: '' })}
                                title="Reset all filters"
                            >
                                Clear
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Table Content */}
            <div className="flex-grow-1" style={{ overflow: 'auto', border: '1px solid #dee2e6' }}>
                <table className="table table-bordered table-hover mb-0" style={{ fontSize: '0.85rem', tableLayout: 'fixed', minWidth: '100%' }}>
                    <thead className="bg-light sticky-top" style={{ zIndex: 10, top: 0 }}>
                        <tr className="border-bottom">
                            <th className="p-2 text-dark fw-bold bg-light" style={{ width: '13%', minWidth: '130px', resize: 'horizontal', overflow: 'hidden', verticalAlign: 'top' }}>
                                Enquiry No <br /> Enquiry Date <br /> Due Date
                            </th>
                            <th className="p-2 text-dark fw-bold bg-light" style={{ width: '18%', minWidth: '160px', resize: 'horizontal', overflow: 'hidden', verticalAlign: 'top' }}>
                                Project Name <br /> Division <br /> Sales Engineer
                            </th>
                            <th className="p-2 text-dark fw-bold bg-light" style={{ width: '22%', minWidth: '180px', resize: 'horizontal', overflow: 'hidden', verticalAlign: 'top' }}>
                                Customer <br /> Received From <br /> Client <br /> Consultant
                            </th>
                            <th className="p-2 text-dark fw-bold bg-light" style={{ width: '25%', minWidth: '200px', resize: 'horizontal', overflow: 'hidden', verticalAlign: 'top' }}>
                                Enquiry Details
                            </th>
                            <th className="p-2 text-dark fw-bold bg-light" style={{ width: '10%', minWidth: '100px', resize: 'horizontal', overflow: 'hidden', verticalAlign: 'top' }}>
                                Site Visit Date
                            </th>
                            <th className="p-2 text-dark fw-bold bg-light" style={{ width: '12%', minWidth: '120px', resize: 'horizontal', overflow: 'hidden', verticalAlign: 'top' }}>
                                Remarks
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.length > 0 ? (
                            data.map((row, idx) => {
                                const isExpanded = expandedRows.has(row.RequestNo);
                                const contentClass = isExpanded ? "text-wrap text-break" : "text-truncate";
                                const cellStyle = isExpanded ? {} : { maxWidth: '0' }; // Use maxWidth 0 only when truncated to force ellipsis

                                return (
                                    <tr key={idx}
                                        onClick={() => onRowClick(row.RequestNo)}
                                        style={{ cursor: 'pointer', transition: 'none' }}
                                    >
                                        {/* Column 1: Enquiry No / Date / Due */}
                                        <td className="p-2 align-top" style={cellStyle}>
                                            <div className="d-flex align-items-center gap-1">
                                                <button
                                                    className="btn btn-sm btn-link p-0 text-muted text-decoration-none border-0"
                                                    onClick={(e) => toggleRow(e, row.RequestNo)}
                                                    style={{ width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title={isExpanded ? "Collapse" : "Expand"}
                                                >
                                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                </button>
                                                <div className={`badge rounded-pill bg-light text-dark border border-secondary border-opacity-25 fw-bold ${contentClass}`} title={!isExpanded ? row.RequestNo : ''}>
                                                    {row.RequestNo}
                                                </div>
                                            </div>
                                            <div className={`ps-4 ${contentClass}`} title={!isExpanded ? formatDate(row.EnquiryDate) : ''}>{formatDate(row.EnquiryDate)}</div>
                                            <div className={`ps-4 ${contentClass} ${new Date(row.DueDate) < new Date() ? 'text-danger fw-bold' : ''}`} title={!isExpanded ? formatDate(row.DueDate) : ''}>
                                                {formatDate(row.DueDate)}
                                            </div>
                                        </td>

                                        {/* Column 2: Project / Division / SE */}
                                        <td className="p-2 align-top" style={cellStyle}>
                                            <div className={`fw-bold ${contentClass}`} title={!isExpanded ? (row.ProjectName || '-') : ''}>{row.ProjectName || '-'}</div>
                                            <div className={contentClass} title={!isExpanded ? (row.EnquiryFor || '-') : ''}>{row.EnquiryFor || '-'}</div>
                                            <div className={contentClass} title={!isExpanded ? (row.ConcernedSE || '-') : ''}>{row.ConcernedSE || '-'}</div>
                                        </td>

                                        {/* Column 3: Parties - Separate lines for Customer, Recv, Client, Consultant */}
                                        <td className="p-2 align-top" style={cellStyle}>
                                            <div className={`fw-bold ${contentClass}`} title={!isExpanded ? (row.CustomerName || '-') : ''}>{row.CustomerName || '-'}</div>
                                            <div className={`text-secondary ${contentClass}`} title={!isExpanded ? (row.ReceivedFrom ? row.ReceivedFrom.split('|')[0] : '-') : ''}>{row.ReceivedFrom ? row.ReceivedFrom.split('|')[0] : '-'}</div>
                                            <div className={contentClass} title={!isExpanded ? (row.ClientName || '-') : ''}>{row.ClientName || '-'}</div>
                                            <div className={`text-muted ${contentClass}`} title={!isExpanded ? (row.ConsultantName || '-') : ''}>{row.ConsultantName || '-'}</div>
                                        </td>

                                        {/* Column 4: Enquiry Details */}
                                        <td className="p-2 align-top" style={cellStyle}>
                                            <div className={`text-secondary ${contentClass}`} style={isExpanded ? {} : { maxHeight: 'none', overflow: 'hidden' }} title={!isExpanded ? (row.EnquiryDetails || '-') : ''}>
                                                {row.EnquiryDetails || '-'}
                                            </div>
                                        </td>

                                        {/* Column 5: Site Visit Date */}
                                        <td className="p-2 align-top" style={cellStyle}>
                                            {row.SiteVisitDate ? (
                                                <div className={`fw-bold text-dark d-inline-block ${contentClass}`} title={!isExpanded ? formatDate(row.SiteVisitDate) : ''}>
                                                    {formatDate(row.SiteVisitDate)}
                                                </div>
                                            ) : '-'}
                                        </td>

                                        {/* Column 6: Remarks (Mapped to Status or empty) */}
                                        <td className="p-2 align-top" style={cellStyle}>
                                            <div className={contentClass} title={!isExpanded ? (row.Status || '-') : ''}>{row.Status || '-'}</div>
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
            </div>
        </div>
    );
};

export default EnquiryTable;
