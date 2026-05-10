import React from 'react';
import { useAuth } from '../../../context/AuthContext';
import {
    getCcCoordinatorNamesForDivision,
    getEffectiveDivisionForDashboardSe,
    getMasterConcernedSeNamesForDivision,
} from '../../../utils/dashboardCcAccess';

/** Case-insensitive ascending order for dropdown lists */
const sortStringsAsc = (list) => {
    if (!list || list.length === 0) return [];
    return [...list].sort((a, b) =>
        String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true })
    );
};

const DashboardFilters = ({ filters, setFilters, masters, viewMode = 'all' }) => {
    const { currentUser } = useAuth();

    const roleString = currentUser?.role || currentUser?.Roles || '';
    const userRoles = typeof roleString === 'string'
        ? roleString.split(',').map(r => r.trim().toLowerCase())
        : (Array.isArray(roleString) ? roleString.map(r => r.trim().toLowerCase()) : []);
    const isAdmin = userRoles.includes('admin') || userRoles.includes('system');
    const userEmail = (currentUser?.email || currentUser?.EmailId || '').trim().toLowerCase();
    const isCCUser = masters.enqItems?.some(item => {
        const val = item.CCMailIds;
        const str = (typeof val === 'string') ? val : '';
        const ccEmails = (str ? str.split(/[,;]/) : [])
            .map(e => e.trim().toLowerCase()).filter(Boolean);
        return ccEmails.includes(userEmail);
    });

    // If CC user: restrict Division dropdown to only the user's DepartmentName from Master_EnquiryFor.
    const ccDepartmentNames = (() => {
        if (!isCCUser) return [];
        const depts = (masters.enqItems || [])
            .filter(item => {
                const str = String(item.CCMailIds || '');
                const ccEmails = (str ? str.split(/[,;]/) : [])
                    .map(e => e.trim().toLowerCase()).filter(Boolean);
                return ccEmails.includes(userEmail);
            })
            .map(item => String(item.DepartmentName || '').trim())
            .filter(Boolean);
        return Array.from(new Set(depts));
    })();

    /** Division key for Master_ConcernedSE.Department + CC coordinator names (aligned with dashboard API). */
    const effectiveDivisionForSeList = getEffectiveDivisionForDashboardSe(
        filters.division,
        isCCUser,
        userEmail,
        masters.enqItems
    );

    /** Master_ConcernedSE.FullName where Department matches selected division (`masters.users` = that table). */
    const masterSeNamesForDivision = getMasterConcernedSeNamesForDivision(
        effectiveDivisionForSeList,
        masters.users
    );

    /** CC mail contacts for this department — selecting one shows all SEs for the division on calendars */
    const ccCoordinatorNamesForDivision = effectiveDivisionForSeList
        ? getCcCoordinatorNamesForDivision(
            effectiveDivisionForSeList,
            masters.enqItems,
            masters.users
        )
        : [];

    const dashboardSeOptions = sortStringsAsc(
        Array.from(new Set([...masterSeNamesForDivision, ...ccCoordinatorNamesForDivision]))
    );

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
        const divisionOptions = sortStringsAsc(
            isCCUser
                ? (ccDepartmentNames.length > 0 ? ccDepartmentNames : ['All'])
                : (masters.enquiryFor || [])
        );

        const seOptions = dashboardSeOptions;

        return (
            <div className="d-flex align-items-center gap-2 w-100">
                <div style={{ width: '38%' }}>
                    <select
                        className="form-select shadow-none dashboard-filter-select"
                        style={commonSelectStyle(isAdmin || isCCUser)}
                        value={filters.division}
                        onChange={(e) => setFilters(prev => ({
                            ...prev,
                            division: e.target.value,
                            salesEngineer: 'All'
                        }))}
                        disabled={!isAdmin && !isCCUser}
                    >
                        {isCCUser ? null : <option value="All">All Divisions</option>}
                        {divisionOptions.map((div, idx) => (
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
                        {seOptions && seOptions.map((se, idx) => (
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

    // Right panel: reserve the same vertical band as the left filters so layout does not shift; controls removed per UX.
    if (viewMode === 'search_date') {
        return <div className="dashboard-filters-right-spacer w-100" aria-hidden="true" />;
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
                    {/* When CC user, only show DepartmentName (fallback to 'All' if missing). */}
                    <select
                        className="form-select border-0 shadow-sm bg-white py-2 dashboard-filter-select"
                        style={commonSelectStyle(isAdmin || isCCUser)}
                        value={filters.division}
                        onChange={(e) => setFilters(prev => ({
                            ...prev,
                            division: e.target.value,
                            salesEngineer: 'All'
                        }))}
                        disabled={!isAdmin && !isCCUser}
                    >
                        {isCCUser ? null : <option value="All">All Divisions</option>}
                        {sortStringsAsc(
                            isCCUser ? (ccDepartmentNames.length ? ccDepartmentNames : ['All']) : (masters.enquiryFor || [])
                        ).map((div, idx) => (
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
                        {dashboardSeOptions.map((se, idx) => (
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
