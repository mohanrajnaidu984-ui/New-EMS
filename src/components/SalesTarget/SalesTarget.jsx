import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import './SalesTarget.css'; // Will create this next

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

    // Data Grid: { [itemName]: { Q1: 0, Q2: 0, Q3: 0, Q4: 0 } }
    const [targetData, setTargetData] = useState({});

    // 1. Check Access
    useEffect(() => {
        const email = currentUser?.EmailId || currentUser?.email;
        console.log("SalesTarget: Checking access for:", email, currentUser);

        if (email) {
            setLoading(true);
            fetch(`http://localhost:5001/api/sales-targets/manager-access?email=${encodeURIComponent(email)}`)
                .then(res => res.json())
                .then(data => {
                    console.log("SalesTarget: Access data:", data);
                    setIsManager(data.isManager);
                    setManagedDivisions(data.divisions || []);
                    if (data.divisions && data.divisions.length > 0) {
                        setSelectedDivision(data.divisions[0]);
                    }
                    setLoading(false);
                })
                .catch(err => {
                    console.error("Access check failed", err);
                    setLoading(false);
                });
        } else {
            console.warn("SalesTarget: No email found for user");
            // If we have a user but no email, stop loading so they see Access Restricted or similar? 
            // Or if no user at all? Main.jsx handles auth usually.
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
                    // Initialize empty grid if needed, but handled in render
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
                    // Start fresh
                    const newMap = {};

                    data.forEach(row => {
                        if (!newMap[row.ItemName]) newMap[row.ItemName] = { Q1: '', Q2: '', Q3: '', Q4: '' };
                        newMap[row.ItemName][row.Quarter] = row.TargetValue;
                    });
                    setTargetData(newMap);
                })
                .catch(err => console.error(err));
        } else {
            setTargetData({});
        }
    }, [selectedYear, selectedDivision, selectedEngineer]);

    const handleInputChange = (item, quarter, value) => {
        setTargetData(prev => ({
            ...prev,
            [item]: {
                ...prev[item],
                [quarter]: value
            }
        }));
    };

    const handleSave = async () => {
        if (!selectedEngineer) return alert("Please select a Sales Engineer");

        // Transform data map to array
        const targetsToSave = Object.keys(targetData).map(itemName => ({
            itemName,
            ...targetData[itemName]
        }));
        // Also include items that might have been typed into but verify against 'items' list? 
        // Actually, we iterate over the 'items' list to show rows.
        // We should verify we capture everything.
        // Better: Iterate 'items' state and grab from 'targetData'

        const finalPayload = items.map(itemName => ({
            itemName,
            Q1: targetData[itemName]?.Q1 || 0,
            Q2: targetData[itemName]?.Q2 || 0,
            Q3: targetData[itemName]?.Q3 || 0,
            Q4: targetData[itemName]?.Q4 || 0,
        }));

        try {
            const res = await fetch('http://localhost:5001/api/sales-targets/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    year: selectedYear,
                    division: selectedDivision,
                    engineer: selectedEngineer,
                    userEmail: currentUser.EmailId,
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

    // Calculate Grand Total
    let grandTotal = 0;

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

            {/* Grid */}
            {selectedEngineer ? (
                <div className="table-responsive rounded shadow-sm">
                    <table className="table table-dark table-hover mb-0 align-middle text-center">
                        <thead className="bg-primary text-white">
                            <tr>
                                <th className="text-start ps-4" style={{ width: '30%' }}>Item Name</th>
                                <th>Q1 (Target)</th>
                                <th>Q2 (Target)</th>
                                <th>Q3 (Target)</th>
                                <th>Q4 (Target)</th>
                                <th className="fw-bold text-success">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.length > 0 ? items.map(item => {
                                const row = targetData[item] || {};
                                const q1 = parseFloat(row.Q1) || 0;
                                const q2 = parseFloat(row.Q2) || 0;
                                const q3 = parseFloat(row.Q3) || 0;
                                const q4 = parseFloat(row.Q4) || 0;
                                const total = q1 + q2 + q3 + q4;
                                grandTotal += total;

                                return (
                                    <tr key={item}>
                                        <td className="text-start ps-4 text-nowrap">{item}</td>
                                        <td>
                                            <input
                                                type="number"
                                                className="form-control form-control-sm bg-transparent text-white border-secondary text-center"
                                                value={row.Q1 || ''}
                                                onChange={(e) => handleInputChange(item, 'Q1', e.target.value)}
                                                placeholder="0"
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                className="form-control form-control-sm bg-transparent text-white border-secondary text-center"
                                                value={row.Q2 || ''}
                                                onChange={(e) => handleInputChange(item, 'Q2', e.target.value)}
                                                placeholder="0"
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                className="form-control form-control-sm bg-transparent text-white border-secondary text-center"
                                                value={row.Q3 || ''}
                                                onChange={(e) => handleInputChange(item, 'Q3', e.target.value)}
                                                placeholder="0"
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                className="form-control form-control-sm bg-transparent text-white border-secondary text-center"
                                                value={row.Q4 || ''}
                                                onChange={(e) => handleInputChange(item, 'Q4', e.target.value)}
                                                placeholder="0"
                                            />
                                        </td>
                                        <td className="fw-bold text-success">{total.toLocaleString()}</td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan="6" className="text-muted py-5">
                                        No items items found for this division.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot style={{ backgroundColor: '#1e293b' }}>
                            <tr>
                                <th className="text-start ps-4">Grand Total</th>
                                <th colSpan="4"></th>
                                <th className="fw-bold text-success fs-5">{grandTotal.toLocaleString()}</th>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            ) : (
                <div className="text-center text-muted py-5 border border-secondary border-dashed rounded bg-dark">
                    <i className="bi bi-people fs-1 d-block mb-3 opacity-50"></i>
                    Please select a Sales Engineer to view and set targets.
                </div>
            )}
        </div>
    );
};

export default SalesTarget;
