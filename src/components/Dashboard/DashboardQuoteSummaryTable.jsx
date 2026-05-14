import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { EMS_TABLE_HEADER_GRADIENT } from '../../constants/emsTheme';

/** Rollup key from API for colour + label (aligned with QuoteForm). */
function normalizeListQuoteRollupKey(raw) {
    let s = String(raw || '').trim();
    if (s === 'All Quoted' || s === 'Partial Quoted' || s === 'None Quoted') return s;
    const base = s.replace(/\s*\([^)]*\)\s*$/g, '').trim();
    if (base === 'All Quoted' || base === 'Partial Quoted' || base === 'None Quoted') return base;
    return 'None Quoted';
}

function formatListQuoteRollupStatusTwoLines(raw) {
    const key = normalizeListQuoteRollupKey(raw);
    const tail = 'for Ownjob';
    if (key === 'None Quoted') return { line1: 'None Quoted', line2: tail };
    if (key === 'Partial Quoted') return { line1: 'Partial Quoted', line2: tail };
    if (key === 'All Quoted') return { line1: 'All Quoted', line2: tail };
    return { line1: 'None Quoted', line2: tail };
}

function listQuoteRollupStatusColor(raw) {
    const k = normalizeListQuoteRollupKey(raw);
    if (k === 'All Quoted') return '#047857';
    if (k === 'Partial Quoted') return '#b45309';
    return '#64748b';
}

/** Count quote lines shown in the “To Customer and Quote details” column for one row. */
function countQuoteLinesInRow(enq) {
    if (!enq) return 0;
    if (Array.isArray(enq.ListQuoteDetailLines) && enq.ListQuoteDetailLines.length > 0) {
        return enq.ListQuoteDetailLines.length;
    }
    if (Array.isArray(enq.ListMultiLeadQuoteRefs) && enq.ListMultiLeadQuoteRefs.length > 0) {
        return enq.ListMultiLeadQuoteRefs.length;
    }
    if (String(enq.ListQuoteRef || '').trim()) return 1;
    return 0;
}

function localYmdFromRawDate(raw) {
    const dt = raw instanceof Date ? raw : raw ? new Date(raw) : null;
    if (!dt || Number.isNaN(dt.getTime())) return null;
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Matches server `fmtRowDetailDate` tail on `textLine` when `quoteDate` is absent (older payloads). */
function parseQuoteYmdFromDetailTextLine(textLine) {
    const tl = String(textLine || '');
    if (/\(Not Quoted\)/i.test(tl)) return null;
    const m = tl.match(/- (\d{2})-([A-Za-z]{3})-(\d{4})\)\s*$/);
    if (!m) return null;
    const monMap = {
        Jan: 0,
        Feb: 1,
        Mar: 2,
        Apr: 3,
        May: 4,
        Jun: 5,
        Jul: 6,
        Aug: 7,
        Sep: 8,
        Oct: 9,
        Nov: 10,
        Dec: 11,
    };
    const dd = Number(m[1]);
    const mo = monMap[m[2]];
    const yyyy = Number(m[3]);
    if (mo === undefined || !yyyy) return null;
    const dt = new Date(yyyy, mo, dd);
    return localYmdFromRawDate(dt);
}

function quoteYmdFromDetailLine(ln) {
    const qd = ln?.quoteDate ?? ln?.QuoteDate;
    if (qd != null && qd !== '') {
        const y = localYmdFromRawDate(qd);
        if (y) return y;
    }
    return parseQuoteYmdFromDetailTextLine(ln?.textLine);
}

function quoteYmdInScope(ymd, scope) {
    if (!ymd || !scope) return false;
    if (scope.day) return ymd === scope.day;
    if (scope.from && scope.to) return ymd >= scope.from && ymd <= scope.to;
    return false;
}

/** When `scope` is null, same as `countQuoteLinesInRow`; otherwise only lines whose quote date lies in scope. */
function countQuoteLinesInRowForScope(enq, scope) {
    if (!enq) return 0;
    if (!scope) return countQuoteLinesInRow(enq);

    if (Array.isArray(enq.ListQuoteDetailLines) && enq.ListQuoteDetailLines.length > 0) {
        return enq.ListQuoteDetailLines.reduce((n, ln) => n + (quoteYmdInScope(quoteYmdFromDetailLine(ln), scope) ? 1 : 0), 0);
    }
    if (Array.isArray(enq.ListMultiLeadQuoteRefs) && enq.ListMultiLeadQuoteRefs.length > 0) {
        return enq.ListMultiLeadQuoteRefs.reduce(
            (n, line) => n + (quoteYmdInScope(localYmdFromRawDate(line.quoteDate ?? line.QuoteDate), scope) ? 1 : 0),
            0,
        );
    }
    if (String(enq.ListQuoteRef || '').trim()) {
        return quoteYmdInScope(localYmdFromRawDate(enq.ListQuoteDate), scope) ? 1 : 0;
    }
    return 0;
}

/**
 * Quote module summary grid (same columns / cell layout as QuoteForm pending/search list).
 */
export default function DashboardQuoteSummaryTable({
    rows,
    onOpenEnquiry,
    emptyLabel = 'No results.',
    quoteDateScope = null,
    /** When set, Total quotes matches dashboard calendar (COUNT EnquiryQuotes in scope). */
    calendarAlignedQuoteTotal = null,
}) {
    const [sortConfig, setSortConfig] = useState({ field: 'DueDate', direction: 'asc' });

    const sortedRows = useMemo(() => {
        const list = Array.isArray(rows) ? [...rows] : [];
        const { field, direction } = sortConfig;
        list.sort((a, b) => {
            let aVal = a[field];
            let bVal = b[field];
            if (field === 'DueDate' || field === 'EnquiryDate' || field === 'ListQuoteDate') {
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
        return list;
    }, [rows, sortConfig]);

    const headerStats = useMemo(() => {
        const list = Array.isArray(sortedRows) ? sortedRows : [];
        const reqSet = new Set();
        let quotes = 0;
        list.forEach((enq) => {
            const rn = String(enq?.RequestNo ?? '').trim();
            const qLines = countQuoteLinesInRowForScope(enq, quoteDateScope);
            if (quoteDateScope) {
                if (qLines > 0 && rn) reqSet.add(rn);
                quotes += qLines;
            } else {
                if (rn) reqSet.add(rn);
                quotes += qLines;
            }
        });
        return { projects: reqSet.size, quotes };
    }, [sortedRows, quoteDateScope]);

    const displayQuoteTotal =
        typeof calendarAlignedQuoteTotal === 'number' && !Number.isNaN(calendarAlignedQuoteTotal)
            ? calendarAlignedQuoteTotal
            : headerStats.quotes;

    const sortField = sortConfig.field;
    const sortDir = sortConfig.direction;

    const renderQSH = (field, label, style = {}) => {
        const isActive = sortField === field;
        const isAsc = sortDir === 'asc';
        return (
            <th
                key={field}
                onClick={() =>
                    setSortConfig((prev) =>
                        prev.field === field
                            ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
                            : { field, direction: 'asc' },
                    )
                }
                style={{
                    padding: '6px 10px',
                    fontSize: '11.7px',
                    fontWeight: '400',
                    color: '#ffffff',
                    borderBottom: '1px solid rgba(210, 222, 255, 0.25)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    ...style,
                    textAlign: 'left',
                }}
            >
                {label}
                {isActive ? (isAsc ? ' ▲' : ' ▼') : <span style={{ color: '#cbd5e1' }}> ⇅</span>}
            </th>
        );
    };

    const quoteListColgroup = (
        <colgroup>
            <col style={{ width: '96px' }} />
            <col style={{ width: '220px' }} />
            <col />
            <col style={{ width: '110px' }} />
            <col style={{ minWidth: '260px', width: '260px' }} />
        </colgroup>
    );

    const quoteListTableFixed = {
        width: 'max-content',
        minWidth: '960px',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
    };

    const quoteListTdTransparent = { backgroundColor: 'transparent' };
    const quoteListRowHoverGrey = '#cbd5e1';
    const tdPad = '10px 12px';

    return (
        <div
            className="w-100 d-flex flex-column flex-grow-1"
            style={{
                background: 'white',
                borderRadius: '8px',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
            }}
        >
            {headerStats.projects > 0 ? (
                <div
                    className="flex-shrink-0 px-2 py-1 d-flex align-items-center justify-content-between gap-2 flex-wrap"
                    role="status"
                    aria-live="polite"
                    style={{ borderBottom: '1px solid #e2e8f0' }}
                >
                    <div className="d-flex align-items-center gap-3 flex-wrap">
                        <span className="small fw-semibold text-dark" style={{ letterSpacing: '0.02em' }}>
                            Total projects: <span className="text-primary">{headerStats.projects}</span>
                        </span>
                        <span className="small fw-semibold text-dark" style={{ letterSpacing: '0.02em' }}>
                            Total quotes: <span className="text-success">{displayQuoteTotal}</span>
                        </span>
                    </div>
                    <span
                        className="small text-muted"
                        style={{ fontSize: '10px' }}
                        title={
                            typeof calendarAlignedQuoteTotal === 'number'
                                ? 'Projects = unique enquiries in this list. Total quotes matches the calendar (each saved quote revision row in the date range).'
                                : quoteDateScope
                                  ? 'Projects = enquiries with at least one quote line in the selected quote-date range; quotes = those lines only.'
                                  : 'Projects = unique enquiry numbers; quotes = lines in quote details.'
                        }
                    >
                        Unique enquiries
                    </span>
                </div>
            ) : null}
            <div
                style={{
                    flex: 1,
                    minHeight: 0,
                    overflow: 'auto',
                    WebkitOverflowScrolling: 'touch',
                }}
            >
                <table style={quoteListTableFixed}>
                    {quoteListColgroup}
                    <thead
                        style={{
                            position: 'sticky',
                            top: 0,
                            zIndex: 2,
                            background: EMS_TABLE_HEADER_GRADIENT,
                            boxShadow: '0 1px 0 rgba(15, 23, 42, 0.12)',
                        }}
                    >
                        <tr>
                            {renderQSH('RequestNo', 'Enquiry No.', { width: '96px', borderTopLeftRadius: '8px' })}
                            {renderQSH('ProjectName', 'Project Name', { minWidth: '200px' })}
                            {renderQSH('ListQuoteRef', 'To Customer and Quote details', {
                                minWidth: 'max-content',
                                maxWidth: '72vw',
                                whiteSpace: 'normal',
                            })}
                            {renderQSH('DueDate', 'Due Date', { minWidth: '110px' })}
                            {renderQSH('ConsultantName', 'Consultant Name', { minWidth: '260px', borderTopRightRadius: '8px' })}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedRows.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-muted text-center py-3 small">
                                    {emptyLabel}
                                </td>
                            </tr>
                        ) : (
                            sortedRows.map((enq, idx) => {
                                const zebraBg = idx % 2 === 0 ? '#ffffff' : '#f1f5f9';
                                const statusLines = formatListQuoteRollupStatusTwoLines(enq.ListQuoteRollupStatus);
                                const statusColor = listQuoteRollupStatusColor(enq.ListQuoteRollupStatus);
                                const reqNo = String(enq.RequestNo ?? '').trim();
                                return (
                                    <tr
                                        key={
                                            enq.QuoteListKind
                                                ? `${enq.RequestNo}-${enq.QuoteListKind}`
                                                : `${String(enq.RequestNo ?? 'r')}-${
                                                      Array.isArray(enq.ListMergedPendingPvIds)
                                                          ? enq.ListMergedPendingPvIds.join('-')
                                                          : String(enq.ListPendingPvId ?? enq.listpendingpvid ?? '').trim() ||
                                                            `row-${idx}`
                                                  }`
                                        }
                                        style={{
                                            borderBottom: '1px solid #e2e8f0',
                                            cursor: reqNo && onOpenEnquiry ? 'pointer' : 'default',
                                            transition: 'background-color 0.12s ease',
                                            backgroundColor: zebraBg,
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = quoteListRowHoverGrey;
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = zebraBg;
                                        }}
                                        onClick={() => {
                                            if (reqNo && onOpenEnquiry) onOpenEnquiry(reqNo);
                                        }}
                                    >
                                        <td
                                            style={{
                                                ...quoteListTdTransparent,
                                                padding: tdPad,
                                                fontSize: '11.7px',
                                                color: '#1e293b',
                                                fontWeight: '500',
                                                verticalAlign: 'top',
                                                whiteSpace: 'nowrap',
                                                textAlign: 'left',
                                            }}
                                        >
                                            <div>{enq.RequestNo}</div>
                                            <div
                                                style={{
                                                    marginTop: '6px',
                                                    fontSize: '8.8px',
                                                    fontWeight: 700,
                                                    letterSpacing: '0.02em',
                                                    color: statusColor,
                                                    whiteSpace: 'normal',
                                                    lineHeight: 1.25,
                                                }}
                                            >
                                                <div>{statusLines.line1}</div>
                                                <div>{statusLines.line2}</div>
                                            </div>
                                        </td>
                                        <td
                                            style={{
                                                ...quoteListTdTransparent,
                                                padding: tdPad,
                                                fontSize: '11.2px',
                                                color: '#64748b',
                                                verticalAlign: 'top',
                                                minWidth: '234px',
                                                whiteSpace: 'nowrap',
                                                textAlign: 'left',
                                            }}
                                        >
                                            {enq.ProjectName || '-'}
                                        </td>
                                        <td
                                            style={{
                                                ...quoteListTdTransparent,
                                                padding: tdPad,
                                                fontSize: '11px',
                                                color: '#64748b',
                                                verticalAlign: 'top',
                                                minWidth: 'max-content',
                                                maxWidth: '72vw',
                                                whiteSpace: 'normal',
                                                wordBreak: 'break-word',
                                                textAlign: 'left',
                                            }}
                                        >
                                            {(() => {
                                                const rowPreparedBy = String(enq.ListPreparedBy ?? enq.listpreparedby ?? '').trim();
                                                const fmtQuoteDate = (raw) => {
                                                    try {
                                                        const d = raw ? new Date(raw) : null;
                                                        return d && !Number.isNaN(d.getTime()) ? format(d, 'dd-MMM-yyyy') : '—';
                                                    } catch {
                                                        return '—';
                                                    }
                                                };
                                                const compactLineStyle = {
                                                    display: 'flex',
                                                    flexWrap: 'wrap',
                                                    alignItems: 'baseline',
                                                    justifyContent: 'flex-start',
                                                    gap: '6px',
                                                    fontSize: '11px',
                                                    lineHeight: 1.2,
                                                    color: '#334155',
                                                    textAlign: 'left',
                                                    width: '100%',
                                                };
                                                const refDateStyle = { fontSize: '11px', color: '#475569', wordBreak: 'break-word' };
                                                const bdStyle = {
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    color: '#166534',
                                                    whiteSpace: 'nowrap',
                                                    background: '#dcfce7',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                };
                                                const preparedByStyle = {
                                                    fontSize: '11px',
                                                    color: '#800000',
                                                    fontWeight: 500,
                                                    whiteSpace: 'normal',
                                                    wordBreak: 'break-word',
                                                };

                                                if (Array.isArray(enq.ListQuoteDetailLines) && enq.ListQuoteDetailLines.length > 0) {
                                                    return enq.ListQuoteDetailLines.map((ln, li) => {
                                                        const linePrep = String(ln.preparedBy ?? ln.PreparedBy ?? '').trim();
                                                        return (
                                                            <div key={`dl-${li}`} style={{ ...compactLineStyle, marginTop: li ? 4 : 0 }}>
                                                                <span style={refDateStyle}>{ln.textLine}</span>
                                                                {ln.bdTotal != null && ln.bdTotal > 0 ? (
                                                                    <span style={{ ...bdStyle, fontSize: '10px' }}>
                                                                        BD{' '}
                                                                        {Number(ln.bdTotal).toLocaleString(undefined, {
                                                                            minimumFractionDigits: 2,
                                                                            maximumFractionDigits: 2,
                                                                        })}
                                                                    </span>
                                                                ) : null}
                                                                {linePrep ? <span style={preparedByStyle}>{linePrep}</span> : null}
                                                            </div>
                                                        );
                                                    });
                                                }

                                                const toNameCell = String(enq.ListQuoteDetailToName ?? '').trim() || '—';
                                                if (Array.isArray(enq.ListMultiLeadQuoteRefs) && enq.ListMultiLeadQuoteRefs.length > 0) {
                                                    const joined = enq.ListMultiLeadQuoteRefs
                                                        .map((line) => `${toNameCell} (${line.quoteNumber} - ${fmtQuoteDate(line.quoteDate)})`)
                                                        .join(' · ');
                                                    const multiPrep = [
                                                        ...new Set(
                                                            enq.ListMultiLeadQuoteRefs.map((line) =>
                                                                String(line.preparedBy ?? line.PreparedBy ?? '').trim(),
                                                            ).filter(Boolean),
                                                        ),
                                                    ].join(' · ');
                                                    return (
                                                        <div style={compactLineStyle}>
                                                            <span style={refDateStyle}>{joined}</span>
                                                            {enq.ListQuoteUnderRefTotal != null && enq.ListQuoteUnderRefTotal > 0 ? (
                                                                <span style={bdStyle}>
                                                                    BD{' '}
                                                                    {Number(enq.ListQuoteUnderRefTotal).toLocaleString(undefined, {
                                                                        minimumFractionDigits: 2,
                                                                        maximumFractionDigits: 2,
                                                                    })}
                                                                </span>
                                                            ) : null}
                                                            {multiPrep ? (
                                                                <span style={preparedByStyle}>{multiPrep}</span>
                                                            ) : rowPreparedBy ? (
                                                                <span style={preparedByStyle}>{rowPreparedBy}</span>
                                                            ) : null}
                                                        </div>
                                                    );
                                                }
                                                if (enq.ListQuoteRef) {
                                                    return (
                                                        <div style={compactLineStyle}>
                                                            <span style={refDateStyle}>
                                                                {toNameCell} ({enq.ListQuoteRef} - {fmtQuoteDate(enq.ListQuoteDate)})
                                                            </span>
                                                            {enq.ListQuoteUnderRefTotal != null && enq.ListQuoteUnderRefTotal > 0 ? (
                                                                <span style={bdStyle}>
                                                                    BD{' '}
                                                                    {Number(enq.ListQuoteUnderRefTotal).toLocaleString(undefined, {
                                                                        minimumFractionDigits: 2,
                                                                        maximumFractionDigits: 2,
                                                                    })}
                                                                </span>
                                                            ) : null}
                                                            {rowPreparedBy ? <span style={preparedByStyle}>{rowPreparedBy}</span> : null}
                                                        </div>
                                                    );
                                                }
                                                return <div style={{ color: '#94a3b8', fontSize: '12px' }}>—</div>;
                                            })()}
                                        </td>
                                        <td
                                            style={{
                                                ...quoteListTdTransparent,
                                                padding: tdPad,
                                                fontSize: '11.2px',
                                                color: '#dc2626',
                                                fontWeight: '500',
                                                verticalAlign: 'top',
                                                minWidth: '110px',
                                                whiteSpace: 'nowrap',
                                                textAlign: 'left',
                                            }}
                                        >
                                            {enq.DueDate ? format(new Date(enq.DueDate), 'dd-MMM-yyyy') : '-'}
                                        </td>
                                        <td
                                            style={{
                                                ...quoteListTdTransparent,
                                                padding: tdPad,
                                                fontSize: '11.2px',
                                                color: '#64748b',
                                                verticalAlign: 'top',
                                                minWidth: '260px',
                                                maxWidth: '42vw',
                                                whiteSpace: 'normal',
                                                wordBreak: 'break-word',
                                                overflowWrap: 'anywhere',
                                                textAlign: 'left',
                                            }}
                                        >
                                            {enq.ConsultantName || enq.consultantName || '-'}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
