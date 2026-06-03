import React, { useMemo, useState, useEffect } from 'react';
import { format } from 'date-fns';
import { FilterX } from 'lucide-react';
import { EMS_TABLE_HEADER_GRADIENT } from '../../constants/emsTheme';
import {
    useTableColumnHeaderFilters,
    TableColumnFilterHeader,
} from '../shared/tableColumnHeaderFilters';
import '../../styles/emsTableColumnFilters.css';

/** Rollup key from API for colour + label (aligned with QuoteForm). */
function normalizeListQuoteRollupKey(raw) {
    let s = String(raw || '').trim();
    if (s === 'All Quoted' || s === 'Partial Quoted' || s === 'None Quoted') return s;
    const base = s.replace(/\s*\([^)]*\)\s*$/g, '').trim();
    if (base === 'All Quoted' || base === 'Partial Quoted' || base === 'None Quoted') return base;
    return 'None Quoted';
}

export function formatListQuoteRollupStatusTwoLines(raw) {
    const key = normalizeListQuoteRollupKey(raw);
    const tail = 'for Ownjob';
    if (key === 'None Quoted') return { line1: 'None Quoted', line2: tail };
    if (key === 'Partial Quoted') return { line1: 'Partial Quoted', line2: tail };
    if (key === 'All Quoted') return { line1: 'All Quoted', line2: tail };
    return { line1: 'None Quoted', line2: tail };
}

export function listQuoteRollupStatusColor(raw) {
    const k = normalizeListQuoteRollupKey(raw);
    if (k === 'All Quoted') return '#047857';
    if (k === 'Partial Quoted') return '#b45309';
    return '#64748b';
}

const QUOTE_LIST_FILTER_KEYS = ['requestNo', 'projectName', 'listQuoteDetails', 'dueDate', 'consultantName'];

function formatQuoteListDueDate(raw) {
    if (!raw) return '—';
    try {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return '—';
        return format(d, 'dd-MMM-yyyy');
    } catch {
        return '—';
    }
}

function getQuoteListFilterValue(row, key) {
    if (!row) return '—';
    switch (key) {
        case 'requestNo': {
            const st = formatListQuoteRollupStatusTwoLines(row.ListQuoteRollupStatus);
            const rn = String(row.RequestNo ?? '').trim() || '—';
            return `${rn} — ${st.line1}`;
        }
        case 'projectName':
            return String(row.ProjectName || '—').trim() || '—';
        case 'listQuoteDetails': {
            if (Array.isArray(row.ListQuoteDetailLines) && row.ListQuoteDetailLines.length > 0) {
                return row.ListQuoteDetailLines
                    .map((ln) => String(ln.textLine || '').trim())
                    .filter(Boolean)
                    .join(' | ') || '—';
            }
            if (Array.isArray(row.ListMultiLeadQuoteRefs) && row.ListMultiLeadQuoteRefs.length > 0) {
                return row.ListMultiLeadQuoteRefs
                    .map((line) => String(line.quoteNumber || '').trim())
                    .filter(Boolean)
                    .join(' | ') || '—';
            }
            const ref = String(row.ListQuoteRef || '').trim();
            const to = String(row.ListQuoteDetailToName || '').trim();
            if (ref || to) return [to, ref].filter(Boolean).join(' — ') || '—';
            return '—';
        }
        case 'dueDate':
            return formatQuoteListDueDate(row.DueDate);
        case 'consultantName':
            return String(row.ConsultantName || row.consultantName || '—').trim() || '—';
        default:
            return '—';
    }
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

function quoteRawDateToMs(raw) {
    if (raw == null || raw === '') return NaN;
    const dt = raw instanceof Date ? raw : new Date(raw);
    const t = dt.getTime();
    return Number.isFinite(t) ? t : NaN;
}

function ymdStringToMs(ymd) {
    if (!ymd) return NaN;
    const parts = String(ymd).split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return NaN;
    const t = new Date(parts[0], parts[1] - 1, parts[2]).getTime();
    return Number.isFinite(t) ? t : NaN;
}

function quoteLineToMs(ln) {
    const direct = quoteRawDateToMs(ln?.quoteDate ?? ln?.QuoteDate);
    if (Number.isFinite(direct)) return direct;
    return ymdStringToMs(quoteYmdFromDetailLine(ln));
}

/** Latest quote date on a row (max of all quote lines shown in the details column). */
export function getLatestQuoteDateMs(enq) {
    if (!enq) return NaN;
    let max = NaN;
    const bump = (ms) => {
        if (!Number.isFinite(ms)) return;
        max = Number.isFinite(max) ? Math.max(max, ms) : ms;
    };
    if (Array.isArray(enq.ListQuoteDetailLines) && enq.ListQuoteDetailLines.length > 0) {
        for (const ln of enq.ListQuoteDetailLines) bump(quoteLineToMs(ln));
        return max;
    }
    if (Array.isArray(enq.ListMultiLeadQuoteRefs) && enq.ListMultiLeadQuoteRefs.length > 0) {
        for (const line of enq.ListMultiLeadQuoteRefs) {
            bump(quoteRawDateToMs(line.quoteDate ?? line.QuoteDate));
        }
        return max;
    }
    if (String(enq.ListQuoteRef || '').trim()) {
        bump(quoteRawDateToMs(enq.ListQuoteDate));
    }
    return max;
}

function quoteYmdInScope(ymd, scope) {
    if (!ymd || !scope) return false;
    if (scope.day) return ymd === scope.day;
    if (scope.from && scope.to) return ymd >= scope.from && ymd <= scope.to;
    return false;
}

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
 * Quote module summary grid (Quote list + Dashboard quote-date popup).
 */
const DEFAULT_QUOTE_LIST_SORT = { field: 'DueDate', direction: 'asc' };

export default function DashboardQuoteSummaryTable({
    rows,
    onOpenEnquiry,
    emptyLabel = 'No results.',
    quoteDateScope = null,
    calendarAlignedQuoteTotal = null,
    onRegisterClearColumnFilters,
    onFilterStateChange,
    defaultSortConfig = null,
    resetSortOnRowsChange = false,
}) {
    const initialSort = defaultSortConfig || DEFAULT_QUOTE_LIST_SORT;
    const [sortConfig, setSortConfig] = useState(initialSort);

    useEffect(() => {
        if (defaultSortConfig) {
            if (resetSortOnRowsChange) {
                setSortConfig(defaultSortConfig);
            }
        } else {
            setSortConfig(DEFAULT_QUOTE_LIST_SORT);
        }
    }, [
        rows,
        resetSortOnRowsChange,
        defaultSortConfig?.field,
        defaultSortConfig?.direction,
    ]);

    const sortedRows = useMemo(() => {
        const list = Array.isArray(rows) ? [...rows] : [];
        const { field, direction } = sortConfig;
        list.sort((a, b) => {
            if (field === 'LatestQuoteDate') {
                const aMs = getLatestQuoteDateMs(a);
                const bMs = getLatestQuoteDateMs(b);
                const aOk = Number.isFinite(aMs);
                const bOk = Number.isFinite(bMs);
                if (!aOk && !bOk) return 0;
                if (!aOk) return 1;
                if (!bOk) return -1;
                if (aMs < bMs) return direction === 'asc' ? -1 : 1;
                if (aMs > bMs) return direction === 'asc' ? 1 : -1;
                return 0;
            }
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

    const colFilters = useTableColumnHeaderFilters(sortedRows, getQuoteListFilterValue, QUOTE_LIST_FILTER_KEYS);
    const displayRows = colFilters.filteredRows;

    useEffect(() => {
        if (typeof onRegisterClearColumnFilters === 'function') {
            onRegisterClearColumnFilters(colFilters.clearAllColumnFilters);
        }
    }, [colFilters.clearAllColumnFilters, onRegisterClearColumnFilters]);

    useEffect(() => {
        onFilterStateChange?.({ hasColumnFilters: colFilters.hasColumnFilters });
    }, [colFilters.hasColumnFilters, onFilterStateChange]);

    const headerStats = useMemo(() => {
        const list = Array.isArray(displayRows) ? displayRows : [];
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
    }, [displayRows, quoteDateScope]);

    const displayQuoteTotal =
        typeof calendarAlignedQuoteTotal === 'number' && !Number.isNaN(calendarAlignedQuoteTotal)
            ? calendarAlignedQuoteTotal
            : headerStats.quotes;

    const handleSort = (field, initialDirection = 'asc') => {
        setSortConfig((prev) =>
            prev.field === field
                ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
                : { field, direction: initialDirection },
        );
    };

    const pricingListThBase = {
        padding: '6px 10px',
        textAlign: 'left',
        fontSize: '11.7px',
        fontWeight: '400',
        color: '#ffffff',
        borderBottom: '1px solid rgba(210, 222, 255, 0.25)',
        whiteSpace: 'nowrap',
        background: EMS_TABLE_HEADER_GRADIENT,
        top: 0,
        zIndex: 2,
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

    const showSummaryBar =
        headerStats.projects > 0 || colFilters.hasColumnFilters || (Array.isArray(rows) && rows.length > 0);

    return (
        <div
            className="ems-cf-scope w-100 d-flex flex-column flex-grow-1"
            style={{
                background: 'white',
                borderRadius: '8px',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
            }}
        >
            {showSummaryBar ? (
                <div
                    className="flex-shrink-0 px-2 py-1 d-flex align-items-center justify-content-between gap-2 flex-wrap"
                    role="status"
                    aria-live="polite"
                    style={{ borderBottom: '1px solid #e2e8f0' }}
                >
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                        <span className="small fw-semibold text-dark d-inline-flex align-items-center gap-1" style={{ letterSpacing: '0.02em' }}>
                            <span>
                                Total projects: <span className="text-primary">{headerStats.projects}</span>
                            </span>
                            {headerStats.projects > 0 ? (
                                <button
                                    type="button"
                                    className="ems-cf-clear-filters-btn"
                                    onClick={colFilters.clearAllColumnFilters}
                                    disabled={!colFilters.hasColumnFilters}
                                    title="Clear all column filters"
                                    aria-label="Clear all column filters"
                                >
                                    <FilterX size={13} strokeWidth={2} aria-hidden="true" />
                                </button>
                            ) : null}
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
                            <TableColumnFilterHeader
                                colKey="requestNo"
                                label="Enquiry No."
                                sortField="RequestNo"
                                sortConfig={sortConfig}
                                onSort={handleSort}
                                filterCtx={colFilters}
                                thStyle={{ ...pricingListThBase, width: '96px', borderTopLeftRadius: '8px' }}
                            />
                            <TableColumnFilterHeader
                                colKey="projectName"
                                label="Project Name"
                                sortField="ProjectName"
                                sortConfig={sortConfig}
                                onSort={handleSort}
                                filterCtx={colFilters}
                                thStyle={{ ...pricingListThBase, minWidth: '200px' }}
                            />
                            <TableColumnFilterHeader
                                colKey="listQuoteDetails"
                                label="To Customer and Quote details"
                                sortField="LatestQuoteDate"
                                sortConfig={sortConfig}
                                onSort={handleSort}
                                initialDirection="desc"
                                filterCtx={colFilters}
                                thStyle={{
                                    ...pricingListThBase,
                                    minWidth: 'max-content',
                                    maxWidth: '72vw',
                                    whiteSpace: 'normal',
                                }}
                            />
                            <TableColumnFilterHeader
                                colKey="dueDate"
                                label="Due Date"
                                sortField="DueDate"
                                sortConfig={sortConfig}
                                onSort={handleSort}
                                filterCtx={colFilters}
                                thStyle={{ ...pricingListThBase, minWidth: '110px' }}
                            />
                            <TableColumnFilterHeader
                                colKey="consultantName"
                                label="Consultant Name"
                                sortField="ConsultantName"
                                sortConfig={sortConfig}
                                onSort={handleSort}
                                filterCtx={colFilters}
                                thStyle={{ ...pricingListThBase, minWidth: '260px', borderTopRightRadius: '8px' }}
                            />
                        </tr>
                    </thead>
                    <tbody>
                        {displayRows.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-muted text-center py-3 small">
                                    {emptyLabel}
                                </td>
                            </tr>
                        ) : (
                            displayRows.map((enq, idx) => {
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
                                            if (reqNo && onOpenEnquiry) onOpenEnquiry(enq);
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
                                                const fmtQuoteDate = (raw) => formatQuoteListDueDate(raw);
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
