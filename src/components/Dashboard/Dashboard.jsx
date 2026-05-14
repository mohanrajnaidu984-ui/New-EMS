import React, { useState, useEffect, useMemo, useRef } from 'react';
import Draggable from 'react-draggable';
import { useData } from '../../context/DataContext'; // Reuse for masters if needed
import { useAuth } from '../../context/AuthContext';
import DashboardFilters from './LeftPanel/DashboardFilters';
import CalendarView from './LeftPanel/CalendarView';
import CalendarBarChart from './LeftPanel/CalendarBarChart';
import EnquiryResultsTable from '../Enquiry/EnquiryResultsTable';
import DashboardQuoteSummaryTable from './DashboardQuoteSummaryTable';
import { attachCanEditFlag } from '../../utils/enquiryResultsHelpers';
import { sortEnquiryRows } from '../../utils/enquiryResultsSort';
import { resolveEffectiveSalesEngineerFilter } from '../../utils/dashboardCcAccess';
import './DashboardLayout.css';


const Dashboard = ({ onNavigate, onOpenEnquiry }) => { // Assuming these props passed from Main
    const { masters, dashboardRefreshCounter } = useData();
    const { currentUser } = useAuth();
    const dashboardModalDragRef = useRef(null);
    // Use relative path to leverage Vite proxy (targets port 5000), avoids port mismatch
    const API_URL = '/api/dashboard';

    // State
    const [dateState, setDateState] = useState(() => {
        const saved = localStorage.getItem('dashboard_dateState');
        const now = new Date();
        const mo = now.getMonth() + 1;
        const yr = now.getFullYear();
        if (saved) {
            try {
                const p = JSON.parse(saved);
                const legacyM = p.month ?? mo;
                const legacyY = p.year ?? yr;
                return {
                    leftCalendar: p.leftCalendar || { month: legacyM, year: legacyY },
                    rightCalendar: p.rightCalendar || { month: legacyM, year: legacyY },
                    selectedDate: p.selectedDate ?? null,
                    selectedType: p.selectedType ?? 'all',
                };
            } catch (e) {
                console.error("Failed to parse dashboard_dateState", e);
            }
        }
        return {
            leftCalendar: { month: mo, year: yr },
            rightCalendar: { month: mo, year: yr },
            selectedDate: null,
            selectedType: 'all',
        };
    });

    /** True when filters were loaded from localStorage on first mount (don’t clobber with role defaults). */
    const filtersHydratedFromStorageRef = useRef(false);
    /** Apply CC / SE role defaults only once when no saved filters (masters may refresh). */
    const dashboardRoleDefaultsAppliedRef = useRef(false);

    const [filters, setFilters] = useState(() => {
        const saved = localStorage.getItem('dashboard_filters');
        if (saved) {
            try {
                filtersHydratedFromStorageRef.current = true;
                return JSON.parse(saved);
            } catch (e) {
                console.error("Failed to parse dashboard_filters", e);
            }
        }
        return {
            division: 'All',
            salesEngineer: 'All',
            mode: 'future',
            dateType: 'Enquiry Date',
            status: 'All',
            search: ''
        };
    });

    // -- Persistence --
    useEffect(() => {
        localStorage.setItem('dashboard_dateState', JSON.stringify(dateState));
    }, [dateState]);

    useEffect(() => {
        localStorage.setItem('dashboard_filters', JSON.stringify(filters));
    }, [filters]);

    const [data, setData] = useState({
        calendarLeft: [],
        calendarTotalsLeft: null,
        calendarRight: [],
        calendarTotalsRight: null,
        summary: {},
        table: [],
    });

    const [filteredTableData, setFilteredTableData] = useState([]);

    const [loading, setLoading] = useState(false);

    const [resultsModalOpen, setResultsModalOpen] = useState(false);
    const [modalSortConfig, setModalSortConfig] = useState({ key: 'EnquiryDate', direction: 'desc' });
    const [quoteSummaryRows, setQuoteSummaryRows] = useState([]);
    /** Same as GET /calendar quoted total (EnquiryQuotes row count); not UI lead-line sum. */
    const [quoteSummaryCalendarQuotedCount, setQuoteSummaryCalendarQuotedCount] = useState(null);
    const [quoteSummaryLoading, setQuoteSummaryLoading] = useState(false);

    const showDashboardQuoteSummaryTable = useMemo(() => {
        if (!resultsModalOpen) return false;
        if (dateState.selectedType === 'quote') return true;
        if (filters.dateType === 'Quote Date' && !dateState.selectedDate) return true;
        return false;
    }, [resultsModalOpen, dateState.selectedType, dateState.selectedDate, filters.dateType]);

    /** Quote summary header totals: count only lines whose QuoteDate falls in this window (day chip or monthly Quote Date). */
    const quoteSummaryDateScope = useMemo(() => {
        if (!showDashboardQuoteSummaryTable) return null;
        const day = String(dateState.selectedDate || '').trim();
        if (day) return { day };
        const dt = (filters.dateType || '').toString();
        if ((dt === 'Quote Date' || dt === 'Quote date') && filters.fromDate && filters.toDate) {
            return { from: String(filters.fromDate).trim(), to: String(filters.toDate).trim() };
        }
        return null;
    }, [showDashboardQuoteSummaryTable, dateState.selectedDate, filters.dateType, filters.fromDate, filters.toDate]);

    const modalTableRows = useMemo(() => {
        const normalized = (filteredTableData || []).map((r) => ({
            ...r,
            DueOn: r.DueOn ?? r.DueDate,
            EnquiryDetails: r.EnquiryDetails ?? r.DetailsOfEnquiry,
            SourceOfInfo: r.SourceOfInfo ?? r.SourceOfEnquiry ?? r.ReceivedFrom,
        }));
        return attachCanEditFlag(normalized, currentUser);
    }, [filteredTableData, currentUser]);

    const modalSortedRows = useMemo(
        () => sortEnquiryRows(modalTableRows, modalSortConfig),
        [modalTableRows, modalSortConfig]
    );

    /** Sum of scoped quote rows in the modal list when filtering by Quote Date — only after the Quoted calendar chip (not Enquiry/Due/Lapsed/Visit). */
    const dashboardModalHeaderQuotedTotal = useMemo(() => {
        if (!resultsModalOpen || showDashboardQuoteSummaryTable) return undefined;
        if (dateState.selectedType !== 'quote') return undefined;
        const dt = (filters.dateType || '').toString();
        if (dt !== 'Quote Date' && dt !== 'Quote date') return undefined;
        return modalSortedRows.reduce(
            (s, r) => s + (Number.isFinite(Number(r.ScopedQuotesCount)) ? Number(r.ScopedQuotesCount) : 0),
            0,
        );
    }, [resultsModalOpen, showDashboardQuoteSummaryTable, dateState.selectedType, filters.dateType, modalSortedRows]);

    const handleModalSort = (key) => {
        let direction = 'asc';
        if (modalSortConfig.key === key && modalSortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setModalSortConfig({ key, direction });
    };

    const handleModalRowOpen = (reqNo) => {
        setResultsModalOpen(false);
        if (onOpenEnquiry) onOpenEnquiry(reqNo);
    };

    useEffect(() => {
        if (!showDashboardQuoteSummaryTable || !currentUser) {
            setQuoteSummaryRows([]);
            setQuoteSummaryCalendarQuotedCount(null);
            setQuoteSummaryLoading(false);
            return undefined;
        }
        const ac = new AbortController();
        (async () => {
            setQuoteSummaryLoading(true);
            try {
                const salesEngineerForApi = resolveEffectiveSalesEngineerFilter({
                    salesEngineer: filters.salesEngineer,
                    division: filters.division,
                    enqItems: masters.enqItems,
                    users: masters.users,
                    currentUserEmail: currentUser?.email || currentUser?.EmailId || '',
                });
                const listParams = new URLSearchParams({
                    division: filters.division,
                    salesEngineer: salesEngineerForApi,
                    mode: filters.mode,
                    userEmail: currentUser.email || currentUser.EmailId || '',
                    userName: currentUser.name || '',
                    userRole: currentUser.role || currentUser.Roles || 'User',
                });
                if (dateState.selectedDate) {
                    listParams.set('date', dateState.selectedDate);
                } else {
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
                const res = await fetch(`${API_URL}/quote-summary-rows?${listParams}`, {
                    signal: ac.signal,
                    cache: 'no-store',
                });
                const data = res.ok ? await res.json() : null;
                if (!ac.signal.aborted) {
                    if (Array.isArray(data)) {
                        setQuoteSummaryRows(data);
                        setQuoteSummaryCalendarQuotedCount(null);
                    } else {
                        setQuoteSummaryRows(Array.isArray(data?.rows) ? data.rows : []);
                        setQuoteSummaryCalendarQuotedCount(
                            typeof data?.calendarQuotedCount === 'number' ? data.calendarQuotedCount : null,
                        );
                    }
                }
            } catch (e) {
                if (e?.name !== 'AbortError') console.error('Dashboard quote-summary fetch:', e);
                if (!ac.signal.aborted) {
                    setQuoteSummaryRows([]);
                    setQuoteSummaryCalendarQuotedCount(null);
                }
            } finally {
                if (!ac.signal.aborted) setQuoteSummaryLoading(false);
            }
        })();
        return () => ac.abort();
    }, [
        showDashboardQuoteSummaryTable,
        currentUser,
        filters.division,
        filters.salesEngineer,
        filters.fromDate,
        filters.toDate,
        filters.dateType,
        filters.mode,
        filters.status,
        filters.search,
        dateState.selectedDate,
        masters.enqItems,
        masters.users,
        dashboardRefreshCounter,
    ]);

    useEffect(() => {
        if (currentUser && masters.enquiryFor && masters.enqItems) {
            const roleString = currentUser.role || currentUser.Roles || '';
            const userRoles = typeof roleString === 'string'
                ? roleString.split(',').map(r => r.trim().toLowerCase())
                : (Array.isArray(roleString) ? roleString.map(r => r.trim().toLowerCase()) : []);
            const isAdmin = userRoles.includes('admin') || userRoles.includes('system');

            if (!isAdmin && !filtersHydratedFromStorageRef.current) {
                if (dashboardRoleDefaultsAppliedRef.current) return;
                dashboardRoleDefaultsAppliedRef.current = true;

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

                // If the user email exists in Master_EnquiryFor.CCMailIds,
                // division dropdown should show only his DepartmentName.
                const ccDepartmentName = (() => {
                    const ccItem = (masters.enqItems || []).find(item => {
                        const cc = String(item.CCMailIds || '').toLowerCase().split(/[,;]/).map(e => e.trim()).filter(Boolean);
                        return cc.includes(userEmail);
                    });
                    return ccItem?.DepartmentName ? String(ccItem.DepartmentName).trim() : '';
                })();

                setFilters(prev => ({
                    ...prev,
                    division: isCCUser && ccDepartmentName ? ccDepartmentName : 'All',
                    salesEngineer: isCCUser ? 'All' : (currentUser.name || 'All')
                }));
            }
        }
    }, [currentUser, masters.enqItems, masters.enquiryFor]);

    // Fetch calendars + summary always; enquiry list only when the results modal is open (heavy query).
    const fetchData = async (signal, includeEnquiries) => {
        setLoading(true);
        try {
            // preparing params
            // CC coordinator display names → treat as "All SEs" for the division (see dashboardCcAccess.js)
            const salesEngineerForApi = resolveEffectiveSalesEngineerFilter({
                salesEngineer: filters.salesEngineer,
                division: filters.division,
                enqItems: masters.enqItems,
                users: masters.users,
                currentUserEmail: currentUser?.email || currentUser?.EmailId || '',
            });
            const baseParams = {
                division: filters.division,
                salesEngineer: salesEngineerForApi,
            };

            // Add User Context for Access Control
            if (currentUser) {
                baseParams.userEmail = currentUser.email || currentUser.EmailId || '';
                baseParams.userName = currentUser.name || '';
                // Handle different role structures
                baseParams.userRole = currentUser.role || currentUser.Roles || 'User';
            }

            const normalizeCalendarPayload = (raw) => {
                if (raw == null) return { daily: [], totals: null };
                return {
                    daily: Array.isArray(raw) ? raw : (raw?.daily || []),
                    totals: Array.isArray(raw) ? null : raw?.totals ?? null,
                };
            };

            const calLeftParams = new URLSearchParams({
                ...baseParams,
                month: dateState.leftCalendar.month,
                year: dateState.leftCalendar.year,
            });
            const calRightParams = new URLSearchParams({
                ...baseParams,
                month: dateState.rightCalendar.month,
                year: dateState.rightCalendar.year,
            });

            const sumParams = new URLSearchParams(baseParams);

            const listParams = new URLSearchParams({
                ...baseParams,
                mode: filters.mode,
            });

            if (dateState.selectedDate) {
                listParams.set('date', dateState.selectedDate);
            } else {
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

            const fetchOpts = signal ? { signal } : {};

            const calFetches = [
                fetch(`${API_URL}/calendar?${calLeftParams}`, fetchOpts),
                fetch(`${API_URL}/calendar?${calRightParams}`, fetchOpts),
                fetch(`${API_URL}/summary?${sumParams}`, fetchOpts),
            ];

            if (includeEnquiries) {
                calFetches.push(fetch(`${API_URL}/enquiries?${listParams}`, fetchOpts));
            }

            const responses = await Promise.all(calFetches);

            if (signal?.aborted) return;

            const calLeftRes = responses[0];
            const calRightRes = responses[1];
            const sumRes = responses[2];
            const listRes = includeEnquiries ? responses[3] : null;

            const calLeftParsed = calLeftRes.ok ? await calLeftRes.json() : [];
            const calRightParsed = calRightRes.ok ? await calRightRes.json() : [];
            const sumParsed = sumRes.ok ? await sumRes.json() : {};

            let listData = [];
            if (includeEnquiries && listRes) {
                if (!listRes.ok) {
                    console.error('Enquiry API Failed:', listRes.status, listRes.statusText);
                } else {
                    const raw = await listRes.json();
                    listData = Array.isArray(raw) ? raw : [];
                }
            }

            if (signal?.aborted) return;

            const leftCal = normalizeCalendarPayload(calLeftParsed);
            const rightCal = normalizeCalendarPayload(calRightParsed);

            setData({
                calendarLeft: leftCal.daily,
                calendarTotalsLeft: leftCal.totals,
                calendarRight: rightCal.daily,
                calendarTotalsRight: rightCal.totals,
                summary: sumParsed || {},
                table: includeEnquiries ? listData : [],
            });
        } catch (err) {
            if (err?.name === 'AbortError') return;
            console.error('Dashboard Fetch Error:', err);
            setData({
                calendarLeft: [],
                calendarTotalsLeft: null,
                calendarRight: [],
                calendarTotalsRight: null,
                summary: {},
                table: [],
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

        /** Match calendar day using local date (API UTC midnight caused UTC ISO compare to drop every row). */
        const localYmd = (dateVal) => {
            if (!dateVal) return null;
            const d = new Date(dateVal);
            if (Number.isNaN(d.getTime())) return null;
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        const dueVal = (row) => row.DueDate ?? row.DueOn;

        /** YYYY-MM-DD for "today" in local timezone (matches calendar cell dates). */
        const todayLocalYmd = () => {
            const d = new Date();
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };
        const quotedLikeStatuses = new Set(['Quote', 'Won', 'Lost', 'Quoted', 'Submitted']);

        const filtered = data.table.filter((row) => {
            const compareDate = (dateVal) => localYmd(dateVal) === targetDate;

            if (type === 'enquiry') return compareDate(row.EnquiryDate);
            if (type === 'due') {
                if (!compareDate(dueVal(row))) return false;
                const dueY = localYmd(dueVal(row));
                if (!dueY || dueY > todayLocalYmd()) return false;
                if (Number(row.HasQuoteInScope) === 1) return false;
                if (row.Status && quotedLikeStatuses.has(row.Status)) return false;
                return true;
            }
            if (type === 'visit') return compareDate(row.SiteVisitDate);
            if (type === 'lapsed') {
                const isDueOnDate = compareDate(dueVal(row));
                const isLapsedStatus = !row.Status || !['Quote', 'Won', 'Lost', 'Quoted', 'Submitted'].includes(row.Status);
                return isDueOnDate && isLapsedStatus;
            }
            if (type === 'quote') {
                return compareDate(row.QuoteDate);
            }
            return true;
        });

        setFilteredTableData(filtered);
    }, [data.table, dateState.selectedDate, dateState.selectedType]);

    useEffect(() => {
        if (!resultsModalOpen) return undefined;
        const onKeyDown = (e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            setResultsModalOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [resultsModalOpen]);

    // Effects
    useEffect(() => {
        // Clear specific date selection when global filters change (Dropdowns, Buttons, Search)
        // This resolves the issue where clicking "This Month" wouldn't override a selected calendar date.
        if (dateState.selectedDate) {
            setDateState(prev => ({ ...prev, selectedDate: null, selectedType: 'all' }));
        }
    }, [filters]);

    useEffect(() => {
        const ac = new AbortController();
        const timer = setTimeout(() => {
            fetchData(ac.signal, resultsModalOpen);
        }, 120); // Short debounce — skip heavy /enquiries until the results modal is open
        return () => {
            clearTimeout(timer);
            ac.abort();
        };
    }, [
        dateState.leftCalendar.month,
        dateState.leftCalendar.year,
        dateState.rightCalendar.month,
        dateState.rightCalendar.year,
        dateState.selectedDate,
        filters.division,
        filters.salesEngineer,
        filters.mode,
        filters.fromDate,
        filters.toDate,
        filters.dateType,
        filters.search,
        filters.status,
        dashboardRefreshCounter,
        resultsModalOpen,
    ]);

    // Handlers
    const handleLeftCalendarMonthChange = (m, y) => {
        setDateState((prev) => ({ ...prev, leftCalendar: { month: m, year: y } }));
    };

    const handleRightCalendarMonthChange = (m, y) => {
        setDateState((prev) => ({ ...prev, rightCalendar: { month: m, year: y } }));
    };

    const handleDateClick = (dateStr, type = 'all') => {
        setDateState(prev => ({
            ...prev,
            selectedDate: dateStr,
            selectedType: type
        }));
        setResultsModalOpen(true);
    };

    const handleBarClick = (type, source = 'left') => {
        const cal = source === 'right' ? dateState.rightCalendar : dateState.leftCalendar;
        const y = cal.year;
        const m = cal.month;
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
        setResultsModalOpen(true);
    };

    return (
        <div
            className="container-fluid dashboard-page-root"
            style={{ height: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column', padding: 0 }}
        >







            {/* Two equal calendar dashboards; enquiry list opens in a modal (Search Enquiry–style grid) */}
            <div className="flex-grow-1 d-flex flex-column" style={{ minHeight: 0 }}>
                <div className="dashboard-split-container dashboard-calendars-row">
                    <div className="dashboard-half-panel">
                        <div className="px-3 py-2 dashboard-filter-bar-row dashboard-filter-bar-strip">
                            <DashboardFilters
                                filters={filters}
                                setFilters={setFilters}
                                masters={masters}
                                viewMode="division_se"
                            />
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                            <div className="dashboard-calendar-gutter d-flex flex-column flex-grow-1" style={{ minHeight: 0, overflow: 'hidden' }}>
                                <div className="dashboard-calendar-combined d-flex flex-column flex-grow-1">
                                    <CalendarBarChart
                                        data={data.calendarLeft}
                                        monthlyTotals={data.calendarTotalsLeft}
                                        onBarClick={(t) => handleBarClick(t, 'left')}
                                    />
                                    <div className="d-flex flex-column flex-grow-1" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                                        <CalendarView
                                            month={dateState.leftCalendar.month}
                                            year={dateState.leftCalendar.year}
                                            onMonthChange={handleLeftCalendarMonthChange}
                                            data={data.calendarLeft}
                                            selectedDate={dateState.selectedDate}
                                            selectedType={dateState.selectedType}
                                            onDateClick={handleDateClick}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="dashboard-half-panel">
                        <div className="px-3 py-2 dashboard-filter-bar-row dashboard-filter-bar-strip">
                            <DashboardFilters
                                filters={filters}
                                setFilters={setFilters}
                                masters={masters}
                                viewMode="search_date"
                            />
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                            <div className="dashboard-calendar-gutter d-flex flex-column flex-grow-1" style={{ minHeight: 0, overflow: 'hidden' }}>
                                <div className="dashboard-calendar-combined d-flex flex-column flex-grow-1">
                                    <CalendarBarChart
                                        data={data.calendarRight}
                                        monthlyTotals={data.calendarTotalsRight}
                                        onBarClick={(t) => handleBarClick(t, 'right')}
                                    />
                                    <div className="d-flex flex-column flex-grow-1" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                                        <CalendarView
                                            month={dateState.rightCalendar.month}
                                            year={dateState.rightCalendar.year}
                                            onMonthChange={handleRightCalendarMonthChange}
                                            data={data.calendarRight}
                                            selectedDate={dateState.selectedDate}
                                            selectedType={dateState.selectedType}
                                            onDateClick={handleDateClick}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {resultsModalOpen && (
                <div
                    className="modal show d-block"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="dashboard-enquiries-modal-title"
                    style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10050 }}
                    onClick={() => setResultsModalOpen(false)}
                >
                    <Draggable
                        nodeRef={dashboardModalDragRef}
                        handle=".dashboard-enquiries-modal-drag-handle"
                        cancel=".btn-close, .btn-close-white, button"
                        enableUserSelectHack={false}
                    >
                        <div
                            ref={dashboardModalDragRef}
                            className="modal-dialog modal-xl"
                            onClick={(e) => e.stopPropagation()}
                            style={{ maxWidth: 'min(96vw, 1320px)', margin: '2vh auto' }}
                        >
                        <div className="modal-content border-0 shadow-lg d-flex flex-column" style={{ maxHeight: '92vh' }}>
                            <div
                                className="modal-header text-white flex-shrink-0 border-0 align-items-center dashboard-enquiries-modal-header-compact"
                                style={{
                                    paddingTop: '0.25rem',
                                    paddingBottom: '0.25rem',
                                    paddingLeft: '0.5rem',
                                    paddingRight: '0.5rem',
                                    minHeight: 0,
                                    backgroundColor: '#4169e1',
                                }}
                            >
                                <div
                                    className="dashboard-enquiries-modal-drag-handle modal-title d-flex align-items-center mb-0 flex-grow-1"
                                    id="dashboard-enquiries-modal-title"
                                    style={{ cursor: 'grab', fontSize: '0.75rem', lineHeight: 1.2 }}
                                >
                                    <i className="bi bi-grip-vertical me-1 opacity-75" aria-hidden />
                                    <span className="visually-hidden">Enquiry results table</span>
                                    {loading ? (
                                        <span className="small fw-normal opacity-75">Loading…</span>
                                    ) : null}
                                </div>
                                <button
                                    type="button"
                                    className="btn-close btn-close-white"
                                    style={{ padding: '0.3rem', transform: 'scale(0.85)' }}
                                    aria-label="Close"
                                    onClick={() => setResultsModalOpen(false)}
                                />
                            </div>
                            {/* Avoid modal-dialog-scrollable + nested flex — it collapsed the table to zero height */}
                            <div
                                className="modal-body p-2 dashboard-enquiries-modal-body d-flex flex-column"
                                style={{
                                    overflow: 'hidden',
                                    maxHeight: 'calc(92vh - 32px)',
                                    minHeight: '260px',
                                }}
                            >
                                {showDashboardQuoteSummaryTable
                                    ? quoteSummaryLoading && quoteSummaryRows.length === 0 && (
                                          <div className="text-center text-muted py-3 small flex-shrink-0">Loading quote summary…</div>
                                      )
                                    : loading &&
                                      modalSortedRows.length === 0 && (
                                          <div className="text-center text-muted py-3 small flex-shrink-0">Loading enquiries…</div>
                                      )}
                                {/* Table inner layout uses flex:1 + minHeight:0; needs a parent with real height or the scroll area collapses to blank */}
                                <div
                                    className="d-flex flex-column flex-grow-1"
                                    style={{ minHeight: 0, height: 'min(72vh, 780px)' }}
                                >
                                    {showDashboardQuoteSummaryTable ? (
                                        <DashboardQuoteSummaryTable
                                            rows={quoteSummaryRows}
                                            onOpenEnquiry={handleModalRowOpen}
                                            emptyLabel="No quoted enquiries for this selection."
                                            quoteDateScope={quoteSummaryDateScope}
                                            calendarAlignedQuoteTotal={quoteSummaryCalendarQuotedCount}
                                        />
                                    ) : (
                                        <EnquiryResultsTable
                                            sortedRows={modalSortedRows}
                                            sortConfig={modalSortConfig}
                                            onSort={handleModalSort}
                                            masters={masters}
                                            onRowOpen={handleModalRowOpen}
                                            emptyLabel="No enquiries for this selection."
                                            headerQuotedTotal={dashboardModalHeaderQuotedTotal}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                        </div>
                    </Draggable>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
