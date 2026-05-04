import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, CartesianGrid
} from 'recharts';
import { Printer, Mail } from 'lucide-react';
import './SalesReport.css';

const defaultReport = () => ({
    targetVsActual: [
        { name: 'Q1', target: 0, actual: 0 },
        { name: 'Q2', target: 0, actual: 0 },
        { name: 'Q3', target: 0, actual: 0 },
        { name: 'Q4', target: 0, actual: 0 }
    ],
    grossMarginTargetVsActual: [
        { name: 'Q1', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0 },
        { name: 'Q2', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0 },
        { name: 'Q3', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0 },
        { name: 'Q4', target: 0, actual: 0, targetSalesBase: 0, targetGpPct: 0 }
    ],
    winLoss: {
        won: 0, lost: 0, followUp: 0, quoted: 0,
        wonValue: 0, lostValue: 0, followUpValue: 0, quotedValue: 0
    },
    probabilityFunnel: [],
    topJobBooked: []
});

/** BHD: values &lt; 1,000,000 use k; 1,000,000+ use M (entire report). */
const SR_ONE_MILLION = 1_000_000;

function formatSalesAmountString(num) {
    const n = Number(num);
    if (Number.isNaN(n)) return '0.00k';
    if (Math.abs(n) >= SR_ONE_MILLION) {
        return `${(n / SR_ONE_MILLION).toFixed(2)}M`;
    }
    return `${(n / 1000).toFixed(2)}k`;
}

/** Brand palette for this report only */
const SR_BLUE = '#6a73ae';
const SR_BLUE_LIGHT = '#abc3e4';

const WON_GREEN = '#15803d';
const LOST_RED = '#dc2626';
/** Won/Lost card: Follow up KPI + donut segment */
const SR_ROYAL_BLUE = '#4169E1';

const PIE_COLORS = {
    Won: WON_GREEN,
    Lost: LOST_RED,
    'Follow up': SR_ROYAL_BLUE
};

/** Won/Lost donut: SVG defs gradient ids (fills pie sectors) */
const SR_DONUT_GRADIENTS = {
    Won: { id: 'srDonutGradWon', hi: '#22c55e', lo: WON_GREEN },
    Lost: { id: 'srDonutGradLost', hi: '#f87171', lo: LOST_RED },
    'Follow up': { id: 'srDonutGradFollowUp', hi: '#7BA3FF', lo: '#2952c4' }
};

/** Target vs Actual / GM charts — actual darker slate; target lighter periwinkle */
const BAR_TARGET_FILL = '#a3b8db';
const BAR_ACTUAL_FILL = '#4f5782';

/** SVG fill URLs (unique per chart so two BarCharts can coexist) */
const SR_BAR_JB = { target: 'url(#srBarJbTarget)', actual: 'url(#srBarJbActual)' };
const SR_BAR_GM = { target: 'url(#srBarGmTarget)', actual: 'url(#srBarGmActual)' };

/** Lighten any #RRGGBB toward white (0 = solid, 1 = white) — bar + funnel gradients */
function mixHexWithWhite(hex, whiteBlend) {
    const raw = String(hex || '').replace('#', '');
    if (raw.length !== 6) return hex;
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    const t = Math.min(1, Math.max(0, whiteBlend));
    const mx = (c) => Math.round(c + (255 - c) * t);
    const h = (n) => n.toString(16).padStart(2, '0');
    return `#${h(mx(r))}${h(mx(g))}${h(mx(b))}`;
}

/** Darken #RRGGBB toward black (0 = no change, 1 = strong) — funnel band bottom edge */
function mixHexWithBlack(hex, amount) {
    const raw = String(hex || '').replace('#', '');
    if (raw.length !== 6) return hex;
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    const t = Math.min(1, Math.max(0, amount));
    const dk = (c) => Math.round(c * (1 - t * 0.5));
    const h = (n) => n.toString(16).padStart(2, '0');
    return `#${h(dk(r))}${h(dk(g))}${h(dk(b))}`;
}

function hexToRgb(hex) {
    const raw = String(hex || '').replace('#', '');
    if (raw.length !== 6) return null;
    return {
        r: parseInt(raw.slice(0, 2), 16),
        g: parseInt(raw.slice(2, 4), 16),
        b: parseInt(raw.slice(4, 6), 16)
    };
}

function lerpColorHex(hexA, hexB, t) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    if (!a || !b) return hexA;
    const u = Math.min(1, Math.max(0, t));
    const x = (c1, c2) => Math.round(c1 + (c2 - c1) * u);
    const pad = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
    return `#${pad(x(a.r, b.r))}${pad(x(a.g, b.g))}${pad(x(a.b, b.b))}`;
}

/** Legend order: Recharts sorts by `value` alphabetically by default (Actual before Target). Pin Target first. */
const legendTargetFirstSorter = (entry) => (entry.value === 'Target' ? 0 : 1);

/** Slightly dark grey for Target vs Actual / GM bar chart axes + legend (matches summary text tuning). */
const SR_CHART_TICK_FILL = '#1f2937';
/** Legend label text — dark grey for all charts. */
const SR_CHART_LEGEND_GREY = '#374151';

/** Bar charts: left margin + Y width so "400.00k" ticks are not clipped; tick size ≥ summary legibility. */
const SR_BAR_CHART_MARGIN = { top: 6, right: 6, left: 16, bottom: 6 };
const SR_YAXIS_WIDTH = 46;
const SR_YAXIS_TICK = { fontSize: 10, fill: SR_CHART_TICK_FILL };

/** Target vs Actual / GM charts — align tick legend sizes with summary (+15%) */
const SR_TA_TEXT_SCALE = 1.15;
const SR_TA_YAXIS_WIDTH = Math.round(SR_YAXIS_WIDTH * SR_TA_TEXT_SCALE);
/** Y-axis value labels −15% vs prior scaled size */
const SR_TA_YAXIS_FONT_SCALE = 0.85;
const SR_TA_YAXIS_TICK = {
    fontSize: Math.round(10 * SR_TA_TEXT_SCALE * SR_TA_YAXIS_FONT_SCALE),
    fill: SR_CHART_TICK_FILL
};
const SR_TA_XAXIS_TICK = {
    fontSize: Math.round(9 * SR_TA_TEXT_SCALE),
    fill: SR_CHART_TICK_FILL,
    textAnchor: 'middle'
};
const SR_TA_LEGEND_FONT_SIZE = Math.round(9 * SR_TA_TEXT_SCALE);
const SR_TA_XAXIS_HEIGHT = Math.round(16 * SR_TA_TEXT_SCALE);

/** Job Booking + Gross margin: tight chart left; quarter table padding matches Recharts plot inset so Q1–Q4 line up with bar / x-axis centres */
const SR_TA_ALIGNED_BAR_MARGIN = { top: 6, right: 6, left: 2, bottom: 6 };
/** Left offset to category plot (margin.left + Y-axis width) — same basis as Recharts layout. */
const SR_TA_PLOT_OFFSET_LEFT = SR_TA_ALIGNED_BAR_MARGIN.left + SR_TA_YAXIS_WIDTH;
const SR_TA_PLOT_OFFSET_RIGHT = SR_TA_ALIGNED_BAR_MARGIN.right;
const SR_TA_QUARTER_CHART_ALIGN_STYLE = {
    '--sr-ta-plot-offset-left': `${SR_TA_PLOT_OFFSET_LEFT}px`,
    '--sr-ta-plot-offset-right': `${SR_TA_PLOT_OFFSET_RIGHT}px`
};

/** Top Jobs table — must match server whitelist in `salesReportRoutes.js` */
const TOP_JOB_STATUS_OPTIONS = [
    { value: 'Won', label: 'Won' },
    { value: 'Lost', label: 'Lost' },
    { value: 'Pending', label: 'Pending' },
    { value: 'Follow Up', label: 'Follow Up' },
    { value: 'On Hold', label: 'On Hold' },
    { value: 'Cancelled', label: 'Cancelled' },
    { value: 'Retendered', label: 'Retendered' }
];

const FUNNEL_STAGE_DEFS = [
    { name: 'Quoted', probability: 10 },
    { name: 'Low Chance', probability: 25 },
    { name: '50-50 Chance', probability: 50 },
    { name: 'Medium Chance', probability: 75 },
    { name: 'High Chance', probability: 90 },
    { name: 'Very High Chance', probability: 99 }
];

/** Pipeline funnel: royal blue ramp — light top → dark bottom (same blend depth as before) */
const FUNNEL_COLOR_TOP = mixHexWithWhite(SR_ROYAL_BLUE, 0.74);
const FUNNEL_COLOR_BOTTOM = mixHexWithBlack(SR_ROYAL_BLUE, 0.58);

const FUNNEL_STAGES = FUNNEL_STAGE_DEFS.map((s, i) => {
    const n = FUNNEL_STAGE_DEFS.length;
    const t = n <= 1 ? 0 : i / (n - 1);
    return { ...s, color: lerpColorHex(FUNNEL_COLOR_TOP, FUNNEL_COLOR_BOTTOM, t) };
});

/** Custom inverted funnel; numeric values are shown in the summary block below. */
function SalesPipelineFunnelVisual({ rows, formatFullNumber }) {
    const vb = { w: 100, h: 100 };
    /** Extra viewBox space above/below drawing (y 0…h) so top % label (e.g. 10%) isn’t clipped. */
    const vbPadY = 6;
    /** Left/right viewBox pad — % labels use textAnchor end and extend left of the funnel edge; without this, “10%” clips. */
    const vbPadX = 14;
    /** Widest row at top — nudge up slightly vs inset copy while vbPadX keeps “10%” clear. */
    const hwTop = 50.5;
    /** Minimum half-width at bottom — flat base. */
    const hwBot = 14.2;
    const hwAt = (y) => hwTop + ((hwBot - hwTop) * y) / vb.h;
    const n = Math.max(rows?.length || 0, 1);
    const bandH = vb.h / n;

    return (
        <div className="sales-pipeline-funnel-visual d-flex flex-column flex-grow-1 min-h-0 w-100">
            <div className="sr-funnel-svg-wrap">
                <svg
                    viewBox={`${-vbPadX} ${-vbPadY} ${vb.w + 2 * vbPadX} ${vb.h + 2 * vbPadY}`}
                    preserveAspectRatio="xMidYMid meet"
                    className="sr-funnel-svg"
                    role="img"
                    aria-label="Sales pipeline by probability stage"
                >
                    <defs>
                        <filter id="srFunnelDrop" x="-30%" y="-30%" width="160%" height="160%">
                            <feDropShadow dx="0" dy="1.2" stdDeviation="1.6" floodColor="#0f172a" floodOpacity="0.13" />
                        </filter>
                        {rows.map((row, i) => (
                            <linearGradient
                                key={`srFunnelGrad-${i}`}
                                id={`srFunnelGrad-${i}`}
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                            >
                                <stop offset="0%" stopColor={mixHexWithWhite(row.fill, 0.45)} />
                                <stop offset="50%" stopColor={row.fill} />
                                <stop offset="100%" stopColor={mixHexWithBlack(row.fill, 0.52)} />
                            </linearGradient>
                        ))}
                    </defs>
                    <g filter="url(#srFunnelDrop)">
                    {rows.map((row, i) => {
                        const y0 = i * bandH;
                        const y1 = (i + 1) * bandH;
                        const xLT = vb.w / 2 - hwAt(y0);
                        const xRT = vb.w / 2 + hwAt(y0);
                        const xLB = vb.w / 2 - hwAt(y1);
                        const xRB = vb.w / 2 + hwAt(y1);
                        const pts = `${xLT},${y0} ${xRT},${y0} ${xRB},${y1} ${xLB},${y1}`;
                        const val = Number(row.value) || 0;
                        return (
                            <g key={row.name || i}>
                                <title>{`${row.name}: ${formatFullNumber(val)}`}</title>
                                <polygon
                                    points={pts}
                                    fill={`url(#srFunnelGrad-${i})`}
                                    stroke="rgba(15, 23, 42, 0.32)"
                                    strokeWidth="0.55"
                                    vectorEffect="non-scaling-stroke"
                                />
                            </g>
                        );
                    })}
                    </g>
                    {rows.map((row, i) => {
                        const stage = FUNNEL_STAGES[i];
                        if (!stage) return null;
                        const y0 = i * bandH;
                        const y1 = (i + 1) * bandH;
                        /* Top band: label a bit lower so “10%” clears viewBox padding; others slightly above mid-band */
                        const cy =
                            i === 0 ? y0 + bandH * 0.48 : y0 + bandH * 0.38;
                        const xLeftAtCy = vb.w / 2 - hwAt(cy);
                        const labelX = xLeftAtCy - 1.15;
                        return (
                            <text
                                key={`lbl-${stage.probability}`}
                                x={labelX}
                                y={cy}
                                fontSize={3.35}
                                textAnchor="end"
                                dominantBaseline="middle"
                                className="sr-funnel-label-text-svg"
                            >
                                {stage.probability}%
                            </text>
                        );
                    })}
                    {rows.map((row, i) => {
                        const val = Number(row.value) || 0;
                        if (val <= 0) return null;
                        const y0 = i * bandH;
                        const y1 = (i + 1) * bandH;
                        const cyVal = y0 + bandH * 0.62;
                        const nBands = rows.length;
                        const lightSegment = i < Math.ceil(nBands / 2);
                        return (
                            <text
                                key={`fval-${row.name || i}`}
                                x={vb.w / 2}
                                y={cyVal}
                                fontSize={2.85}
                                fontWeight="700"
                                textAnchor="middle"
                                dominantBaseline="middle"
                                className="sr-funnel-block-value-svg"
                                fill={lightSegment ? '#0f172a' : '#f8fafc'}
                                stroke={lightSegment ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.35)'}
                                strokeWidth="0.22"
                                paintOrder="stroke fill"
                            >
                                {formatFullNumber(val)}
                            </text>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
}

const SalesReport = () => {
    const { currentUser, storedLoginEmail } = useAuth();
    const [filterLocks, setFilterLocks] = useState({
        company: false,
        division: false,
        role: false
    });

    const [year, setYear] = useState(() => localStorage.getItem('reports_year') || '2026');
    const [company, setCompany] = useState(() => {
        const s = localStorage.getItem('reports_company');
        return s && s !== 'All' ? s : '';
    });
    const [division, setDivision] = useState(() => {
        const s = localStorage.getItem('reports_division');
        return s && s !== 'All' ? s : '';
    });
    const [role, setRole] = useState(() => localStorage.getItem('reports_role') || 'All');
    const [topJobStatus, setTopJobStatus] = useState('Won');

    const [loading, setLoading] = useState(false);
    const [topJobsLoading, setTopJobsLoading] = useState(false);
    const [summaryError, setSummaryError] = useState(null);
    const [reportData, setReportData] = useState(defaultReport);

    const [filterOptions, setFilterOptions] = useState({
        years: [],
        companies: [],
        divisions: [],
        roles: []
    });

    /**
     * Cascading filter options from GET /filters:
     * divisions scope to selected company; SE names to company + division (server-side).
     * Non-CC locked users: fetch only `email` (ignore dropdown params so master triple + years stay correct).
     */
    React.useEffect(() => {
        const loadFilters = async () => {
            try {
                const email = (currentUser?.EmailId || currentUser?.email || storedLoginEmail || '').trim();
                const params = new URLSearchParams();
                if (email) params.append('email', email);
                if (!filterLocks.company) {
                    if (company) params.append('company', company);
                    if (division) params.append('division', division);
                }

                const response = await fetch(`/api/sales-report/filters?${params.toString()}`);
                if (response.ok) {
                    const data = await response.json();
                    const companies = data.companies || [];
                    const divisions = data.divisions || [];
                    const roles = data.roles || [];
                    setFilterOptions((prev) => ({
                        ...prev,
                        years: data.years || [],
                        companies,
                        divisions,
                        roles
                    }));
                    setCompany((prev) => (companies.length ? (companies.includes(prev) ? prev : companies[0]) : prev));
                    setDivision((prev) => (divisions.length ? (divisions.includes(prev) ? prev : divisions[0]) : prev));
                }
            } catch (error) {
                console.error('Failed to fetch sales report filters', error);
            }
        };
        loadFilters();
    }, [company, division, filterLocks.company, currentUser, storedLoginEmail]);

    useEffect(() => {
        localStorage.setItem('reports_year', year);
        if (company) localStorage.setItem('reports_company', company);
        if (division) localStorage.setItem('reports_division', division);
        localStorage.setItem('reports_role', role);
    }, [year, company, division, role]);

    const fetchSummary = async () => {
        setLoading(true);
        setSummaryError(null);
        try {
            const params = new URLSearchParams();
            params.append('year', year);
            if (company) params.append('company', company);
            if (division) params.append('division', division);
            if (role && role !== 'All') params.append('role', role);
            const email = (currentUser?.EmailId || currentUser?.email || storedLoginEmail || '').trim();
            if (email) params.append('email', email);

            const res = await fetch(`/api/sales-report/summary?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                const d = defaultReport();
                setReportData((prev) => ({
                    ...prev,
                    targetVsActual: data.targetVsActual || d.targetVsActual,
                    grossMarginTargetVsActual: data.grossMarginTargetVsActual || d.grossMarginTargetVsActual,
                    winLoss: { ...d.winLoss, ...(data.winLoss || {}) },
                    probabilityFunnel: data.probabilityFunnel || []
                }));
            } else {
                setSummaryError('Could not load sales report.');
                setReportData(defaultReport());
            }
        } catch (error) {
            console.error('Failed to fetch report summary', error);
            setSummaryError('Could not load sales report.');
            setReportData(defaultReport());
        } finally {
            setLoading(false);
        }
    };

    const fetchTopJobBooked = async () => {
        setTopJobsLoading(true);
        try {
            const params = new URLSearchParams();
            params.append('year', year);
            if (company) params.append('company', company);
            if (division) params.append('division', division);
            if (role && role !== 'All') params.append('role', role);
            params.append('topJobStatus', topJobStatus);
            const email = (currentUser?.EmailId || currentUser?.email || storedLoginEmail || '').trim();
            if (email) params.append('email', email);

            const res = await fetch(`/api/sales-report/top-job-booked?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setReportData((prev) => ({
                    ...prev,
                    topJobBooked: data.topJobBooked || []
                }));
            }
        } catch (e) {
            console.error('Failed to fetch top jobs', e);
        } finally {
            setTopJobsLoading(false);
        }
    };

    useEffect(() => {
        if (!year) return;
        if (!filterLocks.company && (!company || !division)) return;
        fetchSummary();
    }, [year, company, division, role, filterLocks.company, currentUser, storedLoginEmail]);

    useEffect(() => {
        if (!year) return;
        if (!filterLocks.company && (!company || !division)) return;
        fetchTopJobBooked();
    }, [year, company, division, role, topJobStatus, filterLocks.company, currentUser, storedLoginEmail]);

    useEffect(() => {
        const email = (currentUser?.EmailId || currentUser?.email || storedLoginEmail || '').trim();
        if (email) {
            fetch(`/api/sales-report/user-access-details?email=${encodeURIComponent(email)}`)
                .then(res => {
                    if (!res.ok) throw new Error('Network response was not ok');
                    return res.json();
                })
                .then(data => {
                    const shouldLock = !!data.lockCompanyDivisionRole;
                    setFilterLocks({
                        company: shouldLock,
                        division: shouldLock,
                        role: shouldLock
                    });
                    if (shouldLock) {
                        if (data.company) setCompany(data.company);
                        if (data.division) setDivision(data.division);
                        if (data.role) setRole(data.role);
                        setFilterOptions(prev => ({
                            ...prev,
                            companies: data.company ? [data.company] : prev.companies,
                            divisions: data.division ? [data.division] : prev.divisions,
                            roles: data.role ? [data.role] : prev.roles
                        }));
                    }
                })
                .catch(err => {
                    console.error('Failed to fetch user access details', err);
                    setFilterLocks({ company: false, division: false, role: false });
                });
        }
    }, [currentUser, storedLoginEmail]);

    const handleCompanyChange = (e) => {
        const val = e.target.value;
        setCompany(val);
        setDivision('');
        setRole('All');
    };

    const handleDivisionChange = (e) => {
        const val = e.target.value;
        setDivision(val);
        setRole('All');
    };

    /** Plain string for charts / tooltips (k if &lt; 1M, else M). */
    const formatFullNumber = (num) => formatSalesAmountString(num);

    /** In-page amounts: suffix k or M at 50% of digit size (see `.sr-money-thousands__k` / `__M`). */
    const formatK = (num) => {
        const n = Number(num);
        const s = formatSalesAmountString(n);
        const isM = s.endsWith('M');
        const digits = isM ? s.slice(0, -1) : s.slice(0, -1);
        return (
            <span className="sr-money-thousands">
                {digits}
                <span className={isM ? 'sr-money-thousands__M' : 'sr-money-thousands__k'}>{isM ? 'M' : 'k'}</span>
            </span>
        );
    };

    const formatShort = (num) => formatSalesAmountString(num);

    const formatGpTargetPct = (n) => {
        const x = Number(n);
        if (Number.isNaN(x)) return '0%';
        return `${Math.round(x)}%`;
    };

    const formatGpTargetPctDisplay = (n) => {
        const x = Number(n);
        const r = Number.isNaN(x) ? 0 : Math.round(x);
        return (
            <>
                {r}
                <span className="sr-pct-sym">%</span>
            </>
        );
    };

    /** WonGrossProfit is GP %; JobValue is full units — GP amount = JobValue × GP% / 100. */
    const formatJobBookedGrossMargin = (row) => {
        const jv = Number(row.JobValue) || 0;
        const gpPctRaw = row.WonGrossProfit;
        if (gpPctRaw === null || gpPctRaw === undefined || gpPctRaw === '') return '—';
        const gpPct = Number(gpPctRaw);
        if (Number.isNaN(gpPct)) return '—';
        const gpVal = jv * (gpPct / 100);
        const pctRounded = Math.round(gpPct);
        return (
            <>
                {formatK(gpVal)} ({pctRounded}
                <span className="sr-pct-sym">%</span>)
            </>
        );
    };

    const targetVsActualData = reportData.targetVsActual || [];
    const totalActual = targetVsActualData.reduce((acc, curr) => acc + (Number(curr.actual) || 0), 0);
    const totalTarget = targetVsActualData.reduce((acc, curr) => acc + (Number(curr.target) || 0), 0);
    const overallRatio = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;

    const grossMarginData = reportData.grossMarginTargetVsActual || defaultReport().grossMarginTargetVsActual;
    const gmTotalActual = grossMarginData.reduce((acc, curr) => acc + (Number(curr.actual) || 0), 0);
    const gmTotalTarget = grossMarginData.reduce((acc, curr) => acc + (Number(curr.target) || 0), 0);
    const gmTotalSalesTargetBase = grossMarginData.reduce((acc, curr) => acc + (Number(curr.targetSalesBase) || 0), 0);
    const gmOverallTargetGpPct = gmTotalSalesTargetBase > 0 ? (gmTotalTarget / gmTotalSalesTargetBase) * 100 : 0;
    const gmOverallRatio = gmTotalTarget > 0 ? Math.round((gmTotalActual / gmTotalTarget) * 100) : 0;

    const wl = reportData.winLoss || defaultReport().winLoss;
    const quotedDenom = Number(wl.quotedValue) || 0;
    const winningRate =
        quotedDenom > 0 ? Math.round(((Number(wl.wonValue) || 0) / quotedDenom) * 100) : 0;
    const losingRate =
        quotedDenom > 0 ? Math.round(((Number(wl.lostValue) || 0) / quotedDenom) * 100) : 0;

    /** Donut: Won / Lost / Follow up only (Quoted stays in KPI row, not in chart). */
    const pieSlices = useMemo(() => {
        const rows = [
            { name: 'Won', value: Number(wl.wonValue) || 0 },
            { name: 'Lost', value: Number(wl.lostValue) || 0 },
            { name: 'Follow up', value: Number(wl.followUpValue) || 0 }
        ];
        return rows.filter((r) => r.value > 0);
    }, [wl]);

    const funnelData = useMemo(() => {
        const rows = reportData.probabilityFunnel || [];
        return FUNNEL_STAGES.map((stage) => {
            const found = rows.find((item) => {
                if (item.ProbabilityPercentage === stage.probability) return true;
                if (!item.ProbabilityName) return false;
                const itemNameLower = String(item.ProbabilityName).toLowerCase();
                const stageNameLower = stage.name.toLowerCase();
                if (stage.name === 'High Chance') {
                    return itemNameLower.includes('high chance') && !itemNameLower.includes('very high chance');
                }
                return itemNameLower.includes(stageNameLower);
            });
            return {
                value: found ? Number(found.TotalValue) || 0 : 0,
                name: `${stage.name} (${stage.probability}%)`,
                fill: stage.color
            };
        });
    }, [reportData.probabilityFunnel]);

    const topRows = useMemo(() => {
        const rows = reportData.topJobBooked || [];
        return [...rows].sort((a, b) => (Number(b.JobValue) || 0) - (Number(a.JobValue) || 0));
    }, [reportData.topJobBooked]);

    const topJobValueMax = useMemo(() => {
        const vals = topRows.map((r) => Math.abs(Number(r.JobValue)) || 0);
        return vals.length ? Math.max(...vals) : 0;
    }, [topRows]);

    const topJobsHeadingWord = useMemo(() => {
        const o = TOP_JOB_STATUS_OPTIONS.find((x) => x.value === topJobStatus);
        return o ? o.label : 'Won';
    }, [topJobStatus]);

    const handlePrint = () => {
        const container = document.querySelector('.sales-report-page');
        if (container) {
            container.classList.add('printing');
            setTimeout(() => window.print(), 450);
        } else {
            window.print();
        }
    };

    useEffect(() => {
        const handleAfterPrint = () => {
            document.querySelector('.sales-report-page')?.classList.remove('printing');
        };
        window.addEventListener('afterprint', handleAfterPrint);
        return () => window.removeEventListener('afterprint', handleAfterPrint);
    }, []);

    const handleEmail = () => {
        const subject = 'Sales Report';
        const body = 'Please find the Sales Report attached. (Note: Please save the report as PDF using the Print option before attaching)';
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };

    return (
        <div
            className="container-fluid sales-report-page sales-report-fit d-flex flex-column"
            style={{
                width: '100vw',
                marginLeft: 'calc(50% - 50vw)',
                marginRight: 'calc(50% - 50vw)'
            }}
        >
            <div className="sr-filter-bar flex-shrink-0 mb-2">
                <div className="d-flex align-items-end justify-content-between flex-wrap gap-2">
                    <div className="d-flex flex-wrap gap-3 align-items-end sr-filter-groups">
                        <div className="sr-filter-field">
                            <label className="sr-filter-label">Year</label>
                            <select className="form-select form-select-sm" aria-label="Year" style={{ minWidth: 100 }} value={year} onChange={(e) => setYear(e.target.value)}>
                                {filterOptions.years.map((y) => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                        <div className="sr-filter-field">
                            <label className="sr-filter-label">Company Name</label>
                            <select
                                className="form-select form-select-sm"
                                aria-label="Company Name"
                                style={{ minWidth: 260 }}
                                value={company}
                                onChange={handleCompanyChange}
                                disabled={filterLocks.company || filterOptions.companies.length === 0}
                            >
                                {filterOptions.companies.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                        <div className="sr-filter-field">
                            <label className="sr-filter-label">Division Name</label>
                            <select
                                className="form-select form-select-sm"
                                aria-label="Division Name"
                                style={{ minWidth: 160 }}
                                value={division}
                                onChange={handleDivisionChange}
                                disabled={filterLocks.division || filterOptions.divisions.length === 0}
                            >
                                {filterOptions.divisions.map((d) => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </div>
                        <div className="sr-filter-field">
                            <label className="sr-filter-label">SE / QS / EE / TE / SM</label>
                            <select className="form-select form-select-sm" aria-label="Role" style={{ minWidth: 180 }} value={role} onChange={(e) => setRole(e.target.value)} disabled={filterLocks.role}>
                                <option value="All">All</option>
                                {filterOptions.roles.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="d-flex align-items-center gap-3 flex-wrap pb-1">
                        <span className="text-muted small mb-0">* All values in BHD</span>
                        <div className="d-flex gap-2 no-print">
                            <button type="button" className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1" onClick={handlePrint} title="Print / Save as PDF">
                                <Printer size={14} /> <span className="d-none d-md-inline">Print</span>
                            </button>
                            <button type="button" className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1" onClick={handleEmail} title="Email">
                                <Mail size={14} /> <span className="d-none d-md-inline">Email</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {summaryError && (
                <div className="alert alert-warning py-1 px-2 small mb-2">{summaryError}</div>
            )}

            {loading ? (
                <div className="d-flex justify-content-center align-items-center flex-grow-1 py-4">
                    <div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading…</span></div>
                </div>
            ) : (
                <div className="sr-dashboard-grid flex-grow-1 min-h-0">
                    {/* 1 — Won / Lost: summary + pie chart in one card (row 1–2) */}
                    <section className="sr-cell sr-cell-won-combined sr-summary-panel sr-summary-compact sr-target-card card border-0 shadow-sm d-flex flex-column min-h-0">
                        <div className="sr-summary-title">Won / Lost</div>
                        <div className="sr-metric-stack d-flex flex-column flex-grow-1 min-h-0">
                        <div className="sr-stack-top d-flex flex-column min-h-0">
                        <div className="sr-summary-body sr-target-body sr-won-summary d-flex">
                            <div className="sr-won-rates d-flex flex-column justify-content-center align-items-center text-center">
                                <div className="sr-rate-block">
                                    <span className="sr-rate-label">
                                        Winning
                                        <br />
                                        rate
                                    </span>
                                    <span className="sr-rate-pct text-success"><span className="sr-rate-pct__val">{winningRate}</span><span className="sr-pct-sym">%</span></span>
                                </div>
                                <div className="sr-rate-block">
                                    <span className="sr-rate-label">
                                        Losing
                                        <br />
                                        rate
                                    </span>
                                    <span className="sr-rate-pct text-danger"><span className="sr-rate-pct__val">{losingRate}</span><span className="sr-pct-sym">%</span></span>
                                </div>
                            </div>
                            <div className="sr-won-values">
                                <div className="sr-kpi-line border-bottom py-0">
                                    <span className="text-muted sr-kpi-label">Won</span>
                                    <span className="sr-kpi-num text-success">{formatK(wl.wonValue)}</span>
                                </div>
                                <div className="sr-kpi-line border-bottom py-0">
                                    <span className="text-muted sr-kpi-label">Lost</span>
                                    <span className="sr-kpi-num text-danger">{formatK(wl.lostValue)}</span>
                                </div>
                                <div className="sr-kpi-line border-bottom py-0">
                                    <span className="text-muted sr-kpi-label">Follow up</span>
                                    <span className="sr-kpi-num" style={{ color: SR_ROYAL_BLUE }}>{formatK(wl.followUpValue)}</span>
                                </div>
                                <div className="sr-kpi-line py-0">
                                    <span className="text-muted sr-kpi-label">Quoted</span>
                                    <span className="sr-kpi-num sr-quoted-strong">{formatK(wl.quotedValue)}</span>
                                </div>
                            </div>
                        </div>
                        <hr className="sr-won-stack-divider" role="presentation" />
                        </div>
                        <div className="sr-won-chart-stack min-h-0 d-flex flex-column p-1">
                            <div className="sr-chart-pie sr-donut-chart flex-grow-1 min-h-0">
                                {pieSlices.length === 0 ? (
                                    <div className="text-muted small text-center py-3">No data</div>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart margin={{ top: 4, right: 2, bottom: 28, left: 2 }}>
                                            <defs>
                                                {Object.values(SR_DONUT_GRADIENTS).map((g) => (
                                                    <linearGradient
                                                        key={g.id}
                                                        id={g.id}
                                                        x1="0"
                                                        y1="0"
                                                        x2="1"
                                                        y2="1"
                                                    >
                                                        <stop offset="0%" stopColor={g.hi} />
                                                        <stop offset="55%" stopColor={g.lo} />
                                                        <stop offset="100%" stopColor={g.lo} />
                                                    </linearGradient>
                                                ))}
                                            </defs>
                                            <Pie
                                                data={pieSlices}
                                                dataKey="value"
                                                nameKey="name"
                                                cx="50%"
                                                cy="50%"
                                                innerRadius="50%"
                                                outerRadius="84%"
                                                paddingAngle={pieSlices.length > 1 ? 2 : 0}
                                                cornerRadius={4}
                                                startAngle={90}
                                                endAngle={-270}
                                            >
                                                {pieSlices.map((entry, index) => {
                                                    const g = SR_DONUT_GRADIENTS[entry.name];
                                                    const fill = g
                                                        ? `url(#${g.id})`
                                                        : PIE_COLORS[entry.name] || SR_BLUE_LIGHT;
                                                    const splitStroke = pieSlices.length > 1;
                                                    return (
                                                        <Cell
                                                            key={`cell-${index}`}
                                                            fill={fill}
                                                            stroke={splitStroke ? '#ffffff' : 'none'}
                                                            strokeWidth={splitStroke ? 1.5 : 0}
                                                        />
                                                    );
                                                })}
                                            </Pie>
                                            <Tooltip formatter={(v) => formatFullNumber(v)} />
                                            <Legend
                                                wrapperStyle={{ fontSize: 9, color: SR_CHART_LEGEND_GREY }}
                                                verticalAlign="bottom"
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>
                        </div>
                    </section>

                    {/* 2 — Job Booking Target vs Actual: summary + bar chart (rows 1–2) */}
                    <section
                        className="sr-cell sr-cell-target-combined sr-jb-section sr-summary-panel sr-summary-compact sr-target-card card border-0 shadow-sm d-flex flex-column min-h-0"
                        style={SR_TA_QUARTER_CHART_ALIGN_STYLE}
                    >
                        <div className="sr-summary-title">Job Booking Target Vs Actual</div>
                        <div className="sr-metric-stack d-flex flex-column flex-grow-1 min-h-0">
                        <div className="sr-stack-top d-flex flex-column min-h-0">
                        <div className="sr-summary-body sr-target-body d-flex flex-column">
                            <div className="d-flex justify-content-between align-items-center sr-target-top sr-jb-target-top">
                                <div className="sr-target-achieved">
                                    <span className="sr-target-achieved-label">Achieved Bookings</span>
                                    <span className="sr-achieved-pct text-success">
                                        <span className="sr-achieved-pct__num">{overallRatio}</span>
                                        <span className="sr-achieved-pct__sym">%</span>
                                    </span>
                                </div>
                                <div className="sr-target-fraction sr-jb-fraction-stack d-flex flex-column align-items-end justify-content-center text-end">
                                    <div className="sr-fraction-actual sr-jb-fraction-cell sr-fraction-kpi-row">
                                        <span className="sr-fraction-suffix sr-fraction-suffix--lead">Actual</span>
                                        <span className="sr-fraction-value text-success">{formatK(totalActual)}</span>
                                    </div>
                                    <div className="sr-fraction-rule sr-jb-fraction-stack-rule" role="presentation" />
                                    <div className="sr-fraction-target sr-jb-fraction-cell sr-fraction-kpi-row">
                                        <span className="sr-fraction-suffix sr-fraction-suffix--lead">Target</span>
                                        <span className="sr-fraction-value sr-fraction-target-val">{formatK(totalTarget)}</span>
                                    </div>
                                </div>
                            </div>
                            <hr className="sr-target-hr" />
                            <div className="sr-jb-quarter-align">
                                <div className="sr-quarter-matrix" aria-label="Quarter breakdown">
                                    <div className="sr-q-matrix__corner" aria-hidden />
                                    {targetVsActualData.map((row, qi) => {
                                        const t = Number(row.target) || 0;
                                        const a = Number(row.actual) || 0;
                                        const pct = t > 0 ? Math.round((a / t) * 100) : 0;
                                        const vsep = qi < 3 ? ' sr-q-matrix__cell--vsep' : '';
                                        return (
                                            <div key={`jb-qh-${row.name}`} className={`sr-q-matrix__qh text-center${vsep}`}>
                                                <div className="sr-quarter-header">
                                                    <span className="sr-quarter-name">{row.name}</span>
                                                    <span className="sr-quarter-pct text-success"> {pct}<span className="sr-pct-sym">%</span></span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div className="sr-q-matrix__lab sr-q-matrix__lab--actual">Actual</div>
                                    {targetVsActualData.map((row, qi) => {
                                        const t = Number(row.target) || 0;
                                        const a = Number(row.actual) || 0;
                                        const vsep = qi < 3 ? ' sr-q-matrix__cell--vsep' : '';
                                        return (
                                            <div key={`jb-qa-${row.name}`} className={`sr-q-matrix__actual text-center text-success${vsep}`}>
                                                {formatK(a)}
                                            </div>
                                        );
                                    })}
                                    <div className="sr-q-matrix__rule" role="presentation" />
                                    <div className="sr-q-matrix__lab sr-q-matrix__lab--target">Target</div>
                                    {targetVsActualData.map((row, qi) => {
                                        const t = Number(row.target) || 0;
                                        const vsep = qi < 3 ? ' sr-q-matrix__cell--vsep' : '';
                                        return (
                                            <div key={`jb-qt-${row.name}`} className={`sr-q-matrix__target sr-quarter-target text-center${vsep}`}>
                                                {formatK(t)}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <hr className="sr-stack-divider" role="presentation" />
                        </div>
                        <div className="sr-ta-chart-stack sr-jb-chart-stack min-h-0 d-flex flex-column">
                            <div className="sr-chart-bar flex-grow-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={targetVsActualData} margin={SR_TA_ALIGNED_BAR_MARGIN}>
                                        <defs>
                                            <linearGradient id="srBarJbTarget" x1="0" y1="1" x2="0" y2="0">
                                                <stop offset="0%" stopColor={mixHexWithWhite(BAR_TARGET_FILL, 0.08)} />
                                                <stop offset="100%" stopColor={mixHexWithWhite(BAR_TARGET_FILL, 0.42)} />
                                            </linearGradient>
                                            <linearGradient id="srBarJbActual" x1="0" y1="1" x2="0" y2="0">
                                                <stop offset="0%" stopColor={BAR_ACTUAL_FILL} />
                                                <stop offset="100%" stopColor={mixHexWithWhite(BAR_ACTUAL_FILL, 0.35)} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e8ecf4" strokeOpacity={0.95} />
                                        <XAxis dataKey="name" tick={SR_TA_XAXIS_TICK} height={SR_TA_XAXIS_HEIGHT} />
                                        <YAxis tickFormatter={formatShort} width={SR_TA_YAXIS_WIDTH} tick={SR_TA_YAXIS_TICK} />
                                        <Tooltip formatter={(v) => formatFullNumber(v)} />
                                        <Legend
                                            itemSorter={legendTargetFirstSorter}
                                            wrapperStyle={{ fontSize: SR_TA_LEGEND_FONT_SIZE, color: SR_CHART_LEGEND_GREY }}
                                            verticalAlign="bottom"
                                        />
                                        <Bar dataKey="target" name="Target" fill={SR_BAR_JB.target} radius={[5, 5, 0, 0]} maxBarSize={20} />
                                        <Bar dataKey="actual" name="Actual Achieved" fill={SR_BAR_JB.actual} radius={[5, 5, 0, 0]} maxBarSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        </div>
                    </section>

                    {/* 3 — Gross margin: summary + bar chart (rows 1–2) */}
                    <section
                        className="sr-cell sr-cell-gm-combined sr-summary-panel sr-summary-compact sr-target-card sr-gm-section card border-0 shadow-sm d-flex flex-column min-h-0"
                        style={SR_TA_QUARTER_CHART_ALIGN_STYLE}
                    >
                        <div className="sr-summary-title">Job Booking Gross Profit Target Vs Actual</div>
                        <div className="sr-metric-stack d-flex flex-column flex-grow-1 min-h-0">
                        <div className="sr-stack-top d-flex flex-column min-h-0">
                        <div className="sr-summary-body sr-target-body d-flex flex-column">
                            <div className="d-flex justify-content-between align-items-center sr-target-top sr-gm-target-top">
                                <div className="sr-target-achieved">
                                    <span className="sr-target-achieved-label">Achieved GP</span>
                                    <span className="sr-achieved-pct text-success">
                                        <span className="sr-achieved-pct__num">{gmOverallRatio}</span>
                                        <span className="sr-achieved-pct__sym">%</span>
                                    </span>
                                </div>
                                <div className="sr-target-fraction sr-gm-fraction-stack d-flex flex-column align-items-end justify-content-center text-end">
                                    <div className="sr-fraction-actual sr-gm-fraction-cell sr-fraction-kpi-row">
                                        <span className="sr-fraction-suffix sr-fraction-suffix--lead">Actual</span>
                                        <span className="sr-fraction-value text-success">{formatK(gmTotalActual)}</span>
                                        <span className="sr-gp-summary-actual-pct"> ({gmOverallRatio}<span className="sr-pct-sym">%</span>)</span>
                                    </div>
                                    <div className="sr-fraction-rule sr-gm-fraction-stack-rule" role="presentation" />
                                    <div className="sr-fraction-target sr-gm-fraction-cell sr-fraction-kpi-row">
                                        <span className="sr-fraction-suffix sr-fraction-suffix--lead">Target</span>
                                        <span className="sr-fraction-value sr-fraction-target-val">
                                            {formatK(gmTotalTarget)}
                                            <span className="sr-fraction-target-gp-pct"> ({formatGpTargetPctDisplay(gmOverallTargetGpPct)})</span>
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <hr className="sr-target-hr" />
                            <div className="sr-gm-quarter-align">
                                <div className="sr-quarter-matrix" aria-label="Quarter breakdown">
                                    <div className="sr-q-matrix__corner" aria-hidden />
                                    {grossMarginData.map((row, qi) => {
                                        const vsep = qi < 3 ? ' sr-q-matrix__cell--vsep' : '';
                                        return (
                                            <div key={`gm-qh-${row.name}`} className={`sr-q-matrix__qh text-center${vsep}`}>
                                                <div className="sr-quarter-header">
                                                    <span className="sr-quarter-name">{row.name}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <div className="sr-q-matrix__lab sr-q-matrix__lab--actual">Actual</div>
                                    {grossMarginData.map((row, qi) => {
                                        const t = Number(row.target) || 0;
                                        const a = Number(row.actual) || 0;
                                        const pct = t > 0 ? Math.round((a / t) * 100) : 0;
                                        const vsep = qi < 3 ? ' sr-q-matrix__cell--vsep' : '';
                                        return (
                                            <div key={`gm-qa-${row.name}`} className={`sr-q-matrix__actual sr-quarter-gp-line text-center${vsep}`}>
                                                <span className="sr-quarter-gp-val">{formatK(a)}</span>
                                                <span className="sr-quarter-gp-pct"> ({pct}<span className="sr-pct-sym">%</span>)</span>
                                            </div>
                                        );
                                    })}
                                    <div className="sr-q-matrix__rule" role="presentation" />
                                    <div className="sr-q-matrix__lab sr-q-matrix__lab--target">Target</div>
                                    {grossMarginData.map((row, qi) => {
                                        const t = Number(row.target) || 0;
                                        const vsep = qi < 3 ? ' sr-q-matrix__cell--vsep' : '';
                                        return (
                                            <div key={`gm-qt-${row.name}`} className={`sr-q-matrix__target sr-gp-quarter-target text-center${vsep}`}>
                                                <span className="sr-quarter-target-k">{formatK(t)}</span>
                                                <span className="sr-quarter-target-gp-pct"> ({formatGpTargetPctDisplay(Number(row.targetGpPct) || 0)})</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <hr className="sr-stack-divider" role="presentation" />
                        </div>
                        <div className="sr-ta-chart-stack sr-gm-chart-stack min-h-0 d-flex flex-column">
                            <div className="sr-chart-bar flex-grow-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={grossMarginData} margin={SR_TA_ALIGNED_BAR_MARGIN}>
                                        <defs>
                                            <linearGradient id="srBarGmTarget" x1="0" y1="1" x2="0" y2="0">
                                                <stop offset="0%" stopColor={mixHexWithWhite(BAR_TARGET_FILL, 0.08)} />
                                                <stop offset="100%" stopColor={mixHexWithWhite(BAR_TARGET_FILL, 0.42)} />
                                            </linearGradient>
                                            <linearGradient id="srBarGmActual" x1="0" y1="1" x2="0" y2="0">
                                                <stop offset="0%" stopColor={BAR_ACTUAL_FILL} />
                                                <stop offset="100%" stopColor={mixHexWithWhite(BAR_ACTUAL_FILL, 0.35)} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e8ecf4" strokeOpacity={0.95} />
                                        <XAxis dataKey="name" tick={SR_TA_XAXIS_TICK} height={SR_TA_XAXIS_HEIGHT} />
                                        <YAxis tickFormatter={formatShort} width={SR_TA_YAXIS_WIDTH} tick={SR_TA_YAXIS_TICK} />
                                        <Tooltip formatter={(v) => formatFullNumber(v)} />
                                        <Legend
                                            itemSorter={legendTargetFirstSorter}
                                            wrapperStyle={{ fontSize: SR_TA_LEGEND_FONT_SIZE, color: SR_CHART_LEGEND_GREY }}
                                            verticalAlign="bottom"
                                        />
                                        <Bar dataKey="target" name="Target" fill={SR_BAR_GM.target} radius={[5, 5, 0, 0]} maxBarSize={20} />
                                        <Bar dataKey="actual" name="Actual Achieved" fill={SR_BAR_GM.actual} radius={[5, 5, 0, 0]} maxBarSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        </div>
                    </section>

                    <section className="sr-cell sr-cell-pipeline sr-pipeline-panel card border-0 shadow-sm">
                        <div className="sr-pipeline-header">Sales Pipeline</div>
                        <div className="sr-pipeline-body d-flex flex-column flex-grow-1 min-h-0">
                            <div className="sr-pipeline-top d-flex flex-column min-h-0 flex-grow-1 p-2">
                                <div className="sr-chart-funnel flex-grow-1 min-h-0">
                                    <SalesPipelineFunnelVisual rows={funnelData} formatFullNumber={formatFullNumber} />
                                </div>
                            </div>
                            <div className="sr-pipeline-summary flex-shrink-0">
                                {FUNNEL_STAGES.map((stage, i) => {
                                    const v = Number(funnelData[i]?.value) || 0;
                                    return (
                                        <div
                                            key={stage.probability}
                                            className="sr-pipeline-summary-row d-flex align-items-center justify-content-between gap-2"
                                        >
                                            <div className="d-flex align-items-center gap-2 min-w-0 flex-grow-1">
                                                <span className="sr-pipeline-summary-pct">{stage.probability}%</span>
                                                <span className="sr-pipeline-swatch" style={{ backgroundColor: stage.color }} title={stage.name} aria-hidden />
                                                <span className="sr-pipeline-summary-legend text-truncate">{stage.name}</span>
                                            </div>
                                            <span className="sr-pipeline-summary-value text-end">{formatK(v)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    <section className="sr-cell sr-cell-table card border-0 shadow-sm">
                        <div className="card-header sr-report-table-title sr-report-table-title--toolbar px-2 py-1 small">
                            <span className="flex-grow-1" aria-hidden />
                            <span className="sr-report-table-heading text-center flex-shrink-0 px-1">
                                Top Jobs {topJobsHeadingWord} details
                            </span>
                            <div className="flex-grow-1 d-flex justify-content-end align-items-center">
                                <label className="visually-hidden" htmlFor="sr-top-jobs-status">
                                    Filter top jobs by status
                                </label>
                                <select
                                    id="sr-top-jobs-status"
                                    className="form-select form-select-sm sr-top-jobs-status-select"
                                    value={topJobStatus}
                                    onChange={(e) => setTopJobStatus(e.target.value)}
                                    aria-label="Filter top jobs by status"
                                >
                                    {TOP_JOB_STATUS_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="table-responsive sr-table-inner min-h-0">
                            <table className="table table-sm table-striped table-bordered mb-0 align-middle sr-detail-table">
                                <thead className="table-secondary">
                                    <tr>
                                        <th style={{ width: 44 }}>Sl.No.</th>
                                        <th>Project Name</th>
                                        <th className="text-end">Job Value</th>
                                        <th className="sr-job-bar-th" title="Horizontal bar: job value relative to the largest value in this list">
                                            Job Value Chart
                                        </th>
                                        <th className="text-end text-nowrap">Gross Margin</th>
                                        <th>Customer Name</th>
                                        <th>Client Name</th>
                                        <th>Consultant Name</th>
                                    </tr>
                                </thead>
                                <tbody
                                    className={topJobsLoading ? 'sr-detail-table__body-loading' : undefined}
                                    aria-busy={topJobsLoading}
                                >
                                    {topRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="text-center text-muted py-2">No job booked rows for the selected filters.</td>
                                        </tr>
                                    ) : (
                                        topRows.map((row, idx) => {
                                            const v = Math.abs(Number(row.JobValue)) || 0;
                                            const pct = topJobValueMax > 0 ? Math.round((v / topJobValueMax) * 100) : 0;
                                            const barW = topJobValueMax > 0 ? Math.min(100, (v / topJobValueMax) * 100) : 0;
                                            return (
                                                <tr key={`${row.ProjectName}-${idx}`}>
                                                    <td>{idx + 1}</td>
                                                    <td>{row.ProjectName || '—'}</td>
                                                    <td className="text-end">{formatK(row.JobValue)}</td>
                                                    <td className="sr-job-bar-cell">
                                                        <div
                                                            className="sr-job-bar-track"
                                                            title={`${pct}% of max job value in this list (${formatFullNumber(v)})`}
                                                            role="img"
                                                            aria-label={`Job value ${pct} percent of maximum in this list`}
                                                        >
                                                            <div className="sr-job-bar-fill" style={{ width: `${barW}%` }} />
                                                        </div>
                                                    </td>
                                                    <td className="text-end small text-nowrap">{formatJobBookedGrossMargin(row)}</td>
                                                    <td>{row.CustomerName || '—'}</td>
                                                    <td>{row.ClientName || '—'}</td>
                                                    <td>{row.ConsultantName || '—'}</td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
};

export default SalesReport;
