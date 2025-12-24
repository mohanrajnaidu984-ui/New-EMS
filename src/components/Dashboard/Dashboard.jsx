import React, { useState, useEffect } from 'react';
import { useData } from '../../context/DataContext'; // Reuse for masters if needed
import { useAuth } from '../../context/AuthContext';
import DashboardFilters from './LeftPanel/DashboardFilters';
import CalendarView from './LeftPanel/CalendarView';
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
        search: ''
    });

    const [data, setData] = useState({
        calendar: [],
        summary: {},
        table: []
    });

    const [filteredTableData, setFilteredTableData] = useState([]);

    const [loading, setLoading] = useState(false);

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
                baseParams.userEmail = currentUser.email || '';
                baseParams.userName = currentUser.name || '';
                // Handle different role structures (AuthContext maps it, but safe check)
                baseParams.userRole = currentUser.role || (currentUser.Roles ? currentUser.Roles.split(',')[0] : 'User');
            }

            // 1. Calendar Params
            const calParams = new URLSearchParams({
                ...baseParams,
                month: dateState.month,
                year: dateState.year
            });

            // 1. Calendar
            const calRes = await fetch(`${API_URL}/calendar?${calParams}`);
            const calData = await calRes.json();

            // 2. Summary (KPI) Params
            const sumParams = new URLSearchParams(baseParams);

            // 2. Summary (KPI)
            // KPI depends on global filters only (Today is implied)
            const sumRes = await fetch(`${API_URL}/summary?${sumParams}`);
            const sumData = await sumRes.json();

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
                if (filters.dateType) listParams.set('dateType', filters.dateType);
                if (filters.search) listParams.set('search', filters.search);
            }

            const listRes = await fetch(`${API_URL}/enquiries?${listParams}`);
            const listData = await listRes.json();

            setData({
                calendar: calData,
                summary: sumData,
                table: listData
            });


        } catch (err) {
            console.error(err);
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
        const targetDate = new Date(dateState.selectedDate).toDateString(); // Compare dates properly

        const filtered = data.table.filter(row => {
            if (type === 'enquiry') return new Date(row.EnquiryDate).toDateString() === targetDate;
            if (type === 'due') return new Date(row.DueDate).toDateString() === targetDate;
            if (type === 'visit') return new Date(row.SiteVisitDate).toDateString() === targetDate;
            return true;
        });

        setFilteredTableData(filtered);
    }, [data.table, dateState.selectedDate, dateState.selectedType]);


    // Effects
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchData();
        }, 500); // Debounce API calls slightly
        return () => clearTimeout(timer);
    }, [dateState.month, dateState.year, dateState.selectedDate, filters.division, filters.salesEngineer, filters.mode, filters.fromDate, filters.toDate, filters.dateType, filters.search]);

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

            {/* Row 1: Global Filters (Horizontal Layout) */}
            <div className="flex-shrink-0 border-bottom bg-white px-3 py-2">
                <DashboardFilters
                    filters={filters}
                    setFilters={setFilters}
                    masters={masters}
                    horizontal={true}
                />
            </div>


            {/* Row 2: Content Area (Calendar + Table) */}
            <div className="flex-grow-1 dashboard-split-container" style={{ minHeight: 0 }}>
                {/* Calendar Panel - 40% */}
                <div className="dashboard-left-panel">
                    <div style={{ flex: 1, overflowY: 'auto' }} className="p-2 h-100">
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

                {/* Table Panel - 60% */}
                <div className="dashboard-right-panel">
                    <div style={{ flex: 1, overflow: 'hidden' }} className="p-2 h-100">
                        <EnquiryTable
                            data={filteredTableData}
                            onRowClick={handleRowClick}
                            filters={filters}
                            setFilters={handleTableFilterChange}
                            selectedDate={dateState.selectedDate}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
