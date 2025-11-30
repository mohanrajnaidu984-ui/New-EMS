import React, { useState, useEffect } from 'react';
import { useData } from '../../context/DataContext';

const SearchEnquiry = ({ onOpen }) => {
    const { enquiries } = useData();

    // Search filters
    const [searchText, setSearchText] = useState('');
    const [filterCategory, setFilterCategory] = useState('All Categories');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    const [results, setResults] = useState([]);

    // Initialize results with all enquiries (already sorted by backend)
    useEffect(() => {
        const allEnquiries = Object.values(enquiries);
        setResults(allEnquiries);
    }, [enquiries]);

    const handleSearch = () => {
        let filtered = Object.values(enquiries);

        // Search text filter (Request No / Customer / Client / Project / SE)
        if (searchText) {
            const lowerText = searchText.toLowerCase();
            filtered = filtered.filter(e =>
                e.RequestNo?.toLowerCase().includes(lowerText) ||
                e.CustomerName?.toLowerCase().includes(lowerText) ||
                (e.SelectedCustomers && e.SelectedCustomers.join(',').toLowerCase().includes(lowerText)) ||
                e.ClientName?.toLowerCase().includes(lowerText) ||
                e.ProjectName?.toLowerCase().includes(lowerText) ||
                (e.SelectedConcernedSEs && e.SelectedConcernedSEs.join(',').toLowerCase().includes(lowerText)) ||
                e.CreatedBy?.toLowerCase().includes(lowerText)
            );
        }

        // Category filter
        if (filterCategory !== 'All Categories') {
            // Add category filtering logic here if needed
        }

        // Date range filter
        if (fromDate) {
            filtered = filtered.filter(e => new Date(e.EnquiryDate) >= new Date(fromDate));
        }
        if (toDate) {
            filtered = filtered.filter(e => new Date(e.EnquiryDate) <= new Date(toDate));
        }

        setResults(filtered);
    };

    const handleClear = () => {
        setSearchText('');
        setFilterCategory('All Categories');
        setFromDate('');
        setToDate('');
        setResults(Object.values(enquiries));
    };

    return (
        <div className="container-fluid p-0">
            {/* Search Filters Card */}
            <div className="card mb-4 border-0 shadow-sm">
                <div className="card-body p-4">
                    <h5 className="card-title mb-3 text-secondary">Filter Enquiries</h5>
                    <div className="row g-3">
                        <div className="col-md-4">
                            <label className="form-label small text-muted fw-bold">SEARCH TEXT</label>
                            <div className="input-group">
                                <span className="input-group-text bg-light border-end-0">
                                    <i className="bi bi-search text-muted"></i>
                                </span>
                                <input
                                    type="text"
                                    className="form-control border-start-0 bg-light"
                                    placeholder="Request No, Customer, Project..."
                                    value={searchText}
                                    onChange={(e) => setSearchText(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="col-md-3">
                            <label className="form-label small text-muted fw-bold">CATEGORY</label>
                            <select
                                className="form-select bg-light"
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                            >
                                <option value="All Categories">All Categories</option>
                                <option value="Enquiry">Enquiry</option>
                                <option value="Pricing">Pricing</option>
                                <option value="Quote">Quote</option>
                            </select>
                        </div>
                        <div className="col-md-3">
                            <label className="form-label small text-muted fw-bold">DATE RANGE</label>
                            <div className="d-flex gap-2">
                                <input
                                    type="date"
                                    className="form-control bg-light"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                    placeholder="From"
                                />
                                <input
                                    type="date"
                                    className="form-control bg-light"
                                    value={toDate}
                                    onChange={(e) => setToDate(e.target.value)}
                                    placeholder="To"
                                />
                            </div>
                        </div>
                        <div className="col-md-2 d-flex align-items-end gap-2">
                            <button className="btn btn-primary flex-grow-1" onClick={handleSearch}>
                                Search
                            </button>
                            <button className="btn btn-light" onClick={handleClear} title="Clear Filters">
                                <i className="bi bi-x-lg"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Results Table Card */}
            <div className="card border-0 shadow-sm">
                <div className="card-body p-0">
                    <div className="table-responsive">
                        <table className="table table-hover align-middle mb-0">
                            <thead className="bg-light">
                                <tr>
                                    <th className="py-3 ps-4 text-secondary small fw-bold border-0">REQUEST NO</th>
                                    <th className="py-3 text-secondary small fw-bold border-0">DATE</th>
                                    <th className="py-3 text-secondary small fw-bold border-0">CUSTOMER</th>
                                    <th className="py-3 text-secondary small fw-bold border-0">PROJECT</th>
                                    <th className="py-3 text-secondary small fw-bold border-0">DUE DATE</th>
                                    <th className="py-3 text-secondary small fw-bold border-0">STATUS</th>
                                    <th className="py-3 pe-4 text-end text-secondary small fw-bold border-0">ACTION</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.length === 0 ? (
                                    <tr><td colSpan="7" className="text-center py-5 text-muted">No enquiries found matching your criteria.</td></tr>
                                ) : (
                                    results.map(r => (
                                        <tr key={r.RequestNo} style={{ cursor: 'pointer' }} onClick={() => onOpen(r.RequestNo)}>
                                            <td className="ps-4 fw-medium text-primary">{r.RequestNo}</td>
                                            <td className="text-muted">{new Date(r.EnquiryDate).toLocaleDateString()}</td>
                                            <td>
                                                <div className="fw-medium text-dark">{r.SelectedCustomers?.join(', ') || r.CustomerName}</div>
                                                <div className="small text-muted">{r.ClientName}</div>
                                            </td>
                                            <td className="text-dark">{r.ProjectName}</td>
                                            <td className={`fw-medium ${new Date(r.DueOn) < new Date() ? 'text-danger' : 'text-muted'}`}>
                                                {new Date(r.DueOn).toLocaleDateString()}
                                            </td>
                                            <td>
                                                <span className={`badge rounded-pill px-3 py-2 ${r.Status === 'Reports' ? 'bg-success bg-opacity-10 text-success' :
                                                        r.Status === 'Quote' ? 'bg-info bg-opacity-10 text-info' :
                                                            'bg-warning bg-opacity-10 text-warning'
                                                    }`}>
                                                    {r.Status || 'Enquiry'}
                                                </span>
                                            </td>
                                            <td className="pe-4 text-end">
                                                <button className="btn btn-sm btn-light text-primary rounded-circle" style={{ width: '32px', height: '32px' }}>
                                                    <i className="bi bi-chevron-right"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                {/* Pagination (Visual Only) */}
                <div className="card-footer bg-white border-0 py-3 d-flex justify-content-between align-items-center">
                    <div className="text-muted small">Showing {results.length} entries</div>
                    <nav>
                        <ul className="pagination pagination-sm mb-0">
                            <li className="page-item disabled"><a className="page-link" href="#">Previous</a></li>
                            <li className="page-item active"><a className="page-link" href="#">1</a></li>
                            <li className="page-item"><a className="page-link" href="#">2</a></li>
                            <li className="page-item"><a className="page-link" href="#">3</a></li>
                            <li className="page-item"><a className="page-link" href="#">Next</a></li>
                        </ul>
                    </nav>
                </div>
            </div>
        </div>
    );
};

export default SearchEnquiry;
