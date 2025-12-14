import React from 'react';

const DashboardFilters = ({ filters, setFilters, masters, horizontal = false }) => {

    if (horizontal) {
        return (
            <div className="d-flex align-items-center gap-3">
                <div style={{ minWidth: '200px' }}>
                    <select
                        className="form-select border-0 shadow-sm bg-white py-2"
                        style={{ fontWeight: 500, borderRadius: '8px' }}
                        value={filters.division}
                        onChange={(e) => setFilters(prev => ({ ...prev, division: e.target.value }))}
                    >
                        <option value="All">All Divisions</option>
                        {masters.enquiryFor && masters.enquiryFor.map((div, idx) => (
                            <option key={idx} value={div}>{div}</option>
                        ))}
                    </select>
                </div>
                <div style={{ minWidth: '200px' }}>
                    <select
                        className="form-select border-0 shadow-sm bg-white py-2"
                        style={{ fontWeight: 500, borderRadius: '8px' }}
                        value={filters.salesEngineer}
                        onChange={(e) => setFilters(prev => ({ ...prev, salesEngineer: e.target.value }))}
                    >
                        <option value="All">All Sales Engineers</option>
                        {masters.concernedSEs && masters.concernedSEs.map((se, idx) => (
                            <option key={idx} value={se}>{se}</option>
                        ))}
                    </select>
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
                        className="form-select border-0 shadow-sm bg-white py-2"
                        style={{ fontWeight: 500, borderRadius: '8px' }}
                        value={filters.division}
                        onChange={(e) => setFilters(prev => ({ ...prev, division: e.target.value }))}
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
                        className="form-select border-0 shadow-sm bg-white py-2"
                        style={{ fontWeight: 500, borderRadius: '8px' }}
                        value={filters.salesEngineer}
                        onChange={(e) => setFilters(prev => ({ ...prev, salesEngineer: e.target.value }))}
                    >
                        <option value="All">All Sales Engineers</option>
                        {masters.concernedSEs && masters.concernedSEs.map((se, idx) => (
                            <option key={idx} value={se}>{se}</option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
};

export default DashboardFilters;
