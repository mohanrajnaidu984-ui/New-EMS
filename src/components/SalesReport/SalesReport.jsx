
import React, { useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, FunnelChart, Funnel, LabelList
} from 'recharts';
import './SalesReport.css'; // Import the dark theme styles

const SalesReport = () => {
    // ---- State ----
    const [year, setYear] = useState('2026');
    const [company, setCompany] = useState('All');
    const [division, setDivision] = useState('All');
    const [role, setRole] = useState('All');

    const [filterOptions, setFilterOptions] = useState({
        years: [],
        companies: [],
        divisions: [],
        roles: []
    });

    React.useEffect(() => {
        // Initial load: Only fetch Years and Companies (no dependencies)
        const fetchInitial = async () => {
            try {
                const response = await fetch('http://localhost:5000/api/sales-report/filters'); // No params returns years and companies
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
        if (company !== 'All') {
            fetchFilters(company, null); // Fetch divisions for company
        } else {
            // If Company is All, clear Divisions and Roles
            setFilterOptions(prev => ({ ...prev, divisions: [], roles: [] }));
            setDivision('All');
            setRole('All');
        }
    }, [company]);

    React.useEffect(() => {
        if (division !== 'All') {
            fetchFilters(company, division); // Fetch roles for division
        } else {
            // If Division is All, clear Roles
            setFilterOptions(prev => ({ ...prev, roles: [] }));
            setRole('All');
        }
    }, [division]);

    const fetchFilters = async (selectedCompany, selectedDivision) => {
        try {
            const params = new URLSearchParams();
            if (selectedCompany && selectedCompany !== 'All') params.append('company', selectedCompany);
            if (selectedDivision && selectedDivision !== 'All') params.append('division', selectedDivision);

            const response = await fetch(`http://localhost:5000/api/sales-report/filters?${params.toString()}`);
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

    const [category, setCategory] = useState('Customer');
    const [selection, setSelection] = useState('Customer - 1');
    const [itemName, setItemName] = useState('All');

    // ---- Mock Data ----
    const targetVsActualData = [
        { name: 'Q1', target: 50000, actual: 45000 },
        { name: 'Q2', target: 60000, actual: 62000 },
        { name: 'Q3', target: 75000, actual: 12000 },
        { name: 'Q4', target: 80000, actual: 0 },
    ];

    const prospectPieData = [
        { name: 'Won', value: 12, color: 'url(#gradP3)' },
        { name: 'Lost', value: 53, color: 'url(#gradP4)' },
        { name: 'Follow Up', value: 35, color: 'url(#gradP2)' },
    ];

    const topProjectsData = [
        { name: 'Project 1', value: 5533283 },
        { name: 'Project 2', value: 4922438 },
        { name: 'Project 3', value: 4311593 },
        { name: 'Project 4', value: 3700746 },
        { name: 'Project 5', value: 3089903 },
        { name: 'Project 6', value: 2479058 },
        { name: 'Project 7', value: 1868213 },
        { name: 'Project 8', value: 1257368 },
        { name: 'Project 9', value: 646523 },
        { name: 'Project 10', value: 35678 },
    ];

    const topCustomersData = [
        { name: 'Customer 10', value: 4553283 },
        { name: 'Customer 9', value: 4052438 },
        { name: 'Customer 8', value: 3551593 },
        { name: 'Customer 7', value: 3050746 },
        { name: 'Customer 6', value: 2549903 },
        { name: 'Customer 5', value: 2049058 },
        { name: 'Customer 4', value: 1548213 },
        { name: 'Customer 3', value: 1047368 },
        { name: 'Customer 2', value: 546523 },
        { name: 'Customer 1', value: 45678 },
    ];

    const topClientsData = [
        { name: 'Client 10', value: 4253283 },
        { name: 'Client 9', value: 3852438 },
        { name: 'Client 8', value: 3251593 },
        { name: 'Client 7', value: 2850746 },
        { name: 'Client 6', value: 2249903 },
        { name: 'Client 5', value: 1849058 },
        { name: 'Client 4', value: 1548213 },
        { name: 'Client 3', value: 1047368 },
        { name: 'Client 2', value: 546523 },
        { name: 'Client 1', value: 45678 },
    ];

    const categoryBarData = [
        { name: 'Project 1', value: 25000 },
        { name: 'Project 2', value: 24000 },
        { name: 'Project 3', value: 22000 },
        { name: 'Project 4', value: 20000 },
        { name: 'Project 5', value: 19000 },
        { name: 'Project 6', value: 17000 },
        { name: 'Project 7', value: 15000 },
        { name: 'Project 8', value: 14000 },
    ];

    const breakdownPieData = [
        { name: 'BMS', value: 47, color: 'url(#gradP4)' },
        { name: 'ELV', value: 26, color: 'url(#gradP3)' },
        { name: 'PICV', value: 21, color: 'url(#gradP2)' },
        { name: 'BTU Meter', value: 6, color: 'url(#gradP1)' },
    ];

    const funnelData = [
        { value: 7000, name: 'Prospects', fill: 'url(#gradP1)' },
        { value: 3200, name: 'Price quotes', fill: 'url(#gradP2)' },
        { value: 2450, name: 'Negotiation', fill: 'url(#gradP3)' },
        { value: 1680, name: 'Closed sales', fill: 'url(#gradP4)' },
    ];

    const formatNumber = (num) => {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'k';
        }
        return num;
    };

    const formatBarLabel = (num) => {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'k';
        }
        return num;
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
                </defs>
            </svg>
            {/* Top Toolbar */}
            <div className="d-flex align-items-center justify-content-between mb-2 flex-shrink-0">
                <div className="d-flex gap-2">
                    <select className="form-select form-select-sm" style={{ width: 100 }} value={year} onChange={(e) => setYear(e.target.value)}>
                        {filterOptions.years.map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                    <select className="form-select form-select-sm" style={{ width: 210 }} value={company} onChange={handleCompanyChange}>
                        <option value="All">All Company</option>
                        {filterOptions.companies.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                    <select className="form-select form-select-sm" style={{ width: 140 }} value={division} onChange={handleDivisionChange}>
                        <option value="All">All Division</option>
                        {filterOptions.divisions.map(d => (
                            <option key={d} value={d}>{d}</option>
                        ))}
                    </select>
                    <select className="form-select form-select-sm" style={{ width: 140 }} value={role} onChange={(e) => setRole(e.target.value)}>
                        <option value="All">All Roles</option>
                        {filterOptions.roles.map(r => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="d-flex w-100 flex-grow-1" style={{ minHeight: 0, gap: '0.75rem' }}>

                {/* Analysis Group: Columns 1 & 2 Merged for Alignment */}
                <div className="d-flex flex-column" style={{ flex: '0 0 50%', maxWidth: '50%', gap: '0.75rem' }}>

                    {/* Row 1: Target Stats & Win-Loss */}
                    <div className="d-flex w-100" style={{ flex: '25', minHeight: 0, gap: '0.75rem' }}>
                        {/* 1. Target Vs Job Booked */}
                        <div className="card shadow-sm border-0 p-2 position-relative pt-2" style={{ flex: '1', minHeight: 0, overflow: 'hidden' }}>
                            <div className="position-absolute start-0 top-0 mt-1 ms-2 fw-bold small" style={{ color: '#34D399', fontSize: '0.7rem' }}>Target Vs Job Booked</div>
                            <div className="d-flex justify-content-between align-items-center mb-0 px-3 mt-1">
                                <div className="d-flex align-items-baseline gap-2">
                                    <span className="fw-bold fs-2 lh-1" style={{ color: '#E0E0E0' }}>84%</span>
                                </div>
                                <div className="text-end">
                                    <div className="d-flex align-items-baseline justify-content-end gap-1 mb-0 border-bottom border-secondary" style={{ borderColor: 'rgba(255,255,255,0.1) !important' }}>
                                        <span className="fw-bold fs-5 lh-1" style={{ color: '#E0E0E0' }}>123.5k</span>
                                        <span className="small" style={{ fontSize: '0.75rem', color: '#E0E0E0' }}>Actual</span>
                                    </div>
                                    <div className="d-flex align-items-baseline justify-content-end gap-1">
                                        <span className="fw-bold fs-5 lh-1" style={{ color: '#3B82F6' }}>145.7k</span>
                                        <span className="small" style={{ fontSize: '0.75rem', color: '#3B82F6' }}>Target</span>
                                    </div>
                                </div>
                            </div>
                            <hr className="my-1 border-secondary" style={{ opacity: 0.2 }} />
                            <div className="d-flex justify-content-between mt-0">
                                {['Q1', 'Q2', 'Q3', 'Q4'].map((q, index) => (
                                    <div key={q} className={`text-center flex-grow-1 ${index !== 3 ? 'border-end border-secondary' : ''}`} style={{ borderColor: 'rgba(255,255,255,0.1) !important' }}>
                                        <div className="small fw-bold text-muted fw-lighter lh-1" style={{ fontSize: '0.75rem', marginBottom: '0' }}>{q} <span style={{ color: '#E0E0E0' }}>84%</span></div>
                                        <div className="fw-bold lh-1 border-bottom border-secondary d-inline-block" style={{ fontSize: '0.75rem', borderColor: 'rgba(255,255,255,0.1) !important', color: '#E0E0E0', marginBottom: '0' }}>145.7k</div>
                                        <div className="fw-bold lh-1" style={{ fontSize: '0.75rem', color: '#3B82F6' }}>123.5k</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 2. Win-Loss Ratio */}
                        <div className="card shadow-sm border-0 p-2 position-relative pt-2" style={{ flex: '1', minHeight: 0, overflow: 'hidden' }}>
                            <div className="position-absolute start-0 top-0 mt-1 ms-2 fw-bold small" style={{ color: '#34D399', fontSize: '0.7rem' }}>Win-Loss Ratio</div>
                            <div className="h-100 d-flex align-items-center pt-1">
                                <div className="d-flex flex-column justify-content-center text-center border-end border-secondary pe-3 me-3" style={{ width: '40%', borderColor: 'rgba(255,255,255,0.1) !important' }}>
                                    <div className="section mb-2">
                                        <div className="text-muted fw-bold mb-0" style={{ fontSize: '0.6rem', textTransform: 'uppercase' }}>Winning Rate</div>
                                        <div className="fw-bold fs-3 lh-1" style={{ color: '#E0E0E0' }}>25%</div>
                                    </div>
                                    <div className="section">
                                        <div className="text-muted fw-bold mb-0" style={{ fontSize: '0.6rem', textTransform: 'uppercase' }}>Losing Rate</div>
                                        <div className="fw-bold fs-3 lh-1" style={{ color: '#3B82F6' }}>84%</div>
                                    </div>
                                </div>
                                <div className="flex-grow-1 d-flex flex-column justify-content-center gap-0">
                                    <div className="d-flex justify-content-between align-items-end">
                                        <span className="fw-bold fs-6 text-nowrap" style={{ color: '#E0E0E0' }}>Quoted</span>
                                        <span className="fw-bold border-bottom border-secondary" style={{ borderColor: 'rgba(255,255,255,0.1) !important', width: '60%', textAlign: 'right', color: '#E0E0E0', fontSize: '0.9rem' }}>145.7k</span>
                                    </div>
                                    <div className="d-flex justify-content-between align-items-end">
                                        <span className="fw-bold fs-6 text-nowrap" style={{ color: '#3B82F6' }}>Won</span>
                                        <span className="fw-bold border-bottom border-secondary" style={{ borderColor: 'rgba(255,255,255,0.1) !important', width: '60%', textAlign: 'right', color: '#3B82F6', fontSize: '0.9rem' }}>123.5k</span>
                                    </div>
                                    <div className="d-flex justify-content-between align-items-end">
                                        <span className="fw-bold fs-6 text-nowrap" style={{ color: '#EF4444' }}>Lost</span>
                                        <span className="fw-bold border-bottom border-secondary" style={{ borderColor: 'rgba(255,255,255,0.1) !important', width: '60%', textAlign: 'right', color: '#EF4444', fontSize: '0.9rem' }}>524.7k</span>
                                    </div>
                                    <div className="d-flex justify-content-between align-items-end">
                                        <span className="fw-bold fs-6 text-nowrap" style={{ color: '#3B82F6' }}>Follow Up</span>
                                        <span className="fw-bold" style={{ color: '#3B82F6', width: '60%', textAlign: 'right', fontSize: '0.9rem' }}>345.1k</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Row 2: Target Actual & Prospect */}
                    <div className="d-flex w-100" style={{ flex: '32', minHeight: 0, gap: '0.75rem' }}>
                        {/* 1. Target Vs Actual */}
                        <div className="card shadow-sm border-0 p-2 position-relative" style={{ flex: '1', minHeight: 0 }}>
                            <div className="position-absolute start-0 top-0 mt-2 ms-2 fw-bold small" style={{ color: '#34D399' }}>Target Vs Actual</div>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={targetVsActualData} margin={{ top: 25, right: 5, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                    <YAxis tickFormatter={formatNumber} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                                    <Tooltip
                                        formatter={(value) => formatNumber(value)}
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#E0E0E0', fontSize: '10px', borderRadius: '4px' }}
                                        itemStyle={{ color: '#E0E0E0' }}
                                    />
                                    <Bar dataKey="target" stackId="a" fill="url(#gradTarget)" radius={[0, 0, 0, 0]} barSize={20}>
                                        <LabelList dataKey="target" position="top" formatter={formatBarLabel} style={{ fill: '#E0E0E0', fontSize: '9px' }} />
                                    </Bar>
                                    <Bar dataKey="actual" stackId="b" fill="url(#gradActual)" radius={[2, 2, 0, 0]} barSize={20}>
                                        <LabelList dataKey="actual" position="top" formatter={formatBarLabel} style={{ fill: '#E0E0E0', fontSize: '9px' }} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* 2. Prospect Pie */}
                        <div className="card shadow-sm border-0 p-1 position-relative" style={{ flex: '1', minHeight: 0 }}>
                            <div className="position-absolute fw-bold small" style={{ top: 5, left: 10, color: '#34D399' }}>Prospect</div>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={prospectPieData}
                                        innerRadius={0}
                                        outerRadius="65%"
                                        paddingAngle={0}
                                        dataKey="value"
                                        label={({ x, y, name, value, textAnchor }) => (
                                            <text x={x} y={y} fill="#E0E0E0" textAnchor={textAnchor} dominantBaseline="central" style={{ fontSize: '0.65rem' }}>
                                                {`${name} ${value}%`}
                                            </text>
                                        )}
                                    >
                                        {prospectPieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#E0E0E0', fontSize: '10px', borderRadius: '4px' }}
                                        itemStyle={{ color: '#E0E0E0' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Row 3: Merged Category & Breakdown */}
                    <div className="card shadow-sm border-0 p-2" style={{ flex: '43', minHeight: 0, overflow: 'hidden' }}>
                        <div className="d-flex h-100 gap-2">
                            {/* Left Half: Category Bar */}
                            <div className="d-flex flex-column h-100" style={{ flex: 1 }}>
                                <div className="d-flex gap-2 mb-1 justify-content-end">
                                    <select className="form-select form-select-sm py-0 bg-transparent border-0 fw-bold" style={{ width: 100, fontSize: '0.75rem', color: '#E0E0E0' }} value={category} onChange={(e) => setCategory(e.target.value)}>
                                        <option value="Customer" style={{ color: '#000' }}>Customer</option>
                                    </select>
                                    <select className="form-select form-select-sm py-0 bg-transparent border-0 fw-bold" style={{ width: 120, fontSize: '0.75rem', color: '#E0E0E0' }} value={selection} onChange={(e) => setSelection(e.target.value)}>
                                        <option value="Customer - 1" style={{ color: '#000' }}>Customer - 1</option>
                                    </select>
                                    <select className="form-select form-select-sm py-0 bg-transparent border-0 fw-bold" style={{ width: 80, fontSize: '0.75rem', color: '#E0E0E0' }} value={itemName} onChange={(e) => setItemName(e.target.value)}>
                                        <option value="All" style={{ color: '#000' }}>All Item</option>
                                    </select>
                                </div>
                                <div className="flex-grow-1" style={{ width: '100%', minHeight: 0 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={categoryBarData} margin={{ top: 10, right: 5, left: -15, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                                            <XAxis dataKey="name" angle={-45} textAnchor="end" height={40} interval={0} tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                            <YAxis tickFormatter={formatNumber} tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                            <Tooltip
                                                formatter={(value) => formatNumber(value)}
                                                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#E0E0E0', fontSize: '10px', borderRadius: '4px' }}
                                                itemStyle={{ color: '#E0E0E0' }}
                                            />
                                            <Bar dataKey="value" fill="url(#gradBar)" radius={[2, 2, 0, 0]} barSize={25}>
                                                <LabelList dataKey="value" position="top" formatter={formatBarLabel} style={{ fill: '#E0E0E0', fontSize: '9px' }} />
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Divider line */}
                            <div style={{ width: 1, backgroundColor: '#334155', opacity: 0.5, margin: '0 0.5rem' }}></div>

                            {/* Right Half: Breakdown Pie */}
                            <div className="position-relative h-100" style={{ flex: 1 }}>
                                <div className="position-absolute fw-bold small" style={{ top: 0, left: 10, color: '#34D399' }}>Category Breakdown</div>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={breakdownPieData}
                                            innerRadius={0}
                                            outerRadius="65%"
                                            paddingAngle={0}
                                            dataKey="value"
                                            label={({ x, y, name, value, textAnchor }) => (
                                                <text x={x} y={y} fill="#E0E0E0" textAnchor={textAnchor} dominantBaseline="central" style={{ fontSize: '0.65rem' }}>
                                                    {`${name} ${value}%`}
                                                </text>
                                            )}
                                        >
                                            {breakdownPieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#E0E0E0', fontSize: '10px', borderRadius: '4px' }}
                                            itemStyle={{ color: '#E0E0E0' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Column 3: Customers, Clients */}
                <div className="d-flex flex-column" style={{ flex: '0 0 25%', maxWidth: '25%', gap: '0.75rem' }}>

                    {/* 1. Top 10 Customers */}
                    <div className="card shadow-sm border-0 p-2" style={{ flex: '1' }}>
                        <h6 className="fw-bold small mb-0 ms-2 text-start" style={{ color: '#34D399' }}>Top 10 Customer's job booked</h6>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topCustomersData} margin={{ top: 25, right: 5, left: -15, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                                <XAxis dataKey="name" angle={-45} textAnchor="end" height={40} interval={0} tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tickFormatter={formatNumber} tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    formatter={(value) => formatNumber(value)}
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#E0E0E0', fontSize: '10px', borderRadius: '4px' }}
                                    itemStyle={{ color: '#E0E0E0' }}
                                />
                                <Bar dataKey="value" fill="url(#gradBar)" radius={[2, 2, 0, 0]}>
                                    <LabelList dataKey="value" position="top" formatter={formatBarLabel} style={{ fill: '#E0E0E0', fontSize: '9px' }} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* 2. Top 10 Clients */}
                    <div className="card shadow-sm border-0 p-2" style={{ flex: '1' }}>
                        <h6 className="fw-bold small mb-0 ms-2 text-start" style={{ color: '#34D399' }}>Top 10 Client's Job booked</h6>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topClientsData} margin={{ top: 25, right: 5, left: -15, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                                <XAxis dataKey="name" angle={-45} textAnchor="end" height={40} interval={0} tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tickFormatter={formatNumber} tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    formatter={(value) => formatNumber(value)}
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#E0E0E0', fontSize: '10px', borderRadius: '4px' }}
                                    itemStyle={{ color: '#E0E0E0' }}
                                />
                                <Bar dataKey="value" fill="url(#gradBar)" radius={[2, 2, 0, 0]}>
                                    <LabelList dataKey="value" position="top" formatter={formatBarLabel} style={{ fill: '#E0E0E0', fontSize: '9px' }} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Column 4: Top 10 Projects, Funnel */}
                <div className="d-flex flex-column" style={{ flex: '0 0 25%', maxWidth: '25%', gap: '0.75rem' }}>

                    {/* 1. Top 10 Projects */}
                    <div className="card shadow-sm border-0 p-2" style={{ flex: '1' }}>
                        <h6 className="fw-bold small mb-0 ms-2 text-start" style={{ color: '#34D399' }}>Top 10 Projects' Job booked</h6>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topProjectsData} margin={{ top: 25, right: 5, left: -15, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                                <XAxis dataKey="name" angle={-45} textAnchor="end" height={40} interval={0} tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tickFormatter={formatNumber} tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    formatter={(value) => formatNumber(value)}
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#E0E0E0', fontSize: '10px', borderRadius: '4px' }}
                                    itemStyle={{ color: '#E0E0E0' }}
                                />
                                <Bar dataKey="value" fill="url(#gradBar)" radius={[2, 2, 0, 0]}>
                                    <LabelList dataKey="value" position="top" formatter={formatBarLabel} style={{ fill: '#E0E0E0', fontSize: '9px' }} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* 2. Funnel */}
                    <div
                        className="card shadow-sm border-0 p-3 h-100 d-flex flex-column"
                        style={{
                            flex: '1',
                            borderRadius: '12px',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                    >
                        <h6 className="fw-bold small mb-2 text-start" style={{ color: '#34D399' }}>Sales Pipeline</h6>
                        <div className="flex-grow-1" style={{ width: '100%', minHeight: 0 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <FunnelChart>
                                    <Tooltip
                                        itemStyle={{ color: '#E0E0E0' }}
                                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#E0E0E0', fontSize: '10px', borderRadius: '4px' }}
                                    />
                                    <Funnel
                                        data={funnelData}
                                        dataKey="value"
                                        isAnimationActive
                                        width="100%"
                                        bottomWidth="0"
                                        gap={0}
                                        stroke="#FFFFFF"
                                        strokeWidth={1}
                                    >
                                        {
                                            funnelData && funnelData.map((entry, index) => {
                                                const colors = ['#93C5FD', '#60A5FA', '#3B82F6', '#1D4ED8', '#1E3A8A'];
                                                return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                                            })
                                        }
                                        <LabelList position="center" fill="#FFFFFF" stroke="none" dataKey="value" formatter={formatNumber} style={{ fontSize: '0.9rem', fontWeight: 'bold', pointerEvents: 'none' }} />
                                    </Funnel>
                                </FunnelChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

            </div>
        </div >
    );
};

export default SalesReport;
