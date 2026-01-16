import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Save, BarChart2, TrendingUp, Target, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const API_BASE = 'http://localhost:5000';

const SalesTarget = () => {
    const { currentUser } = useAuth();
    const isAdmin = currentUser?.Roles === 'Admin' || currentUser?.role === 'Admin';

    // State
    const [activeTab, setActiveTab] = useState(isAdmin ? 'manage' : 'my_performance'); // 'manage' | 'my_performance'
    const [selectedUser, setSelectedUser] = useState(currentUser?.name || '');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    // Manage Targets State
    const [targets, setTargets] = useState({
        q1: 0, q2: 0, q3: 0, q4: 0
    });

    // Performance Data State (Mocked for now)
    const [performanceData, setPerformanceData] = useState(null);
    const [usersList, setUsersList] = useState([]); // For Admin Dropdown

    // Mock Data Loading
    useEffect(() => {
        // Mock Users List
        setUsersList([
            { id: 1, name: 'vignesh' },
            { id: 2, name: 'jane_doe' },
            { id: 3, name: 'john_smith' }
        ]);

        // Mock Fetch Targets for selected user/year
        // In real app: fetch(`${API_BASE}/api/sales-targets/${selectedUser}/${selectedYear}`)
        setTargets({
            q1: 50000,
            q2: 60000,
            q3: 75000,
            q4: 80000
        });

        // Mock Performance Data
        // Actuals calculated from Probability "Won" jobs
        setPerformanceData({
            year: selectedYear,
            user: selectedUser,
            quarters: [
                { name: 'Q1', target: 50000, actual: 45000, variance: -5000 },
                { name: 'Q2', target: 60000, actual: 62000, variance: 2000 },
                { name: 'Q3', target: 75000, actual: 12000, variance: -63000 }, // In progress
                { name: 'Q4', target: 80000, actual: 0, variance: -80000 }
            ],
            totalTarget: 265000,
            totalActual: 119000
        });

    }, [selectedUser, selectedYear]);

    const handleTargetChange = (quarter, value) => {
        setTargets(prev => ({ ...prev, [quarter]: parseFloat(value) || 0 }));
    };

    const saveTargets = () => {
        console.log("Saving Targets:", { user: selectedUser, year: selectedYear, ...targets });
        alert("Targets saved successfully!");
    };

    // Calculate Progress Percentage
    const calculateProgress = (actual, target) => {
        if (!target || target === 0) return 0;
        return Math.min(Math.round((actual / target) * 100), 100);
        return Math.min(Math.round((actual / target) * 100), 100);
    };

    const RenderLegend = () => (
        <div className="d-flex justify-content-center gap-4 mt-2">
            <div className="d-flex align-items-center">
                <div style={{ width: 10, height: 10, backgroundColor: '#ff6b81', marginRight: 6 }}></div>
                <span className="small text-muted">Target</span>
            </div>
            <div className="d-flex align-items-center">
                <div style={{ width: 10, height: 10, backgroundColor: '#2ecc71', marginRight: 6 }}></div>
                <span className="small text-muted">Actual Achieved</span>
            </div>
        </div>
    );

    return (
        <div className="container-fluid pt-4 pb-4" style={{ backgroundColor: '#f8fafc', minHeight: '100vh' }}>
            <div className="row justify-content-center">
                <div className="col-12" style={{ flex: '0 0 80%', maxWidth: '80%' }}>

                    {/* Header & Tabs */}
                    <div className="card border-0 shadow-sm mb-4" style={{ borderRadius: '12px' }}>
                        <div className="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center" style={{ borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}>
                            <div className="d-flex align-items-center gap-2">
                                <Target className="text-primary" size={24} />
                                <h5 className="mb-0 text-primary fw-bold">Sales Targets & Performance</h5>
                            </div>

                            {isAdmin && (
                                <div className="btn-group">
                                    <button
                                        className={`btn ${activeTab === 'manage' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => setActiveTab('manage')}
                                    >
                                        <Users size={16} className="me-2" /> Manage Targets
                                    </button>
                                    <button
                                        className={`btn ${activeTab === 'my_performance' ? 'btn-primary' : 'btn-outline-primary'}`}
                                        onClick={() => {
                                            setActiveTab('my_performance');
                                            setSelectedUser(currentUser?.name); // Reset to self
                                        }}
                                    >
                                        <BarChart2 size={16} className="me-2" /> My Performance
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Manage Targets View */}
                    {activeTab === 'manage' && isAdmin && (
                        <div className="card border-0 shadow-sm" style={{ borderRadius: '12px' }}>
                            <div className="card-body p-4">
                                <h6 className="card-title fw-bold mb-4 border-bottom pb-2">Set Annual Targets</h6>

                                <div className="row g-4 mb-4">
                                    <div className="col-md-4">
                                        <label className="form-label small text-secondary fw-bold">Select Sales Engineer</label>
                                        <select
                                            className="form-select"
                                            value={selectedUser}
                                            onChange={(e) => setSelectedUser(e.target.value)}
                                        >
                                            {usersList.map(u => (
                                                <option key={u.id} value={u.name}>{u.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="col-md-2">
                                        <label className="form-label small text-secondary fw-bold">Financial Year</label>
                                        <select
                                            className="form-select"
                                            value={selectedYear}
                                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                                        >
                                            <option value="2024">2024</option>
                                            <option value="2025">2025</option>
                                            <option value="2026">2026</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="row g-4">
                                    {['q1', 'q2', 'q3', 'q4'].map((q, idx) => (
                                        <div key={q} className="col-md-3">
                                            <div className="card bg-light border-0">
                                                <div className="card-body text-center">
                                                    <h6 className="text-uppercase text-muted fw-bold mb-3">Q{idx + 1} Target</h6>
                                                    <div className="input-group">
                                                        <span className="input-group-text border-0 bg-white">BHD</span>
                                                        <input
                                                            type="number"
                                                            className="form-control border-0 fw-bold text-center"
                                                            value={targets[q]}
                                                            onChange={(e) => handleTargetChange(q, e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-4 d-flex justify-content-end align-items-center border-top pt-3">
                                    <div className="me-4">
                                        <span className="text-muted small me-2">Total Annual Target:</span>
                                        <span className="fw-bold fs-5 text-primary">
                                            BHD {(targets.q1 + targets.q2 + targets.q3 + targets.q4).toLocaleString()}
                                        </span>
                                    </div>
                                    <button className="btn btn-success px-4" onClick={saveTargets}>
                                        <Save size={18} className="me-2" /> Save Targets
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Performance View */}
                    {activeTab === 'my_performance' && performanceData && (
                        <div className="row g-4">
                            {/* Summary Card */}
                            <div className="col-12">
                                <div className="card border-0 shadow-sm h-100" style={{ borderRadius: '12px' }}>
                                    <div className="card-body p-4 d-flex align-items-center justify-content-between">
                                        <div>
                                            <h6 className="text-muted text-uppercase small fw-bold mb-1">Annual Performance ({selectedYear})</h6>
                                            <h3 className="mb-0 fw-bold">{performanceData.user}</h3>
                                        </div>
                                        <div className="text-end">
                                            <h4 className={`mb-0 fw-bold ${performanceData.totalActual >= performanceData.totalTarget ? 'text-success' : 'text-primary'}`}>
                                                BHD {performanceData.totalActual.toLocaleString()}
                                            </h4>
                                            <small className="text-muted">achieved of BHD {performanceData.totalTarget.toLocaleString()}</small>
                                        </div>
                                        <div style={{ width: '200px' }}>
                                            {/* Simple Circle or Bar representation could go here */}
                                            <div className="progress" style={{ height: '10px' }}>
                                                <div
                                                    className={`progress-bar ${performanceData.totalActual >= performanceData.totalTarget ? 'bg-success' : 'bg-primary'}`}
                                                    role="progressbar"
                                                    style={{ width: `${calculateProgress(performanceData.totalActual, performanceData.totalTarget)}%` }}
                                                ></div>
                                            </div>
                                            <div className="text-center mt-1 small fw-bold">
                                                {calculateProgress(performanceData.totalActual, performanceData.totalTarget)}%
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Graphical Representation */}
                            <div className="col-md-6">
                                <div className="card border-0 shadow-sm" style={{ borderRadius: '12px', height: '400px' }}>
                                    <div className="card-header bg-white border-bottom py-3">
                                        <h6 className="mb-0 fw-bold">Performance Chart (Target vs Actual)</h6>
                                    </div>
                                    <div className="card-body">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart
                                                data={performanceData.quarters}
                                                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="name" />
                                                <YAxis />
                                                <Tooltip formatter={(value) => `BHD ${value.toLocaleString()}`} />
                                                <Legend content={<RenderLegend />} />
                                                <Bar key="target" dataKey="target" name="Target" fill="#ff6b81" radius={[4, 4, 0, 0]} barSize={40} />
                                                <Bar key="actual" dataKey="actual" name="Actual Achieved" fill="#2ecc71" radius={[4, 4, 0, 0]} barSize={40} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            {/* Quarterly Breakdown */}
                            <div className="col-12">
                                <div className="card border-0 shadow-sm" style={{ borderRadius: '12px' }}>
                                    <div className="card-header bg-white border-bottom py-3">
                                        <h6 className="mb-0 fw-bold">Quarterly Breakdown</h6>
                                    </div>
                                    <div className="table-responsive">
                                        <table className="table align-middle mb-0">
                                            <thead className="bg-light small text-uppercase text-secondary">
                                                <tr>
                                                    <th className="px-4 py-3 border-0">Quarter</th>
                                                    <th className="px-4 py-3 border-0 text-end">Target (BHD)</th>
                                                    <th className="px-4 py-3 border-0 text-end">Actual Achieved (BHD)</th>
                                                    <th className="px-4 py-3 border-0 text-end">Variance</th>
                                                    <th className="px-4 py-3 border-0 text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {performanceData.quarters.map((q, idx) => (
                                                    <tr key={idx}>
                                                        <td className="px-4 py-3 fw-bold">{q.name}</td>
                                                        <td className="px-4 py-3 text-end text-muted">{q.target.toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-end fw-bold text-dark">{q.actual.toLocaleString()}</td>
                                                        <td className={`px-4 py-3 text-end fw-medium ${q.variance >= 0 ? 'text-success' : 'text-danger'}`}>
                                                            {q.variance > 0 ? '+' : ''}{q.variance.toLocaleString()}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            {q.actual >= q.target ? (
                                                                <span className="badge bg-success-subtle text-success border border-success px-3">Achieved</span>
                                                            ) : (
                                                                <span className="badge bg-danger-subtle text-danger border border-danger px-3">Shortfall</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-light border-top">
                                                <tr className="fw-bold">
                                                    <td className="px-4 py-3">Total</td>
                                                    <td className="px-4 py-3 text-end text-primary">{performanceData.totalTarget.toLocaleString()}</td>
                                                    <td className="px-4 py-3 text-end text-dark">{performanceData.totalActual.toLocaleString()}</td>
                                                    <td className={`px-4 py-3 text-end ${performanceData.totalActual - performanceData.totalTarget >= 0 ? 'text-success' : 'text-danger'}`}>
                                                        {(performanceData.totalActual - performanceData.totalTarget) > 0 ? '+' : ''}
                                                        {(performanceData.totalActual - performanceData.totalTarget).toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        {calculateProgress(performanceData.totalActual, performanceData.totalTarget)}%
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SalesTarget;
