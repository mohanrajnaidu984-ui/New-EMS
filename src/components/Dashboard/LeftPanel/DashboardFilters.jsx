import React from 'react';
import { useAuth } from '../../../context/AuthContext';

const DashboardFilters = ({ filters, setFilters, masters, viewMode = 'all' }) => {
    const { currentUser } = useAuth();

    const roleString = currentUser?.role || currentUser?.Roles || '';
    const userRoles = typeof roleString === 'string'
        ? roleString.split(',').map(r => r.trim().toLowerCase())
        : (Array.isArray(roleString) ? roleString.map(r => r.trim().toLowerCase()) : []);
    const isAdmin = userRoles.includes('admin') || userRoles.includes('system');
    const userEmail = (currentUser?.email || currentUser?.EmailId || '').trim().toLowerCase();
    const isCCUser = masters.enqItems?.some(item => {
        const ccEmails = (item.CCMailIds ? item.CCMailIds.split(/[,;]/) : [])
            .map(e => e.trim().toLowerCase()).filter(Boolean);
        return ccEmails.includes(userEmail);
    });

    const [activeDateFilter, setActiveDateFilter] = React.useState('All');

    const handleDateFilter = (filterType) => {
        setActiveDateFilter(filterType);
        const today = new Date();

        // Helper to format as YYYY-MM-DD in LOCAL time
        const formatLocal = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        let from = null;
        let to = null;

        if (filterType === 'Today') {
            from = formatLocal(today);
            to = formatLocal(today);
        } else if (filterType === 'Tomorrow') {
            const tmrw = new Date(today);
            tmrw.setDate(today.getDate() + 1);
            from = formatLocal(tmrw);
            to = formatLocal(tmrw);
        } else if (filterType === 'This Week') {
            const day = today.getDay(); // 0=Sun, 1=Mon, ...
            // Align to Monday
            const diff = today.getDate() - day + (day === 0 ? -6 : 1);
            const start = new Date(today);
            start.setDate(diff);

            const end = new Date(start);
            end.setDate(start.getDate() + 6);

            from = formatLocal(start);
            to = formatLocal(end);
        } else if (filterType === 'This Month') {
            const start = new Date(today.getFullYear(), today.getMonth(), 1);
            const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            from = formatLocal(start);
            to = formatLocal(end);
        }

        // Reset selectedDate in parent if strictly date range is used, handled by effect in Dashboard but explicit here helps
        setFilters(prev => ({
            ...prev,
            fromDate: from,
            toDate: to,
            mode: filterType === 'All' ? 'future' : 'range', // Switch mode if needed
            date: null // Clear specific date
        }));
    };

    const commonSelectStyle = (enabled) => ({
        fontWeight: 500,
        borderRadius: '4px',
        fontSize: '12.5px',
        height: '36px',
        cursor: enabled ? 'pointer' : 'not-allowed',
        opacity: enabled ? 1 : 0.8,
        transition: 'all 0.2s ease',
        border: '1px solid #dee2e6'
    });

    // Render Division and Sales Engineer (For Left Panel / Calendar)
    if (viewMode === 'division_se') {
        return (
            <div className="d-flex align-items-center gap-2 w-100">
                <div style={{ width: '38%' }}>
                    <select
                        className="form-select shadow-none dashboard-filter-select"
                        style={commonSelectStyle(isAdmin)}
                        value={filters.division}
                        onChange={(e) => setFilters(prev => ({ ...prev, division: e.target.value }))}
                        disabled={!isAdmin}
                    >
                        <option value="All">All Divisions</option>
                        {masters.enquiryFor && masters.enquiryFor.map((div, idx) => (
                            <option key={idx} value={div}>{div}</option>
                        ))}
                    </select>
                </div>
                <div style={{ width: '38%' }}>
                    <select
                        className="form-select shadow-none dashboard-filter-select"
                        style={commonSelectStyle(isAdmin || isCCUser)}
                        value={filters.salesEngineer}
                        onChange={(e) => setFilters(prev => ({ ...prev, salesEngineer: e.target.value }))}
                        disabled={!isAdmin && !isCCUser}
                    >
                        <option value="All">All SEs</option>
                        {masters.concernedSEs && masters.concernedSEs.map((se, idx) => (
                            <option key={idx} value={se}>{se}</option>
                        ))}
                    </select>
                </div>
                <style>{`
                    .dashboard-filter-select:hover:not(:disabled) {
                        background-color: #f8f9fa !important;
                    }
                `}</style>
            </div>
        );
    }

    // Render Search and Date Filters (For Right Panel / Table)
    if (viewMode === 'search_date') {
        return (
            <div className="d-flex align-items-center gap-2 flex-nowrap w-100" style={{
                overflowX: 'auto'
            }}>
                {/* Search Input */}
                <div style={{ minWidth: '140px', maxWidth: '300px', flex: '1 1 auto' }}>
                    <input
                        type="text"
                        className="form-control shadow-none"
                        placeholder="Search project, customer..."
                        value={filters.search || ''}
                        onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                        style={{ fontSize: '12.5px', height: '36px', borderRadius: '4px' }}
                    />
                </div>

                {/* Date Type Selector */}
                <div style={{ minWidth: '130px' }}>
                    <select
                        className="form-select shadow-none dashboard-filter-select"
                        style={commonSelectStyle(true)}
                        value={filters.dateType || 'Enquiry Date'}
                        onChange={(e) => setFilters(prev => ({ ...prev, dateType: e.target.value }))}
                    >
                        <option value="Enquiry Date">Enquiry Date</option>
                        <option value="Due Date">Due Date</option>
                    </select>
                </div>


                {/* Date Filters Buttons */}
                <div className="d-flex gap-2 flex-shrink-0" role="group">
                    {['Today', 'Tomorrow', 'This Week', 'This Month'].map(type => (
                        <button
                            key={type}
                            type="button"
                            className={`btn btn-sm rounded-pill ${activeDateFilter === type ? 'fw-bold text-primary border' : 'btn-light text-muted'}`}
                            onClick={() => handleDateFilter(type)}
                            style={{
                                fontSize: '11px',
                                height: '36px',
                                paddingLeft: '16px',
                                paddingRight: '16px',
                                background: activeDateFilter === type ? '#e0f8ff' : '#f8f9fa',
                                border: activeDateFilter === type ? '1px solid #90e0ef' : '1px solid transparent',
                                boxShadow: activeDateFilter === type ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="card h-100 border-0 shadow-sm" style={{ borderRadius: '16px', background: 'linear-gradient(145deg, #ffffff 0%, #f7f9fc 100%)' }}>
            <div className="card-body p-4">
                <h6 className="fw-semibold text-secondary small text-uppercase mb-4" style={{ letterSpacing: '0.05em' }}>
                    Global Filters
                </h6>

                {/* Division Filter */}
                <div className="mb-4">
                    <label className="form-label small fw-bold text-muted text-uppercase" style={{ fontSize: '0.7rem' }}>Division</label>
                    <select
                        className="form-select border-0 shadow-sm bg-white py-2 dashboard-filter-select"
                        style={commonSelectStyle(isAdmin)}
                        value={filters.division}
                        onChange={(e) => setFilters(prev => ({ ...prev, division: e.target.value }))}
                        disabled={!isAdmin}
                    >
                        <option value="All">All Divisions</option>
                        {masters.enquiryFor && masters.enquiryFor.map((div, idx) => (
                            <option key={idx} value={div}>{div}</option>
                        ))}
                    </select>
                </div>

                {/* Sales Engineer Filter */}
                <div className="mb-0">
                    <label className="form-label small fw-bold text-muted text-uppercase" style={{ fontSize: '0.7rem' }}>Sales Engineer</label>
                    <select
                        className="form-select border-0 shadow-sm bg-white py-2 dashboard-filter-select"
                        style={commonSelectStyle(isAdmin || isCCUser)}
                        value={filters.salesEngineer}
                        onChange={(e) => setFilters(prev => ({ ...prev, salesEngineer: e.target.value }))}
                        disabled={!isAdmin && !isCCUser}
                    >
                        <option value="All">All Sales Engineers</option>
                        {masters.concernedSEs && masters.concernedSEs.map((se, idx) => (
                            <option key={idx} value={se}>{se}</option>
                        ))}
                    </select>
                </div>
            </div>
            <style jsx>{`
                .dashboard-filter-select:hover:not(:disabled) {
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
                    background-color: #fbfcfe !important;
                }
            `}</style>
        </div>
    );
};

export default DashboardFilters;
