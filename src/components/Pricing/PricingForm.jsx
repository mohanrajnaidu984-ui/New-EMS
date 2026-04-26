import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, Trash2, Save, FileText, ChevronDown, ChevronUp, ChevronLeft, FileSpreadsheet, X } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import DateInput from '../Enquiry/DateInput';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

/** List mode: pending pricing work vs search (same UX pattern as Quote list) */
const PRICING_LIST_CATEGORY = {
    PENDING: 'pending',
    SEARCH: 'search',
};

/** Normalize EnquiryFor IDs from API (number vs string) for Set/hierarchy lookups */
const nid = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/** All job IDs under a lead root (inclusive), for the selected lead branch. */
function getPricingLeadSubtreeIds(rootId, allJobs) {
    const rootN = nid(rootId);
    if (rootN == null || !Array.isArray(allJobs)) return new Set();
    const set = new Set([rootN]);
    let changed = true;
    while (changed) {
        changed = false;
        allJobs.forEach((j) => {
            const pid = nid(j.parentId);
            const jid = nid(j.id);
            if (pid != null && jid != null && set.has(pid) && !set.has(jid)) {
                set.add(jid);
                changed = true;
            }
        });
    }
    return set;
}

/**
 * `EnquiryPricingValues.EnquiryForID` must belong to the current “Select Lead Job” tree (not another top-level lead).
 * e.g. a BMS row only under the HVAC lead root is excluded when viewing the Civil lead.
 */
function enquiryForIdInSelectedLeadSubtree(leadRootId, enquiryForId, allJobs) {
    if (leadRootId == null || enquiryForId == null || !allJobs || allJobs.length === 0) return true;
    const n = nid(enquiryForId);
    if (n == null) return true;
    return getPricingLeadSubtreeIds(leadRootId, allJobs).has(n);
}

const stripLForLeadName = (n) => (n || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();

/**
 * `EnquiryPricingValues.LeadJobName` is the lead under which the price was saved.
 * e.g. BMS=2 with LeadJobName=HVAC must not show on the Civil lead tree; Civil's own rows use LeadJobName=Civil.
 */
function valueRowLeadJobMatchesView(valueLeadName, selectedLeadRootItemName) {
    if (!selectedLeadRootItemName || !String(selectedLeadRootItemName).trim()) return true;
    if (!valueLeadName || !String(valueLeadName).trim()) return true;
    return (
        stripLForLeadName(valueLeadName).toLowerCase() === stripLForLeadName(selectedLeadRootItemName).toLowerCase()
    );
}

/**
 * Per-cell read: (EnquiryForID, OptionID) + customer + `LeadJobName` + full job-tree scope under the selected lead.
 */
function parsePriceFromRawValueRowsForCell(
    raw,
    jobId,
    optionId,
    selectedCustomer,
    selectedLeadRootItemName,
    valueScopeLeadId,
    allJobs
) {
    if (!raw || !raw.length) return null;
    let cands = raw.filter(
        (v) =>
            String(v.EnquiryForID ?? v.enquiryForId ?? '') === String(jobId) &&
            String(v.OptionID ?? v.optionID ?? '') === String(optionId)
    );
    if (valueScopeLeadId != null && allJobs && allJobs.length) {
        cands = cands.filter((v) =>
            enquiryForIdInSelectedLeadSubtree(
                valueScopeLeadId,
                v.EnquiryForID ?? v.enquiryForId,
                allJobs
            )
        );
    }
    cands = cands.filter((v) =>
        valueRowLeadJobMatchesView(v.LeadJobName ?? v.leadJobName, selectedLeadRootItemName)
    );
    if (cands.length === 0) return null;
    const sc = (String(selectedCustomer || '')).toLowerCase();
    const withCust = cands.find(
        (v) => (String(v.CustomerName ?? v.customerName ?? '').trim().toLowerCase() === sc)
    );
    const row = withCust || (cands.length === 1 ? cands[0] : null);
    if (!row) return null;
    const p = parseFloat(row.Price);
    return Number.isFinite(p) ? p : null;
}

/**
 * Reject a grouped/legacy row whose `EnquiryForID` does not match this cell’s job (same option name, different lead branch).
 */
function pricingValueRowEnquiryForMatchesJob(row, jobId) {
    if (!row) return false;
    const e = row.EnquiryForID ?? row.enquiryForId;
    if (e == null || e === '' || e === '0' || e === 0) return true;
    return String(e) === String(jobId);
}

/**
 * Every `EnquiryFor` id the user may persist pricing for (assigned jobs on **all** lead branches).
 * Used by Save All so e.g. both `L1 - BMS Project` and `L2 - BMS Project` save in one click.
 */
function resolveAllEditableJobIds({ jobs, myJobs, canEditAll }) {
    if (canEditAll || !Array.isArray(jobs) || !jobs.length) return new Set();
    const myJobsArr = Array.isArray(myJobs) ? myJobs : [];
    const out = new Set();
    for (const j of jobs) {
        if (!myJobsArr.includes(j.itemName)) continue;
        const id = nid(j.id);
        if (id != null) out.add(id);
    }
    return out;
}

/**
 * Single job row the user may edit (own department under this lead).
 * Lead owner → selected lead id; subjob user → shallowest assigned job under that lead.
 */
function resolveOwnJobAnchorId({ jobs, selectedLeadId, myJobs, canEditAll }) {
    if (canEditAll || !Array.isArray(jobs) || !jobs.length || !selectedLeadId) return null;
    const validIds = getPricingLeadSubtreeIds(selectedLeadId, jobs);
    if (!validIds.size) return null;
    const myJobsArr = Array.isArray(myJobs) ? myJobs : [];
    const editableInLeadTree = jobs.filter((j) => {
        const jid = nid(j.id);
        return jid != null && validIds.has(jid) && myJobsArr.includes(j.itemName);
    });
    if (!editableInLeadTree.length) return null;
    if (editableInLeadTree.some((j) => String(j.id) === String(selectedLeadId))) {
        return selectedLeadId;
    }
    const depthFromSelectedRoot = (job) => {
        let d = 0;
        let cur = job;
        const rootN = nid(selectedLeadId);
        while (cur && nid(cur.id) !== rootN) {
            d += 1;
            const pid = nid(cur.parentId);
            cur = pid != null ? jobs.find((p) => nid(p.id) === pid) : null;
        }
        return d;
    };
    editableInLeadTree.sort((a, b) => depthFromSelectedRoot(a) - depthFromSelectedRoot(b));
    return editableInLeadTree[0].id;
}

/** Root passes UI "lead" naming when any sibling uses L-prefixed display names — backend may use leadJobCode only */
const rootPassesLeadNaming = (j, anyRootHasLPrefixInName) => {
    if (!anyRootHasLPrefixInName) return true;
    const name = j.itemName || '';
    if (/^L\d+\s-\s/.test(name)) return true;
    const code = String(j.leadJobCode || j.LeadJobCode || '').trim();
    if (/^L\d+$/i.test(code)) return true;
    return false;
};

const isRootJob = (j) => {
    if (!j) return false;
    const p = j.parentId;
    return p == null || p === '' || p === 0 || p === '0';
};

/** Option IDs from SQL/JSON are often strings — needed for maxId / "newest row" logic */
const optIdNum = (id) => {
    if (id == null || id === '') return NaN;
    const n = Number(id);
    return Number.isFinite(n) ? n : NaN;
};

const stripJobItemPrefix = (n) => (n || '').replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();

/** Option row itemName vs EnquiryFor itemName (prefix / case drift) */
const sameEnquiryItemName = (optItem, jobItem) => {
    const o = (optItem || '').trim();
    const j = (jobItem || '').trim();
    if (!o || !j) return false;
    if (o === j) return true;
    return stripJobItemPrefix(o).toLowerCase() === stripJobItemPrefix(j).toLowerCase();
};

/** Stable map key for job id (number vs string) */
const jobKey = (id) => {
    const n = nid(id);
    return n != null ? String(n) : `k:${String(id)}`;
};

/** One row from getEnquiryPricingList `SubJobPrices` (`label|price|isoDate|level` joined by `;;`). */
function parseSubJobPriceRow(s, index) {
    const parts = String(s).split('|');
    return {
        key: `p-${index}`,
        name: parts[0] ?? '',
        rawPrice: parts[1] ?? '',
        rawDate: parts[2] ?? '',
        level: parseInt(parts[3], 10) || 0,
    };
}

/**
 * Pending / search list: "Customer Name & Total Price" vs "Individual & Subjob Base prices".
 * When any row is indented (level > 0), level-0 lines are treated as customer/total headers and deeper lines as subjob detail.
 * When all rows are level 0 (legacy flat list), show everything in the first column only.
 */
function splitSubJobPricesForListColumns(subJobPricesStr) {
    const rows = (subJobPricesStr || '')
        .split(';;')
        .filter(Boolean)
        .map(parseSubJobPriceRow);
    const hasIndented = rows.some((r) => r.level > 0);
    return {
        customerAndTotalRows: hasIndented ? rows.filter((r) => r.level === 0) : rows,
        individualRows: hasIndented ? rows.filter((r) => r.level > 0) : [],
    };
}

/** Department spec status from `getEnquiryPricingList` (Partial / None / All Priced). */
function pricingListSpecStatusMeta(enq) {
    const specStatus = enq?.UserSpecPricingSummaryStatus ?? enq?.userSpecPricingSummaryStatus;
    if (!specStatus) return null;
    const specStatusColor =
        specStatus === 'All Priced'
            ? '#16a34a'
            : specStatus === 'None Priced'
              ? '#dc2626'
              : specStatus === 'Partial Priced'
                ? '#ca8a04'
                : '#64748b';
    return { specStatus, specStatusColor };
}

function tryParsePricingListDisplay(enq) {
    const raw = enq?.PricingListDisplayJson ?? enq?.pricingListDisplayJson;
    if (!raw || typeof raw !== 'string') return null;
    try {
        const o = JSON.parse(raw);
        if (!o || !Array.isArray(o.customerTotals) || !Array.isArray(o.jobForest)) return null;
        return o;
    } catch {
        return null;
    }
}

/** Align with server `normPricingCustomerKey` on root labels — one block per customer + L# in column 4. */
function normPricingJobForestRootKey(label) {
    return String(label || '')
        .replace(/\s*\(L\d+\)\s*$/i, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function scorePricedJobNode(node) {
    if (!node) return 0;
    const p = Number(node.price);
    let s = node.hasPrice && Number.isFinite(p) && p > 0 ? 1 + p : 0;
    const kids = Array.isArray(node.children) ? node.children : [];
    for (const ch of kids) {
        s += scorePricedJobNode(ch);
    }
    return s;
}

function dedupePricingJobForestRoots(nodes) {
    if (!Array.isArray(nodes) || nodes.length < 2) return nodes;
    const rootKey = (n) => {
        const jid = String(n?.jobId ?? '').trim();
        const raw = String(n?.label || '').trim();
        const labelKey = raw ? normPricingJobForestRootKey(raw) : '';
        if (jid && jid !== 'undefined') return `${labelKey || 'job'}\t${jid}`;
        if (!raw) return `id:${String(n?.jobId ?? '')}`;
        return labelKey || `id:${String(n?.jobId ?? '')}`;
    };
    const best = new Map();
    for (const n of nodes) {
        const k = rootKey(n);
        const sc = scorePricedJobNode(n);
        const prev = best.get(k);
        if (!prev || sc > prev.sc) best.set(k, { node: n, sc });
    }
    const order = [];
    const seen = new Set();
    for (const n of nodes) {
        const k = rootKey(n);
        if (seen.has(k)) continue;
        seen.add(k);
        order.push(k);
    }
    return order.map((k) => best.get(k).node);
}

function PricingListCustomerTotalsFromJson({ items, priceFixedDecimals }) {
    if (!items || items.length === 0) {
        return <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>—</span>;
    }
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                minWidth: 'max-content',
            }}
        >
            {items.map((it, i) => {
                const total = Number(it.total);
                const has = Number.isFinite(total) && total > 0;
                let displayPrice = '';
                if (has) {
                    displayPrice =
                        priceFixedDecimals != null
                            ? total.toLocaleString('en-US', {
                                  minimumFractionDigits: priceFixedDecimals,
                                  maximumFractionDigits: priceFixedDecimals,
                              })
                            : total.toLocaleString(undefined, { minimumFractionDigits: 2 });
                }
                let displayDate = '';
                if (it.updatedAt) {
                    try {
                        displayDate = format(new Date(it.updatedAt), 'dd-MMM-yy hh:mm a');
                    } catch (e) {
                        console.error('Date parse error:', e);
                    }
                }
                return (
                    <div
                        key={`ct-${i}`}
                        style={{
                            fontSize: '11px',
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            flexWrap: 'nowrap',
                            gap: '8px',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <span style={{ fontWeight: '600', color: '#475569' }}>{String(it.label || '').trim()}:</span>
                        <span
                            style={{
                                color: has ? '#166534' : '#94a3b8',
                                fontStyle: has ? 'normal' : 'italic',
                                background: has ? '#dcfce7' : '#f1f5f9',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '10px',
                            }}
                        >
                            {has ? `BD ${displayPrice}` : 'Not Updated'}
                        </span>
                        {has && displayDate && (
                            <span style={{ color: '#94a3b8', fontSize: '10px' }}>({displayDate})</span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function PricingListJobForestFromJson({ nodes, priceFixedDecimals }) {
    const forestRoots = dedupePricingJobForestRoots(nodes);
    if (!forestRoots || forestRoots.length === 0) {
        return <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>—</span>;
    }

    const formatAmt = (n) => {
        const num = Number(n);
        if (!Number.isFinite(num)) return '';
        return priceFixedDecimals != null
            ? num.toLocaleString('en-US', {
                  minimumFractionDigits: priceFixedDecimals,
                  maximumFractionDigits: priceFixedDecimals,
              })
            : num.toLocaleString(undefined, { minimumFractionDigits: 2 });
    };

    const renderNode = (node, depth) => {
        const has = node.hasPrice && Number(node.price) > 0;
        let displayDate = '';
        if (node.updatedAt) {
            try {
                displayDate = format(new Date(node.updatedAt), 'dd-MMM-yy hh:mm a');
            } catch (e) {
                console.error('Date parse error:', e);
            }
        }
        const by = String(node.pricedBy ?? node.updatedBy ?? '').trim();
        const kids = Array.isArray(node.children) ? node.children : [];
        return (
            <div key={String(node.jobId)} style={{ marginBottom: '4px' }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        flexWrap: 'nowrap',
                        marginLeft: depth * 16,
                        fontSize: '11px',
                        whiteSpace: 'nowrap',
                        minWidth: 'max-content',
                    }}
                >
                    {depth > 0 && (
                        <span style={{ color: '#94a3b8', marginRight: '2px', fontSize: '10px', flexShrink: 0 }}>→</span>
                    )}
                    <span style={{ fontWeight: depth === 0 ? '600' : '500', color: '#475569', flexShrink: 0 }}>
                        {String(node.label || '').trim()}:
                    </span>
                    <span
                        style={{
                            color: has ? '#166534' : '#94a3b8',
                            marginLeft: '4px',
                            fontStyle: has ? 'normal' : 'italic',
                            background: has ? '#dcfce7' : '#f1f5f9',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            flexShrink: 0,
                        }}
                    >
                        {has ? `BD ${formatAmt(node.price)}` : 'Not Updated'}
                    </span>
                    {has && displayDate && (
                        <span
                            style={{
                                marginLeft: '6px',
                                color: '#94a3b8',
                                fontSize: '10px',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                            }}
                        >
                            ({displayDate})
                            {by ? (
                                <span style={{ color: '#800000', marginLeft: '6px', fontWeight: '500' }}>{by}</span>
                            ) : null}
                        </span>
                    )}
                </div>
                {kids.length > 0 ? <div style={{ marginTop: '2px' }}>{kids.map((ch) => renderNode(ch, depth + 1))}</div> : null}
            </div>
        );
    };

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: forestRoots.length > 1 ? '12px' : '0',
                minWidth: 'max-content',
            }}
        >
            {forestRoots.map((n, idx) => (
                <div key={`${String(n.jobId)}-${idx}`}>{renderNode(n, 0)}</div>
            ))}
        </div>
    );
}

function PricingListSubJobPriceLines({ rows, priceFixedDecimals }) {
    if (!rows || rows.length === 0) {
        return <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>—</span>;
    }
    const lines = rows.map((row, i) => {
        const { name, rawPrice, rawDate, level } = row;
        const isUpdated = rawPrice && rawPrice !== 'Not Updated' && parseFloat(rawPrice) > 0;

        let displayPrice = rawPrice;
        if (isUpdated) {
            const num = parseFloat(rawPrice);
            if (!isNaN(num)) {
                displayPrice =
                    priceFixedDecimals != null
                        ? num.toLocaleString('en-US', {
                              minimumFractionDigits: priceFixedDecimals,
                              maximumFractionDigits: priceFixedDecimals,
                          })
                        : num.toLocaleString(undefined, { minimumFractionDigits: 2 });
            }
        }

        let displayDate = '';
        if (rawDate) {
            try {
                displayDate = format(new Date(rawDate), 'dd-MMM-yy hh:mm a');
            } catch (e) {
                console.error('Date parse error:', e);
            }
        }

        return (
            <div
                key={row.key || `p-${i}`}
                style={{
                    fontSize: '11px',
                    marginBottom: '4px',
                    whiteSpace: 'nowrap',
                    marginLeft: `${level * 20}px`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    flexWrap: 'nowrap',
                    minWidth: 'max-content',
                }}
            >
                {level > 0 && <span style={{ color: '#94a3b8', marginRight: '2px', flexShrink: 0 }}>↳</span>}
                <span style={{ fontWeight: '600', color: '#475569', flexShrink: 0 }}>{name}:</span>
                <span
                    style={{
                        color: isUpdated ? '#166534' : '#94a3b8',
                        marginLeft: '4px',
                        fontStyle: isUpdated ? 'normal' : 'italic',
                        background: isUpdated ? '#dcfce7' : '#f1f5f9',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        flexShrink: 0,
                    }}
                >
                    {isUpdated ? `BD ${displayPrice}` : 'Not Updated'}
                </span>
                {isUpdated && displayDate && (
                    <span style={{ marginLeft: '6px', color: '#94a3b8', fontSize: '10px', flexShrink: 0 }}>({displayDate})</span>
                )}
            </div>
        );
    });
    return <>{lines}</>;
}

const PricingForm = () => {
    const { currentUser } = useAuth();

    /**
     * Email sent as `userEmail` on /api/pricing/* — same source as the header (session `currentUser`),
     * not `localStorage` `currentUserEmail`, so pending list matches what the user sees top-right.
     */
    const resolvePricingUserEmail = useCallback(() => {
        return (currentUser?.EmailId || currentUser?.email || currentUser?.MailId || '').trim();
    }, [currentUser?.EmailId, currentUser?.email, currentUser?.MailId]);


    // Search / list state (aligned with Quote list: category, criteria, enquiry date range)
    const [pricingListCategory, setPricingListCategory] = useState(PRICING_LIST_CATEGORY.PENDING);
    const [pricingListSearchCriteria, setPricingListSearchCriteria] = useState(() =>
        localStorage.getItem('pricing_listSearchCriteria') || localStorage.getItem('pricing_searchTerm') || ''
    );
    const [pricingListDateFrom, setPricingListDateFrom] = useState('');
    const [pricingListDateTo, setPricingListDateTo] = useState('');
    const [pricingSearchAttempted, setPricingSearchAttempted] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [pendingRequests, setPendingRequests] = useState([]); // Pending List State
    /** Start true so first paint does not flash "No pending items" before the initial fetch runs. */
    const [pendingListLoading, setPendingListLoading] = useState(true);
    const [pendingListError, setPendingListError] = useState(null);
    const [pendingSortConfig, setPendingSortConfig] = useState({ field: 'DueDate', direction: 'asc' }); // Default: soonest due date on top
    const searchRef = useRef(null);

    // Pricing state
    const [selectedEnquiry, setSelectedEnquiry] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [pricingData, setPricingData] = useState(null);
    const [values, setValues] = useState({});
    const [newOptionNames, setNewOptionNames] = useState({});
    const [focusedCell, setFocusedCell] = useState(null); // tracks which price input is focused

    // Customer state
    const [selectedCustomer, setSelectedCustomer] = useState(() => localStorage.getItem('pricing_selectedCustomer') || '');
    const [addingCustomer, setAddingCustomer] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState('');
    const [customerSuggestions, setCustomerSuggestions] = useState([]);
    const [selectedLeadId, setSelectedLeadId] = useState(() => {
        const saved = localStorage.getItem('pricing_selectedLeadId');
        return saved ? parseInt(saved) : null;
    });
    /** True after opening an enquiry from Pending / Search — list UI is hidden so the grid is its own screen. */
    const [pricingEditorStandalone, setPricingEditorStandalone] = useState(false);

    // --- SHARED HELPERS (Step 4522) ---
    const findLeadJobName = (jobOrItemName) => {
        if (!pricingData?.jobs) return null;
        let job = typeof jobOrItemName === 'object' ? jobOrItemName : pricingData.jobs.find(j => j.itemName === jobOrItemName);
        if (!job) return null;
        let current = job;
        let visited = new Set();
        while (current.parentId && current.parentId !== '0' && current.parentId !== 0 && !visited.has(current.id)) {
            visited.add(current.id);
            const parent = pricingData.jobs.find(j => j.id === current.parentId);
            if (!parent) break;
            current = parent;
        }
        // STEP LEAD JOB FIX: Prioritize Code for mentions (L1, L2 etc.)
        return current.leadJobCode || current.LeadJobCode || current.itemName;
    };

    // -- Persistence --
    useEffect(() => {
        localStorage.setItem('pricing_listSearchCriteria', pricingListSearchCriteria);
    }, [pricingListSearchCriteria]);

    useEffect(() => {
        localStorage.setItem('pricing_selectedCustomer', selectedCustomer);
    }, [selectedCustomer]);

    useEffect(() => {
        if (selectedLeadId) localStorage.setItem('pricing_selectedLeadId', selectedLeadId);
        else localStorage.removeItem('pricing_selectedLeadId');
    }, [selectedLeadId]);


    // Debounce timer
    const debounceRef = useRef(null);

    const refreshPendingRequests = useCallback(async () => {
        const userEmail = resolvePricingUserEmail();
        setPendingListError(null);
        if (!userEmail) {
            console.warn('[Pricing] No session email for pending list — currentUser.EmailId/email is empty; sign in again.');
            setPendingRequests([]);
            setPendingListError('No email on your session profile. Sign in again so pending pricing can load.');
            setPendingListLoading(false);
            return;
        }
        setPendingListLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/pricing/list/pending?userEmail=${encodeURIComponent(userEmail)}`);
            let data = null;
            try {
                data = await res.json();
            } catch {
                data = null;
            }
            if (!res.ok) {
                setPendingRequests([]);
                const msg =
                    data && typeof data.error === 'string'
                        ? data.error
                        : `Could not load pending pricing (${res.status}).`;
                setPendingListError(msg);
                return;
            }
            setPendingRequests(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Error fetching pending requests:', err);
            setPendingRequests([]);
            setPendingListError('Network error while loading pending pricing.');
        } finally {
            setPendingListLoading(false);
        }
    }, [resolvePricingUserEmail]);

    const closePricingEditor = useCallback(() => {
        setPricingEditorStandalone(false);
        setPricingData(null);
        setSelectedEnquiry(null);
        setSelectedLeadId(null);
        try {
            localStorage.removeItem('pricing_selectedLeadId');
        } catch {
            /* ignore */
        }
        refreshPendingRequests();
    }, [refreshPendingRequests]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);

        refreshPendingRequests();

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [currentUser, refreshPendingRequests]);



    // Suggestions while typing (Search Pricing mode only)
    const handlePricingListCriteriaInput = (value) => {
        setPricingListSearchCriteria(value);
        setSuggestions([]);
        if (!value.trim()) {
            setSearchResults([]);
            setPricingData(null);
        }

        if (pricingListCategory !== PRICING_LIST_CATEGORY.SEARCH) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        if (debounceRef.current) clearTimeout(debounceRef.current);

        const shouldSuggest = value.trim().length >= 1;

        if (shouldSuggest) {
            debounceRef.current = setTimeout(async () => {
                try {
                    const userEmail = resolvePricingUserEmail();
                    const res = await fetch(`${API_BASE}/api/pricing/list?search=${encodeURIComponent(value.trim())}&userEmail=${encodeURIComponent(userEmail)}&pendingOnly=false`);
                    if (res.ok) {
                        const data = await res.json();
                        setSuggestions(data.slice(0, 10));
                        setShowSuggestions(data.length > 0);
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

    const handleSelectSuggestion = (enq) => {
        setPricingListSearchCriteria(String(enq.RequestNo || ''));
        setSuggestions([]);
        setShowSuggestions(false);
        setSearchResults([enq]);
    };

    const handlePricingListSearch = async () => {
        if (pricingListCategory !== PRICING_LIST_CATEGORY.SEARCH) return;
        setPricingEditorStandalone(false);
        const q = pricingListSearchCriteria.trim();
        const df = (pricingListDateFrom || '').trim();
        const dt = (pricingListDateTo || '').trim();
        if (!q && !(df && dt)) {
            setSearchResults([]);
            setPricingSearchAttempted(false);
            return;
        }
        setPricingSearchAttempted(true);
        setShowSuggestions(false);
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }
        if (searching) return;
        setSearching(true);
        setPricingData(null);

        try {
            const userEmail = resolvePricingUserEmail();
            const params = new URLSearchParams();
            params.set('userEmail', userEmail);
            params.set('pendingOnly', 'false');
            if (q) params.set('search', q);
            if (df) params.set('dateFrom', df);
            if (dt) params.set('dateTo', dt);
            const res = await fetch(`${API_BASE}/api/pricing/list?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setSearchResults(Array.isArray(data) ? data : []);
                setSuggestions([]);
            } else {
                setSearchResults([]);
            }
        } catch (err) {
            console.error('Pricing list search error:', err);
            alert('Search failed. Please try again.');
            setSearchResults([]);
        } finally {
            setSearching(false);
        }
    };

    const handlePricingListClear = () => {
        setPricingEditorStandalone(false);
        setPricingListSearchCriteria('');
        setPricingListDateFrom('');
        setPricingListDateTo('');
        setSearchResults([]);
        setPricingListCategory(PRICING_LIST_CATEGORY.PENDING);
        setPricingSearchAttempted(false);
        setSuggestions([]);
        setShowSuggestions(false);
        setPricingData(null);
        setSelectedEnquiry(null);
        setValues({});
        setSelectedCustomer('');
        setAddingCustomer(false);
        setNewCustomerName('');
        refreshPendingRequests();
    };

    // Load pricing for selected enquiry
    const loadPricing = async (requestNo, customerName = null, preserveValues = null, loadOptions = null) => {
        const ignoreExistingLeadSelection = loadOptions?.ignoreExistingLeadSelection === true;
        setLoading(true);
        setSelectedEnquiry(requestNo);

        try {
            const userEmail = resolvePricingUserEmail();
            const url = `${API_BASE}/api/pricing/${encodeURIComponent(requestNo)}?userEmail=${encodeURIComponent(userEmail)}${customerName ? `&customerName=${encodeURIComponent(customerName)}` : ''}`;
            const res = await fetch(url);

            if (!res.ok) {
                const errData = await res.json();
                console.error('Failed to load pricing:', errData);
                if (res.status === 404) {
                    setPricingData({
                        enquiry: errData.enquiry || { RequestNo: requestNo },
                        jobs: [],
                        options: [],
                        values: [],
                        customers: [],
                        access: { canEditAll: false, visibleJobs: [], editableJobs: [], hasLeadAccess: false }
                    });
                } else {
                    setError(errData.error || 'Failed to load pricing');
                }
            } else {
                const data = await res.json();

                // SANITIZATION: Globally Trim Customer Names to prevent mismatch (Step 944)
                if (data.jobs) data.jobs.forEach(j => { if (j.itemName) j.itemName = j.itemName.trim(); });
                // Note: data.enquiry.customerName might be CSV, don't trim internal commas here, handled by split logic
                if (data.extraCustomers) data.extraCustomers = data.extraCustomers.map(c => c ? c.trim() : c);
                if (data.options) data.options.forEach(o => {
                    if (o.customerName) o.customerName = o.customerName.trim();
                    if (o.itemName) o.itemName = o.itemName.trim();
                    if (o.leadJobName) o.leadJobName = o.leadJobName.trim();
                });
                if (data.access && data.access.editableJobs) data.access.editableJobs = data.access.editableJobs.map(j => j ? j.trim() : j);
                if (data.access && data.access.visibleJobs) data.access.visibleJobs = data.access.visibleJobs.map(j => j ? j.trim() : j);

                if (import.meta.env.DEV) {
                    console.log('[Pricing loadPricing] requestNo', requestNo, 'jobs:', data.jobs?.length, data.jobs?.map((j) => ({
                        id: j.id,
                        itemName: j.itemName,
                        parentId: j.parentId,
                        visible: j.visible,
                        leadJobCode: j.leadJobCode || j.LeadJobCode,
                    })));
                    console.log('[Pricing loadPricing] access.visibleJobs', data.access?.visibleJobs?.length, data.access?.visibleJobs);
                    console.log('[Pricing loadPricing] options:', data.options?.length, 'activeCustomer values keys:', data.values && Object.keys(data.values).length, 'sample', data.values && Object.keys(data.values).slice(0, 8), 'allValues buckets:', data.allValues && Object.keys(data.allValues).length);
                }
                // NOTE: data.values Sanitization (Trim Customer/Lead)
                if (Array.isArray(data.values)) data.values.forEach(v => {
                    if (v.CustomerName) v.CustomerName = v.CustomerName.trim();
                    if (v.LeadJobName) v.LeadJobName = v.LeadJobName.trim();
                });

                // ---------------------------------------------------------
                // HIERARCHY LOGIC: Treat Parent Jobs as Customers
                // ---------------------------------------------------------
                const internalParentCustomers = [];
                if (data.jobs && data.access && data.access.editableJobs) {
                    data.access.editableJobs.forEach(jobName => {
                        const job = data.jobs.find(j => j.itemName === jobName);
                        if (job && job.parentId) {
                            const parent = data.jobs.find(p => p.id === job.parentId);
                            if (parent) {
                                // Clean the parent name (remove L1/L2 prefixes) to use as Customer Name
                                const cleanParent = parent.leadJobCode || parent.LeadJobCode || parent.itemName;
                                if (!internalParentCustomers.includes(cleanParent)) {
                                    internalParentCustomers.push(cleanParent);
                                }
                            }
                        }
                    });
                }

                // Add these internal customers to the main list immediately for display
                if (data.customers) {
                    internalParentCustomers.forEach(pc => {
                        if (!data.customers.includes(pc)) data.customers.push(pc);
                    });
                }
                // ---------------------------------------------------------

                // AUTO-PROVISION TABS (Pricing Sheets)
                // Ensure ALL linked customers (Main + Extra + Internal Parents) have pricing tabs.
                // Sync ALL unique options (e.g. "Base Price", "Option-1") across all customers to ensure consistency.
                const linkedCustomers = [
                    ...(data.enquiry?.customerName || '').split(','),
                    ...(data.extraCustomers || []).flatMap(c => (c || '').split(',')),
                    ...internalParentCustomers // Include internal parents
                ].map(s => s.trim())
                    .filter(s => s && s.length > 0 && s !== '(Not Assigned)')
                    .filter(s => {
                        // STRICT FILTER: Only include if explicitly in Master/Extra OR is an Internal Parent
                        const masterList = (data.enquiry.customerName || '').split(',').map(c => c.trim());
                        const isMaster = masterList.includes(s);
                        const isExtra = (data.extraCustomers || []).some(ec => (ec || '').split(',').map(c => c.trim()).includes(s));
                        const isInternal = internalParentCustomers.includes(s);
                        return isMaster || isExtra || isInternal;
                    });

                // Build a helper to find the lead job for a given job object or itemName context
                // A job is a lead job if it has no parentId (root job)
                const findLeadJobName = (jobOrItemName) => {
                    if (!data.jobs) return null;
                    let job = typeof jobOrItemName === 'object' ? jobOrItemName : data.jobs.find(j => j.itemName === jobOrItemName);
                    if (!job) return null;
                    // Walk up to root to find lead job
                    let current = job;
                    let visited = new Set();
                    while (current.parentId && !visited.has(current.id)) {
                        visited.add(current.id);
                        const parent = data.jobs.find(j => j.id === current.parentId);
                        if (!parent) break;
                        current = parent;
                    }
                    // current is now the root (lead) job
                    return current.itemName;
                };

                // Build expected (ItemName, OptionName) pairs per job from DB rows for that job only (+ Base Price).
                // A global union of every option name onto every job made deletes ineffective: deleting "38250" for
                // HVAC re-created it on reload because "38250" still existed for BMS in allUniqueNames.
                const uniqueOptions = [];
                const seenUo = new Set();

                if (data.jobs) {
                    data.jobs.forEach(j => {
                        const ljName = findLeadJobName(j);
                        const names = new Set(['Base Price']);
                        if (data.options) {
                            data.options.forEach((o) => {
                                if (!o || !o.name) return;
                                if (o.itemName && sameEnquiryItemName(o.itemName, j.itemName)) {
                                    names.add(o.name);
                                }
                            });
                        }

                        names.forEach(name => {
                            const key = `${j.itemName}|${name}|${ljName}`;
                            if (!seenUo.has(key)) {
                                seenUo.add(key);
                                uniqueOptions.push({
                                    itemName: j.itemName,
                                    name: name,
                                    leadJobName: ljName,
                                    enquiryForId: j.id // Added ID to disambiguate
                                });
                            }
                        });
                    });
                }

                // 2. Identify missing options for each Job/Option pair based on their NATURAL customer
                const optionsToCreate = [];
                uniqueOptions.forEach(uo => {
                    const job = data.jobs.find(j => j.id === uo.enquiryForId);
                    if (!job) return;

                    let targetCustomers = [];
                    if (job.parentId && job.parentId !== '0' && job.parentId !== 0) {
                        // Internal Sub-job: Only quote to parent
                        const parent = data.jobs.find(p => p.id === job.parentId);
                        if (parent) {
                            // Clean the parent name (remove L1/L2 prefixes) to use as Customer Name
                            const cleanParent = parent.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                            targetCustomers = [cleanParent];
                        }
                    } else {
                        // Root Lead Job: Quote to external clients
                        targetCustomers = linkedCustomers.filter(c => {
                            // Only include external clients (Master/Extra), not internal parents
                            const masterList = (data.enquiry.customerName || '').split(',').map(s => s.trim());
                            const isMaster = masterList.includes(c);
                            const isExtra = (data.extraCustomers || []).some(ec => (ec || '').split(',').map(s => s.trim()).includes(c));
                            return isMaster || isExtra;
                        });
                    }

                    targetCustomers.forEach(custName => {
                        const exists = data.options && data.options.some(o =>
                            o.customerName === custName &&
                            o.itemName === uo.itemName &&
                            o.name === uo.name &&
                            o.leadJobName === uo.leadJobName
                        );

                        if (!exists) {
                            optionsToCreate.push({
                                customerName: custName,
                                itemName: uo.itemName,
                                optionName: uo.name,
                                leadJobName: uo.leadJobName,
                                enquiryForId: uo.enquiryForId // Pass through to provisioning
                            });
                        }
                    });
                });

                // De-dupe payloads to reduce parallel race inserts
                const dedupeKey = (opt) => `${requestNo}__${opt.optionName}__${opt.itemName}__${opt.customerName || ''}__${opt.leadJobName || ''}`;
                const optionsToCreateDeduped = Array.from(
                    new Map(optionsToCreate.map(o => [dedupeKey(o), o])).values()
                );

                if (optionsToCreateDeduped.length > 0) {
                    // Start Provisioning
                    try {
                        // Track originating optionsToCreate entry so we can backfill from it
                        const promises = optionsToCreateDeduped.map((opt) => {
                            const payload = {
                                requestNo: requestNo,
                                optionName: opt.optionName,
                                itemName: opt.itemName,
                                enquiryForId: opt.enquiryForId,         // Pass ID to resolve correctly
                                customerName: opt.customerName,
                                leadJobName: opt.leadJobName || null   // ← include derived leadJobName
                            };
                            return fetch(`${API_BASE}/api/pricing/option`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            }).then(r => r.ok ? r.json().then(json => ({ json, srcOpt: opt })) : null);
                        });

                        const results = await Promise.all(promises);

                        // Update local data
                        if (!data.options) data.options = [];
                        if (!data.customers) data.customers = []; // Ensure initialized

                        results.forEach(item => {
                            if (!item || !item.json) return;
                            const res = item.json;   // { success, option: { ID, OptionName, ItemName, CustomerName, LeadJobName } }
                            const srcOpt = item.srcOpt;
                            // API returns the DB row nested under res.option
                            const optRow = res.option || res;
                            const realId = optRow.ID || optRow.id;
                            const realName = optRow.OptionName || optRow.optionName || srcOpt.optionName;
                            const realItem = optRow.ItemName || optRow.itemName || srcOpt.itemName;
                            const realCustomer = optRow.CustomerName || optRow.customerName || srcOpt.customerName;
                            const realLeadJob = optRow.LeadJobName || optRow.leadJobName || srcOpt.leadJobName;

                            if (realId) {
                                data.options.push({
                                    id: realId,
                                    name: realName,
                                    itemName: realItem,
                                    customerName: realCustomer,
                                    leadJobName: realLeadJob
                                });
                            }
                            // Add to active customers list if not already there
                            if (realCustomer && !data.customers.includes(realCustomer)) {
                                data.customers.push(realCustomer);
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

                // --- KEY MIGRATION & CUSTOMER GROUPING ---
                // Process Raw Array into Nested Map: [CustomerName][Key] = Value
                const groupedValues = {}; // { 'Nass': { '204_280': ... }, 'Ahmed': { ... } }

                // Create a Map of OptionID -> CustomerName for robust lookup
                const optionCustomerMap = {};
                if (data.options) {
                    data.options.forEach(o => {
                        if (o.id) optionCustomerMap[o.id] = o.customerName; // Assume Option's Customer is Truth
                    });
                }

                /** Unchanged server rows: strict (OptionID, EnquiryForID) is the only reliable key when
                 *  the same `itemName` appears in multiple lead branches. */
                const serverValuesSnapshot = Array.isArray(data.values)
                    ? data.values.map((r) => (r && typeof r === 'object' ? { ...r } : r))
                    : [];
                const rowCustomerFor = (v) =>
                    (optionCustomerMap[Number(v.OptionID ?? v.optionID)] || v.CustomerName || data.enquiry?.customerName || '')
                        .toString()
                        .trim();

                if (Array.isArray(data.values) && data.jobs) {
                    data.values.forEach(v => {
                        // FIX: Resolve Customer from Option Definition first (Defense against DB having NULL CustomerName on Values)
                        let rawCust = 'Main';
                        if (optionCustomerMap[v.OptionID]) {
                            rawCust = optionCustomerMap[v.OptionID];
                        } else {
                            // Fallback to Value's stored customer or Enquiry default
                            rawCust = v.CustomerName || data.enquiry.customerName || 'Main';
                        }

                        const cust = rawCust.trim(); // Ensure clean customer name match (Step 937)

                        if (!groupedValues[cust]) groupedValues[cust] = {};

                        // Derive Keys
                        // 1. Strict ID Key
                        if (v.EnquiryForID) {
                            const idKey = `${v.OptionID}_${v.EnquiryForID}`;
                            // Priority Logic: If key already exists, overwrite ONLY if this value is "Better Match"?
                            // Currently we partition by `cust` so collisions are rare within same customer bucket.
                            // BUT, if we have "Main" falling back into "Noorwood" bucket due to Option Map logic?
                            // No, `optionCustomerMap` forces it.

                            // Standard Assignment
                            groupedValues[cust][idKey] = v;
                        }

                        // 2. Name / Legacy Keys (Backfill) — only when EnquiryForID is missing. If we have a job ID,
                        // OptionID_EnquiryForID is already set; name-only keys collide when the same ItemName exists
                        // under different lead jobs (e.g. two "BMS Project" rows).
                        if (v.EnquiryForItem) {
                            const jobId = v.EnquiryForID;
                            const job = jobId ? data.jobs.find((j) => j.id == jobId) : null;

                            if (!jobId || !job) {
                                const nameKey = `${v.OptionID}_${v.EnquiryForItem}`;
                                groupedValues[cust][nameKey] = v;
                            }
                        }
                    });
                }

                // Store global map
                data.allValues = groupedValues;
                data.rawEnquiryPricingValues = serverValuesSnapshot;

                // Set active values for current view
                const activeCust = data.activeCustomer || (data.customers && data.customers[0]);
                data.values = groupedValues[activeCust] || {};



                // Deduplicate Options (Backend sometimes sends duplicates due to joins)
                if (data.options) {
                    const seen = new Set();
                    data.options = data.options.filter(o => {
                        const key = `${o.name}|${o.itemName}|${o.customerName}|${o.leadJobName}`;
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                }

                // Cleanup: Filter out malformed customer names (containing commas) from display
                if (data.customers) {
                    data.customers = data.customers.filter(c => c && typeof c === 'string' && !c.includes(','));

                    // STRICT DISPLAY FILTER: 
                    // Ensure displayed customers are ONLY those currently valid in Enquiry or Internal Parents
                    // This hides stale customers that might still exist in the options table
                    data.customers = data.customers.filter(s => {
                        const masterList = (data.enquiry?.customerName || '').split(',').map(c => c.trim());
                        const isMaster = masterList.includes(s);
                        const isExtra = (data.extraCustomers || []).some(ec => {
                            if (!ec || typeof ec !== 'string') return false;
                            return ec.split(',').map(c => c.trim()).includes(s);
                        });
                        const isInternal = (internalParentCustomers || []).includes(s);
                        return isMaster || isExtra || isInternal;
                    });
                }

                // ---------------------------------------------------------
                // VISIBILITY FILTER: Restrict Tabs based on User Scope
                // ---------------------------------------------------------
                // Rule: Users see a Customer Tab ONLY if:
                // 1. It is the Main Enquiry Customer.
                // 2. The Tab Name matches their own Job Name (Internal Customer).
                // 3. They have a Pricing Option (Row) explicitly assigned to their Job in that Tab.
                // 4. They are an Admin/Manager (canEditAll).

                // ---------------------------------------------------------
                // VISIBILITY FILTER: Strict Role-Based View
                // ---------------------------------------------------------
                // ---------------------------------------------------------
                // VISIBILITY FILTER: Dynamic filtering moved to useMemo (Step 1727)
                // ---------------------------------------------------------

                // ---------------------------------------------------------
                // ---------------------------------------------------------

                setPricingData(data);

                // Set selected customer (Ensure it's valid after filtering)
                let validCustomer = customerName;
                if (!validCustomer || validCustomer.includes(',') || !data.customers.includes(validCustomer)) {
                    validCustomer = data.activeCustomer;
                    if (!data.customers.includes(validCustomer)) {
                        validCustomer = data.customers[0] || '';
                    }
                }
                setSelectedCustomer(validCustomer);

                // Initialize state values using ID-based keys with Legacy Fallback
                const initialValues = {};
                // Pre-calculate Visible Set for Hybrid Aggregation
                // Logic MUST Match 'visibleJobs' calculation below:
                // Lead Job + Direct Children.
                const visibleIds = new Set();

                if (data.jobs && data.access && data.access.visibleJobs) {
                    data.access.visibleJobs.forEach(vName => {
                        const matches = data.jobs.filter((j) => (j.itemName || '').trim() === (vName || '').trim());
                        matches.forEach((vJob) => {
                            const idn = nid(vJob.id);
                            if (idn != null) visibleIds.add(idn);
                        });
                    });
                }

                if (data.options && data.jobs) {
                    /** Like `findLeadJobName` but use `data.jobs` from this response (not React state). */
                    const findLeadRootNameForData = (jobOrItem) => {
                        if (!data.jobs) return null;
                        let job =
                            typeof jobOrItem === 'object' ? jobOrItem : data.jobs.find((j) => (j.itemName || '').trim() === (jobOrItem || '').trim());
                        if (!job) return null;
                        let current = job;
                        const visited = new Set();
                        while (
                            current.parentId &&
                            String(current.parentId) !== '0' &&
                            current.parentId !== 0 &&
                            !visited.has(current.id)
                        ) {
                            visited.add(current.id);
                            const parent = data.jobs.find((j) => j.id === current.parentId);
                            if (!parent) break;
                            current = parent;
                        }
                        return current.leadJobCode || current.LeadJobCode || current.itemName;
                    };
                    const itemNameOcc = new Map();
                    data.jobs.forEach((j) => {
                        const n = (j.itemName || '').trim();
                        if (!n) return;
                        itemNameOcc.set(n, (itemNameOcc.get(n) || 0) + 1);
                    });
                    const isAmbiguousItemName = (n) => (itemNameOcc.get((n || '').trim()) || 0) > 1;

                    /** Same lead root the auto-select block will use, so load-time prices match the visible tree. */
                    let leadRootNameForValueFilter = null;
                    let valueScopeLeadId = null;
                    if (data.jobs) {
                        const isTreeVisibleByIdForInit = (jobId) => {
                            const j = data.jobs.find((x) => x.id == jobId);
                            if (!j) return false;
                            if (j.visible === true) return true;
                            const jn = nid(jobId);
                            const children = data.jobs.filter((c) => nid(c.parentId) === jn);
                            return children.some((c) => isTreeVisibleByIdForInit(c.id));
                        };
                        const anyRootHasLPrefixInName = data.jobs.some(
                            (j) => isRootJob(j) && /^L\d+\s-\s/.test(j.itemName || '')
                        );
                        const roots = data.jobs.filter(
                            (j) =>
                                isRootJob(j) &&
                                isTreeVisibleByIdForInit(j.id) &&
                                rootPassesLeadNaming(j, anyRootHasLPrefixInName)
                        );
                        if (roots.length > 0) {
                            const myJobs = (data.access && data.access.editableJobs) || [];
                            const myRoot = roots.find((r) => myJobs.includes(r.itemName));
                            const targetRoot = myRoot || roots[0];
                            let leadIdForInit;
                            if (loadOptions && loadOptions.useLeadIdForValueInit !== undefined) {
                                leadIdForInit = loadOptions.useLeadIdForValueInit;
                            } else if (ignoreExistingLeadSelection) {
                                leadIdForInit = null;
                            } else {
                                leadIdForInit = selectedLeadId;
                            }
                            const currentLeadValid =
                                leadIdForInit && roots.some((r) => Number(r.id) === Number(leadIdForInit));
                            const leadId = currentLeadValid ? leadIdForInit : targetRoot.id;
                            valueScopeLeadId = leadId;
                            const rj = data.jobs.find((j) => Number(j.id) === Number(leadId));
                            if (rj) leadRootNameForValueFilter = rj.itemName;
                        }
                    }

                    // Recursive Aggregation Logic
                    const getRecursivePrice = (rootOptionId, jobId, visited = new Set()) => {
                        if (visited.has(jobId)) return 0;
                        visited.add(jobId);

                        // Do not re-map OptionID using synthetic `options` metadata (it can be from a different
                        // lead branch for the same OptionID). The (opt, job) loop already selected this opt.id;
                        // EnquiryForID in EnquiryPricingValues is authoritative for the row.
                        const activeOptionId = rootOptionId;

                        const idKey = `${activeOptionId}_${jobId}`;
                        const rootOpt = data.options.find((o) => o.id === rootOptionId);
                        let selfPrice = 0;
                        let hasFoundPrice = false;

                        const job = data.jobs.find((j) => j.id === jobId);
                        const nameAmbiguous = job && isAmbiguousItemName(job.itemName);

                        const fromRawN = parsePriceFromRawValueRowsForCell(
                            data.rawEnquiryPricingValues,
                            jobId,
                            activeOptionId,
                            activeCust,
                            leadRootNameForValueFilter,
                            valueScopeLeadId,
                            data.jobs
                        );
                        if (fromRawN != null) {
                            selfPrice = fromRawN;
                            hasFoundPrice = true;
                        }

                        // 2. Grouped bucket (Allow 0 to be displayed)
                        if (!hasFoundPrice && data.values && data.values[idKey] && parseFloat(data.values[idKey].Price) >= 0) {
                            const gr = data.values[idKey];
                            const eidG = gr.EnquiryForID ?? gr.enquiryForId;
                            if (
                                eidG != null &&
                                String(eidG) !== '' &&
                                String(eidG) !== '0' &&
                                String(eidG) !== String(jobId)
                            ) {
                                /* id-keyed bucket row points at a different EnquiryFor — ignore */
                            } else if (
                                enquiryForIdInSelectedLeadSubtree(valueScopeLeadId, gr.EnquiryForID ?? jobId, data.jobs) &&
                                valueRowLeadJobMatchesView(gr.LeadJobName, leadRootNameForValueFilter)
                            ) {
                                selfPrice = parseFloat(gr.Price);
                                hasFoundPrice = true;
                            }
                        }
                        if (
                            !hasFoundPrice &&
                            job &&
                            !nameAmbiguous &&
                            enquiryForIdInSelectedLeadSubtree(valueScopeLeadId, jobId, data.jobs)
                        ) {
                            // Legacy name/clean — only if this ItemName is unique on the enquiry (else wrong branch)
                            const nameKey = `${activeOptionId}_${job.itemName}`;
                            if (data.values && data.values[nameKey] && parseFloat(data.values[nameKey].Price) >= 0) {
                                const nr = data.values[nameKey];
                                const ne = nr.EnquiryForID ?? nr.enquiryForId;
                                if (
                                    ne == null ||
                                    String(ne) === '' ||
                                    String(ne) === '0' ||
                                    String(ne) === String(jobId)
                                ) {
                                    selfPrice = parseFloat(nr.Price);
                                    hasFoundPrice = true;
                                }
                            } else {
                                const cleanName = job.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                                const cleanKey = `${activeOptionId}_${cleanName}`;
                                if (data.values && data.values[cleanKey] && parseFloat(data.values[cleanKey].Price) >= 0) {
                                    const cr = data.values[cleanKey];
                                    const ce = cr.EnquiryForID ?? cr.enquiryForId;
                                    if (
                                        ce == null ||
                                        String(ce) === '' ||
                                        String(ce) === '0' ||
                                        String(ce) === String(jobId)
                                    ) {
                                        selfPrice = parseFloat(cr.Price);
                                        hasFoundPrice = true;
                                    }
                                }
                            }

                            if ((!hasFoundPrice || selfPrice <= 0) && !nameAmbiguous && data.allValues) {
                                for (const custKey in data.allValues) {
                                    const custBucket = data.allValues[custKey];
                                    const peerOpt = data.options.find(
                                        (o) =>
                                            o.customerName === custKey &&
                                            o.name === rootOpt?.name &&
                                            o.itemName === job.itemName
                                    );
                                    if (peerOpt) {
                                        const peerKey = `${peerOpt.id}_${jobId}`;
                                        // Never fall back to `${opt}_${itemName}` — two branches can share the same name (e.g. BMS under Civil vs BMS under HVAC).
                                        const peerVal = custBucket[peerKey];
                                        if (peerVal && parseFloat(peerVal.Price) > 0) {
                                            selfPrice = parseFloat(peerVal.Price);
                                            hasFoundPrice = true;
                                            console.log(
                                                `[Pricing Persistence] PROMOTING price ${selfPrice} for job ${job.itemName} from bucket ${custKey} to current view`
                                            );
                                            break;
                                        }
                                    }
                                }
                            }
                        }

                        // 3. Sum Children (Pass the ORIGINAL Root Option Name logic down)
                        // DISABLED: User explicitly requested that parent jobs should ONLY show their net value 
                        // and NOT accumulate subjob values to prevent duplicated pricing (Step 1531).
                        /*
                        const children = data.jobs.filter(j => j.parentId === jobId);
                        let childrenSum = 0;
                        children.forEach(c => {
                            // Hybrid Aggregation: Only sum HIDDEN children. 
                            // If a child is part of the "Visible Jobs" list, it has its own input row, so we exclude it (Component Pricing model).
                            // But we need to know if it's visible. 
                            // data.jobs doesn't have 'visible' prop yet.
                            // We can use the 'targetJobs' logic or pass visible IDs.

                            // For Initial Load, we assume the standard visibility logic: 
                            // Lead Job + Direct Children (Level 1/2) are Visible.
                            // Since we don't have the View State calculated yet, we approximate:
                            // If Child is likely to be displayed (L2), skip it.

                            // Better: Calculate 'visibleIds' set first in loadPricing.
                            const cid = nid(c.id);
                            if (cid != null && visibleIds.has(cid)) {
                                return; // Skip Visible Child
                            }

                            // We pass rootOptionId again, let the next recursion resolve its own best ID
                            childrenSum += getRecursivePrice(rootOptionId, c.id, new Set(visited));
                        });
                        */

                        return selfPrice;
                    };


                    data.options.forEach(opt => {
                        data.jobs.forEach(job => {
                            // -------------------------------------------------------------
                            // STRICT MATCHING: Only process Job/Option pairs that belong together
                            // -------------------------------------------------------------
                            const jobLeadName = findLeadRootNameForData(job);
                            const optLeadName = opt.leadJobName;

                            // FIX (Step 1231): ONLY initialize values for the current customer tab.
                            // Broadly initializing all matching options caused saveAll to try and 
                            // update/duplicate records for external customers (like Ithbat) 
                            // while viewing internal tabs (like Civil Project).
                            if (opt.customerName !== activeCust) return;

                            let isMatch = false;
                            if (opt.itemName === job.itemName) {
                                // Name matches. Now check hierarchy context.
                                if (!optLeadName || !jobLeadName || optLeadName === jobLeadName) {
                                    isMatch = true;
                                }
                            } else if (opt.itemName === 'Lead Job' && !job.parentId) {
                                // Special handling for root-level 'Lead Job' options
                                if (!optLeadName || !jobLeadName || optLeadName === jobLeadName) {
                                    isMatch = true;
                                }
                            }
                            if (
                                !isMatch &&
                                isAmbiguousItemName(job.itemName) &&
                                (data.rawEnquiryPricingValues || []).some(
                                    (v) =>
                                        String(v.EnquiryForID ?? v.enquiryForId ?? '') === String(job.id) &&
                                        String(v.OptionID ?? v.optionID ?? '') === String(opt.id)
                                )
                            ) {
                                isMatch = true;
                            }

                            if (!isMatch) return;
                            // -------------------------------------------------------------

                            // Calculate Aggregated Price
                            const aggregatedPrice = getRecursivePrice(opt.id, job.id);

                            const exactKey = `${opt.id}_${job.id}`;
                            const hasNameLegacy =
                                !isAmbiguousItemName(job.itemName) && data.values && data.values[`${opt.id}_${job.itemName}`];
                            const hasExplicitRow =
                                data.values && (data.values[exactKey] || hasNameLegacy);
                            // Seed a value for every (opt,job) match so `...initialValues` wins over `...prev` and we clear a stale price from another lead/branch.
                            const shouldSeed =
                                aggregatedPrice > 0 || (aggregatedPrice === 0 && hasExplicitRow);
                            if (shouldSeed) {
                                initialValues[exactKey] = aggregatedPrice;
                            } else {
                                // Empty string: clear number in `prev` without showing a literal 0 for “never set”
                                initialValues[exactKey] = '';
                            }
                        });
                    });
                }

                // Drop value keys whose OptionID no longer exists (e.g. after DELETE); else `...prev` keeps stale cells.
                const validPricingOptionIds = new Set(
                    (data.options || []).map((o) => String(o.id)).filter((id) => id && id !== 'undefined')
                );
                const stripStaleValueKeys = (src = {}) =>
                    Object.fromEntries(
                        Object.entries(src).filter(([key]) => {
                            if (String(key).startsWith('simulated')) return true;
                            const optPart = String(key).split('_')[0];
                            if (!optPart) return true;
                            return validPricingOptionIds.has(optPart);
                        })
                    );

                if (preserveValues) {
                    setValues((prev) => ({
                        ...stripStaleValueKeys(prev),
                        ...initialValues,
                        ...preserveValues,
                    }));
                } else {
                    setValues((prev) => ({
                        ...stripStaleValueKeys(prev),
                        ...initialValues,
                    }));
                }

                // Auto-Select First VISIBLE Lead Job
                if (data.jobs) {
                    const anyRootHasLPrefixInName = data.jobs.some(j => isRootJob(j) && /^L\d+\s-\s/.test(j.itemName || ''));

                    // FIX: Use ID-based visible flag set by backend to avoid name-collision
                    // (e.g. root BMS and child BMS share the same itemName)
                    const isTreeVisibleById = (jobId) => {
                        const job = data.jobs.find(j => j.id == jobId);
                        if (!job) return false;
                        if (job.visible === true) return true;
                        const jn = nid(jobId);
                        const children = data.jobs.filter(j => nid(j.parentId) === jn);
                        return children.some(c => isTreeVisibleById(c.id));
                    };

                    const roots = data.jobs.filter(j =>
                        isRootJob(j) &&
                        isTreeVisibleById(j.id) &&
                        rootPassesLeadNaming(j, anyRootHasLPrefixInName)
                    );

                    if (roots.length > 0) {
                        // Priority: Auto-select a root the user is explicitly assigned to
                        const myJobs = (data.access && data.access.editableJobs) || [];
                        const myRoot = roots.find(r => myJobs.includes(r.itemName));
                        const targetRoot = myRoot || roots[0];

                        if (loadOptions && loadOptions.useLeadIdForValueInit !== undefined) {
                            const forced = loadOptions.useLeadIdForValueInit;
                            if (forced != null && roots.some((r) => Number(r.id) === Number(forced))) {
                                setSelectedLeadId(forced);
                            } else if (forced == null) {
                                setSelectedLeadId(null);
                            } else {
                                setSelectedLeadId(targetRoot.id);
                            }
                        } else {
                            // Opening a new enquiry: setSelectedLeadId(null) then loadPricing in the same
                            // tick; the closure can still see the *previous* enquiry's lead id.
                            const leadIdForAuto = ignoreExistingLeadSelection ? null : selectedLeadId;
                            const currentLeadValid = leadIdForAuto && roots.some(r => Number(r.id) === Number(leadIdForAuto));

                            if (!leadIdForAuto || !currentLeadValid) {
                                console.log('Lead Job Auto-selection:', targetRoot.itemName, targetRoot.id);
                                setSelectedLeadId(targetRoot.id);
                            } else {
                                console.log('Maintaining current Lead Job selection:', leadIdForAuto);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Error loading pricing:', err);
        } finally {
            setLoading(false);
        }
    };

    /** Open enquiry grid on its own screen (hide pending/search lists until Back / Close). */
    const openPricingEditorForEnquiry = (requestNo) => {
        setPricingEditorStandalone(true);
        setPricingData(null);
        setSelectedEnquiry(null);
        setSelectedLeadId(null);
        try {
            localStorage.removeItem('pricing_selectedLeadId');
        } catch {
            /* ignore */
        }
        void loadPricing(requestNo, null, null, { ignoreExistingLeadSelection: true });
    };

    // Add new option row
    const addOption = async (targetScope, explicitName = null, explicitCustomer = null) => {
        const currentValues = { ...values }; // Capture current state
        const optionName = explicitName || newOptionNames[targetScope] || '';
        if (!optionName.trim() || !pricingData) return;

        let targetItemName = targetScope ? targetScope.trim() : '';
        // Resolve display name back to raw ItemName
        const currentActiveLeadJob = (pricingData.jobs || []).find(j => j.id == selectedLeadId);

        if (
            targetItemName.includes(' / Lead Job') ||
            targetItemName === 'Lead Job' ||
            (currentActiveLeadJob && targetItemName === `${currentActiveLeadJob.itemName} / Lead Job`) ||
            (currentActiveLeadJob && targetItemName === `${currentActiveLeadJob.itemName} (Lead Job)`) ||
            targetItemName.endsWith(' (Lead Job)')
        ) {
            targetItemName = currentActiveLeadJob ? currentActiveLeadJob.itemName.trim() : null;
        }

        // Determine customer name for payload
        let custName = explicitCustomer || selectedCustomer;
        // HIERARCHICAL OVERRIDE: If the target item is a sub-job, it MUST quote to its parent

        // Find matching job strictly within context
        const targetJob = (pricingData.jobs || []).find(j => {
            if (j.itemName !== targetItemName) return false;
            // Disambiguate by LeadJob if multiple items have same name
            const currentLjName = currentActiveLeadJob ? currentActiveLeadJob.itemName : null;
            return !currentLjName || findLeadJobName(j) === currentLjName;
        });

        if (!pricingData.access?.canEditAll) {
            const anchorId = resolveOwnJobAnchorId({
                jobs: pricingData.jobs,
                selectedLeadId,
                myJobs: pricingData.access?.editableJobs || [],
                canEditAll: false,
            });
            if (anchorId != null && targetJob && nid(targetJob.id) !== nid(anchorId)) {
                return;
            }
        }

        if (targetJob && targetJob.parentId && targetJob.parentId !== '0' && targetJob.parentId !== 0) {
            const parent = (pricingData.jobs || []).find(p => p.id === targetJob.parentId);
            if (parent) {
                custName = parent.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
            }
        }

        // Final fallback for lead-jobs: if still blank, use main enquiry customer
        if (!custName || !custName.trim()) {
            const masterList = (pricingData.enquiry.customerName || '')
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);
            if (masterList.length > 0) {
                custName = masterList[0];
            }
        }

        const leadJobName = currentActiveLeadJob ? currentActiveLeadJob.itemName : null;

        const payload = {
            requestNo: pricingData.enquiry.requestNo,
            optionName: optionName.trim(),
            itemName: targetItemName,
            enquiryForId: targetJob ? targetJob.id : null, // Pass ID if resolved
            customerName: custName, // Use resolved customer (parent for sub-jobs, external for lead-jobs)
            leadJobName: leadJobName // Bind Option to current Lead Job Scope
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
                loadPricing(pricingData.enquiry.requestNo, explicitCustomer || selectedCustomer, currentValues);
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

        // API / React may use string vs number IDs — strict === misses the row and delete silently no-ops.
        const optToDelete = (pricingData.options || []).find((o) => String(o.id) === String(optionId));
        if (!optToDelete) {
            console.warn('[Pricing deleteOption] No option row for id', optionId);
            return;
        }

        const nameNorm = (optToDelete.name || '').trim().toLowerCase();
        if (nameNorm === 'base price') {
            return;
        }

        if (!pricingData.access?.canEditAll) {
            const anchorId = resolveOwnJobAnchorId({
                jobs: pricingData.jobs,
                selectedLeadId,
                myJobs: pricingData.access?.editableJobs || [],
                canEditAll: false,
            });
            if (anchorId != null) {
                const jobMatch = (pricingData.jobs || []).find((j) =>
                    sameEnquiryItemName(optToDelete.itemName, j.itemName)
                );
                if (jobMatch && nid(jobMatch.id) !== nid(anchorId)) {
                    return;
                }
            }
        }

        // Special Rule: Default options like 'Base Price' or 'Price' are usually kept,
        // but user-added named options should be removed globally to prevent auto-sync from bringing them back.
        const isDefault = ['price', 'optional', 'base price'].includes(nameNorm);

        let idsToDelete = [optToDelete.id];
        if (!isDefault) {
            // Find all matching options (Same Name Case-Insensitive & Trimmed, same ItemName context)
            const matches = (pricingData.options || []).filter(
                (o) =>
                    o.name &&
                    o.name.trim().toLowerCase() === nameNorm &&
                    o.itemName &&
                    o.itemName.trim().toLowerCase() === (optToDelete.itemName || '').trim().toLowerCase()
            );
            // Ensure unique IDs to avoid multiple DELETE requests for same record (Step 932)
            idsToDelete = Array.from(new Set(matches.map((m) => m.id)));
            console.log(
                `Bulk Delete: Found ${idsToDelete.length} unique matching rows for "${optToDelete.name}" (trimmed) across all branches/tabs for ${optToDelete.itemName}`
            );
        }

        const idsToDeleteSet = new Set(idsToDelete.map((id) => String(id)));

        try {
            const currentValues = { ...values }; // Capture current state
            console.log(`Bulk Delete: Initiating delete for IDs: [${[...idsToDeleteSet].join(', ')}]`);
            // Deleted all linked IDs in parallel with verification
            const results = await Promise.all(
                [...idsToDeleteSet].map((id) =>
                    fetch(`${API_BASE}/api/pricing/option/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => ({
                        id,
                        ok: r.ok,
                        status: r.status,
                    }))
                )
            );

            console.log('Delete Results:', results);

            const allOk = results.every((res) => res.ok);
            if (allOk) {
                // Remove the deleted option's values from currentValues to prevent stale keys
                const cleanedValues = Object.keys(currentValues).reduce((acc, key) => {
                    const kOptId = String(key).split('_')[0];
                    if (String(key).startsWith('simulated') || !idsToDeleteSet.has(kOptId)) {
                        acc[key] = currentValues[key];
                    }
                    return acc;
                }, {});

                loadPricing(pricingData.enquiry.requestNo, selectedCustomer, cleanedValues);
            } else {
                alert('Failed to delete some option rows. They may be in use.');
                loadPricing(pricingData.enquiry.requestNo, selectedCustomer);
            }
        } catch (err) {
            console.error('Error deleting option:', err);
        }
    };

    // Format a numeric value as ###,###,###.### (up to 3 decimal places, no trailing zeros)
    const formatPrice = (val) => {
        if (val === '' || val === undefined || val === null) return '';
        const num = parseFloat(val);
        if (isNaN(num)) return '';
        // Use locale string with max 3 decimal places, no trailing zeros
        return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
    };

    // Update cell value — always strip commas and store as plain float
    const handleValueChange = (optionId, jobId, value) => {
        const key = `${optionId}_${jobId}`;
        const stripped = String(value).replace(/,/g, ''); // remove commas the user may paste

        // Validation: allow only numbers and a single decimal point (Step 4488)
        if (stripped !== '' && !/^-?\d*\.?\d*$/.test(stripped)) return;

        setValues(prev => ({
            ...prev,
            [key]: stripped
        }));
    };

    // Save all prices
    const saveAll = async () => {
        if (!pricingData) return;

        const requestNo = pricingData.enquiry.requestNo;
        const userName = currentUser?.name || currentUser?.FullName || 'Unknown';
        const editableJobs = pricingData.access.editableJobs || []; // Contains Names
        const ownEditableJobIds = resolveAllEditableJobIds({
            jobs: pricingData.jobs,
            myJobs: editableJobs,
            canEditAll: !!pricingData.access?.canEditAll,
        });

        // Determine all keys that have data (State + DB)
        const allKeys = new Set([
            ...Object.keys(values),
            ...Object.keys(pricingData.values || {})
        ]);

        let skippedCount = 0;
        const valuesToSave = [];

        // Step 1: Realize any simulated keys that have values (Step 3401)
        const simsToProcess = Array.from(allKeys).filter(k => k.startsWith('simulated') && values[k] !== undefined && values[k] !== '');
        for (const simKey of simsToProcess) {
            try {
                const parts = simKey.split('_');
                const jobId = parseInt(parts[parts.length - 1]);
                const job = pricingData.jobs.find(j => j.id === jobId);
                if (!job) continue;
                if (!pricingData.access.canEditAll && ownEditableJobIds.size > 0 && !ownEditableJobIds.has(nid(job.id))) {
                    continue;
                }

                const currentActiveLeadJob = pricingData.jobs.find(j => j.id == selectedLeadId);
                const leadJobName = currentActiveLeadJob ? currentActiveLeadJob.itemName : null;
                let custName = selectedCustomer;
                if (job.parentId && job.parentId !== '0' && job.parentId !== 0) {
                    const parent = pricingData.jobs.find(p => p.id === job.parentId);
                    if (parent) custName = parent.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                }

                const res = await fetch(`${API_BASE}/api/pricing/option`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        requestNo: requestNo,
                        optionName: 'Base Price',
                        itemName: job.itemName,
                        customerName: custName,
                        leadJobName: leadJobName
                    })
                });

                if (res.ok) {
                    const d = await res.json();
                    const newKey = `${d.option.ID}_${jobId}`;
                    values[newKey] = values[simKey];
                    allKeys.add(newKey);
                    delete values[simKey];
                }
            } catch (err) { console.error('Sim realization error:', err); }
        }

        // Step 2: Save Loop
        const debugSaveAll =
            String(pricingData?.enquiry?.requestNo || requestNo) === '25'
                ? { totals: 0, skipped: { simulated: 0, parts: 0, noJobOrOpt: 0, notEditable: 0, noMatch: 0 } }
                : null;
        for (const key of allKeys) {
            if (debugSaveAll) debugSaveAll.totals++;
            if (key.startsWith('simulated')) {
                if (debugSaveAll) debugSaveAll.skipped.simulated++;
                continue;
            }

            const parts = key.split('_');
            if (parts.length < 2) {
                if (debugSaveAll) debugSaveAll.skipped.parts++;
                continue;
            }

            const optionId = parseInt(parts[0]);
            let jobId = parseInt(parts[1]);
            const opt = pricingData.options.find(o => o.id === optionId);

            // Robust Job Identification (Handle both ID-based and Name-based keys)
            let job = pricingData.jobs.find(j => j.id === jobId);

            if (!job && parts[1] && opt) {
                // Legacy Map: key was OptionID_ItemName
                // Use Option's leadJobName and itemName to find the exact job
                const itemName = parts[1];
                job = pricingData.jobs.find(j =>
                    j.itemName === itemName &&
                    (findLeadJobName(j) === opt.leadJobName || (!findLeadJobName(j) && !opt.leadJobName))
                );
                if (job) jobId = job.id; // Correct the ID for submission
            }

            if (!job || !opt) {
                if (debugSaveAll) debugSaveAll.skipped.noJobOrOpt++;
                continue;
            }

            // HIERARCHICAL RESOLUTION: Ensure we are saving to the INTERNAL Option ID for sub-jobs
            let effectiveOptionId = optionId;
            let effectiveCustomerName = opt.customerName;

            if (job.parentId && job.parentId !== '0' && job.parentId !== 0) {
                const parent = pricingData.jobs.find(p => p.id === job.parentId);
                if (parent) {
                    const targetCust = parent.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                    const internalOpt = pricingData.options.find(o =>
                        o.name === opt.name &&
                        o.customerName === targetCust &&
                        o.itemName === job.itemName &&
                        (o.leadJobName === opt.leadJobName || (!o.leadJobName && !opt.leadJobName))
                    );
                    if (internalOpt) {
                        effectiveOptionId = internalOpt.id;
                        effectiveCustomerName = targetCust;
                    }
                }
            }

            // Permission Check (based on Job Name still)
            if (!editableJobs.includes(job.itemName)) {
                if (debugSaveAll) debugSaveAll.skipped.notEditable++;
                continue;
            }
            // Non-admins: any assigned own-job row across all lead branches (not only the selected lead).
            if (!pricingData.access.canEditAll && ownEditableJobIds.size > 0 && !ownEditableJobIds.has(nid(job.id))) {
                if (debugSaveAll) debugSaveAll.skipped.notEditable++;
                continue;
            }

            const clean = (s) => (s || '')
                .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width chars
                .replace(/^(L\\d+\\s*-\\s*|Sub Job\\s*-\\s*)/i, '')
                .replace(/^L\\d+\\s*-\\s*/i, '')
                .replace(/^Sub Job\\s*-\\s*/i, '')
                .trim();
            const norm = (s) => clean(s)
                .toLowerCase()
                .replace(/[^a-z0-9 ]+/g, ' ')
                .replace(/\\s+/g, ' ')
                .trim();

            const jobLeadName = findLeadJobName(job);
            const optLeadName = opt.leadJobName;

            const optItem = norm(opt.itemName);
            const jobItem = norm(job.itemName);
            const optLead = norm(optLeadName);
            const jobLead = norm(jobLeadName);

            let isMatch = false;
            if (optItem === jobItem) {
                // Since the edited cell key already includes the concrete OptionID and JobID,
                // we do not need to re-check lead-job scope here. Using the found `opt` + `job`
                // pair is sufficient to persist the correct row.
                isMatch = true;
            } else if (clean(opt.itemName) === 'Lead Job' && (!job.parentId || job.parentId === 0 || job.parentId === '0')) {
                isMatch = true;
            }

            if (!isMatch) {
                if (debugSaveAll) {
                    debugSaveAll.skipped.noMatch++;
                    debugSaveAll.failures = debugSaveAll.failures || [];
                    debugSaveAll.failures.push({
                        key,
                        optionId,
                        jobId,
                        opt: { itemName: opt.itemName, leadJobName: optLeadName },
                        job: { itemName: job.itemName, parentId: job.parentId },
                        computed: { optItem, jobItem, optLead, jobLead }
                    });
                }
                continue;
            }
            // -------------------------------------------------------------

            // Determine Price
            let displayPrice = 0;
            if (values.hasOwnProperty(key)) {
                const userValue = values[key];
                if (userValue !== '' && userValue !== undefined && userValue !== null) {
                    displayPrice = parseFloat(userValue) || 0;
                }
            } else if (pricingData.values[key] && pricingData.values[key].Price) {
                // If using DB value, check if it was aggregated?? No, DB stores Self.
                // Wait, if we never touched 'values[key]', then we display DB value?
                // But DB value is Self.
                // If we don't have it in state, it means user didn't edit it.
                // But render is showing Aggregated. initialValues puts Aggregated into State.
                // So state ALWAYS has Aggregated.
                if (values[key] === undefined) {
                    // This case happens if initialValues didn't populate for some reason, or key missing.
                    // Fallback to DB self price.
                    displayPrice = parseFloat(pricingData.values[key].Price) || 0;
                }
            }

            // --- REVERSE AGGREGATION LOGIC (Subtract Hidden Children) ---
            // Re-calculate the sum of *Hidden* children for this specific Option & Job
            // We reuse the recursive logic but EXCLUDE self.

            const getHiddenChildrenSum = (rootOptionId, rootJobId) => {
                // Clone of logic in loadPricing, but focusing on Children only

                // 1. Identify Root Option "Instance"
                let activeOptionId = rootOptionId;
                const rootOpt = pricingData.options.find(o => o.id === rootOptionId);
                const rootJob = pricingData.jobs.find(j => j.id === rootJobId);

                if (rootOpt && rootJob) {
                    let specificOpt = pricingData.options.find(o =>
                        o.name === rootOpt.name &&
                        o.customerName === rootOpt.customerName &&
                        o.leadJobName === rootOpt.leadJobName &&
                        (o.itemName === rootJob.itemName)
                    );
                    if (!specificOpt) {
                        const cleanJobName = rootJob.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                        specificOpt = pricingData.options.find(o =>
                            o.name === rootOpt.name &&
                            o.customerName === rootOpt.customerName &&
                            (o.itemName === cleanJobName)
                        );
                    }
                    if (specificOpt) activeOptionId = specificOpt.id;
                }

                // Recursive Sum
                let sum = 0;
                const children = pricingData.jobs.filter(j => j.parentId === rootJobId);

                children.forEach(child => {
                    // VISIBILITY CHECK:
                    // If Child is VISIBLE in current view, it is NOT hidden. Do not subtract it.
                    // (Because render didn't add it in the first place).
                    // However, 'visibleJobs' variable is local to render. 
                    // We need to reconstruct the visibility scope here or access it.
                    // Fortunatley, 'targetJobs' logic in Render relies on selectedLeadId + strict Scope.

                    // We can approxVisibility check:
                    // If child is a Direct Child of Root (L2), it is likely Visible if Root is L1.
                    // Logic: L1 is Lead. L2 are Visible inputs. L3 are Hidden inputs.
                    // So:
                    // If RootJob == LeadJob -> Children (L2) are VISIBLE. Sum = 0 (Don't subtract).
                    // If RootJob != LeadJob (it's L2) -> Children (L3) are HIDDEN. Sum = L3 Aggregates.

                    // FIX: Hybrid Aggregation - Subtract ONLY Hidden Children.
                    // If Child is Visible, the User Input (DisplayPrice) does NOT include it (Component Pricing).
                    // So we do NOT subtract it.

                    const isVisible = pricingData.access.visibleJobs.includes(child.itemName);

                    if (isVisible) {
                        // Children are visible L2 rows. Do NOT subtract them.
                        return;
                    } else {
                        // Children are hidden L3 rows. Subtract them!
                        // We need the AGGREGATED price of the Child (Self + Its Children).
                        // Because the User Input (DisplayPrice) includes Child (Aggregate).
                        // We need to call getRecursivePrice view-emulator?

                        // Wait, we need the EXACT Same logic as Render.
                        // Let's copy-paste a helper or use recursion here.

                        // Helper to get total price of a child node (Aggregated)
                        const getChildAggregate = (optId, chId) => {
                            let childActiveOptId = optId;
                            // Re-resolve Option ID properly (Inheritance Logic)
                            const pOpt = pricingData.options.find(o => o.id === optId);
                            const pJob = pricingData.jobs.find(j => j.id === chId);
                            if (pOpt && pJob) {
                                // HIERARCHICAL CUSTOMER RESOLUTION for Child Lookup
                                let targetCust = pOpt.customerName;
                                if (pJob.parentId) {
                                    const parent = pricingData.jobs.find(pj => pj.id === pJob.parentId);
                                    if (parent) targetCust = parent.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                                }

                                // Try Match
                                let sOpt = pricingData.options.find(o =>
                                    o.name === pOpt.name && o.customerName === targetCust && o.itemName === pJob.itemName
                                );
                                // Try Clean Match
                                if (!sOpt) {
                                    const cleanPJobName = pJob.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                                    sOpt = pricingData.options.find(o =>
                                        o.name === pOpt.name && o.customerName === targetCust && o.itemName === cleanPJobName
                                    );
                                }
                                if (sOpt) childActiveOptId = sOpt.id;
                            }

                            const key = `${childActiveOptId}_${chId}`;
                            let val = 0;
                            // Priority 1: Check Current State (User Edits)
                            if (values[key] !== undefined && values[key] !== '') {
                                val = parseFloat(values[key]) || 0;
                            }
                            // Priority 2: Check Database Values (Pre-loaded)
                            else if (pricingData.values[key]) {
                                val = parseFloat(pricingData.values[key].Price) || 0;
                            }

                            // Fallbacks (Name based keys)
                            if (val === 0 && pJob) {
                                const nKey = `${childActiveOptId}_${pJob.itemName}`;
                                if (values[nKey] !== undefined && values[nKey] !== '') val = parseFloat(values[nKey]);
                                else if (pricingData.values[nKey]) val = parseFloat(pricingData.values[nKey].Price);
                            }

                            let gcSum = 0;
                            const gKids = pricingData.jobs.filter(x => x.parentId === chId);
                            gKids.forEach(mk => gcSum += getChildAggregate(optId, mk.id));
                            return val + gcSum;
                        };

                        sum += getChildAggregate(rootOptionId, child.id);
                    }
                });
                return sum;
            };



            const hiddenSum = getHiddenChildrenSum(effectiveOptionId, jobId);

            // CASCADING ZERO LOGIC:
            // If User Explicitly set 0, and HiddenChildren have value, we must CLEAR them.
            const userInitiatedZero = (values.hasOwnProperty(key) && parseFloat(values[key]) === 0);

            if (userInitiatedZero && hiddenSum > 0) {
                // Automatically clear hidden children (No Confirm - assume intent)

                // Collect all hidden descendants recursively
                const collectWipableNodes = (optId, chId) => {
                    const isVisible = pricingData.access.visibleJobs.includes(pricingData.jobs.find(j => j.id === chId)?.itemName);
                    if (isVisible) return;

                    let childActiveOptId = optId;
                    const pOpt = pricingData.options.find(o => o.id === optId);
                    const pJob = pricingData.jobs.find(j => j.id === chId);
                    if (pOpt && pJob) {
                        // HIERARCHICAL CUSTOMER RESOLUTION
                        let targetCust = pOpt.customerName;
                        if (pJob.parentId) {
                            const parent = pricingData.jobs.find(pj => pj.id === pJob.parentId);
                            if (parent) targetCust = parent.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                        }

                        let sOpt = pricingData.options.find(o =>
                            o.name === pOpt.name && o.customerName === targetCust && o.itemName === pJob.itemName
                        );
                        if (!sOpt) {
                            const cleanPJobName = pJob.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                            sOpt = pricingData.options.find(o =>
                                o.name === pOpt.name && o.customerName === targetCust && o.itemName === cleanPJobName
                            );
                        }
                        if (sOpt) childActiveOptId = sOpt.id;

                            valuesToSave.push({
                            optionId: childActiveOptId,
                            optionName: pOpt.name,
                            enquiryForItem: pJob.itemName,
                            enquiryForId: chId,
                            price: 0,
                            customerName: targetCust,
                            leadJobName: pOpt.leadJobName,
                                // Store which "kind" of price this is in DB
                                priceOption: pOpt.name === 'Base Price' ? 'Base Price' : pOpt.name // Include user option name
                        });
                    }

                    const gKids = pricingData.jobs.filter(x => x.parentId === chId);
                    gKids.forEach(mk => collectWipableNodes(optId, mk.id));
                };

                const children = pricingData.jobs.filter(j => j.parentId === jobId);
                children.forEach(c => collectWipableNodes(effectiveOptionId, c.id));

                // Force Self Price to 0 (override hiddenSum subtraction)
                // Because if we wipe hiddenSum, it becomes 0.
                // So SelfPrice = Display(0) - NewHiddenSum(0) = 0.
            }

            // If we wiped children, treat hiddenSum as 0.
            const effectiveHiddenSum = (userInitiatedZero && hiddenSum > 0) ? 0 : hiddenSum;

            const finalSelfPrice = displayPrice - effectiveHiddenSum;

            // Actually, if finalSelfPrice is effectively the Component Cost.

            let priceToSave = finalSelfPrice;
            if (priceToSave < 0 && displayPrice > 0) {
                // Edge case: User entered 10, but Hidden Children sum is 20.
                // This implies they want to reduce the package cost.
                // We can't reduce Hidden Children automatically.
                // We have to set Self to 0? Or negative?
                // Let's set to 0.
                priceToSave = 0;
            } else if (priceToSave < 0) {
                // if display was 0, save 0.
                priceToSave = 0;
            }

            // NEW SKIP LOGIC (Robust Dirty Check):
            const dbValRow = pricingData.values[key];
            const currentDbPrice = dbValRow ? (parseFloat(dbValRow.Price) || 0) : 0;
            const hasExplicitDbRow = !!dbValRow;
            const isNoChange = Math.abs(priceToSave - currentDbPrice) < 0.01;

            if (isNoChange) {
                // Skip if already explicit in DB, or if implicit (0) and untouched by user
                if (hasExplicitDbRow || !values.hasOwnProperty(key)) {
                    skippedCount++;
                    continue;
                }
                // If implicit 0 but User explicitly touched/typed 0, we PROCEED to save (Create Explicit 0 Row)
            }

            valuesToSave.push({
                optionId: effectiveOptionId, // Use Hierarchical Resolved ID
                optionName: opt.name,
                enquiryForItem: job.itemName, // Send Name for legacy compat/logging
                enquiryForId: job.id,         // Send ID for strict linking
                price: priceToSave,           // SAVE NET SELF PRICE
                customerName: effectiveCustomerName, // Use Hierarchical Resolved Customer
                leadJobName: opt.leadJobName,    // Include Lead Job Name (Step 1078 - from Option)
                // Store which "kind" of price this is in DB
                priceOption: opt.name === 'Base Price' ? 'Base Price' : opt.name // User option vs base price
            });
        }

        if (valuesToSave.length === 0) {
            const debugRequestNo = requestNo;
            const debugSimKeys = Array.from(allKeys).filter(k => k.startsWith('simulated'));
            const debugParsedKeys = Array.from(allKeys).map((k) => {
                const parts = k.split('_');
                const optionId = parseInt(parts[0]);
                const jobId = parseInt(parts[1]);
                const opt = Number.isFinite(optionId)
                    ? (pricingData.options || []).find(o => o.id === optionId)
                    : null;
                const job = Number.isFinite(jobId)
                    ? (pricingData.jobs || []).find(j => j.id === jobId)
                    : null;
                return { key: k, parts, optionId, jobId, optFound: !!opt, jobFound: !!job, optId: opt ? opt.id : null };
            });
            console.log('Pricing saveAll DEBUG (valuesToSave empty)', {
                requestNo: debugRequestNo,
                totalKeysInSet: allKeys.size,
                exampleKeys: Array.from(allKeys).slice(0, 30),
                parsedKeys: debugParsedKeys,
                simulatedKeys: debugSimKeys,
                valuesStateKeys: Object.keys(values || {}).slice(0, 50),
                pricingValuesKeys: Object.keys(pricingData.values || {}).slice(0, 50),
                debugSaveAll
            });

            alert('⚠️ Cannot save: All price values are empty or zero.\n\nPlease enter at least one valid price value greater than zero.');
            loadPricing(pricingData.enquiry.requestNo, selectedCustomer);
            return;
        }



        setSaving(true);

        try {
            // Batch saving (Concurrent requests). IMPORTANT: verify HTTP status
            // so we don't show success when the backend rejected the payload.
            const promises = valuesToSave.map((item) => {
                return fetch(`${API_BASE}/api/pricing/value`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        requestNo: requestNo,
                        optionId: item.optionId,
                        enquiryForItem: item.enquiryForItem,
                        enquiryForId: item.enquiryForId, // NEW FIELD
                        price: item.price,
                        updatedBy: userName,
                        customerName: item.customerName, // Use item-specific customer name
                        leadJobName: item.leadJobName,    // Use item-specific lead job name (Step 1078)
                        priceOption: item.priceOption    // NEW COLUMN FIELD
                    })
                }).then(async (r) => {
                    if (!r.ok) {
                        const body = await r.text().catch(() => '');
                        throw new Error(`Save failed: HTTP ${r.status} ${r.statusText}. Payload=${JSON.stringify(item)}. Body=${body}`);
                    }
                    // Backend returns {success:true}, but we don't strictly need it.
                    return r.json().catch(() => null);
                });
            });

            await Promise.all(promises);
            alert('✓ Pricing saved successfully!');
            loadPricing(pricingData.enquiry.requestNo, selectedCustomer);
            refreshPendingRequests();
        } catch (err) {
            console.error('Error saving:', err);
            alert('Failed to save pricing: ' + (err?.message || err));
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

    // Dynamic Customer Tabs Filter (Step 1727)
    const displayedCustomers = React.useMemo(() => {
        if (!pricingData || !selectedLeadId) return [];
        // Admins/Managers early out removed - properly evaluated below

        const myJobs = pricingData.access.editableJobs || [];
        const selectedJob = pricingData.jobs?.find(j => j.id == selectedLeadId);
        if (!selectedJob) return [];

        // 1. Identify External Customers (Main + Extra)
        const masterList = (pricingData.enquiry?.customerName || '').split(',').map(c => c.trim()).filter(Boolean);
        const extraList = (pricingData.extraCustomers || []).flatMap(c => (c || '').split(',')).map(c => c.trim()).filter(Boolean);
        const externalCustomers = [...masterList, ...extraList];

        // 2. Identify jobs in the current Lead Job's tree
        const treeJobs = new Set([Number(selectedLeadId)]);
        let changed = true;
        while (changed) {
            changed = false;
            pricingData.jobs.forEach(j => {
                if (j.parentId !== null && j.parentId !== undefined) {
                    const pId = Number(j.parentId || j.ParentID);
                    const id = Number(j.id || j.ID);
                    if (treeJobs.has(pId) && !treeJobs.has(id)) {
                        treeJobs.add(id);
                        changed = true;
                    }
                }
            });
        }

        // 3. Parent Jobs (Internal Customers) and Root Status in THIS Tree
        const parentCustomers = new Set();
        let amIRootInTree = false;

        if (pricingData?.jobs) {
            pricingData.jobs.forEach(jobObj => {
                if (!treeJobs.has(Number(jobObj.id || jobObj.ID))) return;

                myJobs.forEach(assignedName => {
                    const cleanAssigned = assignedName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase();
                    const cleanJob = jobObj.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim().toLowerCase();

                    if (cleanJob === cleanAssigned) {
                        if (Number(jobObj.id || jobObj.ID) === Number(selectedLeadId)) {
                            amIRootInTree = true;
                        }

                        const pId = jobObj.parentId || jobObj.ParentID;
                        if (pId && pId !== '0' && pId !== 0) {
                            const parentObj = pricingData.jobs.find(p => Number(p.id || p.ID) === Number(pId));
                            if (parentObj) {
                                const cleanP = parentObj.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                                parentCustomers.add(cleanP);
                            }
                        }
                    }
                });
            });
        }

        const allPossibleCustomers = [...new Set([
            ...externalCustomers,
            ...Array.from(parentCustomers)
        ])];

        return allPossibleCustomers.filter(cName => {
            const cleanC = cName.trim();

            if (pricingData.access?.canEditAll) {
                const isExternal = externalCustomers.includes(cleanC);
                const isInternalParent = pricingData.jobs.some(j => {
                    if (!treeJobs.has(Number(j.id || j.ID))) return false;
                    const pId = j.parentId || j.ParentID;
                    if (!pId || pId === '0' || pId === 0) return false;
                    const parent = pricingData.jobs.find(p => Number(p.id || p.ID) === Number(pId));
                    return parent && parent.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim() === cleanC;
                });
                return isExternal || isInternalParent;
            }

            // ENHANCED LOGIC (customer tab labels)
            // 1) Own job is the selected lead job → tabs are external enquiry customers only (main + extra), not internal job/parent names.
            // 2) Own job is a subjob under that lead → tabs are parent job name(s) only (parentCustomers); see else branch.
            if (amIRootInTree) {
                return externalCustomers.includes(cleanC);
            }
            // Sub-job user in this lead’s tree: parent job tab(s) only (already tracked in parentCustomers).
            if (parentCustomers.has(cleanC)) return true;
            return false;
        });
    }, [pricingData, selectedLeadId, pricingData?.access?.editableJobs]); // Added editableJobs to ensure refresh on permission change

    // Sync selectedCustomer with displayed tabs
    const lastSyncedCustomersRef = React.useRef("");
    useEffect(() => {
        lastSyncedCustomersRef.current = '';
    }, [selectedLeadId]);

    useEffect(() => {
        const customersStr = displayedCustomers.join('|');
        if (displayedCustomers.length > 0 && pricingData && !loading) {
            // Check if selectedCustomer is still valid in the NEW list
            const isSelectedStillValid = selectedCustomer && displayedCustomers.includes(selectedCustomer);

            if (!isSelectedStillValid) {
                // If not valid, or not yet synced for this list content, jump to first tab
                if (lastSyncedCustomersRef.current !== customersStr) {
                    console.log('Syncing selectedCustomer to first available tab:', displayedCustomers[0]);
                    lastSyncedCustomersRef.current = customersStr;
                    loadPricing(pricingData.enquiry.requestNo, displayedCustomers[0], values);
                }
            }
        }
    }, [displayedCustomers, pricingData?.enquiry?.requestNo, loading]); // Added loading/reqID to ensure stable trigger

    // Get visible jobs
    const visibleJobs = pricingData ? pricingData.jobs.filter(j => j.visible !== false) : [];

    // Filter Options based on Custom Scope Logic
    // Filter Options based on Custom Scope Logic
    const filteredOptions = React.useMemo(() => {
        if (!pricingData || !pricingData.options) return [];

        const seenKeys = new Set();
        const editable = pricingData.access.editableJobs || [];

        // Calculate Scope of Active Lead Job (for Filtering)
        let leadScope = new Set();
        let activeLeadName = null;

        let activeLeadCode = '';
        if (selectedLeadId && pricingData.jobs) {
            const leadJob = pricingData.jobs.find(j => j.id == selectedLeadId);
            if (leadJob) {
                activeLeadName = leadJob.itemName;
                activeLeadCode = String(leadJob.leadJobCode || leadJob.LeadJobCode || '').trim();

                // Recurse to find all children keys
                const getChildren = (pId) => {
                    const pn = nid(pId);
                    const children = pricingData.jobs.filter(j => nid(j.parentId) === pn);
                    children.forEach(c => {
                        leadScope.add(c.itemName);
                        getChildren(c.id);
                    });
                };
                leadScope.add(leadJob.itemName);
                getChildren(leadJob.id);
                if (activeLeadCode) leadScope.add(activeLeadCode);
            }
        }

        const optItemInLeadTree = (itemName) => {
            if (!itemName || !activeLeadName) return false;
            const t = itemName.trim();
            if (leadScope.has(t)) return true;
            for (const n of leadScope) {
                if (sameEnquiryItemName(t, n)) return true;
            }
            return false;
        };

        // Helper to check if option belongs to a child of an editable job
        const isRelatedToEditable = (optItemName) => {
            if (!optItemName) return false;
            if (editable.includes(optItemName)) return true;
            const optJob = pricingData.jobs.find(j => j.itemName === optItemName);
            if (!optJob) return false;
            if (optJob.parentId != null && optJob.parentId !== '' && optJob.parentId !== 0 && optJob.parentId !== '0') {
                const parentJob = pricingData.jobs.find(p => p.id == optJob.parentId);
                if (parentJob && editable.includes(parentJob.itemName)) return true;
            }
            if (optItemName.includes('BMS') && editable.some(e => e.includes('Electrical'))) return true;
            return false;
        };

        // Step 1: Broad Filter (Context + Scope Match)
        // Options may only set leadJobName (no itemName) — they must still pass isScopeMatch.
        const candidates = pricingData.options.filter(o => {
            let matchesActiveLeadTag = false;
            if (activeLeadName) {
                if (o.leadJobName) {
                    const ln = (o.leadJobName || '').trim();
                    matchesActiveLeadTag = ln === (activeLeadName || '').trim() || (!!activeLeadCode && ln === activeLeadCode);
                    if (!matchesActiveLeadTag) return false;
                } else if (o.itemName && !optItemInLeadTree(o.itemName)) {
                    return false;
                }
            }

            const isScopeMatch =
                pricingData.access.hasLeadAccess ||
                isRelatedToEditable(o.itemName) ||
                (activeLeadName && o.itemName && optItemInLeadTree(o.itemName)) ||
                matchesActiveLeadTag;

            if (!isScopeMatch) return false;

            // Shared Logic: If it belongs to our Lead Job / Job scope, we show it across ALL customer tabs.
            // This ensures "Option 1 added for A" is also visible on "Tab B".
            return true;
        });

        // Step 2: Prioritize Current Customer and Deduplicate
        candidates.sort((a, b) => {
            const aMatch = a.customerName === selectedCustomer ? 0 : 1;
            const bMatch = b.customerName === selectedCustomer ? 0 : 1;
            return aMatch - bMatch;
        });

        const results = [];
        candidates.forEach(o => {
            const cleanName = (o.name || '').trim();
            const cleanItem = (o.itemName || '').trim();
            const cleanLead = (o.leadJobName || '').trim();
            const dedupKey = `${cleanName}-${cleanItem}-${cleanLead || 'Legacy'}`;
            if (!seenKeys.has(dedupKey)) {
                seenKeys.add(dedupKey);
                results.push(o);
            }
        });

        // Step 3: Ensure "Base Price" row is ALWAYS present for relevant jobs
        const leadJob = pricingData.jobs?.find(j => j.id == selectedLeadId);
        if (leadJob && selectedCustomer && !results.some(o => o.name === 'Base Price' && o.itemName === leadJob.itemName)) {
            results.push({
                id: `simulated_base_lead_${leadJob.id}`,
                name: 'Base Price',
                itemName: leadJob.itemName,
                customerName: selectedCustomer,
                isSimulated: true
            });
        }

        pricingData.jobs.forEach(sj => {
            if (!leadScope.has(sj.itemName)) return;
            const canSeeOrEdit = pricingData.access.canEditAll || pricingData.access.hasLeadAccess || editable.includes(sj.itemName);
            if (canSeeOrEdit && !results.some(o => o.name === 'Base Price' && o.itemName === sj.itemName)) {
                results.push({
                    id: `simulated_base_sj_${sj.id}`,
                    name: 'Base Price',
                    itemName: sj.itemName,
                    customerName: selectedCustomer,
                    isSimulated: true
                });
            }
        });

        if (import.meta.env.DEV) {
            const byLead = {};
            const byItem = {};
            results.forEach((o) => {
                const k = (o.leadJobName || '(no leadJobName)').trim();
                byLead[k] = (byLead[k] || 0) + 1;
                const ik = (o.itemName || '(no itemName)').trim();
                byItem[ik] = (byItem[ik] || 0) + 1;
            });
            console.log('[Pricing filteredOptions] selectedLeadId', selectedLeadId, 'jobs', pricingData.jobs?.length, 'raw options', pricingData.options?.length, 'filtered', results.length, 'by leadJobName', byLead, 'by itemName', byItem);
        }

        return results;
    }, [pricingData, selectedCustomer, selectedLeadId]);

    /** Full-height list shell so wide tables scroll horizontally at the bottom of the viewport, not under a short tbody. */
    const listFillsViewport =
        !pricingEditorStandalone &&
        !pricingData &&
        ((pricingListCategory === PRICING_LIST_CATEGORY.SEARCH && searchResults.length > 0) ||
            (pricingListCategory === PRICING_LIST_CATEGORY.PENDING && pendingRequests.length > 0));

    return (
        <div
            style={{
                padding: '20px',
                background: '#f5f7fa',
                minHeight: 'calc(100vh - 80px)',
                ...(listFillsViewport
                    ? {
                          height: 'calc(100vh - 80px)',
                          boxSizing: 'border-box',
                          display: 'flex',
                          flexDirection: 'column',
                      }
                    : {}),
                ...(pricingEditorStandalone
                    ? {
                          boxSizing: 'border-box',
                          display: 'flex',
                          flexDirection: 'column',
                      }
                    : {}),
            }}
        >
            {pricingEditorStandalone && (
                <div
                    style={{
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        flexShrink: 0,
                    }}
                >
                    <button
                        type="button"
                        onClick={closePricingEditor}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 14px',
                            fontSize: '13px',
                            fontWeight: '600',
                            color: '#1e40af',
                            background: '#fff',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                        }}
                    >
                        <ChevronLeft size={18} aria-hidden />
                        Back to pricing list
                    </button>
                </div>
            )}

            {!pricingEditorStandalone && (
            <>
            {/* List filters (same pattern as Quote: category, criteria, enquiry dates, Search / Clear) */}
            <div
                style={{
                    background: 'white',
                    padding: '16px 20px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    ...(listFillsViewport ? { flexShrink: 0 } : {}),
                }}
            >
                <div
                    ref={searchRef}
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        gap: '10px 16px',
                        rowGap: '10px',
                        width: '100%',
                    }}
                >
                    <label
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '12px',
                            fontWeight: '600',
                            color: '#475569',
                            margin: 0,
                        }}
                    >
                        Category
                        <select
                            value={pricingListCategory}
                            onChange={(e) => {
                                const v = e.target.value;
                                setPricingEditorStandalone(false);
                                setPricingListCategory(v);
                                if (v === PRICING_LIST_CATEGORY.PENDING) {
                                    setSearchResults([]);
                                    setPricingSearchAttempted(false);
                                    // Otherwise the list stays hidden behind `!pricingData` and the main area looks blank.
                                    setPricingData(null);
                                    setSelectedEnquiry(null);
                                    refreshPendingRequests();
                                }
                            }}
                            style={{
                                minWidth: '148px',
                                padding: '6px 10px',
                                fontSize: '12px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                background: '#fff',
                                color: '#334155',
                                cursor: 'pointer',
                            }}
                        >
                            <option value={PRICING_LIST_CATEGORY.PENDING}>Pending Pricing</option>
                            <option value={PRICING_LIST_CATEGORY.SEARCH}>Search Price</option>
                        </select>
                    </label>
                    <label
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '12px',
                            fontWeight: '600',
                            color: '#475569',
                            margin: 0,
                            flex: '2 1 280px',
                            minWidth: '220px',
                            maxWidth: '640px',
                        }}
                    >
                        Search criteria
                        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                            <input
                                type="text"
                                autoComplete="off"
                                value={pricingListSearchCriteria}
                                onChange={(e) => handlePricingListCriteriaInput(e.target.value)}
                                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                                onKeyDown={(e) => {
                                    if (e.key !== 'Enter') return;
                                    e.preventDefault();
                                    if (pricingListCategory !== PRICING_LIST_CATEGORY.SEARCH || searching) return;
                                    handlePricingListSearch();
                                }}
                                disabled={pricingListCategory !== PRICING_LIST_CATEGORY.SEARCH}
                                placeholder={
                                    pricingListCategory === PRICING_LIST_CATEGORY.SEARCH
                                        ? 'Enquiry no., project, customer, client, consultant, updated by… (use From/To for enquiry date)'
                                        : 'Select "Search Price" to enable'
                                }
                                style={{
                                    width: '100%',
                                    padding: '6px 10px',
                                    fontSize: '12px',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    background: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? '#fff' : '#f1f5f9',
                                    color: '#334155',
                                    opacity: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? 1 : 0.65,
                                    cursor: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? 'text' : 'not-allowed',
                                }}
                            />
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
                                            onMouseOver={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                                            onMouseOut={(e) => { e.currentTarget.style.background = 'white'; }}
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
                    </label>
                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '12px',
                            fontWeight: '600',
                            color: '#475569',
                            opacity: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? 1 : 0.65,
                        }}
                    >
                        <span style={{ whiteSpace: 'nowrap' }}>From</span>
                        <div style={{ width: '128px', pointerEvents: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? 'auto' : 'none' }}>
                            <DateInput
                                value={pricingListDateFrom}
                                onChange={(e) => setPricingListDateFrom(e.target.value)}
                                disabled={pricingListCategory !== PRICING_LIST_CATEGORY.SEARCH}
                                placeholder="DD-MMM-YYYY"
                                style={{
                                    fontSize: '12px',
                                    padding: '6px 8px',
                                    cursor: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? 'pointer' : 'not-allowed',
                                }}
                            />
                        </div>
                        <span style={{ whiteSpace: 'nowrap' }}>To</span>
                        <div style={{ width: '128px', pointerEvents: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? 'auto' : 'none' }}>
                            <DateInput
                                value={pricingListDateTo}
                                onChange={(e) => setPricingListDateTo(e.target.value)}
                                disabled={pricingListCategory !== PRICING_LIST_CATEGORY.SEARCH}
                                placeholder="DD-MMM-YYYY"
                                style={{
                                    fontSize: '12px',
                                    padding: '6px 8px',
                                    cursor: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? 'pointer' : 'not-allowed',
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={handlePricingListSearch}
                                disabled={pricingListCategory !== PRICING_LIST_CATEGORY.SEARCH || searching}
                                style={{
                                    padding: '6px 14px',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    borderRadius: '6px',
                                    border: '1px solid #2563eb',
                                    background: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? '#2563eb' : '#e2e8f0',
                                    color: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH ? '#fff' : '#94a3b8',
                                    cursor: pricingListCategory === PRICING_LIST_CATEGORY.SEARCH && !searching ? 'pointer' : 'not-allowed',
                                }}
                            >
                                {searching ? 'Searching…' : 'Search'}
                            </button>
                            <button
                                type="button"
                                onClick={handlePricingListClear}
                                style={{
                                    padding: '6px 14px',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    borderRadius: '6px',
                                    border: '1px solid #cbd5e1',
                                    background: '#fff',
                                    color: '#475569',
                                    cursor: 'pointer',
                                }}
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Searching Indicator */}
            {searching && (
                <div
                    style={{
                        background: 'white',
                        padding: '20px',
                        borderRadius: '8px',
                        textAlign: 'center',
                        color: '#64748b',
                        marginBottom: '20px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        ...(listFillsViewport ? { flexShrink: 0 } : {}),
                    }}
                >
                    Searching for enquiries...
                </div>
            )}

            {/* Search Results Table */}
            {
                pricingListCategory === PRICING_LIST_CATEGORY.SEARCH && searchResults.length > 0 && !pricingData && (
                    <div
                        style={{
                            background: 'white',
                            borderRadius: '8px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            overflow: 'hidden',
                            marginBottom: listFillsViewport ? 0 : '20px',
                            ...(listFillsViewport
                                ? {
                                      flex: 1,
                                      minHeight: 0,
                                      display: 'flex',
                                      flexDirection: 'column',
                                  }
                                : {}),
                        }}
                    >
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                            <h3 style={{ margin: 0, fontSize: '15px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Search size={16} /> Search Results ({searchResults.length})
                            </h3>
                            <button
                                type="button"
                                onClick={() => {
                                    setPricingEditorStandalone(false);
                                    setSearchResults([]);
                                    setPricingListCategory(PRICING_LIST_CATEGORY.PENDING);
                                    setPricingSearchAttempted(false);
                                }}
                                style={{ fontSize: '12px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                                Close Results
                            </button>
                        </div>
                        <div
                            style={{
                                flex: listFillsViewport ? 1 : undefined,
                                minHeight: listFillsViewport ? 0 : undefined,
                                maxHeight: listFillsViewport ? undefined : 'calc(100vh - 260px)',
                                overflowY: 'auto',
                                overflowX: 'auto',
                                WebkitOverflowScrolling: 'touch',
                            }}
                        >
                            <table
                                style={{
                                    width: 'max-content',
                                    minWidth: '100%',
                                    borderCollapse: 'collapse',
                                    tableLayout: 'auto',
                                }}
                            >
                                <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                                    <tr>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Enquiry No.</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Project Name</th>
                                        <th
                                            style={{
                                                padding: '10px 16px',
                                                textAlign: 'left',
                                                fontSize: '12px',
                                                fontWeight: '600',
                                                color: '#64748b',
                                                borderBottom: '1px solid #e2e8f0',
                                                whiteSpace: 'nowrap',
                                                minWidth: 'min(560px, 92vw)',
                                                width: 'auto',
                                            }}
                                        >
                                            Customer Name & Total Price
                                        </th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Individual & Subjob Base prices</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Client Name</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Consultant Name</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Enquiry Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {searchResults.map((enq, idx) => {
                                        const structured = tryParsePricingListDisplay(enq);
                                        const priceSplit = structured ? null : splitSubJobPricesForListColumns(enq.SubJobPrices);
                                        const specMeta = pricingListSpecStatusMeta(enq);
                                        return (
                                        <tr
                                            key={enq.RequestNo || idx}
                                            style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                                            onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                                            onClick={() => openPricingEditorForEnquiry(enq.RequestNo)}
                                        >
                                            <td
                                                style={{
                                                    padding: '12px 16px',
                                                    fontSize: '13px',
                                                    color: '#1e293b',
                                                    fontWeight: '500',
                                                    verticalAlign: 'top',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                <div>{enq.RequestNo}</div>
                                                {specMeta && (
                                                    <div
                                                        style={{
                                                            fontSize: '11px',
                                                            color: specMeta.specStatusColor,
                                                            fontWeight: 600,
                                                            marginTop: '4px',
                                                            lineHeight: 1.3,
                                                        }}
                                                    >
                                                        {specMeta.specStatus}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{enq.ProjectName || '-'}</td>
                                            <td
                                                style={{
                                                    padding: '12px 16px',
                                                    fontSize: '13px',
                                                    color: '#64748b',
                                                    verticalAlign: 'top',
                                                    whiteSpace: 'normal',
                                                    minWidth: 'max-content',
                                                    width: 'auto',
                                                }}
                                            >
                                                {structured ? (
                                                    <PricingListCustomerTotalsFromJson
                                                        items={structured.customerTotals}
                                                        priceFixedDecimals={null}
                                                    />
                                                ) : enq.SubJobPrices ? (
                                                    <PricingListSubJobPriceLines
                                                        rows={priceSplit.customerAndTotalRows}
                                                        priceFixedDecimals={null}
                                                    />
                                                ) : (
                                                    <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>No assigned jobs</span>
                                                )}
                                            </td>
                                            <td
                                                style={{
                                                    padding: '12px 16px',
                                                    fontSize: '13px',
                                                    color: '#64748b',
                                                    verticalAlign: 'top',
                                                    whiteSpace: 'normal',
                                                    width: '1%',
                                                    minWidth: 'max-content',
                                                }}
                                            >
                                                {structured ? (
                                                    <PricingListJobForestFromJson
                                                        nodes={structured.jobForest}
                                                        priceFixedDecimals={null}
                                                    />
                                                ) : enq.SubJobPrices ? (
                                                    <PricingListSubJobPriceLines
                                                        rows={priceSplit.individualRows}
                                                        priceFixedDecimals={null}
                                                    />
                                                ) : (
                                                    <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>—</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{enq.ClientName || '-'}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{enq.ConsultantName || '-'}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{enq.EnquiryDate ? format(new Date(enq.EnquiryDate), 'dd-MMM-yyyy') : '-'}</td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            }

            {/* Pending list status (always visible in Pending Pricing — avoids blank screen on API errors / zero rows) */}
            {pricingListCategory === PRICING_LIST_CATEGORY.PENDING && pendingListLoading && (
                <div style={{ background: 'white', padding: '24px', borderRadius: '8px', textAlign: 'center', color: '#64748b', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    Loading pending pricing…
                </div>
            )}
            {pricingListCategory === PRICING_LIST_CATEGORY.PENDING && !pendingListLoading && pendingListError && (
                <div style={{ background: '#fef2f2', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #fecaca', color: '#991b1b', fontSize: '13px' }}>
                    {pendingListError}
                </div>
            )}
            {pricingListCategory === PRICING_LIST_CATEGORY.PENDING && !pendingListLoading && !pendingListError && pendingRequests.length === 0 && (
                <div style={{ background: 'white', padding: '32px', borderRadius: '8px', textAlign: 'center', color: '#64748b', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', fontSize: '13px' }}>
                    No pending pricing items for your account. Enquiries appear here when at least one visible base price line is still <strong>Not Updated</strong>.
                </div>
            )}

            {/* Pending Requests List */}
            {
                pricingListCategory === PRICING_LIST_CATEGORY.PENDING && pendingRequests.length > 0 && (() => {
                    // --- Sort Logic ---
                    const sortedPending = [...pendingRequests].sort((a, b) => {
                        const { field, direction } = pendingSortConfig;
                        let aVal = a[field];
                        let bVal = b[field];
                        // Date fields
                        if (field === 'DueDate' || field === 'EnquiryDate') {
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

                    const SortableHeader = ({ field, label, style = {} }) => {
                        const isActive = pendingSortConfig.field === field;
                        const isAsc = pendingSortConfig.direction === 'asc';
                        return (
                            <th
                                onClick={() => setPendingSortConfig(prev =>
                                    prev.field === field
                                        ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
                                        : { field, direction: 'asc' }
                                )}
                                style={{
                                    padding: '10px 16px', textAlign: 'left', fontSize: '12px',
                                    fontWeight: '600', color: isActive ? '#0284c7' : '#64748b',
                                    borderBottom: '1px solid #e2e8f0', cursor: 'pointer',
                                    userSelect: 'none', whiteSpace: 'nowrap', ...style
                                }}
                            >
                                {label}
                                {isActive
                                    ? (isAsc ? ' ▲' : ' ▼')
                                    : <span style={{ color: '#cbd5e1' }}> ⇅</span>
                                }
                            </th>
                        );
                    };

                    return (
                        <div
                            style={{
                                background: 'white',
                                borderRadius: '8px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                overflow: 'hidden',
                                marginBottom: listFillsViewport ? 0 : '20px',
                                ...(listFillsViewport
                                    ? {
                                          flex: 1,
                                          minHeight: 0,
                                          display: 'flex',
                                          flexDirection: 'column',
                                      }
                                    : {}),
                            }}
                        >
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                                <h3 style={{ margin: 0, fontSize: '15px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <FileText size={16} /> Pending Updates ({pendingRequests.length})
                                </h3>
                                <span style={{ fontSize: '12px', color: '#64748b' }}>
                                    Sorted by <strong>{pendingSortConfig.field === 'DueDate' ? 'Due Date' : pendingSortConfig.field === 'RequestNo' ? 'Enquiry No.' : pendingSortConfig.field === 'ProjectName' ? 'Project Name' : pendingSortConfig.field === 'CustomerName' ? 'Customer & Total Price' : pendingSortConfig.field}</strong> {pendingSortConfig.direction === 'asc' ? '(Soonest first)' : '(Latest first)'}
                                </span>
                            </div>
                            {/* Make the pending list fill the viewport height (instead of a fixed 400px). */}
                            <div
                                style={{
                                    flex: listFillsViewport ? 1 : undefined,
                                    minHeight: listFillsViewport ? 0 : undefined,
                                    maxHeight: listFillsViewport ? undefined : 'calc(100vh - 260px)',
                                    overflowY: 'auto',
                                    overflowX: 'auto',
                                    WebkitOverflowScrolling: 'touch',
                                }}
                            >
                                <table
                                    style={{
                                        width: 'max-content',
                                        minWidth: '100%',
                                        borderCollapse: 'collapse',
                                        tableLayout: 'auto',
                                    }}
                                >
                                    <thead style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                                        <tr>
                                            <SortableHeader field="RequestNo" label="Enquiry No." />
                                            <SortableHeader field="ProjectName" label="Project Name" />
                                            <SortableHeader
                                                field="CustomerName"
                                                label="Customer Name & Total Price"
                                                style={{ minWidth: 'min(560px, 92vw)', width: 'auto' }}
                                            />
                                            <th
                                                style={{
                                                    padding: '10px 16px',
                                                    textAlign: 'left',
                                                    fontSize: '12px',
                                                    fontWeight: '600',
                                                    color: '#64748b',
                                                    borderBottom: '1px solid #e2e8f0',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                Individual & Subjob Base prices
                                            </th>
                                            <SortableHeader field="ClientName" label="Client Name" />
                                            <SortableHeader field="ConsultantName" label="Consultant Name" />
                                            <SortableHeader field="DueDate" label="Due Date" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedPending.map((enq, idx) => {
                                            const structured = tryParsePricingListDisplay(enq);
                                            const priceSplit = structured ? null : splitSubJobPricesForListColumns(enq.SubJobPrices);
                                            const specMeta = pricingListSpecStatusMeta(enq);
                                            return (
                                            <tr
                                                key={enq.RequestNo || idx}
                                                style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                                                onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                                                onClick={() => openPricingEditorForEnquiry(enq.RequestNo)}
                                            >
                                                <td
                                                    style={{
                                                        padding: '12px 16px',
                                                        fontSize: '13px',
                                                        color: '#1e293b',
                                                        fontWeight: '500',
                                                        verticalAlign: 'top',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    <div>{enq.RequestNo}</div>
                                                    {specMeta && specMeta.specStatus !== 'All Priced' && (
                                                        <div
                                                            style={{
                                                                fontSize: '11px',
                                                                color: specMeta.specStatusColor,
                                                                fontWeight: 600,
                                                                marginTop: '4px',
                                                                lineHeight: 1.3,
                                                            }}
                                                        >
                                                            {specMeta.specStatus}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{enq.ProjectName || '-'}</td>
                                                <td
                                                    style={{
                                                        padding: '12px 16px',
                                                        fontSize: '13px',
                                                        color: '#64748b',
                                                        verticalAlign: 'top',
                                                        whiteSpace: 'normal',
                                                        minWidth: 'max-content',
                                                        width: 'auto',
                                                    }}
                                                >
                                                    {structured ? (
                                                        <PricingListCustomerTotalsFromJson
                                                            items={structured.customerTotals}
                                                            priceFixedDecimals={3}
                                                        />
                                                    ) : enq.SubJobPrices ? (
                                                        <PricingListSubJobPriceLines
                                                            rows={priceSplit.customerAndTotalRows}
                                                            priceFixedDecimals={3}
                                                        />
                                                    ) : (
                                                        <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>No assigned jobs</span>
                                                    )}
                                                </td>
                                                <td
                                                    style={{
                                                        padding: '12px 16px',
                                                        fontSize: '13px',
                                                        color: '#64748b',
                                                        verticalAlign: 'top',
                                                        whiteSpace: 'normal',
                                                        width: '1%',
                                                        minWidth: 'max-content',
                                                    }}
                                                >
                                                    {structured ? (
                                                        <PricingListJobForestFromJson
                                                            nodes={structured.jobForest}
                                                            priceFixedDecimals={3}
                                                        />
                                                    ) : enq.SubJobPrices ? (
                                                        <PricingListSubJobPriceLines
                                                            rows={priceSplit.individualRows}
                                                            priceFixedDecimals={3}
                                                        />
                                                    ) : (
                                                        <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>—</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{enq.ClientName || '-'}</td>
                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#64748b', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{enq.ConsultantName || '-'}</td>
                                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#dc2626', fontWeight: '500', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{enq.DueDate ? format(new Date(enq.DueDate), 'dd-MMM-yyyy') : '-'}</td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })()
            }

            {/* No results (Search Price mode, after running Search) */}
            {
                pricingListCategory === PRICING_LIST_CATEGORY.SEARCH
                && !searching
                && !pricingData
                && searchResults.length === 0
                && pricingSearchAttempted
                && !showSuggestions
                && (
                    <div style={{ background: 'white', padding: '40px', borderRadius: '8px', textAlign: 'center', color: '#64748b' }}>
                        No results. Enter search text and/or choose From and To enquiry dates, then click Search.
                    </div>
                )
            }
            </>
            )}

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
                    <div
                        style={{
                            background: 'white',
                            borderRadius: '8px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            overflow: 'hidden',
                            ...(pricingEditorStandalone ? { flex: 1, minHeight: 0 } : {}),
                        }}
                    >
                        {/* Enquiry Info Header */}
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '16px', color: '#1e293b' }}>
                                    {pricingData.enquiry.projectName}
                                    <span style={{ fontWeight: '400', color: '#64748b', marginLeft: '8px' }}>({pricingData.enquiry.requestNo})</span>
                                </h3>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                {(() => {
                                    // Access type should depend on whether the user's "own job" is the selected Lead Job.
                                    // - If selected lead job is the same as user's assigned editable job => "Lead Job Access"
                                    // - Otherwise (user is editing a subjob under this selected lead job scope) => "Subjob Access"
                                    const selectedJob = (pricingData.jobs || []).find(j => String(j.id) === String(selectedLeadId));

                                    const editableJobNames = pricingData.access?.editableJobs || [];
                                    const editableJobs = (pricingData.jobs || []).filter(j => editableJobNames.includes(j.itemName));

                                    const ownJobMatchesSelected =
                                        !!selectedJob &&
                                        editableJobs.some(ej => String(ej.id) === String(selectedJob.id));

                                    const isSelectedLeadRoot =
                                        !!selectedJob &&
                                        (!selectedJob.parentId || selectedJob.parentId === 0 || selectedJob.parentId === '0');

                                    const isLeadAccess = ownJobMatchesSelected && isSelectedLeadRoot;

                                    const label = isLeadAccess ? 'Lead Job Access' : 'Subjob Access';
                                    const bg = isLeadAccess ? '#dcfce7' : '#fef3c7';
                                    const fg = isLeadAccess ? '#166534' : '#92400e';

                                    return (
                                        <span style={{
                                            padding: '4px 12px',
                                            borderRadius: '12px',
                                            fontSize: '11px',
                                            fontWeight: '600',
                                            background: bg,
                                            color: fg
                                        }}>
                                            {label}
                                        </span>
                                    );
                                })()}
                                <button
                                    type="button"
                                    onClick={closePricingEditor}
                                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                                    aria-label="Close pricing editor"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Lead Job Selector (Filter by User Access) */}
                        {(() => {
                            if (!pricingData) return null;

                            // Filter roots based on visible assignments (e.g., Department Scope)
                            const visibleScope = pricingData.access?.visibleJobs || [];
                            const anyRootHasLPrefixInName = pricingData.jobs.some(j => isRootJob(j) && /^L\d+\s-\s/.test(j.itemName || ''));

                            // FIX: Use ID-based visibility flag (set by backend per job) to avoid
                            // confusing same-named jobs at different levels (e.g. root BMS vs child BMS)
                            // Name-based visibleScope matching caused root BMS to appear for Electrical
                            // users because child BMS shared the same itemName as root BMS.
                            const isTreeVisibleById = (jobId) => {
                                const job = pricingData.jobs.find(j => j.id == jobId);
                                if (!job) return false;
                                // Use the `visible` flag directly (set by backend's ID-based traversal)
                                if (job.visible === true) return true;
                                // Recurse into children
                                const jn = nid(jobId);
                                const children = pricingData.jobs.filter(j => nid(j.parentId) === jn);
                                return children.some(c => isTreeVisibleById(c.id));
                            };

                            const roots = pricingData.jobs.filter(j => {
                                if (!isRootJob(j)) return false;
                                if (!rootPassesLeadNaming(j, anyRootHasLPrefixInName)) return false;
                                if (!isTreeVisibleById(j.id)) return false;
                                return true;
                            });

                            if (import.meta.env.DEV) {
                                console.log('[Pricing render roots]', roots.length, roots.map((r) => ({ id: r.id, itemName: r.itemName, leadJobCode: r.leadJobCode || r.LeadJobCode })));
                            }
                            console.log(`Pricing Render: ${roots.length} Lead Jobs identified.`);

                            if (roots.length === 0) return null;

                            const selectedRoot = roots.find(r => String(r.id) === String(selectedLeadId || ''));
                            const selectedLeadCode = ((selectedRoot?.leadJobCode || selectedRoot?.LeadJobCode || '') + '').trim();
                            return (
                                <div style={{ padding: '12px 20px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Select Lead Job:</span>
                                    <select
                                        disabled={false}
                                        value={selectedLeadId != null && selectedLeadId !== '' ? String(selectedLeadId) : ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            const newId = val === '' ? null : (Number.isFinite(Number(val)) ? Number(val) : val);
                                            console.log('Lead Job Selected (Change):', newId);
                                            setSelectedLeadId(newId);
                                            if (pricingData?.enquiry?.requestNo && newId != null) {
                                                // Do not pass `values` as preserve: it would re-apply the previous lead’s map over the new `initialValues`.
                                                void loadPricing(
                                                    pricingData.enquiry.requestNo,
                                                    selectedCustomer,
                                                    null,
                                                    { useLeadIdForValueInit: newId }
                                                );
                                            }
                                        }}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '4px',
                                            border: '1px solid #cbd5e1',
                                            fontSize: '13px',
                                            minWidth: '200px',
                                            backgroundColor: 'white',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <option value="">Select Lead Job...</option>
                                         {roots.map(r => {
                                             const name = r.itemName || '';
                                             return <option key={r.id} value={String(r.id)}>{name}</option>;
                                         })}
                                    </select>
                                    {selectedLeadCode ? (
                                        <span style={{
                                            padding: '4px 8px',
                                            borderRadius: '999px',
                                            border: '1px solid #cbd5e1',
                                            background: '#ffffff',
                                            color: '#334155',
                                            fontSize: '12px',
                                            fontWeight: '600'
                                        }}>
                                            {selectedLeadCode}
                                        </span>
                                    ) : null}
                                </div>
                            );
                        })()}

                        {/* Customer Selection Tabs */}
                        {selectedLeadId && (
                            <div style={{ padding: '0 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', overflow: addingCustomer ? 'visible' : 'auto' }}>
                                <div style={{ display: 'flex', alignItems: 'center', minWidth: 'min-content' }}>
                                    {displayedCustomers && displayedCustomers.map((cust, idx) => (
                                        <div
                                            key={`${cust}-${idx}`}
                                            onClick={() => {
                                                if (cust === selectedCustomer) return;
                                                loadPricing(pricingData.enquiry.requestNo, cust, values);
                                            }}
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
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Pricing Table Content */}
                        {selectedLeadId && (
                            visibleJobs.length === 0 ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                                    No EnquiryFor items found for this enquiry.
                                </div>
                            ) : (
                                <>
                                    <table style={{ width: 'auto', minWidth: '600px', borderCollapse: 'collapse' }}>
                                        <tbody>
                                            {(() => {
                                                // Grouping Logic: Keyed by Job ID
                                                const groupMap = {}; // { jobId: { job, options: [] } }

                                                const itemNameOccRender = new Map();
                                                (pricingData.jobs || []).forEach((j) => {
                                                    const n = (j.itemName || '').trim();
                                                    if (!n) return;
                                                    itemNameOccRender.set(n, (itemNameOccRender.get(n) || 0) + 1);
                                                });
                                                const isAmbigItemName = (n) => (itemNameOccRender.get((n || '').trim()) || 0) > 1;

                                                const selectedLeadRootName = (pricingData.jobs || []).find(
                                                    (j) => String(j.id) === String(selectedLeadId)
                                                )?.itemName;

                                                // LEAD JOB FILTERING LOGIC (subtree ids: module helper getPricingLeadSubtreeIds)

                                                let targetJobs = visibleJobs;
                                                /** Jobs under the selected lead root (used for scope + anchor). */
                                                let validIds = null;
                                                if (selectedLeadId && pricingData && pricingData.jobs) {
                                                    // EXPANDED: Include ALL descendants (L1, L2, L3...)
                                                    validIds = getPricingLeadSubtreeIds(selectedLeadId, pricingData.jobs);
                                                    targetJobs = visibleJobs.filter(j => {
                                                        const jid = nid(j.id);
                                                        return jid != null && validIds.has(jid);
                                                    });
                                                }

                                                // Initialize Groups for Target Jobs
                                                // LOGIC UPDATE: Context-Aware Visibility
                                                // If User is viewing an External Tab (Not their own Internal Tab), hide Descendants.
                                                // Only show Editable Jobs in External/Parent Tabs.
                                                // Admin/Manager (hasLeadAccess) sees all.

                                                // Step 1: Resolve Tab Context (Which Job is this tab about?)
                                                const cleanTabNameSearch = (name) => name.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();

                                                // IMPROVED (Step 2026-03-10): Prioritize jobs within the selected branch scope to handle duplicate names
                                                let contextJob = null;
                                                if (selectedLeadId && pricingData && pricingData.jobs && validIds) {
                                                    contextJob = pricingData.jobs.find(j => {
                                                        const jid = nid(j.id);
                                                        return jid != null && validIds.has(jid) &&
                                                        (cleanTabNameSearch(j.itemName) === selectedCustomer || j.itemName === selectedCustomer);
                                                    });
                                                }

                                                if (!contextJob && pricingData && pricingData.jobs) {
                                                    contextJob = pricingData.jobs.find(j =>
                                                        cleanTabNameSearch(j.itemName) === selectedCustomer || j.itemName === selectedCustomer
                                                    );
                                                }

                                                // Step 2: Identify Allowed IDs in this Tab (Tree Match)
                                                let tabAllowedIds = null;
                                                if (contextJob) {
                                                    const ctxN = nid(contextJob.id);
                                                    tabAllowedIds = ctxN != null ? new Set([ctxN]) : new Set();
                                                    let changed = true;
                                                    while (changed) {
                                                        changed = false;
                                                        pricingData.jobs.forEach(j => {
                                                            const jid = nid(j.id);
                                                            const pid = nid(j.parentId);
                                                            if (jid != null && pid != null && !tabAllowedIds.has(jid) && tabAllowedIds.has(pid)) {
                                                                tabAllowedIds.add(jid);
                                                                changed = true;
                                                            }
                                                        });
                                                    }
                                                }

                                                // Step 3: Identify User Scope (What can this user see in general?)
                                                // Provision (Step 1857): Even if user has hasLeadAccess, if they are NOT the lead for this specific selection,
                                                // we restrict them to their assigned scope.
                                                const myJobs = pricingData.access.editableJobs || [];

                                                // Always include descendants of editable jobs for "Subjob View"
                                                const getMyTotalScope = (names) => {
                                                    const ids = new Set();
                                                    const startJobs = pricingData.jobs.filter(j => names.includes(j.itemName));
                                                    startJobs.forEach(sj => {
                                                        const sjid = nid(sj.id);
                                                        if (sjid != null) ids.add(sjid);
                                                        let changedInner = true;
                                                        while (changedInner) {
                                                            changedInner = false;
                                                            pricingData.jobs.forEach(child => {
                                                                const cid = nid(child.id);
                                                                const cpid = nid(child.parentId);
                                                                if (cid != null && cpid != null && !ids.has(cid) && ids.has(cpid)) {
                                                                    ids.add(cid);
                                                                    changedInner = true;
                                                                }
                                                            });
                                                        }
                                                    });
                                                    return ids;
                                                };

                                                // Must match the header badge ("Lead Job Access" vs "Subjob Access"):
                                                // only the user whose editable job *is* the selected lead root gets full branch scope.
                                                // Using hasLeadAccess here wrongly cleared myScopeIds for subjob users who matched another
                                                // root on the enquiry — they then saw the parent lead pricing row (read-only), violating 1c/2c.
                                                const selectedJobForScope = pricingData.jobs?.find((j) => String(j.id) === String(selectedLeadId));
                                                const editableObjsForScope = (pricingData.jobs || []).filter((j) =>
                                                    myJobs.includes(j.itemName)
                                                );
                                                const ownJobIsSelectedLeadRoot =
                                                    !!selectedJobForScope &&
                                                    editableObjsForScope.some((ej) => String(ej.id) === String(selectedJobForScope.id)) &&
                                                    (!selectedJobForScope.parentId ||
                                                        selectedJobForScope.parentId === 0 ||
                                                        selectedJobForScope.parentId === '0');

                                                // Sub-user scope must stay inside this lead’s tree (same itemName can exist on another branch).
                                                const rawMyScope = getMyTotalScope(myJobs);
                                                const myScopeInLeadTree = new Set();
                                                if (validIds && validIds.size) {
                                                    rawMyScope.forEach((id) => {
                                                        if (validIds.has(id)) myScopeInLeadTree.add(id);
                                                    });
                                                } else {
                                                    rawMyScope.forEach((id) => myScopeInLeadTree.add(id));
                                                }

                                                const myScopeIds = (pricingData.access.canEditAll || ownJobIsSelectedLeadRoot)
                                                    ? null // Admins, or lead owner: full branch under selected lead (2b)
                                                    : myScopeInLeadTree; // Subjob under this lead: own job + descendants only; ancestors hidden (1b–1c)

                                                // Single “own” row for edit/add/delete; descendants are view-only (1b, 2b).
                                                const ownJobAnchorId = resolveOwnJobAnchorId({
                                                    jobs: pricingData.jobs,
                                                    selectedLeadId,
                                                    myJobs,
                                                    canEditAll: !!pricingData.access.canEditAll,
                                                });

                                                // Step 4: Final Filter: Intersection of LeadJobScope, TabScope, and UserScope
                                                let contextFilteredJobs = targetJobs.filter(j => {
                                                    const jid = nid(j.id);
                                                    // A. Tab Filter: If we are in an internal/parent tab, only show that job and its children
                                                    if (tabAllowedIds && jid != null && !tabAllowedIds.has(jid)) return false;

                                                    // B. Scope Filter: Non-admins only see their assigned tree
                                                    if (myScopeIds && jid != null && !myScopeIds.has(jid)) return false;

                                                    return true;
                                                });

                                                contextFilteredJobs.forEach(job => {
                                                    groupMap[job.id] = { job: job, options: [], seenNames: new Set() };
                                                });

                                                // Determine Lead Job for sorting
                                                const activeLeadJob = pricingData.jobs.find(j => j.id == selectedLeadId) || targetJobs.find(j => j.isLead);

                                                // Assign Options to Groups
                                                // NOTE: Exclude simulated options (e.g. 'Base Price' placeholder with Date.now() id)
                                                // from maxId, otherwise every real option becomes 'isNotNewest' and gets hidden.
                                                const maxId = filteredOptions.reduce((max, opt) => {
                                                    if (opt.isSimulated) return max;
                                                    const n = optIdNum(opt.id);
                                                    if (!Number.isFinite(n)) return max;
                                                    return n > max ? n : max;
                                                }, 0);

                                                filteredOptions.forEach(opt => {
                                                    contextFilteredJobs.forEach(job => {
                                                        let match = false;
                                                        const activeLeadJobName = activeLeadJob ? activeLeadJob.itemName : null;
                                                        const activeLeadJobCode = activeLeadJob ? String(activeLeadJob.leadJobCode || activeLeadJob.LeadJobCode || '').trim() : '';
                                                         if (!opt.itemName) {
                                                             match = (job.id == selectedLeadId); // Null scope -> Matches Current Lead
                                                         } else if (opt.itemName.trim() === 'Lead Job') {
                                                             match = (job.id == selectedLeadId);
                                                         } else if (sameEnquiryItemName(opt.itemName, job.itemName)) {
                                                             match = true;
                                                         } else if (activeLeadJobName && opt.itemName.trim() === `${activeLeadJobName.trim()} / Lead Job`) {
                                                             match = true;
                                                         } else if (activeLeadJobCode && opt.itemName.trim() === `${activeLeadJobCode} / Lead Job`) {
                                                             match = true;
                                                         }
                                                        if (match && !groupMap[job.id].seenNames.has(opt.name)) {
                                                            groupMap[job.id].seenNames.add(opt.name); // DEDUPE PROTECTION (Step 932)
                                                            const key = `${opt.id}_${job.id}`;
                                                            let price = null; // Default to NULL (Missing) to differentiate from 0
                                                            let hasExplicitValue = false;

                                                            // Prefer server/raw lookup (scoped to selected lead subtree) so we never show another top-level lead’s price; then in-memory edits.
                                                            const lookupValue = (dataSet) => {
                                                                if (!dataSet) return null;
                                                                if (!enquiryForIdInSelectedLeadSubtree(selectedLeadId, job.id, pricingData.jobs)) {
                                                                    return null;
                                                                }
                                                                if (dataSet[key] && dataSet[key].Price !== undefined) {
                                                                    const row = dataSet[key];
                                                                    if (!pricingValueRowEnquiryForMatchesJob(row, job.id)) return null;
                                                                    if (!enquiryForIdInSelectedLeadSubtree(selectedLeadId, row.EnquiryForID ?? job.id, pricingData.jobs)) {
                                                                        return null;
                                                                    }
                                                                    if (valueRowLeadJobMatchesView(row.LeadJobName, selectedLeadRootName)) {
                                                                        return parseFloat(dataSet[key].Price);
                                                                    }
                                                                }
                                                                const fromRaw = parsePriceFromRawValueRowsForCell(
                                                                    pricingData.rawEnquiryPricingValues,
                                                                    job.id,
                                                                    opt.id,
                                                                    selectedCustomer,
                                                                    selectedLeadRootName,
                                                                    selectedLeadId,
                                                                    pricingData.jobs
                                                                );
                                                                if (fromRaw !== null) return fromRaw;
                                                                if (isAmbigItemName(job.itemName)) {
                                                                    return null;
                                                                }
                                                                const nameKey = `${opt.id}_${job.itemName}`;
                                                                if (dataSet[nameKey] && dataSet[nameKey].Price !== undefined) {
                                                                    if (!pricingValueRowEnquiryForMatchesJob(dataSet[nameKey], job.id)) {
                                                                        return null;
                                                                    }
                                                                    return parseFloat(dataSet[nameKey].Price);
                                                                }
                                                                const cleanName = job.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                                                                const cleanKey = `${opt.id}_${cleanName}`;
                                                                if (dataSet[cleanKey] && dataSet[cleanKey].Price !== undefined) {
                                                                    if (!pricingValueRowEnquiryForMatchesJob(dataSet[cleanKey], job.id)) {
                                                                        return null;
                                                                    }
                                                                    return parseFloat(dataSet[cleanKey].Price);
                                                                }
                                                                return null;
                                                            };

                                                            const fromLookup = lookupValue(pricingData.values);
                                                            if (fromLookup != null) {
                                                                price = fromLookup;
                                                                hasExplicitValue = true;
                                                            } else if (values[key] !== undefined && values[key] !== '') {
                                                                price = parseFloat(values[key]) || 0;
                                                                hasExplicitValue = true;
                                                            }

                                                            // Default to 0 for math if still null, but keep flag
                                                            const effectivePriceForCalc = (price === null) ? 0 : price;

                                                            // FALLBACK: Cross-Tab Lookup when price is missing in current customer tab.
                                                            const contextJob = pricingData.jobs.find(j =>
                                                                j.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim() === selectedCustomer ||
                                                                j.itemName === selectedCustomer
                                                            );
                                                            const isExternalContext = !contextJob;

                                                            const isMyScope = pricingData.access && pricingData.access.editableJobs && pricingData.access.editableJobs.includes(job.itemName);
                                                            const isMyInternalTab = contextJob && pricingData.access && pricingData.access.editableJobs && pricingData.access.editableJobs.includes(contextJob.itemName);
                                                            const shouldForceInternal = isExternalContext && !job.isLead && !isMyScope;

                                                            const isMissing = (price === null);

                                                            const leadTagMatches = (optLN) => {
                                                                if (!optLN) return false;
                                                                const t = optLN.trim();
                                                                if (activeLeadJobName && t === activeLeadJobName.trim()) return true;
                                                                if (activeLeadJobCode && t === activeLeadJobCode) return true;
                                                                return false;
                                                            };

                                                            // FIX: Trigger fallback whenever price is MISSING (not just shouldForceInternal).
                                                            if ((isMissing || shouldForceInternal) && pricingData.allValues) {
                                                                const lookupInternal = (dataSet, optionId) => {
                                                                    if (!dataSet) return null;
                                                                    if (!enquiryForIdInSelectedLeadSubtree(selectedLeadId, job.id, pricingData.jobs)) {
                                                                        return null;
                                                                    }
                                                                    const iKey = `${optionId}_${job.id}`;
                                                                    if (dataSet[iKey] && dataSet[iKey].Price !== undefined) {
                                                                        const irow = dataSet[iKey];
                                                                        if (!pricingValueRowEnquiryForMatchesJob(irow, job.id)) return null;
                                                                        if (!enquiryForIdInSelectedLeadSubtree(selectedLeadId, irow.EnquiryForID ?? job.id, pricingData.jobs)) {
                                                                            return null;
                                                                        }
                                                                        if (valueRowLeadJobMatchesView(irow.LeadJobName, selectedLeadRootName)) {
                                                                            return parseFloat(irow.Price);
                                                                        }
                                                                    }
                                                                    const fromR = parsePriceFromRawValueRowsForCell(
                                                                        pricingData.rawEnquiryPricingValues,
                                                                        job.id,
                                                                        optionId,
                                                                        selectedCustomer,
                                                                        selectedLeadRootName,
                                                                        selectedLeadId,
                                                                        pricingData.jobs
                                                                    );
                                                                    if (fromR !== null) return fromR;
                                                                    if (isAmbigItemName(job.itemName)) {
                                                                        return null;
                                                                    }
                                                                    const iNameKey = `${optionId}_${job.itemName}`;
                                                                    if (dataSet[iNameKey] && dataSet[iNameKey].Price !== undefined) {
                                                                        if (!pricingValueRowEnquiryForMatchesJob(dataSet[iNameKey], job.id)) return null;
                                                                        return parseFloat(dataSet[iNameKey].Price);
                                                                    }
                                                                    const iCleanKey = `${optionId}_${job.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim()}`;
                                                                    if (dataSet[iCleanKey] && dataSet[iCleanKey].Price !== undefined) {
                                                                        if (!pricingValueRowEnquiryForMatchesJob(dataSet[iCleanKey], job.id)) return null;
                                                                        return parseFloat(dataSet[iCleanKey].Price);
                                                                    }
                                                                    return null;
                                                                };

                                                                // Strategy 1: Find internal option in parent's customer bucket
                                                                const parentJob = pricingData.jobs.find(j => j.id == job.parentId);
                                                                if (parentJob) {
                                                                    const parentName = parentJob.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
                                                                    const rawParentName = parentJob.itemName.trim();

                                                                    // IMPROVED: Prioritize internal option matching the active Lead Job (Step 1912)
                                                                    const internalOption = pricingData.options
                                                                        .filter(o => o.name === opt.name && sameEnquiryItemName(o.itemName, job.itemName) && (o.customerName === parentName || o.customerName === rawParentName))
                                                                        .sort((a, b) => {
                                                                            const aLeadMatch = leadTagMatches(a.leadJobName);
                                                                            const bLeadMatch = leadTagMatches(b.leadJobName);
                                                                            if (aLeadMatch && !bLeadMatch) return -1;
                                                                            if (!aLeadMatch && bLeadMatch) return 1;
                                                                            return 0;
                                                                        })[0];

                                                                    if (internalOption) {
                                                                        let internalValues = pricingData.allValues[parentName];
                                                                        if (!internalValues) internalValues = pricingData.allValues[rawParentName];
                                                                        const internalPrice = lookupInternal(internalValues, internalOption.id);
                                                                        if (internalPrice !== null && internalPrice > 0) {
                                                                            price = internalPrice;
                                                                            hasExplicitValue = true;
                                                                        }
                                                                    }
                                                                }

                                                                // Strategy 2: Scan ALL customer buckets for a matching option+job price
                                                                if (price === null && pricingData.allValues) {
                                                                    const myEditableJobs = pricingData.access?.editableJobs || [];
                                                                    for (const [bucketCustomer, bucketValues] of Object.entries(pricingData.allValues)) {
                                                                        if (bucketCustomer === selectedCustomer) continue; // Skip current tab
                                                                        const bucketJob = pricingData.jobs.find(j =>
                                                                            j.itemName === bucketCustomer ||
                                                                            j.itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim() === bucketCustomer
                                                                        );
                                                                        const isScopeBucket = bucketJob && myEditableJobs.includes(bucketJob.itemName);
                                                                        if (!isScopeBucket) continue;

                                                                        // Find ALL matching options in this bucket (same name + same job context)
                                                                        // IMPROVED: Prioritize options matching active lead branch
                                                                        const matchingOptions = pricingData.options
                                                                            .filter(o => o.name === opt.name && sameEnquiryItemName(o.itemName, job.itemName) && o.customerName === bucketCustomer)
                                                                            .sort((a, b) => {
                                                                                const aLeadMatch = leadTagMatches(a.leadJobName);
                                                                                const bLeadMatch = leadTagMatches(b.leadJobName);
                                                                                if (aLeadMatch && !bLeadMatch) return -1;
                                                                                if (!aLeadMatch && bLeadMatch) return 1;
                                                                                return 0;
                                                                            });

                                                                        for (const mOpt of matchingOptions) {
                                                                            const found = lookupInternal(bucketValues, mOpt.id);
                                                                            if (found !== null && found > 0) {
                                                                                price = found;
                                                                                hasExplicitValue = true;
                                                                                break;
                                                                            }
                                                                        }
                                                                        if (price !== null && price > 0) break;
                                                                    }
                                                                }
                                                            }

                                                            // Finalize Price for Display Logic
                                                            if (price === null) price = 0;

                                                            // Hide if Empty, Not Newest, Not Base Price
                                                            const isDefault = (opt.name === 'Price' || opt.name === 'Optional');
                                                            const isEmpty = (price <= 0.01 && !hasExplicitValue); // Treat 0 as empty ONLY if implicit
                                                            const optN = optIdNum(opt.id);
                                                            const isNotNewest = Number.isFinite(optN) && maxId > 0 && optN !== maxId;

                                                            if (isDefault && isEmpty && isNotNewest) return;

                                                            // Push cloned option with effective Price for display
                                                            groupMap[job.id].options.push({ ...opt, effectivePrice: price });
                                                        }
                                                    });
                                                });

                                                // HIERARCHICAL SORTING LOGIC
                                                const hierarchyResults = [];
                                                const processedIds = new Set();
                                                const groupList = Object.values(groupMap);

                                                const idMap = new Map();
                                                contextFilteredJobs.forEach(j => idMap.set(jobKey(j.id), j));

                                                const childrenMap = new Map();
                                                contextFilteredJobs.forEach(j => {
                                                    const pk = jobKey(j.parentId);
                                                    if (!isRootJob(j) && idMap.has(pk)) {
                                                        if (!childrenMap.has(pk)) childrenMap.set(pk, []);
                                                        childrenMap.get(pk).push(j);
                                                    }
                                                });

                                                const buildList = (job, level) => {
                                                    const k = jobKey(job.id);
                                                    if (processedIds.has(k)) return;
                                                    processedIds.add(k);

                                                    const group = groupMap[job.id];
                                                    if (group) {
                                                        group.level = level;
                                                        hierarchyResults.push(group);
                                                    }

                                                    const children = childrenMap.get(k) || [];
                                                    children.sort((a, b) => (nid(a.id) || 0) - (nid(b.id) || 0));
                                                    children.forEach(c => buildList(c, level + 1));
                                                };

                                                contextFilteredJobs.forEach(j => {
                                                    if (isRootJob(j) || !idMap.has(jobKey(j.parentId))) {
                                                        buildList(j, 0);
                                                    }
                                                });

                                                if (hierarchyResults.length < groupList.length) {
                                                    groupList.forEach(g => {
                                                        if (!processedIds.has(jobKey(g.job.id))) {
                                                            g.level = 0;
                                                            hierarchyResults.push(g);
                                                        }
                                                    });
                                                }

                                                if (import.meta.env.DEV) {
                                                    const totalRows = hierarchyResults.reduce((s, g) => s + (g.options?.length || 0), 0);
                                                    console.log('[Pricing table render]', {
                                                        contextFilteredJobs: contextFilteredJobs.length,
                                                        filteredOptions: filteredOptions.length,
                                                        hierarchyJobSections: hierarchyResults.length,
                                                        renderedOptionRows: totalRows,
                                                        perJobRows: hierarchyResults.map((g) => ({ id: g.job.id, name: g.job.itemName, rows: g.options?.length || 0 })),
                                                    });
                                                }

                                                return hierarchyResults.map(group => {
                                                    const job = group.job;
                                                    let groupName = job.itemName;
                                                    if (job.isLead) {
                                                        const code = (job.leadJobCode || job.LeadJobCode || '').trim();
                                                        groupName = code ? `${code} - ${job.itemName}` : job.itemName;
                                                    }

                                                    // Non-admins: only the resolved own-job anchor is editable; same-branch subjobs are view-only (1b, 2b).
                                                    const canEditSection =
                                                        pricingData.access.canEditAll ||
                                                        (ownJobAnchorId != null && String(job.id) === String(ownJobAnchorId));

                                                    return (
                                                        <React.Fragment key={job.id}>
                                                            <tr style={{ background: '#e2e8f0' }}>
                                                                <td colSpan={2} style={{
                                                                    padding: '6px 12px',
                                                                    fontWeight: 'bold',
                                                                    fontSize: '11px',
                                                                    color: '#475569',
                                                                    textTransform: 'uppercase',
                                                                    paddingLeft: `${(group.level || 0) * 20 + 12}px`
                                                                }}>
                                                                    {group.level > 0 && <span style={{ marginRight: '6px', color: '#dc2626', fontWeight: 'bold', fontSize: '16px' }}>↳</span>}
                                                                    {groupName} Options
                                                                </td>
                                                            </tr>
                                                            {group.options.map(option => {
                                                                const key = `${option.id}_${job.id}`;
                                                                const canEditRow = canEditSection;

                                                                let displayValue = '';
                                                                if (values[key] !== undefined && values[key] !== '') {
                                                                    displayValue = values[key];
                                                                } else if (option.effectivePrice && option.effectivePrice > 0.01) {
                                                                    displayValue = option.effectivePrice;
                                                                } else if (values[key] === 0 || values[key] === '0') {
                                                                    displayValue = 0;
                                                                } else {
                                                                    displayValue = '';
                                                                }

                                                                return (
                                                                    <tr key={`${option.id}_${job.id}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                                        <td style={{ padding: '6px 12px', fontWeight: '500', color: '#1e293b', fontSize: '13px' }}>{option.name}</td>
                                                                        <td style={{ padding: '4px 8px', textAlign: 'left', width: '150px' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '4px', marginLeft: '0px' }}>
                                                                                <input
                                                                                    type="text"
                                                                                    inputMode="decimal"
                                                                                    value={
                                                                                        focusedCell === `${option.id}_${job.id}`
                                                                                            ? (displayValue === '' ? '' : String(displayValue))
                                                                                            : formatPrice(displayValue)
                                                                                    }
                                                                                    onFocus={() => setFocusedCell(`${option.id}_${job.id}`)}
                                                                                    onBlur={() => setFocusedCell(null)}
                                                                                    onChange={(e) => handleValueChange(option.id, job.id, e.target.value)}
                                                                                    disabled={!canEditRow}
                                                                                    placeholder="0"
                                                                                    style={{
                                                                                        width: '100%',
                                                                                        maxWidth: '130px',
                                                                                        padding: '4px 6px',
                                                                                        border: '1px solid #e2e8f0',
                                                                                        borderRadius: '4px',
                                                                                        fontSize: '13px',
                                                                                        textAlign: 'right',
                                                                                        backgroundColor: canEditRow ? '#fff' : '#f1f5f9',
                                                                                        color: '#1e293b',
                                                                                        opacity: 1,
                                                                                        cursor: canEditRow ? 'text' : 'not-allowed'
                                                                                    }}
                                                                                />
                                                                                {canEditRow &&
                                                                                    String(option.name || '').trim().toLowerCase() !== 'base price' && (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => deleteOption(option.id)}
                                                                                            title="Delete this option"
                                                                                            style={{
                                                                                                background: 'none',
                                                                                                border: 'none',
                                                                                                color: '#ef4444',
                                                                                                cursor: 'pointer',
                                                                                            }}
                                                                                        >
                                                                                            <Trash2 size={16} />
                                                                                        </button>
                                                                                    )}
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                            {canEditSection && (
                                                                <tr style={{ background: '#f8fafc' }}>
                                                                    <td style={{ padding: '4px 12px' }}>
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
                                                                                padding: '4px 8px',
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
                                                            <tr><td colSpan={2} style={{ height: '8px' }}></td></tr>
                                                        </React.Fragment>
                                                    );
                                                });
                                            })()}
                                        </tbody>
                                    </table>
                                    {/* Actions Footer */}
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
                            )
                        )}
                    </div>
                )
            }
        </div>
    );
};

export default PricingForm;
