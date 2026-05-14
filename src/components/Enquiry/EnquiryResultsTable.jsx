import React, { useMemo } from 'react';
import { getLeadJobDisplayLines } from '../../utils/leadJobDisplayLines';
import {
    formatEnquiryResultDate,
    getCustomerDisplayLines,
    getEnquiryTypeDisplay,
    getEnquiryDetailsDisplay,
    getSourceOfInfoDisplay,
} from '../../utils/enquiryResultsHelpers';
import { EMS_TABLE_HEADER_GRADIENT } from '../../constants/emsTheme';
import './EnquiryResultsTable.css';

/** Resolve enquiry id from list rows (API/client variants). */
export function getEnquiryRowRequestNo(row) {
    const v = row?.RequestNo ?? row?.requestNo;
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
}

/**
 * Search Enquiry–style results grid (shared with Search Enquiry page and Dashboard popup).
 */
const EnquiryResultsTable = ({
    sortedRows,
    sortConfig,
    onSort,
    masters,
    onRowOpen,
    emptyLabel = 'No results.',
    /** When set (e.g. dashboard Quote Date modal), show total quote lines next to project count. */
    headerQuotedTotal = null,
}) => {
    const SortIcon = ({ column }) => {
        if (sortConfig?.key !== column) return <i className="bi bi-arrow-down-up ms-1 text-muted" style={{ fontSize: '10px' }}></i>;
        return sortConfig.direction === 'asc'
            ? <i className="bi bi-arrow-up ms-1 text-primary"></i>
            : <i className="bi bi-arrow-down ms-1 text-primary"></i>;
    };

    /** Unique enquiries in the list (one row per enquiry counts once). */
    const distinctProjectCount = useMemo(() => {
        const keys = new Set();
        (sortedRows || []).forEach((row, idx) => {
            const no = getEnquiryRowRequestNo(row);
            if (no) keys.add(`e:${no}`);
            else {
                const pn = String(row?.ProjectName ?? '').trim();
                keys.add(pn ? `p:${pn.toLowerCase()}` : `row:${idx}`);
            }
        });
        return keys.size;
    }, [sortedRows]);

    const headerThStyle = {
        position: 'sticky',
        top: 0,
        zIndex: 2,
        background: EMS_TABLE_HEADER_GRADIENT,
        color: '#ffffff',
        textShadow: '0 1px 2px rgba(15, 23, 42, 0.38)',
        borderColor: 'rgba(210, 222, 255, 0.25)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.22), inset 0 -1px 0 rgba(15, 23, 42, 0.14)',
        fontSize: '11px',
        fontWeight: 400,
        paddingTop: '0.28rem',
        paddingBottom: '0.28rem',
        verticalAlign: 'middle',
    };

    return (
        <div className="enquiry-results-table-root w-100 d-flex flex-column flex-grow-1" style={{ minHeight: 0 }}>
            {distinctProjectCount > 0 ? (
                <div
                    className="enquiry-results-table-project-total flex-shrink-0 px-2 py-1 d-flex align-items-center justify-content-between gap-2 flex-wrap"
                    role="status"
                    aria-live="polite"
                >
                    <div className="d-flex align-items-center gap-3 flex-wrap">
                        <span className="small fw-semibold text-dark" style={{ letterSpacing: '0.02em' }}>
                            Total projects:{' '}
                            <span className="text-primary">{distinctProjectCount}</span>
                        </span>
                        {headerQuotedTotal != null && Number.isFinite(Number(headerQuotedTotal)) ? (
                            <span className="small fw-semibold text-dark" style={{ letterSpacing: '0.02em' }}>
                                Total quotes:{' '}
                                <span className="text-success">{Number(headerQuotedTotal)}</span>
                            </span>
                        ) : null}
                    </div>
                    <span className="small text-muted" style={{ fontSize: '10px' }} title="Each enquiry number counts once, even if multiple lines appear.">
                        Unique enquiries
                    </span>
                </div>
            ) : null}
            <div className="enquiry-search-table-wrap">
                <table
                    className="table table-sm table-hover align-middle"
                    style={{ fontSize: '11px', tableLayout: 'auto' }}
                >
                    <thead>
                        <tr>
                            <th style={headerThStyle}>Action</th>
                            <th className="sortable-header" style={headerThStyle} onClick={() => onSort('RequestNo')}>
                                <div className="header-content">Enquiry No. <SortIcon column="RequestNo" /></div>
                            </th>
                            <th className="sortable-header" style={headerThStyle} onClick={() => onSort('EnquiryDate')}>
                                <div className="header-content">Enquiry Date <SortIcon column="EnquiryDate" /></div>
                            </th>
                            <th className="sortable-header" style={headerThStyle} onClick={() => onSort('ProjectName')}>
                                <div className="header-content">Project <SortIcon column="ProjectName" /></div>
                            </th>
                            <th className="sortable-header" style={headerThStyle} onClick={() => onSort('SE')}>
                                <div className="header-content" style={{ alignItems: 'flex-start', whiteSpace: 'normal' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                                        <span style={{ fontWeight: 400 }}>Divisions</span>
                                        <span style={{ fontSize: '10px', opacity: 0.88 }}>SE/EE/TE/QS Involved</span>
                                    </div>
                                    <SortIcon column="SE" />
                                </div>
                            </th>
                            <th className="sortable-header" style={{ ...headerThStyle, maxWidth: '260px' }} onClick={() => onSort('EnquiryDetails')}>
                                <div className="header-content">Enquiry Details <SortIcon column="EnquiryDetails" /></div>
                            </th>
                            <th className="sortable-header" style={headerThStyle} onClick={() => onSort('Customer')}>
                                <div className="header-content">Customer Name / Contractor Name <SortIcon column="Customer" /></div>
                            </th>
                            <th className="sortable-header" onClick={() => onSort('DueOn')} style={headerThStyle}>
                                <div className="header-content">Due <SortIcon column="DueOn" /></div>
                            </th>
                            <th className="sortable-header text-nowrap" onClick={() => onSort('SiteVisitDate')} style={headerThStyle}>
                                <div className="header-content">Site visit date <SortIcon column="SiteVisitDate" /></div>
                            </th>
                            <th className="sortable-header" style={headerThStyle} onClick={() => onSort('ClientName')}>
                                <div className="header-content">Client <SortIcon column="ClientName" /></div>
                            </th>
                            <th className="sortable-header" style={headerThStyle} onClick={() => onSort('EnquiryType')}>
                                <div className="header-content">Enquiry Type <SortIcon column="EnquiryType" /></div>
                            </th>
                            <th className="sortable-header" style={headerThStyle} onClick={() => onSort('SourceOfInfo')}>
                                <div className="header-content">Source <SortIcon column="SourceOfInfo" /></div>
                            </th>
                            <th className="sortable-header" style={headerThStyle} onClick={() => onSort('Status')}>
                                <div className="header-content">Status <SortIcon column="Status" /></div>
                            </th>
                            <th className="sortable-header" style={headerThStyle} onClick={() => onSort('CreatedBy')}>
                                <div className="header-content">Created By <SortIcon column="CreatedBy" /></div>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedRows.length === 0 ? (
                            <tr><td colSpan="14" className="text-muted text-center">{emptyLabel}</td></tr>
                        ) : (
                            sortedRows.map((r, idx) => {
                                const jobLines = getLeadJobDisplayLines(r, { users: masters?.users });
                                const reqNo = getEnquiryRowRequestNo(r);
                                const canActivate = Boolean(reqNo && typeof onRowOpen === 'function');
                                const openThisRow = () => {
                                    if (canActivate) onRowOpen(reqNo);
                                };
                                const rowKey = reqNo || `row-${idx}`;
                                return (
                                    <tr
                                        key={`${rowKey}-${idx}`}
                                        className={canActivate ? 'enquiry-search-row-open' : ''}
                                        tabIndex={canActivate ? 0 : undefined}
                                        role={canActivate ? 'button' : undefined}
                                        title={canActivate ? (r._canEdit ? 'Open enquiry (edit)' : 'Open enquiry (view)') : undefined}
                                        onKeyDown={(e) => {
                                            if (!canActivate) return;
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                openThisRow();
                                            }
                                        }}
                                    >
                                        <td
                                            className="position-relative"
                                            onClick={openThisRow}
                                            style={{ cursor: canActivate ? 'pointer' : 'default' }}
                                        >
                                            <div
                                                aria-hidden
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    width: '24px',
                                                    height: '24px',
                                                    borderRadius: '5px',
                                                    transition: 'all 0.2s',
                                                    backgroundColor: r._canEdit ? 'rgba(13, 110, 253, 0.1)' : 'rgba(108, 117, 125, 0.1)',
                                                    color: r._canEdit ? '#0d6efd' : '#6c757d',
                                                }}
                                                className="action-icon-hover"
                                            >
                                                {r._canEdit ? (
                                                    <i className="bi bi-pencil-square" style={{ fontSize: '13px' }}></i>
                                                ) : (
                                                    <i className="bi bi-eye" style={{ fontSize: '13px' }}></i>
                                                )}
                                            </div>
                                        </td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{reqNo}</td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{formatEnquiryResultDate(r.EnquiryDate)}</td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{r.ProjectName}</td>
                                        <td style={{ verticalAlign: 'top', minWidth: '200px', cursor: canActivate ? 'pointer' : 'default' }} onClick={openThisRow}>
                                            {jobLines.map((ln, li) => {
                                                const sePart = ln.se ? ` (${ln.se})` : '';
                                                const isSub = ln.depth > 0;
                                                return (
                                                    <div
                                                        key={`jd-${r.RequestNo}-${li}`}
                                                        style={{
                                                            paddingLeft: isSub ? `${6 + (ln.depth - 1) * 10}px` : 0,
                                                            fontSize: 'calc(11px * 0.9)',
                                                            color: '#1e293b',
                                                            marginBottom: li < jobLines.length - 1 ? 4 : 0,
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        {isSub ? (
                                                            <span className="text-muted me-1" style={{ fontSize: 'calc(10px * 0.9)' }}>
                                                                {'--> '}
                                                            </span>
                                                        ) : null}
                                                        <span style={{ fontWeight: ln.depth === 0 ? 600 : 400 }}>{ln.label}</span>
                                                        {ln.se ? (
                                                            <span style={{ color: '#9f1239', fontWeight: 400, fontSize: '81%' }}>{sePart}</span>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}
                                        </td>
                                        <td
                                            style={{ verticalAlign: 'top', maxWidth: '260px', fontSize: '11px', whiteSpace: 'normal', wordBreak: 'break-word', cursor: canActivate ? 'pointer' : 'default' }}
                                            title={getEnquiryDetailsDisplay(r)}
                                            onClick={openThisRow}
                                        >
                                            {getEnquiryDetailsDisplay(r)}
                                        </td>
                                        <td style={{ verticalAlign: 'top', cursor: canActivate ? 'pointer' : 'default' }} onClick={openThisRow}>
                                            {getCustomerDisplayLines(r).map((name, i, arr) => (
                                                <div
                                                    key={`${r.RequestNo}-cust-${i}`}
                                                    style={{
                                                        lineHeight: 1.25,
                                                        marginBottom: i < arr.length - 1 ? 4 : 0,
                                                    }}
                                                >
                                                    {name}
                                                </div>
                                            ))}
                                        </td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{formatEnquiryResultDate(r.DueOn ?? r.DueDate)}</td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{formatEnquiryResultDate(r.SiteVisitDate)}</td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{r.ClientName}</td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{getEnquiryTypeDisplay(r)}</td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{getSourceOfInfoDisplay(r)}</td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{r.Status || 'Enquiry'}</td>
                                        <td onClick={openThisRow} style={{ cursor: canActivate ? 'pointer' : 'default' }}>{r.CreatedBy || '-'}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default EnquiryResultsTable;
