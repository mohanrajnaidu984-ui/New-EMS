import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import './SalesTarget.css';

// ── Formatted Revenue Input (shows ###,###,### when not focused) ──
const RevenueInput = ({ value, onChange, placeholder = '0', style = {} }) => {
    const [isFocused, setIsFocused] = useState(false);
    const [localRaw, setLocalRaw] = useState('');
    const inputRef = useRef();

    // Format number with commas: 1000000 → '1,000,000'
    const formatWithCommas = (val) => {
        const num = parseFloat(String(val).replace(/,/g, ''));
        if (isNaN(num) || val === '' || val === null || val === undefined) return '';
        return Math.round(num).toLocaleString('en-US');
    };

    const handleFocus = () => {
        // Show raw numeric when editing
        setLocalRaw(value !== '' && value !== null && value !== undefined ? String(value) : '');
        setIsFocused(true);
    };

    const handleBlur = () => {
        setIsFocused(false);
        // Strip commas and parse, then propagate
        const stripped = String(localRaw).replace(/,/g, '');
        const num = parseFloat(stripped);
        onChange(isNaN(num) ? '' : num);
    };

    const handleChange = (e) => {
        // Allow digits, commas, decimals while typing
        const raw = e.target.value.replace(/[^0-9.,]/g, '');
        setLocalRaw(raw);
    };

    const displayValue = isFocused ? localRaw : formatWithCommas(value);

    return (
        <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            className="form-control form-control-sm bg-transparent text-white border-secondary text-center"
            style={{ fontSize: '13px', letterSpacing: '0.3px', ...style }}
            value={displayValue}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChange={handleChange}
            placeholder={placeholder}
        />
    );
};

const SalesTarget = () => {
    const { currentUser } = useAuth();
    const [loading, setLoading] = useState(true);
    const [isManager, setIsManager] = useState(false);
    const [managedDivisions, setManagedDivisions] = useState([]);

    // Filters
    const [selectedYear, setSelectedYear] = useState('2026');
    const [selectedDivision, setSelectedDivision] = useState('');
    const [selectedEngineer, setSelectedEngineer] = useState('');

    // Lists
    const [engineers, setEngineers] = useState([]);
    const [items, setItems] = useState([]); // List of item names

    // Data Grid:
    // { [itemName]: { Q1: 0, Q2: 0, Q3: 0, Q4: 0, Q1_GP: 0, Q2_GP: 0, Q3_GP: 0, Q4_GP: 0 } }
    // Q*_GP stores the GP% (0-100); the BD amount is calculated as Revenue × (GP%/100)
    const [targetData, setTargetData] = useState({});

    // 1. Check Access
    useEffect(() => {
        const email = currentUser?.EmailId || currentUser?.email;

        if (email) {
            setLoading(true);
            fetch(`http://localhost:5001/api/sales-targets/manager-access?email=${encodeURIComponent(email)}`)
                .then(res => res.json())
                .then(data => {
                    setIsManager(data.isManager);
                    setManagedDivisions(data.divisions || []);
                    if (data.divisions && data.divisions.length > 0) {
                        setSelectedDivision(data.divisions[0]);
                    }
                    setLoading(false);
                })
                .catch(err => {
                    setLoading(false);
                });
        } else {
            if (currentUser) setLoading(false);
        }
    }, [currentUser]);

    // 2. Load Engineers & Items when Division Changes
    useEffect(() => {
        if (selectedDivision) {
            // Load Engineers
            fetch(`http://localhost:5001/api/sales-targets/engineers?division=${encodeURIComponent(selectedDivision)}`)
                .then(res => res.json())
                .then(data => setEngineers(data))
                .catch(err => console.error(err));

            // Load Items
            fetch(`http://localhost:5001/api/sales-targets/items?division=${encodeURIComponent(selectedDivision)}`)
                .then(res => res.json())
                .then(data => {
                    const itemList = data.map(i => i.ItemName);
                    setItems(itemList);
                })
                .catch(err => console.error(err));
        }
    }, [selectedDivision]);

    // 3. Load Existing Targets when Filters Ready
    useEffect(() => {
        if (selectedYear && selectedDivision && selectedEngineer) {
            fetch(`http://localhost:5001/api/sales-targets/targets?year=${selectedYear}&division=${encodeURIComponent(selectedDivision)}&engineer=${encodeURIComponent(selectedEngineer)}`)
                .then(res => res.json())
                .then(data => {
                    const newMap = {};
                    data.forEach(row => {
                        if (!newMap[row.ItemName]) {
                            newMap[row.ItemName] = { Q1: '', Q2: '', Q3: '', Q4: '', Q1_GP: '', Q2_GP: '', Q3_GP: '', Q4_GP: '' };
                        }
                        newMap[row.ItemName][row.Quarter] = row.TargetValue;
                        newMap[row.ItemName][`${row.Quarter}_GP`] = row.GrossProfitTarget ?? '';
                    });
                    setTargetData(newMap);
                })
                .catch(err => console.error(err));
        } else {
            setTargetData({});
        }
    }, [selectedYear, selectedDivision, selectedEngineer]);

    const handleInputChange = (item, field, value) => {
        setTargetData(prev => ({
            ...prev,
            [item]: {
                ...prev[item],
                [field]: value
            }
        }));
    };

    const handleSave = async () => {
        if (!selectedEngineer) return alert("Please select a Sales Engineer");

        const finalPayload = items.map(itemName => ({
            itemName,
            Q1: targetData[itemName]?.Q1 || 0,
            Q2: targetData[itemName]?.Q2 || 0,
            Q3: targetData[itemName]?.Q3 || 0,
            Q4: targetData[itemName]?.Q4 || 0,
            Q1_GP: targetData[itemName]?.Q1_GP || 0,
            Q2_GP: targetData[itemName]?.Q2_GP || 0,
            Q3_GP: targetData[itemName]?.Q3_GP || 0,
            Q4_GP: targetData[itemName]?.Q4_GP || 0,
        }));

        try {
            const res = await fetch('http://localhost:5001/api/sales-targets/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    year: selectedYear,
                    division: selectedDivision,
                    engineer: selectedEngineer,
                    userEmail: currentUser?.EmailId || currentUser?.email,
                    targets: finalPayload
                })
            });
            if (res.ok) {
                alert("Targets saved successfully!");
            } else {
                alert("Failed to save targets.");
            }
        } catch (err) {
            console.error(err);
            alert("Error saving targets.");
        }
    };

    if (loading) return <div className="p-4 text-white">Loading...</div>;

    if (!isManager) {
        return (
            <div className="d-flex justify-content-center align-items-center h-100 text-white">
                <div className="text-center">
                    <i className="bi bi-lock-fill fs-1 text-secondary mb-3"></i>
                    <h3>Access Restricted</h3>
                    <p className="text-muted">You do not have permission to access Sales Target Settings.</p>
                </div>
            </div>
        );
    }

    // Calculate Grand Totals
    let grandTotalRevenue = 0;
    let grandTotalGPAmount = 0;

    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];

    // Helper to format number with commas
    const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

    // Inline styles for the two sub-rows
    const revenueRowStyle = {
        borderBottom: '1px dashed #334155',
    };
    const gpRowStyle = {
        borderBottom: '1px solid #1e3a5f',
        backgroundColor: 'rgba(16, 185, 129, 0.05)',
    };

    const labelCellStyle = {
        fontSize: '10px',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        paddingTop: '4px',
        paddingBottom: '4px',
        paddingLeft: '8px',
        color: '#94a3b8',
        whiteSpace: 'nowrap',
    };

    const gpLabelStyle = {
        ...labelCellStyle,
        color: '#34d399',
    };

    return (
        <div className="container-fluid p-4 sales-target-container" style={{ backgroundColor: '#0f172a', minHeight: 'calc(100vh - 100px)', color: '#e0e0e0' }}>
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h4 className="fw-bold text-white mb-0">
                    <i className="bi bi-bullseye me-2 text-primary"></i>
                    Sales Target Settings
                </h4>
                <button className="btn btn-primary" onClick={handleSave}>
                    <i className="bi bi-save me-2"></i> Save Changes
                </button>
            </div>

            {/* Filters */}
            <div className="card border-0 mb-4 shadow-sm" style={{ backgroundColor: '#1e293b' }}>
                <div className="card-body d-flex gap-3 align-items-end">
                    <div className="form-group">
                        <label className="small text-muted mb-1">Financial Year</label>
                        <select className="form-select bg-dark text-white border-secondary" value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                            {['2025', '2026', '2027'].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div className="form-group" style={{ minWidth: '200px' }}>
                        <label className="small text-muted mb-1">Division</label>
                        <select className="form-select bg-dark text-white border-secondary" value={selectedDivision} onChange={e => setSelectedDivision(e.target.value)}>
                            {managedDivisions.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                    <div className="form-group" style={{ minWidth: '250px' }}>
                        <label className="small text-muted mb-1">Sales Engineer</label>
                        <select className="form-select bg-dark text-white border-secondary" value={selectedEngineer} onChange={e => setSelectedEngineer(e.target.value)}>
                            <option value="">-- Select Engineer --</option>
                            {engineers.map(e => <option key={e.EmailId} value={e.FullName}>{e.FullName}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Legend */}
            {selectedEngineer && (
                <div className="d-flex gap-4 mb-3" style={{ fontSize: '12px' }}>
                    <span style={{ color: '#94a3b8' }}>
                        <span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#334155', borderRadius: '2px', marginRight: '6px' }}></span>
                        Revenue Target (BD)
                    </span>
                    <span style={{ color: '#34d399' }}>
                        <span style={{ display: 'inline-block', width: '10px', height: '10px', background: 'rgba(16, 185, 129, 0.3)', borderRadius: '2px', marginRight: '6px' }}></span>
                        Gross Profit Target (% of Revenue)
                    </span>
                </div>
            )}

            {/* Grid */}
            {selectedEngineer ? (
                <div className="table-responsive rounded shadow-sm">
                    <table className="table table-dark mb-0 align-middle" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                        <thead>
                            <tr style={{ background: 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%)' }}>
                                <th className="text-start ps-4" style={{ width: '28%', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', color: '#93c5fd', padding: '14px 16px' }}>
                                    Item Name
                                </th>
                                {quarters.map(q => (
                                    <th key={q} className="text-center" style={{ fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', color: '#93c5fd', padding: '14px 16px' }}>
                                        {q} — Target
                                    </th>
                                ))}
                                <th className="text-center fw-bold" style={{ fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', color: '#34d399', padding: '14px 16px' }}>
                                    Total
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.length > 0 ? items.map(item => {
                                const row = targetData[item] || {};
                                const q1 = parseFloat(row.Q1) || 0;
                                const q2 = parseFloat(row.Q2) || 0;
                                const q3 = parseFloat(row.Q3) || 0;
                                const q4 = parseFloat(row.Q4) || 0;
                                const totalRev = q1 + q2 + q3 + q4;

                                // GP% per quarter → calculate BD amount
                                const gp1pct = parseFloat(row.Q1_GP) || 0;
                                const gp2pct = parseFloat(row.Q2_GP) || 0;
                                const gp3pct = parseFloat(row.Q3_GP) || 0;
                                const gp4pct = parseFloat(row.Q4_GP) || 0;

                                const gp1amt = q1 * (gp1pct / 100);
                                const gp2amt = q2 * (gp2pct / 100);
                                const gp3amt = q3 * (gp3pct / 100);
                                const gp4amt = q4 * (gp4pct / 100);
                                const totalGPAmt = gp1amt + gp2amt + gp3amt + gp4amt;
                                const avgGPPct = totalRev > 0 ? (totalGPAmt / totalRev) * 100 : 0;

                                grandTotalRevenue += totalRev;
                                grandTotalGPAmount += totalGPAmt;

                                const qRevs = [q1, q2, q3, q4];
                                const qGPPcts = [gp1pct, gp2pct, gp3pct, gp4pct];
                                const qGPAmts = [gp1amt, gp2amt, gp3amt, gp4amt];

                                return (
                                    <React.Fragment key={item}>
                                        {/* Row 1: Item name + Revenue inputs */}
                                        <tr style={revenueRowStyle}>
                                            <td
                                                className="text-start ps-4 text-nowrap"
                                                rowSpan={2}
                                                style={{
                                                    fontWeight: '600',
                                                    fontSize: '13px',
                                                    color: '#e2e8f0',
                                                    verticalAlign: 'middle',
                                                    borderRight: '1px solid #334155',
                                                    borderBottom: '1px solid #1e3a5f',
                                                }}
                                            >
                                                {item}
                                            </td>
                                            {quarters.map((q, qi) => (
                                                <td key={q} style={{ padding: '6px 8px' }}>
                                                    <div style={labelCellStyle}>Revenue (BD)</div>
                                                    <RevenueInput
                                                        value={row[q] ?? ''}
                                                        onChange={(val) => handleInputChange(item, q, val)}
                                                        placeholder="0"
                                                    />
                                                </td>
                                            ))}
                                            <td className="text-center fw-bold" style={{ color: '#60a5fa', fontSize: '13px', borderLeft: '1px solid #334155' }}>
                                                <div style={{ ...labelCellStyle, color: '#60a5fa' }}>Revenue</div>
                                                {fmt(totalRev)}
                                            </td>
                                        </tr>

                                        {/* Row 2: GP % inputs + calculated BD amounts */}
                                        <tr style={gpRowStyle}>
                                            {quarters.map((q, qi) => (
                                                <td key={q} style={{ padding: '6px 8px' }}>
                                                    <div style={gpLabelStyle}>GP %</div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            step="0.1"
                                                            className="form-control form-control-sm text-center"
                                                            style={{
                                                                fontSize: '13px',
                                                                background: 'rgba(16, 185, 129, 0.08)',
                                                                border: '1px solid rgba(52, 211, 153, 0.35)',
                                                                color: '#34d399',
                                                                width: '70px',
                                                                flexShrink: 0,
                                                            }}
                                                            value={row[`${q}_GP`] ?? ''}
                                                            onChange={(e) => handleInputChange(item, `${q}_GP`, e.target.value)}
                                                            placeholder="%"
                                                        />
                                                        <span style={{ color: '#34d399', fontWeight: '700', fontSize: '13px' }}>%</span>
                                                        {qGPAmts[qi] > 0 && (
                                                            <span style={{
                                                                fontSize: '11px',
                                                                color: '#6ee7b7',
                                                                background: 'rgba(16, 185, 129, 0.15)',
                                                                border: '1px solid rgba(52, 211, 153, 0.2)',
                                                                borderRadius: '4px',
                                                                padding: '1px 6px',
                                                                whiteSpace: 'nowrap',
                                                            }}>
                                                                BD {fmt(qGPAmts[qi])}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            ))}
                                            <td className="text-center fw-bold" style={{ color: '#34d399', fontSize: '13px', borderLeft: '1px solid #334155' }}>
                                                <div style={gpLabelStyle}>GP ({avgGPPct.toFixed(1)}%)</div>
                                                {fmt(totalGPAmt)}
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                );
                            }) : (
                                <tr>
                                    <td colSpan="6" className="text-muted py-5 text-center">
                                        No items found for this division.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot style={{ backgroundColor: '#0f172a', borderTop: '2px solid #1e40af' }}>
                            <tr>
                                <th className="text-start ps-4" style={{ color: '#e2e8f0', padding: '14px 16px', fontSize: '13px' }}>Grand Total</th>
                                <th colSpan="4" style={{ padding: '14px 16px' }}></th>
                                <th className="text-center" style={{ padding: '14px 16px' }}>
                                    <div style={{ color: '#60a5fa', fontSize: '12px', fontWeight: '700' }}>
                                        Revenue: {fmt(grandTotalRevenue)}
                                    </div>
                                    <div style={{ color: '#34d399', fontSize: '12px', fontWeight: '700', marginTop: '4px' }}>
                                        GP ({grandTotalRevenue > 0 ? ((grandTotalGPAmount / grandTotalRevenue) * 100).toFixed(1) : '0.0'}%): {fmt(grandTotalGPAmount)}
                                    </div>
                                </th>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            ) : (
                <div className="text-center text-muted py-5 border border-secondary border-dashed rounded bg-dark">
                    <i className="bi bi-people fs-1 d-block mb-3 opacity-50"></i>
                    Please select a Sales Engineer to view and set targets.
                </div>
            )
            }
        </div >
    );
};

export default SalesTarget;
