import React, { useState, useEffect } from 'react';
import { useData } from '../../context/DataContext'; // Reuse for masters if needed
import { useAuth } from '../../context/AuthContext';
import DashboardFilters from './LeftPanel/DashboardFilters';
import CalendarView from './LeftPanel/CalendarView';
import CalendarBarChart from './LeftPanel/CalendarBarChart';
import SummaryCards from './RightPanel/SummaryCards';
import EnquiryTable from './RightPanel/EnquiryTable';
import AnalyticsRow from './AnalyticsRow';
import './DashboardLayout.css';


const Dashboard = ({ onNavigate, onOpenEnquiry }) => { // Assuming these props passed from Main
    const { masters } = useData();
    const { currentUser } = useAuth();
    // Use relative path to leverage Vite proxy (targets port 5000), avoids port mismatch
    const API_URL = '/api/dashboard';

    // State
    const [dateState, setDateState] = useState({
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        selectedDate: null,
        selectedType: 'all' // 'all', 'enquiry', 'due', 'visit'
    });

    const [filters, setFilters] = useState({
        division: 'All',
        salesEngineer: 'All',
        mode: 'future', // Default to Future (Due >= Today)
        dateType: 'Enquiry Date',
        status: 'All',
        search: ''
    });

    const [data, setData] = useState({
        calendar: [],
        summary: {},
        table: []
    });

    const [filteredTableData, setFilteredTableData] = useState([]);

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (currentUser && masters.enquiryFor && masters.enqItems) {
            const roleString = currentUser.role || currentUser.Roles || '';
            const userRoles = typeof roleString === 'string'
                ? roleString.split(',').map(r => r.trim().toLowerCase())
                : (Array.isArray(roleString) ? roleString.map(r => r.trim().toLowerCase()) : []);
            const isAdmin = userRoles.includes('admin') || userRoles.includes('system');

            if (!isAdmin) {
                const userEmail = (currentUser.email || currentUser.EmailId || '').trim().toLowerCase();
                const userRequestNo = String(currentUser.RequestNo || '');
                const userDivisionName = currentUser.DivisionName; // From login API

                // Find matched division based on email in masters
                let matchedItem = (masters.enqItems || []).find(item => {
                    const common = String(item.CommonMailIds || '').toLowerCase().split(/[,;]/).map(e => e.trim()).filter(Boolean);
                    const cc = String(item.CCMailIds || '').toLowerCase().split(/[,;]/).map(e => e.trim()).filter(Boolean);
                    return common.includes(userEmail) || cc.includes(userEmail);
                });

                // Fallback 1: Match by DivisionName from Login (most reliable SE link)
                if (!matchedItem && userDivisionName) {
                    matchedItem = (masters.enqItems || []).find(item =>
                        item.ItemName.toLowerCase() === userDivisionName.toLowerCase()
                    );
                }

                // Fallback 2: Match by RequestNo if SE profile has it (links to division template)
                if (!matchedItem && userRequestNo) {
                    matchedItem = (masters.enqItems || []).find(item =>
                        String(item.RequestNo) === userRequestNo
                    );
                }

                const isCCUser = (masters.enqItems || []).some(item => {
                    const cc = String(item.CCMailIds || '').toLowerCase().split(/[,;]/).map(e => e.trim()).filter(Boolean);
                    return cc.includes(userEmail);
                });

                setFilters(prev => ({
                    ...prev,
                    division: 'All', // Set to 'All' to avoid hierarchical name mismatch
                    salesEngineer: isCCUser ? 'All' : (currentUser.name || 'All')
                }));
            }
        }
    }, [currentUser, masters.enqItems, masters.enquiryFor]);

    // Fetch Data
    const fetchData = async () => {
        setLoading(true);
        try {
            // preparing params
            // Start with basic filters
            const baseParams = {
                division: filters.division,
                salesEngineer: filters.salesEngineer
            };

            // Add User Context for Access Control
            if (currentUser) {
                baseParams.userEmail = currentUser.email || currentUser.EmailId || '';
                baseParams.userName = currentUser.name || '';
                // Handle different role structures
                baseParams.userRole = currentUser.role || currentUser.Roles || 'User';
            }

            // 1. Calendar Params
            const calParams = new URLSearchParams({
                ...baseParams,
                month: dateState.month,
                year: dateState.year
            });

            // 1. Calendar
            const calRes = await fetch(`${API_URL}/calendar?${calParams}`);
            const calData = calRes.ok ? await calRes.json() : [];

            // 2. Summary (KPI) Params
            const sumParams = new URLSearchParams(baseParams);

            // 2. Summary (KPI)
            // KPI depends on global filters only (Today is implied)
            const sumRes = await fetch(`${API_URL}/summary?${sumParams}`);
            const sumData = sumRes.ok ? await sumRes.json() : {};

            // 3. Table Params
            const listParams = new URLSearchParams({
                ...baseParams,
                mode: filters.mode
            });

            // If specific date is selected in calendar, filter table by that date
            if (dateState.selectedDate) {
                listParams.set('date', dateState.selectedDate);
            } else {
                // Determine mode if no date selected? or uses 'mode' state
                // filters.mode handles 'today'/'future'/'all'
                if (filters.fromDate) listParams.set('fromDate', filters.fromDate);
                if (filters.toDate) listParams.set('toDate', filters.toDate);

                if (filters.dateType === 'Lapsed') {
                    listParams.set('dateType', 'Due Date');
                    listParams.set('status', 'Lapsed');
                } else {
                    listParams.set('dateType', filters.dateType);
                    if (filters.status && filters.status !== 'All') listParams.set('status', filters.status);
                }

                if (filters.search) listParams.set('search', filters.search);
            }

            const listRes = await fetch(`${API_URL}/enquiries?${listParams}`);
            let listData = [];
            if (listRes.ok) {
                listData = await listRes.json();
                if (!Array.isArray(listData)) listData = []; // Extra safety
            } else {
                console.error("Enquiry API Failed:", listRes.status, listRes.statusText);
            }

            setData({
                calendar: Array.isArray(calData) ? calData : (calData.daily || []),
                calendarTotals: !Array.isArray(calData) ? calData.totals : null,
                summary: sumData || {},
                table: Array.isArray(listData) ? listData : []
            });


        } catch (err) {
            console.error("Dashboard Fetch Error:", err);
            setData({
                calendar: [],
                summary: {},
                table: []
            });
        } finally {
            setLoading(false);
        }
    };

    // Filter Table Data based on selectedType (Frontend Filtering)
    useEffect(() => {
        if (!dateState.selectedDate || dateState.selectedType === 'all') {
            setFilteredTableData(data.table);
            return;
        }

        const type = dateState.selectedType;
        const targetDate = dateState.selectedDate; // Already YYYY-MM-DD from CalendarView

        if (!Array.isArray(data.table)) {
            console.error("Data Table is not an array:", data.table);
            setFilteredTableData([]);
            return;
        }

        const filtered = data.table.filter(row => {
            const compareDate = (dateVal) => {
                if (!dateVal) return false;
                const d1 = new Date(dateVal).toISOString().split('T')[0];
                return d1 === targetDate;
            };

            if (type === 'enquiry') return compareDate(row.EnquiryDate);
            if (type === 'due') return compareDate(row.DueDate);
            if (type === 'visit') return compareDate(row.SiteVisitDate);
            if (type === 'lapsed') {
                const isDueOnDate = compareDate(row.DueDate);
                const isLapsedStatus = !row.Status || !['Quote', 'Won', 'Lost', 'Quoted', 'Submitted'].includes(row.Status);
                return isDueOnDate && isLapsedStatus;
            }
            if (type === 'quote') {
                // Backend already filters QuoteDate to match the selected @date parameter.
                // So if QuoteDate is not null, it IS the target date.
                return !!row.QuoteDate;
            }
            return true;
        });

        setFilteredTableData(filtered);
    }, [data.table, dateState.selectedDate, dateState.selectedType]);


    // Effects
    useEffect(() => {
        // Clear specific date selection when global filters change (Dropdowns, Buttons, Search)
        // This resolves the issue where clicking "This Month" wouldn't override a selected calendar date.
        if (dateState.selectedDate) {
            setDateState(prev => ({ ...prev, selectedDate: null, selectedType: 'all' }));
        }
    }, [filters]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchData();
        }, 500); // Debounce API calls slightly
        return () => clearTimeout(timer);
    }, [dateState.month, dateState.year, dateState.selectedDate, filters.division, filters.salesEngineer, filters.mode, filters.fromDate, filters.toDate, filters.dateType, filters.search, filters.status]);

    // Handlers
    const handleMonthChange = (m, y) => {
        setDateState(prev => ({ ...prev, month: m, year: y }));
    };

    const handleDateClick = (dateStr, type = 'all') => {
        setDateState(prev => ({
            ...prev,
            selectedDate: dateStr,
            selectedType: type
        }));
    };

    const handleBarClick = (type) => {
        // Calculate Month Range based on current Calendar Month
        const y = dateState.year;
        const m = dateState.month;
        // Construct localized date strings to avoid timezone shifts
        // Month is 1-indexed in state, 0-indexed in Date constructor
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 0);

        // Simple formatter (local YYYY-MM-DD)
        const toLocalYMD = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const fromDate = toLocalYMD(start);
        const toDate = toLocalYMD(end);

        const newFilters = {
            fromDate,
            toDate,
            mode: 'range',
            search: '',
            date: null // Clear specific date
        };

        if (type === 'enquiry') {
            newFilters.status = 'All';
            newFilters.dateType = 'Enquiry Date';
        } else if (type === 'due') {
            newFilters.status = 'All';
            newFilters.dateType = 'Due Date';
        } else if (type === 'lapsed') {
            newFilters.status = 'All'; // Handled by dateType logic in fetchData
            newFilters.dateType = 'Lapsed';
        } else if (type === 'quote') {
            newFilters.status = 'All'; // Don't force 'Quoted' status because we want all quotes in that range?
            // If we filter by 'Quote Date', logic handles quotes.
            newFilters.dateType = 'Quote Date';
        }

        setFilters(prev => ({ ...prev, ...newFilters }));
    };

    const handleTableFilterChange = (newFilters) => {
        // If changing mode, we might want to clear selectedDate?
        if (newFilters.mode) {
            setDateState(prev => ({ ...prev, selectedDate: null, selectedType: 'all' }));
        }
        if (newFilters.date === null) {
            setDateState(prev => ({ ...prev, selectedDate: null, selectedType: 'all' }));
        }
        setFilters(newFilters);
    };

    // Wire up row click to open enquiry
    const handleRowClick = (reqNo) => {
        if (onOpenEnquiry) onOpenEnquiry(reqNo); // Needs to be passed down from App -> Main -> Dashboard
    };

    return (
        <div className="container-fluid" style={{ height: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column', padding: 0 }}>







            {/* Row 2: Content Area (Calendar + Table) */}
            <div className="flex-grow-1 dashboard-split-container" style={{ minHeight: 0 }}>
                {/* Calendar Panel - 40% */}
                <div className="dashboard-left-panel">
                    <div className="px-3 py-2 border-bottom bg-white">
                        <DashboardFilters
                            filters={filters}
                            setFilters={setFilters}
                            masters={masters}
                            viewMode="division_se"
                        />
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                        <CalendarBarChart
                            data={data.calendar}
                            monthlyTotals={data.calendarTotals}
                            onBarClick={handleBarClick}
                        />
                        <div className="p-2" style={{ flex: 1 }}>
                            <CalendarView
                                month={dateState.month}
                                year={dateState.year}
                                onMonthChange={handleMonthChange}
                                data={data.calendar}
                                selectedDate={dateState.selectedDate}
                                selectedType={dateState.selectedType}
                                onDateClick={handleDateClick}
                            />
                        </div>
                    </div>
                </div>

                {/* Table Panel - 60% */}
                <div className="dashboard-right-panel">
                    <div className="px-3 py-2 border-bottom bg-white">
                        <DashboardFilters
                            filters={filters}
                            setFilters={setFilters}
                            masters={masters}
                            viewMode="search_date"
                            selectedDate={dateState.selectedDate}
                        />
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }} className="p-2">
                        <EnquiryTable
                            data={filteredTableData}
                            onRowClick={handleRowClick}
                            filters={filters}
                            setFilters={handleTableFilterChange}
                            selectedDate={dateState.selectedDate}
                            selectedType={dateState.selectedType}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
