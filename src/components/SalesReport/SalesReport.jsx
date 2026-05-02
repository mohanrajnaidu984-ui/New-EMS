import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
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
        { name: 'Q1', target: 0, actual: 0 },
        { name: 'Q2', target: 0, actual: 0 },
        { name: 'Q3', target: 0, actual: 0 },
        { name: 'Q4', target: 0, actual: 0 }
    ],
    winLoss: {
        won: 0, lost: 0, followUp: 0, quoted: 0,
        wonValue: 0, lostValue: 0, followUpValue: 0, quotedValue: 0
    },
    probabilityFunnel: [],
    topJobBooked: []
});

/** Brand palette for this report only */
const SR_BLUE = '#6a73ae';
const SR_BLUE_LIGHT = '#abc3e4';

const WON_GREEN = '#15803d';
const LOST_RED = '#dc2626';

const PIE_COLORS = {
    Quoted: SR_BLUE_LIGHT,
    Won: WON_GREEN,
    Lost: LOST_RED,
    'Follow up': SR_BLUE
};

/** Target vs Actual / GM charts — slightly darker than legacy SR_BLUE_LIGHT / SR_BLUE */
const BAR_TARGET_FILL = '#7c94c8';
const BAR_ACTUAL_FILL = '#4f5782';

const TA_CHART_LEGEND_PAYLOAD = [
    { value: 'Target', type: 'rect', id: 'target', color: BAR_TARGET_FILL },
    { value: 'Actual Achieved', type: 'rect', id: 'actual', color: BAR_ACTUAL_FILL }
];

/** Tint header blue toward white (ratio 0 = solid header color, 1 = white) — used for funnel gradient. */
function mixHeaderBlueWithWhite(whiteBlend) {
    const r = parseInt(SR_BLUE.slice(1, 3), 16);
    const g = parseInt(SR_BLUE.slice(3, 5), 16);
    const b = parseInt(SR_BLUE.slice(5, 7), 16);
    const t = Math.min(1, Math.max(0, whiteBlend));
    const mx = (c) => Math.round(c + (255 - c) * t);
    const h = (n) => n.toString(16).padStart(2, '0');
    return `#${h(mx(r))}${h(mx(g))}${h(mx(b))}`;
}

const FUNNEL_STAGE_DEFS = [
    { name: 'Low Chance', probability: 25 },
    { name: '50-50 Chance', probability: 50 },
    { name: 'Medium Chance', probability: 75 },
    { name: 'High Chance', probability: 90 },
    { name: 'Very High Chance', probability: 99 }
];

/* Top = lightest tint, bottom = solid header blue (darkest in range) */
const FUNNEL_STAGES = FUNNEL_STAGE_DEFS.map((s, i) => {
    const n = FUNNEL_STAGE_DEFS.length;
    const t = n <= 1 ? 0 : i / (n - 1);
    const whiteBlend = 0.88 * (1 - t);
    return { ...s, color: mixHeaderBlueWithWhite(whiteBlend) };
});

/** Custom inverted funnel; numeric values are shown in the summary block below. */
function SalesPipelineFunnelVisual({ rows, formatFullNumber }) {
    const vb = { w: 100, h: 100 };
    const hwTop = 44;
    /** Half-width at bottom y = 0 → sharp cone tip (was ~8 and looked “cut off”). */
    const hwBot = 0;
    const hwAt = (y) => hwTop + ((hwBot - hwTop) * y) / vb.h;
    const n = Math.max(rows?.length || 0, 1);
    const bandH = vb.h / n;

    return (
        <div className="sales-pipeline-funnel-visual d-flex min-h-0">
            <div className="sr-funnel-labels-col">
                {FUNNEL_STAGES.map((stage) => (
                    <div key={stage.probability} className="sr-funnel-label-cell">
                        <span className="sr-funnel-label-text">{stage.probability}%</span>
                    </div>
                ))}
            </div>
            <div className="sr-funnel-svg-wrap">
                <svg
                    viewBox={`0 0 ${vb.w} ${vb.h}`}
                    preserveAspectRatio="xMidYMid meet"
                    className="sr-funnel-svg"
                    role="img"
                    aria-label="Sales pipeline by probability stage"
                >
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
                                    fill={row.fill}
                                    stroke="#1e293b"
                                    strokeWidth="0.4"
                                    vectorEffect="non-scaling-stroke"
                                />
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
}

const SalesReport = () => {
    const { currentUser } = useAuth();
    const [filterLocks, setFilterLocks] = useState({
        company: false,
        division: false,
        role: false
    });

    const [year, setYear] = useState(() => localStorage.getItem('reports_year') || '2026');
    const [company, setCompany] = useState(() => localStorage.getItem('reports_company') || 'All');
    const [division, setDivision] = useState(() => localStorage.getItem('reports_division') || 'All');
    const [role, setRole] = useState(() => localStorage.getItem('reports_role') || 'All');

    const [loading, setLoading] = useState(false);
    const [summaryError, setSummaryError] = useState(null);
    const [reportData, setReportData] = useState(defaultReport);

    const [filterOptions, setFilterOptions] = useState({
        years: [],
        companies: [],
        divisions: [],
        roles: []
    });

    React.useEffect(() => {
        const fetchInitial = async () => {
            try {
                const email = currentUser?.EmailId || currentUser?.email;
                const params = new URLSearchParams();
                if (email) params.append('email', email);
                const response = await fetch(`/api/sales-report/filters?${params.toString()}`);
                if (response.ok) {
                    const data = await response.json();
                    setFilterOptions(prev => ({
                        ...prev,
                        years: data.years || [],
                        companies: data.companies || [],
                        divisions: [],
                        roles: []
                    }));
                }
            } catch (error) {
                console.error('Failed to fetch initial filters', error);
            }
        };
        fetchInitial();
    }, [currentUser]);

    React.useEffect(() => {
        if (filterLocks.company) return;
        if (company !== 'All') {
            fetchFilters(company, null);
        } else {
            setFilterOptions(prev => ({ ...prev, divisions: [], roles: [] }));
            setDivision('All');
            setRole('All');
        }
    }, [company, filterLocks.company]);

    React.useEffect(() => {
        if (filterLocks.division) return;
        if (division !== 'All') {
            fetchFilters(company, division);
        } else {
            setFilterOptions(prev => ({ ...prev, roles: [] }));
            setRole('All');
        }
    }, [division, filterLocks.division]);

    useEffect(() => {
        localStorage.setItem('reports_year', year);
        localStorage.setItem('reports_company', company);
        localStorage.setItem('reports_division', division);
        localStorage.setItem('reports_role', role);
    }, [year, company, division, role]);

    const fetchFilters = async (selectedCompany, selectedDivision) => {
        try {
            const params = new URLSearchParams();
            const email = currentUser?.EmailId || currentUser?.email;
            if (email) params.append('email', email);
            if (selectedCompany && selectedCompany !== 'All') params.append('company', selectedCompany);
            if (selectedDivision && selectedDivision !== 'All') params.append('division', selectedDivision);

            const response = await fetch(`/api/sales-report/filters?${params.toString()}`);
            if (response.ok) {
                const data = await response.json();
                setFilterOptions(prev => ({
                    ...prev,
                    years: data.years || [],
                    companies: data.companies || [],
                    divisions: data.divisions || [],
                    roles: data.roles || []
                }));
            }
        } catch (error) {
            console.error('Failed to fetch filters', error);
        }
    };

    const fetchSummary = async () => {
        setLoading(true);
        setSummaryError(null);
        try {
            const params = new URLSearchParams();
            params.append('year', year);
            if (company && company !== 'All') params.append('company', company);
            if (division && division !== 'All') params.append('division', division);
            if (role && role !== 'All') params.append('role', role);

            const res = await fetch(`/api/sales-report/summary?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                const d = defaultReport();
                setReportData({
                    targetVsActual: data.targetVsActual || d.targetVsActual,
                    grossMarginTargetVsActual: data.grossMarginTargetVsActual || d.grossMarginTargetVsActual,
                    winLoss: { ...d.winLoss, ...(data.winLoss || {}) },
                    probabilityFunnel: data.probabilityFunnel || [],
                    topJobBooked: data.topJobBooked || []
                });
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

    useEffect(() => {
        if (year) fetchSummary();
    }, [year, company, division, role]);

    useEffect(() => {
        const email = currentUser?.EmailId || currentUser?.email;
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
    }, [currentUser]);

    const handleCompanyChange = (e) => {
        const val = e.target.value;
        setCompany(val);
        setDivision('All');
        setRole('All');
    };

    const handleDivisionChange = (e) => {
        const val = e.target.value;
        setDivision(val);
        setRole('All');
    };

    const formatFullNumber = (num) => {
        const n = Number(num);
        if (Number.isNaN(n)) return '0.000';
        return n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    };

    const formatShort = (num) => {
        const n = Number(num);
        if (Number.isNaN(n)) return '0';
        if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
        if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
        return String(Math.round(n));
    };

    const targetVsActualData = reportData.targetVsActual || [];
    const totalActual = targetVsActualData.reduce((acc, curr) => acc + (Number(curr.actual) || 0), 0);
    const totalTarget = targetVsActualData.reduce((acc, curr) => acc + (Number(curr.target) || 0), 0);
    const overallRatio = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;

    const grossMarginData = reportData.grossMarginTargetVsActual || defaultReport().grossMarginTargetVsActual;
    const gmTotalActual = grossMarginData.reduce((acc, curr) => acc + (Number(curr.actual) || 0), 0);
    const gmTotalTarget = grossMarginData.reduce((acc, curr) => acc + (Number(curr.target) || 0), 0);
    const gmOverallRatio = gmTotalTarget > 0 ? Math.round((gmTotalActual / gmTotalTarget) * 100) : 0;

    const wl = reportData.winLoss || defaultReport().winLoss;
    const wlTotalVal = (Number(wl.wonValue) || 0) + (Number(wl.lostValue) || 0);
    const winningRate = wlTotalVal > 0 ? Math.round(((Number(wl.wonValue) || 0) / wlTotalVal) * 100) : 0;
    const losingRate = wlTotalVal > 0 ? Math.round(((Number(wl.lostValue) || 0) / wlTotalVal) * 100) : 0;

    const pieSlices = useMemo(() => {
        const rows = [
            { name: 'Quoted', value: Number(wl.quotedValue) || 0 },
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
                            <select className="form-select form-select-sm" aria-label="Company Name" style={{ minWidth: 200 }} value={company} onChange={handleCompanyChange} disabled={filterLocks.company}>
                                <option value="All">All</option>
                                {filterOptions.companies.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                        <div className="sr-filter-field">
                            <label className="sr-filter-label">Division Name</label>
                            <select className="form-select form-select-sm" aria-label="Division Name" style={{ minWidth: 160 }} value={division} onChange={handleDivisionChange} disabled={filterLocks.division}>
                                <option value="All">All</option>
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
                    {/* 1 — Won / Lost summary (text only) */}
                    <section className="sr-cell sr-cell-won-text sr-summary-panel sr-summary-compact sr-target-card card border shadow-sm">
                        <div className="sr-summary-title">Won / Lost</div>
                        <div className="sr-summary-body sr-target-body sr-won-summary d-flex">
                            <div className="sr-won-rates d-flex flex-column justify-content-center align-items-center text-center">
                                <div className="sr-rate-block">
                                    <span className="sr-rate-label">
                                        Winning
                                        <br />
                                        rate
                                    </span>
                                    <span className="sr-rate-pct text-success">{winningRate}%</span>
                                </div>
                                <div className="sr-rate-block">
                                    <span className="sr-rate-label">
                                        Losing
                                        <br />
                                        rate
                                    </span>
                                    <span className="sr-rate-pct text-danger">{losingRate}%</span>
                                </div>
                            </div>
                            <div className="sr-won-values">
                                <div className="sr-kpi-line border-bottom py-0">
                                    <span className="text-muted sr-kpi-label">Won</span>
                                    <span className="sr-kpi-num text-success">{formatFullNumber(wl.wonValue)}</span>
                                </div>
                                <div className="sr-kpi-line border-bottom py-0">
                                    <span className="text-muted sr-kpi-label">Lost</span>
                                    <span className="sr-kpi-num text-danger">{formatFullNumber(wl.lostValue)}</span>
                                </div>
                                <div className="sr-kpi-line py-0">
                                    <span className="text-muted sr-kpi-label">Quoted</span>
                                    <span className="sr-kpi-num sr-quoted-strong">{formatFullNumber(wl.quotedValue)}</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 2 — Target vs Actual summary (text only) */}
                    <section className="sr-cell sr-cell-target-text sr-summary-panel sr-summary-compact sr-target-card card border shadow-sm">
                        <div className="sr-summary-title">Target Vs Actual</div>
                        <div className="sr-summary-body sr-target-body d-flex flex-column">
                            <div className="d-flex justify-content-between align-items-start sr-target-top">
                                <div className="sr-target-achieved">
                                    <span className="sr-target-achieved-label">Achieved</span>
                                    <span className="sr-achieved-pct text-success">{overallRatio}%</span>
                                </div>
                                <div className="sr-target-fraction text-end">
                                    <div className="sr-fraction-actual">
                                        <span className="sr-fraction-value text-success">{formatFullNumber(totalActual)}</span>
                                        <span className="sr-fraction-suffix"> Actual</span>
                                    </div>
                                    <div className="sr-fraction-rule" role="presentation" />
                                    <div className="sr-fraction-target">
                                        <span className="sr-fraction-value sr-fraction-target-val">{formatFullNumber(totalTarget)}</span>
                                        <span className="sr-fraction-suffix"> Target</span>
                                    </div>
                                </div>
                            </div>
                            <hr className="sr-target-hr" />
                            <div className="sr-quarter-grid-4">
                                {targetVsActualData.map((row) => {
                                    const t = Number(row.target) || 0;
                                    const a = Number(row.actual) || 0;
                                    const pct = t > 0 ? Math.round((a / t) * 100) : 0;
                                    return (
                                        <div key={row.name} className="sr-quarter-col d-flex flex-column align-items-center text-center">
                                            <div className="sr-quarter-header">
                                                <span className="sr-quarter-name">{row.name}</span>
                                                <span className="sr-quarter-pct text-success"> {pct}%</span>
                                            </div>
                                            <div className="sr-quarter-actual text-success">{formatFullNumber(a)}</div>
                                            <div className="sr-quarter-target">{formatFullNumber(t)}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    {/* 3 — Won / Lost chart only */}
                    <section className="sr-cell sr-cell-won-chart sr-chart-panel card border shadow-sm">
                        <div className="sr-chart-panel-inner h-100 min-h-0 d-flex flex-column p-1">
                            <div className="sr-chart-pie flex-grow-1 min-h-0">
                                {pieSlices.length === 0 ? (
                                    <div className="text-muted small text-center py-3">No data</div>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={pieSlices}
                                                dataKey="value"
                                                nameKey="name"
                                                cx="50%"
                                                cy="42%"
                                                innerRadius="50%"
                                                outerRadius="72%"
                                                paddingAngle={2}
                                            >
                                                {pieSlices.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={PIE_COLORS[entry.name] || SR_BLUE_LIGHT} stroke="#fff" strokeWidth={1} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(v) => formatFullNumber(v)} />
                                            <Legend wrapperStyle={{ fontSize: 9 }} verticalAlign="bottom" />
                                        </PieChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* 4 — Target vs Actual chart only */}
                    <section className="sr-cell sr-cell-target-chart sr-chart-panel card border shadow-sm">
                        <div className="sr-chart-panel-inner h-100 min-h-0 d-flex flex-column p-1">
                            <div className="sr-chart-bar flex-grow-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={targetVsActualData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                                        <XAxis dataKey="name" tick={{ fontSize: 9 }} height={16} />
                                        <YAxis tickFormatter={formatShort} width={28} tick={{ fontSize: 8 }} />
                                        <Tooltip formatter={(v) => formatFullNumber(v)} />
                                        <Legend payload={TA_CHART_LEGEND_PAYLOAD} wrapperStyle={{ fontSize: 9 }} verticalAlign="bottom" />
                                        <Bar dataKey="target" name="Target" fill={BAR_TARGET_FILL} radius={[2, 2, 0, 0]} maxBarSize={18} />
                                        <Bar dataKey="actual" name="Actual Achieved" fill={BAR_ACTUAL_FILL} radius={[2, 2, 0, 0]} maxBarSize={18} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </section>

                    {/* 5 — Gross margin summary (same layout as Target vs Actual) */}
                    <section className="sr-cell sr-cell-gm-text sr-summary-panel sr-summary-compact sr-target-card sr-gm-section card border shadow-sm">
                        <div className="sr-summary-title">Gross Margin Target Vs Actual</div>
                        <div className="sr-summary-body sr-target-body d-flex flex-column">
                            <div className="d-flex justify-content-between align-items-start sr-target-top">
                                <div className="sr-target-achieved">
                                    <span className="sr-target-achieved-label">Achieved</span>
                                    <span className="sr-achieved-pct text-success">{gmOverallRatio}%</span>
                                </div>
                                <div className="sr-target-fraction text-end">
                                    <div className="sr-fraction-actual">
                                        <span className="sr-fraction-value text-success">{formatFullNumber(gmTotalActual)}</span>
                                        <span className="sr-fraction-suffix"> Actual</span>
                                    </div>
                                    <div className="sr-fraction-rule" role="presentation" />
                                    <div className="sr-fraction-target">
                                        <span className="sr-fraction-value sr-fraction-target-val">{formatFullNumber(gmTotalTarget)}</span>
                                        <span className="sr-fraction-suffix"> Target</span>
                                    </div>
                                </div>
                            </div>
                            <hr className="sr-target-hr" />
                            <div className="sr-quarter-grid-4">
                                {grossMarginData.map((row) => {
                                    const t = Number(row.target) || 0;
                                    const a = Number(row.actual) || 0;
                                    const pct = t > 0 ? Math.round((a / t) * 100) : 0;
                                    return (
                                        <div key={row.name} className="sr-quarter-col d-flex flex-column align-items-center text-center">
                                            <div className="sr-quarter-header">
                                                <span className="sr-quarter-name">{row.name}</span>
                                                <span className="sr-quarter-pct text-success"> {pct}%</span>
                                            </div>
                                            <div className="sr-quarter-actual text-success">{formatFullNumber(a)}</div>
                                            <div className="sr-quarter-target">{formatFullNumber(t)}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    {/* 6 — Gross margin chart */}
                    <section className="sr-cell sr-cell-gm-chart sr-chart-panel card border shadow-sm">
                        <div className="sr-chart-panel-inner h-100 min-h-0 d-flex flex-column p-1">
                            <div className="sr-chart-bar flex-grow-1 min-h-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={grossMarginData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                                        <XAxis dataKey="name" tick={{ fontSize: 9 }} height={16} />
                                        <YAxis tickFormatter={formatShort} width={28} tick={{ fontSize: 8 }} />
                                        <Tooltip formatter={(v) => formatFullNumber(v)} />
                                        <Legend payload={TA_CHART_LEGEND_PAYLOAD} wrapperStyle={{ fontSize: 9 }} verticalAlign="bottom" />
                                        <Bar dataKey="target" name="Target" fill={BAR_TARGET_FILL} radius={[2, 2, 0, 0]} maxBarSize={18} />
                                        <Bar dataKey="actual" name="Actual Achieved" fill={BAR_ACTUAL_FILL} radius={[2, 2, 0, 0]} maxBarSize={18} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </section>

                    <section className="sr-cell sr-cell-pipeline sr-pipeline-panel card border shadow-sm">
                        <div className="sr-pipeline-header px-2 small">Sales Pipeline</div>
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
                                            <span className="sr-pipeline-summary-value text-end">{formatFullNumber(v)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    <section className="sr-cell sr-cell-table card border shadow-sm">
                        <div className="card-header sr-report-table-title text-center px-2 small">Top Job Booked Details</div>
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
                                        <th>Customer Name</th>
                                        <th>Client Name</th>
                                        <th>Consultant Name</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="text-center text-muted py-2">No job booked rows for the selected filters.</td>
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
                                                    <td className="text-end">{formatFullNumber(row.JobValue)}</td>
                                                    <td className="sr-job-bar-cell">
                                                        <div
                                                            className="sr-job-bar-track"
                                                            title={`${pct}% of max job value in this list (${formatFullNumber(v)} BHD)`}
                                                            role="img"
                                                            aria-label={`Job value ${pct} percent of maximum in this list`}
                                                        >
                                                            <div className="sr-job-bar-fill" style={{ width: `${barW}%` }} />
                                                        </div>
                                                    </td>
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
