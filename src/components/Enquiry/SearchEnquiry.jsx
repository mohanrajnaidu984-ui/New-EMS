import React, { useState, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';

const SearchEnquiry = ({ onOpen }) => {
    const { enquiries, masters } = useData();
    const { currentUser } = useAuth();

    // Search filters
    const [searchText, setSearchText] = useState('');
    const [filterCategory, setFilterCategory] = useState('All Categories');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    const [results, setResults] = useState([]);
    const [filteredEnquiries, setFilteredEnquiries] = useState([]);

    // Initialize filtered enquiries based on permissions
    useEffect(() => {
        if (!currentUser) return;

        // Determine user role
        const roleString = currentUser.role || currentUser.Roles || '';
        const userRoles = typeof roleString === 'string'
            ? roleString.split(',').map(r => r.trim())
            : (Array.isArray(roleString) ? roleString : []);

        const isAdmin = userRoles.includes('Admin');
        const userEmail = currentUser.EmailId?.toLowerCase() || '';
        const currentUserName = currentUser.name?.trim().toLowerCase() || '';

        // Filter Function
        const isVisible = (enq) => {
            if (isAdmin) return true;

            // 1. Created By Me
            if (enq.CreatedBy && enq.CreatedBy.trim().toLowerCase() === currentUserName) return true;

            // 2. Concerned SE is Me (Check name match or list match)
            if (enq.ConcernedSE && enq.ConcernedSE.trim().toLowerCase() === currentUserName) return true;
            // Check if user is in SelectedConcernedSEs array if it exists
            if (enq.SelectedConcernedSEs && enq.SelectedConcernedSEs.some(se => se.trim().toLowerCase() === currentUserName)) return true;


            // 3. Division/Department Coworker (via EnquiryFor -> Email Check)
            if (masters.enqItems && enq.SelectedEnquiryFor) {
                const selectedItems = Array.isArray(enq.SelectedEnquiryFor) ? enq.SelectedEnquiryFor : enq.SelectedEnquiryFor.split(',');
                const relevantItems = masters.enqItems.filter(item => selectedItems.includes(item.ItemName));

                for (const item of relevantItems) {
                    const allEmails = [
                        ...(item.CommonMailIds ? item.CommonMailIds.split(',') : []),
                        ...(item.CCMailIds ? item.CCMailIds.split(',') : [])
                    ].map(e => e.trim().toLowerCase());

                    if (userEmail && allEmails.includes(userEmail)) {
                        return true;
                    }
                }
            }

            return false;
        };

        const allowed = Object.values(enquiries)
            .filter(isVisible)
            .sort((a, b) => {
                // Primary: CreatedAt (descending)
                const dateA = new Date(a.CreatedAt || a.EnquiryDate);
                const dateB = new Date(b.CreatedAt || b.EnquiryDate);
                if (dateB - dateA !== 0) return dateB - dateA;

                // Secondary: RequestNo (descending) as tie-breaker
                return (b.RequestNo || '').localeCompare(a.RequestNo || '');
            });

        setFilteredEnquiries(allowed);
        setResults(allowed);
    }, [enquiries, currentUser, masters]);

    const handleSearch = () => {
        // If searching, search ALL enquiries. If no search, show only filtered "relevant" enquiries.
        let sourceList = (searchText || fromDate || toDate) ? Object.values(enquiries) : filteredEnquiries;

        let filtered = [...sourceList];

        // Search text filter
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

        // Sort results (Recent first)
        filtered.sort((a, b) => {
            const dateA = new Date(a.CreatedAt || a.EnquiryDate);
            const dateB = new Date(b.CreatedAt || b.EnquiryDate);
            return dateB - dateA;
        });

        setResults(filtered);
    };

    const handleClear = () => {
        setSearchText('');
        setFilterCategory('All Categories');
        setFromDate('');
        setToDate('');
        setResults(filteredEnquiries);
    };

    return (
        <div>
            {/* Search Filters */}
            <div className="row g-2 mb-3">
                <div className="col-md-3">
                    <label className="form-label">Search text</label>
                    <input
                        type="text"
                        className="form-control"
                        placeholder="Request No / Customer / Client / Project / SE / Created By"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{ fontSize: '13px' }}
                    />
                </div>
                <div className="col-md-2">
                    <label className="form-label">Filter Category</label>
                    <select
                        className="form-select"
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        style={{ fontSize: '13px' }}
                    >
                        <option value="All Categories">All Categories</option>
                    </select>
                </div>
                <div className="col-md-2">
                    <label className="form-label">From date</label>
                    <input
                        type="date"
                        className="form-control"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        style={{ fontSize: '13px' }}
                    />
                </div>
                <div className="col-md-2">
                    <label className="form-label">To date</label>
                    <input
                        type="date"
                        className="form-control"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        style={{ fontSize: '13px' }}
                    />
                </div>
                <div className="col-md-3 d-flex align-items-end">
                    <button className="btn btn-outline-primary me-2" onClick={handleSearch}>Search</button>
                    <button className="btn btn-outline-secondary" onClick={handleClear}>Clear</button>
                </div>
            </div>

            {/* Results Table */}
            <div className="table-responsive">
                <table className="table table-sm table-hover align-middle" style={{ fontSize: '13px' }}>
                    <thead className="table-light">
                        <tr>
                            <th>Request No</th>
                            <th>Enquiry Date</th>
                            <th>Customer</th>
                            <th>Client</th>
                            <th>Project</th>
                            <th>Source</th>
                            <th>Due</th>
                            <th>SE(s)</th>
                            <th>Status</th>
                            <th>Created By</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {results.length === 0 ? (
                            <tr><td colSpan="11" className="text-muted text-center">No results.</td></tr>
                        ) : (
                            results.map(r => (
                                <tr key={r.RequestNo}>
                                    <td>{r.RequestNo}</td>
                                    <td>{r.EnquiryDate}</td>
                                    <td>{r.SelectedCustomers?.join(', ') || r.CustomerName}</td>
                                    <td>{r.ClientName}</td>
                                    <td>{r.ProjectName}</td>
                                    <td>{r.SourceOfInfo}</td>
                                    <td>{r.DueOn}</td>
                                    <td>{r.SelectedConcernedSEs?.join(', ') || r.ConcernedSE}</td>
                                    <td>{r.Status || 'Enquiry'}</td>
                                    <td>{r.CreatedBy || '-'}</td>
                                    <td>
                                        {r.Status === 'Reports' ? (
                                            <button
                                                className="btn btn-sm"
                                                style={{
                                                    backgroundColor: '#d4edda',
                                                    color: '#155724',
                                                    border: '1px solid #c3e6cb',
                                                    fontSize: '12px'
                                                }}
                                                onClick={() => onOpen(r.RequestNo)}
                                            >
                                                Closed
                                            </button>
                                        ) : (
                                            <button
                                                className="btn btn-outline-primary btn-sm"
                                                onClick={() => onOpen(r.RequestNo)}
                                                style={{ fontSize: '12px' }}
                                            >
                                                Open
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default SearchEnquiry;
