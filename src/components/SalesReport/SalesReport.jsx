import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, FunnelChart, Funnel, LabelList
} from 'recharts';
import { Printer, Mail } from 'lucide-react';
import Modal from '../Modals/Modal';
import './SalesReport.css'; // Import the dark theme styles

const SalesReport = () => {
    // ---- State ----
    const { currentUser } = useAuth();
    const [isRestricted, setIsRestricted] = useState(false);

    const [year, setYear] = useState(() => localStorage.getItem('reports_year') || '2026');
    const [quarter, setQuarter] = useState(() => localStorage.getItem('reports_quarter') || 'All');
    const [company, setCompany] = useState(() => localStorage.getItem('reports_company') || 'All');
    const [division, setDivision] = useState(() => localStorage.getItem('reports_division') || 'All');
    const [role, setRole] = useState(() => localStorage.getItem('reports_role') || 'All');
    const [loading, setLoading] = useState(false);
    const [reportData, setReportData] = useState({
        targetVsActual: [
            { name: 'Q1', target: 0, actual: 0 },
            { name: 'Q2', target: 0, actual: 0 },
            { name: 'Q3', target: 0, actual: 0 },
            { name: 'Q4', target: 0, actual: 0 }
        ],
        winLoss: { won: 0, lost: 0, followUp: 0, wonValue: 0, lostValue: 0, followUpValue: 0 },
        topCustomers: [],
        topProjects: [],
        topClients: [],
        topClients: [],
        probabilityFunnel: [],
        itemWiseStats: []
    });

    const [pieMetric, setPieMetric] = useState('Won');
    const [itemWiseQuarter, setItemWiseQuarter] = useState('All');
    const [itemWiseData, setItemWiseData] = useState([]);

    const [filterOptions, setFilterOptions] = useState({
        years: [],
        companies: [],
        divisions: [],
        roles: []
    });

    // -- Funnel Details Modal State --
    const [showFunnelModal, setShowFunnelModal] = useState(false);
    const [funnelModalTitle, setFunnelModalTitle] = useState('');
    const [funnelDetails, setFunnelDetails] = useState([]);
    const [loadingDetails, setLoadingDetails] = useState(false);

    React.useEffect(() => {
        // Initial load: Only fetch Years and Companies (no dependencies)
        const fetchInitial = async () => {
            try {
                const response = await fetch('http://localhost:5001/api/sales-report/filters'); // No params returns years and companies
                if (response.ok) {
                    const data = await response.json();
                    setFilterOptions(prev => ({
                        ...prev,
                        years: data.years || [],
                        companies: data.companies || [],
                        divisions: [], // Ensure blank initially
                        roles: []      // Ensure blank initially
                    }));
                }
            } catch (error) {
                console.error("Failed to fetch initial filters", error);
            }
        };
        fetchInitial();
    }, []);

    React.useEffect(() => {
        if (isRestricted) return; // Skip if restricted

        if (company !== 'All') {
            fetchFilters(company, null); // Fetch divisions for company
        } else {
            // If Company is All, clear Divisions and Roles
            setFilterOptions(prev => ({ ...prev, divisions: [], roles: [] }));
            setDivision('All');
            setRole('All');
        }
    }, [company, isRestricted]);

    React.useEffect(() => {
        if (isRestricted) return; // Skip if restricted

        if (division !== 'All') {
            fetchFilters(company, division); // Fetch roles for division
        } else {
            // If Division is All, clear Roles
            setFilterOptions(prev => ({ ...prev, roles: [] }));
            setRole('All');
        }
    }, [division, isRestricted]);

    // -- Persistence --
    useEffect(() => {
        localStorage.setItem('reports_year', year);
        localStorage.setItem('reports_quarter', quarter);
        localStorage.setItem('reports_company', company);
        localStorage.setItem('reports_division', division);
        localStorage.setItem('reports_role', role);
    }, [year, quarter, company, division, role]);

    const fetchFilters = async (selectedCompany, selectedDivision) => {
        try {
            const params = new URLSearchParams();
            if (selectedCompany && selectedCompany !== 'All') params.append('company', selectedCompany);
            if (selectedDivision && selectedDivision !== 'All') params.append('division', selectedDivision);

            const response = await fetch(`http://localhost:5001/api/sales-report/filters?${params.toString()}`);
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
            console.error("Failed to fetch filters", error);
        }
    };

    const fetchSummary = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.append('year', year);
            if (quarter && quarter !== 'All') params.append('quarter', quarter);
            if (company && company !== 'All') params.append('company', company);
            if (division && division !== 'All') params.append('division', division);
            if (role && role !== 'All') params.append('role', role);

            const res = await fetch(`http://localhost:5001/api/sales-report/summary?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setReportData(data);
            }
        } catch (error) {
            console.error("Failed to fetch report summary", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchItemWiseStats = async () => {
        try {
            const params = new URLSearchParams();
            params.append('year', year);
            if (itemWiseQuarter && itemWiseQuarter !== 'All') params.append('quarter', itemWiseQuarter);
            if (company && company !== 'All') params.append('company', company);
            if (division && division !== 'All') params.append('division', division);
            if (role && role !== 'All') params.append('role', role);

            // Re-use summary endpoint? No, summary is heavy.
            // Let's assume we use summary but we only care about itemWiseStats.
            // A better way is to update summary route to return only itemWiseStats if requested?
            // OR we can just use the existing summary data if 'All' (default) and re-fetch if specific?
            // Actually, the summary endpoint filters EVERYTHING by the 'quarter' param.
            // So if we want to filter JUST this chart, we can call summary with specific quarter.
            // But that fetches everything.
            // Let's create a dedicated endpoint later if needed. For now, let's call summary.
            // Wait, calling summary will be slow.
            // Let's try to filter client side? No, we don't have the data.
            // We'll add a new endpoint /item-wise-stats to the backend.

            const res = await fetch(`http://localhost:5001/api/sales-report/item-wise-stats?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setItemWiseData(data);
            }
        } catch (error) {
            console.error("Failed to fetch item wise stats", error);
        }
    };

    useEffect(() => {
        if (year) fetchItemWiseStats();
    }, [year, itemWiseQuarter, company, division, role]);

    useEffect(() => {
        if (year) fetchSummary();
    }, [year, quarter, company, division, role]);

    // Access Control Logic
    useEffect(() => {
        console.log("Checking Access Control for:", currentUser);
        const email = currentUser?.EmailId || currentUser?.email;

        if (email) {
            console.log("Fetching access details for:", email);
            fetch(`http://localhost:5001/api/sales-report/user-access-details?email=${encodeURIComponent(email)}`)
                .then(res => {
                    if (!res.ok) throw new Error('Network response was not ok');
                    return res.json();
                })
                .then(data => {
                    console.log("Access Details Received:", data);
                    if (data.restricted) {
                        setIsRestricted(true);

                        // Set fields from Backend Source of Truth
                        if (data.company) setCompany(data.company);
                        if (data.division) setDivision(data.division);
                        if (data.role) setRole(data.role);

                        // Lock dropdowns
                        const newOptions = {
                            companies: data.company ? [data.company] : [],
                            divisions: data.division ? [data.division] : [],
                            roles: data.role ? [data.role] : []
                        };
                        console.log("Locking Filter Options:", newOptions);

                        setFilterOptions(prev => ({
                            ...prev,
                            ...newOptions
                        }));
                    } else {
                        setIsRestricted(false);
                    }
                })
                .catch(err => {
                    console.error("Failed to fetch user access details", err);
                    // Fallback to client check if API fails
                    const RESTRICTED_ROLES = ['Sales Engineer', 'Estimation Engineer', 'Quantity Surveyor'];
                    const userDesignation = currentUser.Designation || currentUser.designation;
                    if (RESTRICTED_ROLES.includes(userDesignation)) {
                        setIsRestricted(true);
                        // Try to lock with what we have
                        if (currentUser.Department) {
                            setDivision(currentUser.Department);
                            setFilterOptions(prev => ({ ...prev, divisions: [currentUser.Department] }));
                        }
                    }
                });
        }
    }, [currentUser]);

    // Handlers to reset downstream filters
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




    const targetVsActualData = reportData.targetVsActual;

    const totalActual = targetVsActualData.reduce((acc, curr) => acc + curr.actual, 0);
    const totalTarget = targetVsActualData.reduce((acc, curr) => acc + curr.target, 0);
    const overallRatio = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;

    const winLoss = reportData.winLoss;
    const totalStatus = winLoss.won + winLoss.lost + winLoss.followUp;
    const totalValue = winLoss.wonValue + winLoss.lostValue + winLoss.followUpValue;

    const prospectPieData = [
        { name: 'Won', value: winLoss.wonValue, color: 'url(#gradP3)' },
        { name: 'Lost', value: winLoss.lostValue, color: 'url(#gradP4)' },
        { name: 'Follow Up', value: winLoss.followUpValue, color: 'url(#gradP2)' },
    ];

    const topProjectsData = reportData.topProjects.length > 0 ? reportData.topProjects : [
        { name: 'No Data', value: 0 }
    ];

    const topCustomersData = reportData.topCustomers.length > 0 ? reportData.topCustomers : [
        { name: 'No Data', value: 0 }
    ];

    const topClientsData = reportData.topClients.length > 0 ? reportData.topClients : [
        { name: 'No Data', value: 0 }
    ];

    // Enforce strict 5 stages for Funnel
    const funnelStages = [
        { name: 'Low Chance', probability: 25, color: '#03A9F4', textColor: '#FFFFFF', stroke: '#000000' },       // Light Blue
        { name: '50-50 Chance', probability: 50, color: '#00C853', textColor: '#FFFFFF', stroke: '#000000' },     // Green
        { name: 'Medium Chance', probability: 75, color: '#0288D1', textColor: '#FFFFFF', stroke: '#000000' },    // Dark Blue
        { name: 'High Chance', probability: 90, color: '#7E57C2', textColor: '#FFFFFF', stroke: '#000000' },      // Purple
        { name: 'Very High Chance', probability: 99, color: '#D50000', textColor: '#FFFFFF', stroke: '#000000' }  // Red
    ];

    const funnelData = funnelStages.map(stage => {
        // Find matching data from API or default to 0
        const found = (reportData.probabilityFunnel || []).find(item => {
            if (item.ProbabilityPercentage === stage.probability) return true;
            if (!item.ProbabilityName) return false;

            const itemNameLower = item.ProbabilityName.toLowerCase();
            const stageNameLower = stage.name.toLowerCase();

            // Precise word match for 'High Chance' to avoid matching 'Very High Chance'
            if (stage.name === "High Chance") {
                return itemNameLower.includes("high chance") && !itemNameLower.includes("very high chance");
            }

            return itemNameLower.includes(stageNameLower);
        });

        return {
            value: found ? (found.TotalValue || 0) : 0,
            name: `${stage.name} (${stage.probability}%)`,
            color: stage.color,
            fill: stage.color,
            textColor: stage.textColor
        };
    }).sort((a, b) => {
        // Sort by probability percentage embedded in name for correct funnel order (Low on top is standard for some, but typically Funnel is High value to Low value? 
        // Wait, standard sales funnel is usually "Leads" -> "Won". 
        // But here it seems to be probability based. 
        // The user image shows "Low Chance" at the top (Red) down to "Very High" (Blue)? OR reverse?
        // Funnel shape usually implies decreasing volume, but here it's "Stages".
        // Let's look at colors in user image:
        // Top is Red-ish. Bottom is Blue-ish.
        // Red is often "Low Chance". Blue is "High".
        // So Low -> High.
        // Let's keep the order defined in `funnelStages` (Low to High).
        // However, Recharts Funnel usually renders text top-down.
        return 0; // Keep array order
    });

    const handleChartClick = async (data, metric, extraParam = null) => {
        if (!data) return;

        const label = data.name;

        let title = `${label} Details`;
        if (metric === 'quarterly-actual') title = `${label} Job Booked Details`;
        if (metric === 'win-loss') title = `${label} Enquiries`;
        if (metric === 'customer') title = `Computed Won Jobs for ${label}`;
        if (metric === 'project') title = `Computed Won Jobs for ${label}`;
        if (metric === 'client') title = `Computed Won Jobs for ${label}`;
        if (metric === 'item-stats') title = `${label} - ${extraParam || 'Details'}`;

        setFunnelModalTitle(title);
        setShowFunnelModal(true);
        setLoadingDetails(true);
        setFunnelDetails([]);

        try {
            const params = new URLSearchParams();
            params.append('year', year);
            if (company && company !== 'All') params.append('company', company);
            if (division && division !== 'All') params.append('division', division);
            if (role && role !== 'All') params.append('role', role);

            params.append('metric', metric);
            params.append('label', label);
            if (extraParam) params.append('status', extraParam);

            if (quarter && quarter !== 'All') params.append('quarter', quarter);

            const res = await fetch(`http://localhost:5001/api/sales-report/drilldown-details?${params.toString()}`);
            if (res.ok) {
                const details = await res.json();
                setFunnelDetails(details);
            }
        } catch (error) {
            console.error("Failed to fetch drilldown details", error);
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleFunnelClick = async (data, index) => {
        if (!data) return;
        // Map index back to original stage to get clean name (e.g., "Low Chance")
        const stage = funnelStages[index];
        const probabilityName = stage ? stage.name : data.name.split(' (')[0];

        setFunnelModalTitle(`${probabilityName} Enquiries`);
        setShowFunnelModal(true);
        setLoadingDetails(true);
        setFunnelDetails([]);

        try {
            const params = new URLSearchParams();
            params.append('year', year);
            if (company && company !== 'All') params.append('company', company);
            if (division && division !== 'All') params.append('division', division);
            if (role && role !== 'All') params.append('role', role);
            params.append('probabilityName', probabilityName);

            if (quarter && quarter !== 'All') params.append('quarter', quarter);

            const res = await fetch(`http://localhost:5001/api/sales-report/funnel-details?${params.toString()}`);
            if (res.ok) {
                const details = await res.json();
                setFunnelDetails(details);
            }
        } catch (error) {
            console.error("Failed to fetch funnel details", error);
        } finally {
            setLoadingDetails(false);
        }
    };

    // Helper to render job tree recursively
    const renderJobTree = (nodes, level = 0) => {
        return nodes.map((job) => (
            <div key={job.ID} style={{ marginLeft: `${level * 15}px`, borderLeft: level > 0 ? '1px solid #cbd5e1' : 'none', paddingLeft: level > 0 ? '5px' : '0' }}>
                <div className="d-flex justify-content-between" style={{ fontSize: '0.8rem' }}>
                    <span style={{ color: '#334155' }}>
                        {level > 0 && <span style={{ color: '#94a3b8', marginRight: '4px' }}>↳</span>}
                        {job.ItemName}
                    </span>
                    <span style={{ color: '#059669', fontWeight: 'bold' }}>
                        {job.NetPrice > 0 ? formatFullNumber(job.NetPrice) : '-'}
                    </span>
                </div>
                {job.children && job.children.length > 0 && (
                    <div className="mt-1">
                        {renderJobTree(job.children, level + 1)}
                    </div>
                )}
            </div>
        ));
    };

    const formatNumber = (num) => {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'k';
        }
        return num.toString();
    };

    const formatFullNumber = (num) => {
        return Number(num).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    };

    const formatBarLabel = (num) => {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'k';
        }
        return num;
    };

    const CustomBarLabel = (props) => {
        const { x, y, width, value } = props;
        if (value === 0 || value === '0') return null;
        return (
            <text
                x={x + width / 2}
                y={y}
                fill="#E0E0E0"
                textAnchor="middle"
                dy={-6}
                style={{ fontSize: '9px', fontWeight: 'normal' }}
            >
                {formatBarLabel(value)}
            </text>
        );
    };

    const RankedBarLabel = (props) => {
        const { x, y, width, value, index } = props;
        if (value === 0 || value === '0') return null;
        const radius = 8;
        return (
            <g>
                <circle cx={x + width / 2} cy={y - 24} r={radius} fill="url(#gradBar)" />
                <text x={x + width / 2} y={y - 24} dy={3} textAnchor="middle" fill="#FFFFFF" fontSize="9px" fontWeight="bold">
                    {index + 1}
                </text>
                <text
                    x={x + width / 2}
                    y={y}
                    fill="#E0E0E0"
                    textAnchor="middle"
                    dy={-6}
                    style={{ fontSize: '9px', fontWeight: 'normal' }}
                >
                    {formatBarLabel(value)}
                </text>
            </g>
        );
    };

    // Custom tick component for wrapped text labels
    const CustomWrappedTick = (props) => {
        const { x, y, payload } = props;
        const words = payload.value.split(' ');
        const maxCharsPerLine = 7;
        let lines = [];
        let currentLine = '';

        words.forEach(word => {
            if ((currentLine + word).length <= maxCharsPerLine) {
                currentLine += (currentLine ? ' ' : '') + word;
            } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            }
        });
        if (currentLine) lines.push(currentLine);

        // Limit to 4 lines to avoid vertical overflow
        if (lines.length > 4) {
            lines = lines.slice(0, 4);
            lines[3] = lines[3] + '..';
        }

        return (
            <g transform={`translate(${x},${y})`}>
                {lines.map((line, index) => (
                    <text
                        key={index}
                        x={0}
                        y={0}
                        dy={index * 9 + 5} // Compact spacing, slight offset
                        textAnchor="middle"
                        fill="#E0E0E0"
                        style={{ fontSize: '8px' }}
                    >
                        {line}
                    </text>
                ))}
            </g>
        );
    };

    const handlePrint = () => {
        const container = document.querySelector('.sales-report-dark-theme');
        if (container) {
            container.classList.add('printing');
            // Allow time for Recharts to update its size based on the new CSS class
            setTimeout(() => {
                window.print();
            }, 500);
        } else {
            window.print();
        }
    };

    useEffect(() => {
        const handleAfterPrint = () => {
            const container = document.querySelector('.sales-report-dark-theme');
            if (container) {
                container.classList.remove('printing');
            }
        };

        window.addEventListener('afterprint', handleAfterPrint);
        return () => {
            window.removeEventListener('afterprint', handleAfterPrint);
        };
    }, []);

    const handleEmail = () => {
        const subject = "Sales Report";
        const body = "Please find the Sales Report attached. (Note: Please save the report as PDF using the Print option before attaching)";
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };

    return (
        <div
            className="container-fluid d-flex flex-column sales-report-dark-theme"
            style={{
                height: 'calc(100vh - 100px)',
                overflow: 'hidden',
                padding: '0.75rem',
                backgroundColor: '#0f172a',
                width: '100vw',
                marginLeft: 'calc(50% - 50vw)',
                marginRight: 'calc(50% - 50vw)'
            }}
        >
            <svg style={{ height: 0, width: 0, position: 'absolute' }}>
                <defs>
                    <linearGradient id="gradBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#64B5F6" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#1976D2" stopOpacity={1} />
                    </linearGradient>
                    <linearGradient id="gradTarget" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#90CAF9" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#42A5F5" stopOpacity={1} />
                    </linearGradient>
                    <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1E88E5" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#0D47A1" stopOpacity={1} />
                    </linearGradient>
                    <linearGradient id="gradP1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#90CAF9" />
                        <stop offset="100%" stopColor="#42A5F5" />
                    </linearGradient>
                    <linearGradient id="gradP2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#42A5F5" />
                        <stop offset="100%" stopColor="#1E88E5" />
                    </linearGradient>
                    <linearGradient id="gradP3" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1E88E5" />
                        <stop offset="100%" stopColor="#1565C0" />
                    </linearGradient>
                    <linearGradient id="gradP4" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1565C0" />
                        <stop offset="100%" stopColor="#0D47A1" />
                    </linearGradient>
                    <linearGradient id="gradP5" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0D47A1" />
                        <stop offset="100%" stopColor="#0A3A7A" />
                    </linearGradient>
                </defs>
            </svg>
            {/* Top Toolbar */}
            <div className="d-flex align-items-center justify-content-between mb-2 flex-shrink-0">
                <div className="d-flex gap-2">
                    <select className="form-select form-select-sm" style={{ width: 110 }} value={quarter} onChange={(e) => setQuarter(e.target.value)}>
                        <option value="All">All Quarters</option>
                        <option value="Q1">Q1</option>
                        <option value="Q2">Q2</option>
                        <option value="Q3">Q3</option>
                        <option value="Q4">Q4</option>
                    </select>
                    <select className="form-select form-select-sm" style={{ width: 100 }} value={year} onChange={(e) => setYear(e.target.value)}>
                        {filterOptions.years.map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                    <select className="form-select form-select-sm" style={{ width: 210 }} value={company} onChange={handleCompanyChange} disabled={isRestricted}>
                        <option value="All">All Company</option>
                        {filterOptions.companies.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                    <select className="form-select form-select-sm" style={{ width: 140 }} value={division} onChange={handleDivisionChange} disabled={isRestricted}>
                        <option value="All">All Division</option>
                        {filterOptions.divisions.map(d => (
                            <option key={d} value={d}>{d}</option>
                        ))}
                    </select>
                    <select className="form-select form-select-sm" style={{ width: 140 }} value={role} onChange={(e) => setRole(e.target.value)} disabled={isRestricted}>
                        <option value="All">All Roles</option>
                        {filterOptions.roles.map(r => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>
                </div>
                <div className="d-flex align-items-center gap-3">
                    <div className="text-muted small" style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        * All the values are in BHD
                    </div>
                    <div className="d-flex gap-2 no-print">
                        <button className="btn btn-sm btn-outline-light d-flex align-items-center gap-1" onClick={handlePrint} title="Print / Save as PDF" style={{ borderColor: '#334155', color: '#e2e8f0' }}>
                            <Printer size={14} /> <span className="d-none d-md-inline">Print</span>
                        </button>
                        <button className="btn btn-sm btn-outline-light d-flex align-items-center gap-1" onClick={handleEmail} title="Email Report" style={{ borderColor: '#334155', color: '#e2e8f0' }}>
                            <Mail size={14} /> <span className="d-none d-md-inline">Email</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="d-flex w-100 flex-grow-1" style={{ minHeight: 0, gap: '0.75rem' }}>

                {/* Analysis Group: Columns 1 & 2 Merged for Alignment */}
                {/* Analysis Group: Columns 1 & 2 Merged for Alignment */}
                <div className="d-flex flex-column" style={{ flex: 1, minWidth: 0, gap: '0.75rem' }}>

                    {/* Top Section: Merged Target (Left) & Stacked Right Columns */}
                    <div className="d-flex w-100" style={{ flex: '57', minHeight: 0, gap: '0.75rem' }}>

                        {/* 1. Merged Target Card (Target Stats + Bar Chart) */}
                        <div className="card shadow-sm border-0 p-2 position-relative pt-2" style={{ flex: '1', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                            <div className="position-absolute start-0 top-0 mt-1 ms-2 fw-bold small" style={{ color: '#34D399', fontSize: '0.7rem' }}>Target Vs Job Booked</div>

                            {/* Stats Section */}
                            <div className="d-flex justify-content-between align-items-center mb-0 px-3 mt-3">
                                <div className="d-flex align-items-baseline gap-2">
                                    <span className="fw-bold fs-2 lh-1" style={{ color: '#E0E0E0' }}>{overallRatio}%</span>
                                </div>
                                <div className="text-end">
                                    <div className="d-flex align-items-baseline justify-content-end gap-1 mb-0 border-bottom border-secondary" style={{ borderColor: 'rgba(255,255,255,0.1) !important' }}>
                                        <span className="fw-bold fs-5 lh-1" style={{ color: '#E0E0E0', cursor: 'help' }} title={formatFullNumber(totalActual)}>{formatBarLabel(totalActual)}</span>
                                        <span className="small" style={{ fontSize: '0.75rem', color: '#E0E0E0' }}>Total Actual</span>
                                    </div>
                                    <div className="d-flex align-items-baseline justify-content-end gap-1">
                                        <span className="fw-bold fs-5 lh-1" style={{ color: '#3B82F6', cursor: 'help' }} title={formatFullNumber(totalTarget)}>{formatBarLabel(totalTarget)}</span>
                                        <span className="small" style={{ fontSize: '0.75rem', color: '#3B82F6' }}>Total Target</span>
                                    </div>
                                </div>
                            </div>
                            <hr className="my-2 border-secondary" style={{ opacity: 0.2 }} />
                            <div className="d-grid mt-0 mb-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginLeft: '45px', marginRight: '10px', gap: '0' }}>
                                {['Q1', 'Q2', 'Q3', 'Q4'].map((q, index) => (
                                    <div key={q} className={`text-center ${index !== 3 ? 'border-end border-secondary' : ''}`} style={{ borderColor: 'rgba(255,255,255,0.1) !important' }}>
                                        <div className="small fw-bold text-muted fw-lighter lh-1" style={{ fontSize: '0.75rem', marginBottom: '4px', color: '#34D399' }}>
                                            <span style={{ color: '#34D399' }}>{q} </span>
                                            <span style={{ color: '#E0E0E0' }}>{targetVsActualData[index]?.target > 0 ? Math.round((targetVsActualData[index]?.actual / targetVsActualData[index]?.target) * 100) : 0}%</span>
                                        </div>
                                        <div className="fw-bold lh-1 border-bottom border-secondary d-flex justify-content-center position-relative px-1" style={{ fontSize: '0.75rem', borderColor: 'rgba(255,255,255,0.1) !important', color: '#E0E0E0', marginBottom: '0' }}>
                                            {index === 0 && <span style={{ position: 'absolute', left: '-38px', fontSize: '0.65rem', opacity: 0.8 }}>Actual</span>}
                                            <span style={{ cursor: 'help' }} title={formatFullNumber(targetVsActualData[index]?.actual || 0)}>{formatBarLabel(targetVsActualData[index]?.actual || 0)}</span>
                                        </div>
                                        <div className="fw-bold lh-1 d-flex justify-content-center position-relative px-1" style={{ fontSize: '0.75rem', color: '#3B82F6' }}>
                                            {index === 0 && <span style={{ position: 'absolute', left: '-38px', fontSize: '0.65rem', opacity: 0.8 }}>Target</span>}
                                            <span style={{ cursor: 'help' }} title={formatFullNumber(targetVsActualData[index]?.target || 0)}>{formatBarLabel(targetVsActualData[index]?.target || 0)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Chart Section */}
                            <div className="flex-grow-1" style={{ width: '100%', minHeight: '180px', height: '180px' }}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={180}>
                                    <BarChart data={targetVsActualData} margin={{ top: 25, right: 10, left: 5, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#E0E0E0' }} />
                                        <YAxis width={40} tickFormatter={formatNumber} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#E0E0E0' }} />
                                        <Tooltip
                                            formatter={(value) => formatFullNumber(value)}
                                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#E0E0E0', fontSize: '10px', borderRadius: '4px' }}
                                            itemStyle={{ color: '#E0E0E0' }}
                                        />
                                        <Legend
                                            verticalAlign="top"
                                            align="right"
                                            wrapperStyle={{ fontSize: '10px', color: '#E0E0E0', paddingBottom: '10px' }}
                                            content={() => (
                                                <div className="d-flex justify-content-end gap-3" style={{ fontSize: '10px', color: '#E0E0E0' }}>
                                                    <div className="d-flex align-items-center gap-1">
                                                        <div style={{ width: 8, height: 8, borderRadius: '2px', backgroundColor: '#42A5F5' }}></div>
                                                        <span>Target</span>
                                                    </div>
                                                    <div className="d-flex align-items-center gap-1">
                                                        <div style={{ width: 8, height: 8, borderRadius: '2px', backgroundColor: '#0D47A1' }}></div>
                                                        <span>Job Booked</span>
                                                    </div>
                                                </div>
                                            )}
                                        />
                                        <Tooltip
                                            formatter={(value) => formatFullNumber(value)}
                                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#E0E0E0', fontSize: '10px', borderRadius: '4px' }}
                                            itemStyle={{ color: '#E0E0E0' }}
                                        />
                                        <Bar dataKey="target" stackId="a" fill="url(#gradTarget)" radius={[0, 0, 0, 0]} barSize={20}>
                                            <LabelList dataKey="target" content={<CustomBarLabel />} />
                                        </Bar>
                                        <Bar dataKey="actual" stackId="b" fill="url(#gradActual)" radius={[2, 2, 0, 0]} barSize={20} style={{ cursor: 'pointer' }} onClick={(data) => handleChartClick(data, 'quarterly-actual')}>
                                            <LabelList dataKey="actual" content={<CustomBarLabel />} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Right Column: Win-Loss & Prospect Merged */}
                        <div className="card shadow-sm border-0 p-2 position-relative pt-2" style={{ flex: '1', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                            <div className="position-absolute start-0 top-0 mt-1 ms-2 fw-bold small" style={{ color: '#34D399', fontSize: '0.7rem' }}>Win-Loss Ratio</div>

                            {/* Win-Loss Stats Section */}
                            <div className="d-flex align-items-center pt-3 pb-2 border-bottom border-secondary mb-2" style={{ borderColor: 'rgba(255,255,255,0.1) !important', flex: '0 0 auto' }}>
                                <div className="d-flex flex-column justify-content-center text-center border-end border-secondary pe-3 me-3" style={{ width: '40%', borderColor: 'rgba(255,255,255,0.1) !important' }}>
                                    <div className="section mb-2">
                                        <div className="text-muted fw-bold mb-0" style={{ fontSize: '0.6rem', textTransform: 'uppercase' }}>Winning Rate</div>
                                        <div className="fw-bold fs-3 lh-1" style={{ color: '#E0E0E0' }}>{totalValue > 0 ? Math.round((winLoss.wonValue / totalValue) * 100) : 0}%</div>
                                    </div>
                                    <div className="section">
                                        <div className="text-muted fw-bold mb-0" style={{ fontSize: '0.6rem', textTransform: 'uppercase' }}>Losing Rate</div>
                                        <div className="fw-bold fs-3 lh-1" style={{ color: '#3B82F6' }}>{totalValue > 0 ? Math.round((winLoss.lostValue / totalValue) * 100) : 0}%</div>
                                    </div>
                                </div>
                                <div className="flex-grow-1 d-flex flex-column justify-content-center gap-0">
                                    <div className="d-flex justify-content-between align-items-end">
                                        <span className="fw-bold fs-6 text-nowrap" style={{ color: '#E0E0E0' }}>Quoted</span>
                                        <span className="fw-bold border-bottom border-secondary" style={{ borderColor: 'rgba(255,255,255,0.1) !important', width: '60%', textAlign: 'right', color: '#E0E0E0', fontSize: '0.9rem', cursor: 'help' }} title={formatFullNumber(winLoss.wonValue + winLoss.lostValue + winLoss.followUpValue)}>{formatBarLabel(winLoss.wonValue + winLoss.lostValue + winLoss.followUpValue)}</span>
                                    </div>
                                    <div className="d-flex justify-content-between align-items-end">
                                        <span className="fw-bold fs-6 text-nowrap" style={{ color: '#3B82F6' }}>Won</span>
                                        <span className="fw-bold border-bottom border-secondary" style={{ borderColor: 'rgba(255,255,255,0.1) !important', width: '60%', textAlign: 'right', color: '#E0E0E0', fontSize: '0.9rem', cursor: 'help' }} title={formatFullNumber(winLoss.wonValue)}>{formatBarLabel(winLoss.wonValue)}</span>
                                    </div>
                                    <div className="d-flex justify-content-between align-items-end">
                                        <span className="fw-bold fs-6 text-nowrap" style={{ color: '#EF4444' }}>Lost</span>
                                        <span className="fw-bold border-bottom border-secondary" style={{ borderColor: 'rgba(255,255,255,0.1) !important', width: '60%', textAlign: 'right', color: '#EF4444', fontSize: '0.9rem', cursor: 'help' }} title={formatFullNumber(winLoss.lostValue)}>{formatBarLabel(winLoss.lostValue)}</span>
                                    </div>
                                    <div className="d-flex justify-content-between align-items-end">
                                        <span className="fw-bold fs-6 text-nowrap" style={{ color: '#3B82F6' }}>Follow Up</span>
                                        <span className="fw-bold" style={{ color: '#3B82F6', width: '60%', textAlign: 'right', fontSize: '0.9rem', cursor: 'help' }} title={formatFullNumber(winLoss.followUpValue)}>{formatBarLabel(winLoss.followUpValue)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Prospect Pie Section */}
                            <div className="flex-grow-1" style={{ width: '100%', minHeight: '180px', height: '180px', position: 'relative' }}>
                                {/* Heading removed as requested */}
                                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={180}>
                                    <PieChart>
                                        <Pie
                                            data={prospectPieData}
                                            innerRadius={0}
                                            outerRadius="60%"
                                            paddingAngle={0}
                                            minAngle={5}
                                            dataKey="value"
                                            labelLine={{ stroke: '#E0E0E0', strokeWidth: 1 }}
                                            label={({ x, y, name, value, textAnchor }) => {
                                                const percentage = totalValue > 0 ? Math.round((value / totalValue) * 100) : 0;
                                                return (
                                                    <text x={x} y={y} fill="#E0E0E0" textAnchor={textAnchor} dominantBaseline="central" style={{ fontSize: '0.65rem' }}>
                                                        <tspan x={x} dy="-0.6em">{name}</tspan>
                                                        <tspan x={x} dy="1.2em">{`${formatBarLabel(value)} (${percentage}%)`}</tspan>
                                                    </text>
                                                );
                                            }}
                                            onClick={(data) => handleChartClick(data, 'win-loss')}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            {prospectPieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} stroke="#0f172a" strokeWidth={1} style={{ cursor: 'pointer' }} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(value) => formatFullNumber(value)}
                                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#E0E0E0', fontSize: '10px', borderRadius: '4px' }}
                                            itemStyle={{ color: '#E0E0E0' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Row 3: Merged Category & Breakdown */}
                    {/* Row 3: Merged Category & Breakdown - REFATORING to Two Separate Cards */}
                    <div className="d-flex w-100" style={{ flex: '43', minHeight: 0, gap: '0.75rem' }}>

                        {/* Left Card: Item Wise Target vs Actual Won */}
                        <div className="card shadow-sm border-0 p-2" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                            <div className="d-flex flex-column h-100">
                                <div className="d-flex justify-content-between align-items-center mb-1">
                                    <h6 className="fw-bold small mb-0 ms-2 text-start" style={{ color: '#34D399' }}>Item wise Target Vs Job Booked</h6>
                                </div>
                                <div className="d-flex gap-1 justify-content-center mb-2">
                                    {['All', 'Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                                        <button
                                            key={q}
                                            className={`btn btn-sm px-2 py-0 ${itemWiseQuarter === q ? 'btn-primary' : 'btn-outline-secondary'}`}
                                            style={{ fontSize: '0.65rem', borderColor: itemWiseQuarter === q ? '' : '#334155', color: itemWiseQuarter === q ? '#fff' : '#94a3b8' }}
                                            onClick={() => setItemWiseQuarter(q)}
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex-grow-1" style={{ width: '100%', minHeight: '150px', height: '150px' }}>
                                    <ResponsiveContainer width="100%" height="100%" minHeight={150}>
                                        <BarChart data={itemWiseData.length > 0 ? itemWiseData : []} margin={{ top: 50, right: 5, left: 10, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                                            <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} interval={0} tick={{ fontSize: 8, fill: '#E0E0E0' }} axisLine={false} tickLine={false} />
                                            <YAxis width={40} tickFormatter={formatNumber} tick={{ fontSize: 8, fill: '#E0E0E0' }} axisLine={false} tickLine={false} />
                                            <Tooltip
                                                formatter={(value) => formatFullNumber(value)}
                                                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#E0E0E0', fontSize: '10px', borderRadius: '4px' }}
                                                itemStyle={{ color: '#E0E0E0' }}
                                            />
                                            <Legend
                                                verticalAlign="top"
                                                align="right"
                                                wrapperStyle={{ fontSize: '10px', color: '#E0E0E0', paddingBottom: '10px' }}
                                                content={() => (
                                                    <div className="d-flex justify-content-end gap-3" style={{ fontSize: '10px', color: '#E0E0E0' }}>
                                                        <div className="d-flex align-items-center gap-1">
                                                            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#42A5F5' }}></div>
                                                            <span>Target</span>
                                                        </div>
                                                        <div className="d-flex align-items-center gap-1">
                                                            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#0D47A1' }}></div>
                                                            <span>Job Booked</span>
                                                        </div>
                                                    </div>
                                                )}
                                            />
                                            <Bar dataKey="target" name="Target" fill="url(#gradTarget)" radius={[2, 2, 0, 0]} barSize={15}>
                                                <LabelList dataKey="target" position="top" offset={18} formatter={formatBarLabel} style={{ fill: '#E0E0E0', fontSize: '8px', fontWeight: 'normal' }} />
                                            </Bar>
                                            <Bar dataKey="won" name="Job Booked" fill="url(#gradActual)" radius={[2, 2, 0, 0]} barSize={15} style={{ cursor: 'pointer' }} onClick={(data) => handleChartClick(data, 'item-stats', 'Won')}>
                                                <LabelList dataKey="won" position="top" offset={2} formatter={formatBarLabel} style={{ fill: '#E0E0E0', fontSize: '8px', fontWeight: 'normal' }} />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* Right Card: Item Wise Breakdown Pie */}
                        <div className="card shadow-sm border-0 p-2" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                            <div className="position-relative h-100 d-flex flex-column">
                                <div className="d-flex justify-content-between align-items-start mb-1">
                                    <div className="fw-bold small" style={{ color: '#34D399', marginLeft: '10px' }}>Item Wise Breakdown</div>
                                </div>

                                {/* Selectable Buttons */}
                                <div className="d-flex gap-1 justify-content-center mb-2">
                                    {['Quoted', 'Won', 'Lost', 'Follow Up'].map(metric => (
                                        <button
                                            key={metric}
                                            className={`btn btn-sm px-2 py-0 ${pieMetric === metric ? 'btn-primary' : 'btn-outline-secondary'}`}
                                            style={{ fontSize: '0.65rem', borderColor: pieMetric === metric ? '' : '#334155', color: pieMetric === metric ? '#fff' : '#94a3b8' }}
                                            onClick={() => setPieMetric(metric)}
                                        >
                                            {metric}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex-grow-1" style={{ width: '100%', minHeight: 0 }}>
                                    <ResponsiveContainer width="100%" height="100%" minHeight={180}>
                                        <PieChart>
                                            <Pie
                                                data={(reportData.itemWiseStats || []).map(item => {
                                                    let val = 0;
                                                    if (pieMetric === 'Quoted') val = item.won + item.lost + item.followUp;
                                                    else if (pieMetric === 'Won') val = item.won;
                                                    else if (pieMetric === 'Lost') val = item.lost;
                                                    else if (pieMetric === 'Follow Up') val = item.followUp;
                                                    return { name: item.name, value: val };
                                                }).filter(d => d.value > 0)}
                                                innerRadius={0}
                                                outerRadius="45%"
                                                paddingAngle={0}
                                                minAngle={15}
                                                dataKey="value"
                                                labelLine={{ stroke: '#E0E0E0', strokeWidth: 1 }}
                                                label={({ x, y, name, value, textAnchor }) => {
                                                    // Calculate total for percentage
                                                    const currentTotal = (reportData.itemWiseStats || []).reduce((acc, item) => {
                                                        let val = 0;
                                                        if (pieMetric === 'Quoted') val = item.won + item.lost + item.followUp;
                                                        else if (pieMetric === 'Won') val = item.won;
                                                        else if (pieMetric === 'Lost') val = item.lost;
                                                        else if (pieMetric === 'Follow Up') val = item.followUp;
                                                        return acc + val;
                                                    }, 0);

                                                    const percentage = currentTotal > 0 ? Math.round((value / currentTotal) * 100) : 0;
                                                    return (
                                                        <text x={x} y={y} fill="#E0E0E0" textAnchor={textAnchor} dominantBaseline="central" style={{ fontSize: '0.65rem' }}>
                                                            <tspan x={x} dy="-0.6em">{name}</tspan>
                                                            <tspan x={x} dy="1.2em">{`${formatBarLabel(value)} (${percentage}%)`}</tspan>
                                                        </text>
                                                    );
                                                }}
                                                onClick={(data) => handleChartClick(data, 'item-stats', pieMetric)}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                {(reportData.itemWiseStats || []).map((entry, index) => {
                                                    const colors = ['#0D47A1', '#1565C0', '#1976D2', '#1E88E5', '#2196F3', '#42A5F5', '#64B5F6', '#90CAF9'];
                                                    return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} stroke="#0f172a" style={{ cursor: 'pointer' }} />;
                                                })}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#E0E0E0', fontSize: '10px', borderRadius: '4px' }}
                                                itemStyle={{ color: '#E0E0E0' }}
                                                formatter={(value) => formatFullNumber(value)}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Group: 2x2 Grid for Top 10s and Funnel */}
                {/* Right Group: 2x2 Grid for Top 10s and Funnel */}
                <div className="d-flex flex-column" style={{ flex: 1, minWidth: 0, gap: '0.75rem' }}>

                    {/* Row 1: Customers & Projects */}
                    <div className="d-flex w-100" style={{ flex: 1, minHeight: 0, gap: '0.75rem' }}>
                        {/* 1. Top 10 Customers */}
                        <div className="card shadow-sm border-0 p-2" style={{ flex: '0 0 calc(50% - 0.375rem)', maxWidth: 'calc(50% - 0.375rem)', minHeight: '220px' }}>
                            <h6 className="fw-bold small mb-0 ms-2 text-start" style={{ color: '#34D399' }}>Top 10 Customer's job booked</h6>
                            <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                                <BarChart data={topCustomersData} margin={{ top: 60, right: 5, left: 40, bottom: 15 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} interval={0} tick={{ fontSize: 9, fill: '#E0E0E0' }} tickFormatter={(val) => val.length > 20 ? val.substring(0, 20) + '..' : val} axisLine={false} tickLine={false} />
                                    <YAxis width={40} tickFormatter={formatNumber} tick={{ fontSize: 8, fill: '#E0E0E0' }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        formatter={(value) => formatFullNumber(value)}
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#E0E0E0', fontSize: '10px', borderRadius: '4px' }}
                                        itemStyle={{ color: '#E0E0E0' }}
                                    />
                                    <Bar dataKey="value" fill="url(#gradBar)" radius={[2, 2, 0, 0]} style={{ cursor: 'pointer' }} onClick={(data) => handleChartClick(data, 'customer')}>
                                        <LabelList dataKey="value" content={<RankedBarLabel />} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* 2. Top 10 Projects */}
                        <div className="card shadow-sm border-0 p-2" style={{ flex: '0 0 calc(50% - 0.375rem)', maxWidth: 'calc(50% - 0.375rem)', minHeight: '220px' }}>
                            <h6 className="fw-bold small mb-0 ms-2 text-start" style={{ color: '#34D399' }}>Top 10 Projects' Job booked</h6>
                            <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                                <BarChart data={topProjectsData} margin={{ top: 60, right: 5, left: 40, bottom: 15 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} interval={0} tick={{ fontSize: 9, fill: '#E0E0E0' }} tickFormatter={(val) => val.length > 20 ? val.substring(0, 20) + '..' : val} axisLine={false} tickLine={false} />
                                    <YAxis width={40} tickFormatter={formatNumber} tick={{ fontSize: 8, fill: '#E0E0E0' }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        formatter={(value) => formatFullNumber(value)}
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#E0E0E0', fontSize: '10px', borderRadius: '4px' }}
                                        itemStyle={{ color: '#E0E0E0' }}
                                    />
                                    <Bar dataKey="value" fill="url(#gradBar)" radius={[2, 2, 0, 0]} style={{ cursor: 'pointer' }} onClick={(data) => handleChartClick(data, 'project')}>
                                        <LabelList dataKey="value" content={<RankedBarLabel />} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Row 2: Clients & Pipeline */}
                    <div className="d-flex w-100" style={{ flex: 1, minHeight: 0, gap: '0.75rem' }}>
                        {/* 3. Top 10 Clients */}
                        <div className="card shadow-sm border-0 p-2" style={{ flex: '0 0 calc(50% - 0.375rem)', maxWidth: 'calc(50% - 0.375rem)', minHeight: '220px' }}>
                            <h6 className="fw-bold small mb-0 ms-2 text-start" style={{ color: '#34D399' }}>Top 10 Client's Job booked</h6>
                            <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                                <BarChart data={topClientsData} margin={{ top: 60, right: 5, left: 40, bottom: 15 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} interval={0} tick={{ fontSize: 9, fill: '#E0E0E0' }} tickFormatter={(val) => val.length > 20 ? val.substring(0, 20) + '..' : val} axisLine={false} tickLine={false} />
                                    <YAxis width={40} tickFormatter={formatNumber} tick={{ fontSize: 8, fill: '#E0E0E0' }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        formatter={(value) => formatFullNumber(value)}
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#E0E0E0', fontSize: '10px', borderRadius: '4px' }}
                                        itemStyle={{ color: '#E0E0E0' }}
                                    />
                                    <Bar dataKey="value" fill="url(#gradBar)" radius={[2, 2, 0, 0]} style={{ cursor: 'pointer' }} onClick={(data) => handleChartClick(data, 'client')}>
                                        <LabelList dataKey="value" content={<RankedBarLabel />} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* 4. Sales Pipeline */}
                        <div
                            className="card shadow-sm border-0 p-3"
                            style={{
                                flex: '0 0 calc(50% - 0.375rem)',
                                maxWidth: 'calc(50% - 0.375rem)',
                                borderRadius: '12px',
                                display: 'flex',
                                flexDirection: 'column'
                            }}
                        >
                            <h6 className="fw-bold small mb-2 text-start" style={{ color: '#34D399' }}>Sales Pipeline</h6>
                            <div className="flex-grow-1" style={{ width: '100%', minHeight: '180px', height: '180px' }}>
                                <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={180}>
                                    <FunnelChart margin={{ top: 10, bottom: 10, left: 120, right: 10 }} style={{ outline: 'none' }}>
                                        <defs>
                                            <linearGradient id="gradP1" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#90CAF9" />
                                                <stop offset="100%" stopColor="#42A5F5" />
                                            </linearGradient>
                                            <linearGradient id="gradP2" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#42A5F5" />
                                                <stop offset="100%" stopColor="#1E88E5" />
                                            </linearGradient>
                                            <linearGradient id="gradP3" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#1E88E5" />
                                                <stop offset="100%" stopColor="#1565C0" />
                                            </linearGradient>
                                        </defs>
                                        <Tooltip
                                            formatter={(value) => formatFullNumber(value)}
                                            itemStyle={{ color: '#E0E0E0' }}
                                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#E0E0E0', fontSize: '10px', borderRadius: '4px' }}
                                        />
                                        <Funnel
                                            data={funnelData.map((d, i) => ({ ...d, renderValue: 5 - i }))}
                                            dataKey="renderValue"
                                            isAnimationActive={false}
                                            width="98%"
                                            bottomWidth={0}
                                            gap={2}
                                            stroke="#000000"
                                            strokeWidth={1}
                                            onClick={handleFunnelClick}
                                            style={{ cursor: 'pointer', outline: 'none' }}
                                        >
                                            <LabelList
                                                position="left"
                                                fill="#E0E0E0"
                                                stroke="none"
                                                dataKey="name"
                                                content={({ x, y, value }) => (
                                                    <g>
                                                        <line x1={x + 5} y1={y + 18} x2={120} y2={y + 18} stroke="#E0E0E0" strokeWidth={1} />
                                                        <text x={115} y={y + 18} fill="#E0E0E0" fontSize={11} textAnchor="end" dominantBaseline="middle">
                                                            {value}
                                                        </text>
                                                    </g>
                                                )}
                                            />
                                            <LabelList
                                                position="center"
                                                stroke="none"
                                                dataKey="value"
                                                content={({ x, y, width, height, value, index }) => {
                                                    const color = funnelData[index]?.textColor || '#FFFFFF';
                                                    return (
                                                        <text x={x + width / 2} y={y + height / 2} fill={color} fontSize={10} fontWeight="bold" textAnchor="middle" dominantBaseline="middle">
                                                            {formatNumber(value)}
                                                        </text>
                                                    );
                                                }}
                                            />
                                            {funnelData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} stroke="#000000" strokeWidth={1} />
                                            ))}
                                        </Funnel>

                                    </FunnelChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
            {/* Funnel Details Modal */}
            <Modal
                show={showFunnelModal}
                title={funnelModalTitle}
                onClose={() => setShowFunnelModal(false)}
                footer={
                    <button className="btn btn-secondary" onClick={() => setShowFunnelModal(false)}>Close</button>
                }
                maxWidth="1050px"
            >
                <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                    {loadingDetails ? (
                        <div className="text-center py-5">
                            <div className="spinner-border text-primary" role="status">
                                <span className="visually-hidden">Loading...</span>
                            </div>
                        </div>
                    ) : funnelDetails.length === 0 ? (
                        <div className="text-center py-5 text-muted">No details found for this section.</div>
                    ) : (
                        <div className="table-responsive">
                            <div className="d-flex justify-content-between align-items-center mb-2 px-1">
                                <span className="text-muted small">Showing {funnelDetails.length} items</span>
                            </div>
                            <table className="table table-hover table-striped table-bordered table-sm mb-0" style={{ fontSize: '13.5px' }}>
                                <thead className="table-light">
                                    {/* Summary Row aligned with columns */}
                                    <tr style={{ borderTop: 'none' }}>
                                        <th colSpan="4" style={{ backgroundColor: '#fff', border: 'none' }}></th>
                                        <th className="text-end" style={{ backgroundColor: '#fff', border: 'none', color: '#059669', fontSize: '15px' }}>
                                            {formatFullNumber(funnelDetails.reduce((sum, item) => sum + (Number(item.TotalPrice) || 0), 0))}
                                        </th>
                                        <th style={{ backgroundColor: '#fff', border: 'none' }}></th>
                                    </tr>
                                    <tr style={{ color: '#1e293b' }}>
                                        <th style={{ backgroundColor: '#f8f9fa' }}>Enquiry No.</th>
                                        <th style={{ backgroundColor: '#f8f9fa' }}>Project Name</th>
                                        <th style={{ backgroundColor: '#f8f9fa' }}>Quote Ref & Date</th>
                                        <th style={{ backgroundColor: '#f8f9fa' }}>Customer Name</th>
                                        <th className="text-end" style={{ backgroundColor: '#f8f9fa' }}>Total Price</th>
                                        <th style={{ backgroundColor: '#f8f9fa' }}>Net Price (Job Breakdown)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {funnelDetails.map((item, idx) => (
                                        <tr key={idx}>
                                            <td style={{ verticalAlign: 'middle' }}>{item.RequestNo}</td>
                                            <td style={{ verticalAlign: 'middle', maxWidth: '200px', whiteSpace: 'normal', wordWrap: 'break-word' }}>{item.ProjectName}</td>
                                            <td style={{ verticalAlign: 'middle' }}>
                                                {item.QuoteRef ? (
                                                    <div>
                                                        <div className="fw-bold text-primary">{item.QuoteRef}</div>
                                                        <div className="small text-muted">{new Date(item.QuoteDate).toLocaleDateString()}</div>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted">-</span>
                                                )}
                                            </td>
                                            <td style={{ verticalAlign: 'middle', maxWidth: '150px', whiteSpace: 'normal', wordWrap: 'break-word' }}>{item.CustomerName}</td>
                                            <td className="text-end" style={{ verticalAlign: 'middle', fontWeight: 'bold' }}>
                                                {item.TotalPrice ? formatFullNumber(item.TotalPrice) : '0'}
                                            </td>
                                            <td style={{ padding: '0.5rem' }}>
                                                {item.jobs && item.jobs.length > 0 ? (
                                                    <div style={{ maxHeight: '150px', overflowY: 'auto', backgroundColor: '#f1f5f9', padding: '8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                                        {renderJobTree(item.jobs)}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted small">No job details</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div >
                    )}
                </div >
            </Modal >
        </div >
    );
};

export default SalesReport;
