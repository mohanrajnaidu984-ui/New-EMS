import React, { useState, useEffect } from 'react';
import { FileText, Users, CheckCircle, Clock, TrendingUp, Mail, Phone } from 'lucide-react';
import { useData } from '../../context/DataContext';
import DashboardLayout from './DashboardLayout';
import KPICard from './KPICard';
import GaugeChart from './GaugeChart';
import StatBarChart from './StatBarChart';
import CalendarView from './CalendarView';

const Dashboard = () => {
    const { enquiries } = useData();

    // Date State
    const today = new Date();
    const [day, setDay] = useState(today.getDate().toString());
    const [month, setMonth] = useState(today.toLocaleString('default', { month: 'short' }));
    const [year, setYear] = useState(today.getFullYear().toString());

    // Dashboard Data State
    const [kpiData, setKpiData] = useState([]);
    const [gaugeData, setGaugeData] = useState([]);
    const [barDataTrend, setBarDataTrend] = useState([]);
    const [barDataSource, setBarDataSource] = useState([]);
    const [calendarData, setCalendarData] = useState({});

    const months = {
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
        'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    };

    const calculateStats = () => {
        const selectedMonthNum = months[month];
        const selectedYear = year;
        const selectedDay = day.padStart(2, '0');
        const fullDateStr = `${selectedYear}-${selectedMonthNum}-${selectedDay}`;

        const allEnquiries = Object.values(enquiries);

        // 1. KPIs
        const enquiriesToday = allEnquiries.filter(e => e.EnquiryDate === fullDateStr).length;
        const siteVisitsToday = allEnquiries.filter(e => e.SiteVisitDate === fullDateStr).length;
        const dueToday = allEnquiries.filter(e => e.DueOn === fullDateStr).length;

        // Pending Quotes: Status is Pricing or Quote
        const pendingQuotes = allEnquiries.filter(e => ['Pricing', 'Quote'].includes(e.Status)).length;

        // Orders Won (Month): Status is Reports (Closed) in selected Month/Year
        const ordersWon = allEnquiries.filter(e =>
            e.Status === 'Reports' &&
            e.EnquiryDate?.startsWith(`${selectedYear}-${selectedMonthNum}`)
        ).length;

        // Total Enquiries (Year)
        const totalEnquiriesYear = allEnquiries.filter(e => e.EnquiryDate?.startsWith(selectedYear)).length;

        setKpiData([
            { title: 'Enquiries Today', main: enquiriesToday, sub: 'New', color: 'kpi-yellow' },
            { title: 'Site Visits Today', main: siteVisitsToday, sub: 'Scheduled', color: 'kpi-yellow' },
            { title: 'Due Today', main: dueToday, sub: 'Deadlines', color: 'kpi-green' },
            { title: 'Pending Quotes', main: pendingQuotes, sub: 'Processing', color: 'kpi-orange' },
            { title: 'Orders Won (Month)', main: ordersWon, sub: 'Converted', color: 'kpi-orange' },
            { title: 'Total Enquiries (Year)', main: totalEnquiriesYear, sub: 'YTD', color: 'kpi-blue' },
            { title: 'Total Revenue (Year)', main: 'N/A', sub: 'YTD', color: 'kpi-blue' }, // No revenue field yet
        ]);

        // 2. Gauge Charts (Mock calculations for now as we lack specific fields)
        const total = allEnquiries.length || 1;
        const conversionRate = Math.round((ordersWon / total) * 100) || 0;

        setGaugeData([
            { value: conversionRate, label: 'Conversion Rate' },
            { value: 90, label: 'Response Target' }, // Mock
            { value: 45, label: 'Win Rate' }, // Mock
            { value: 80, label: 'Customer Sat.' }, // Mock
            { value: 20, label: 'Lost Rate' }, // Mock
            { value: 12, label: 'Active SEs' }, // Mock
            { value: 5, label: 'Pending Approvals' }, // Mock
        ]);

        // 3. Bar Charts
        // Trend: Daily count for selected month
        const daysInMonth = new Date(selectedYear, parseInt(selectedMonthNum), 0).getDate();
        const trendData = Array.from({ length: daysInMonth }, (_, i) => {
            const d = (i + 1).toString().padStart(2, '0');
            const dateStr = `${selectedYear}-${selectedMonthNum}-${d}`;
            return {
                name: i + 1,
                value: allEnquiries.filter(e => e.EnquiryDate === dateStr).length
            };
        });
        setBarDataTrend(trendData);

        // Source: Count by SourceOfInfo
        const sourceCounts = {};
        allEnquiries.forEach(e => {
            const src = e.SourceOfInfo || 'Unknown';
            sourceCounts[src] = (sourceCounts[src] || 0) + 1;
        });
        const sourceData = Object.keys(sourceCounts).map(key => ({ name: key, value: sourceCounts[key] }));
        setBarDataSource(sourceData);

        // 4. Calendar Data
        const calData = {};
        for (let i = 1; i <= daysInMonth; i++) {
            const d = i.toString().padStart(2, '0');
            const dateStr = `${selectedYear}-${selectedMonthNum}-${d}`;
            const newCount = allEnquiries.filter(e => e.EnquiryDate === dateStr).length;
            const dueCount = allEnquiries.filter(e => e.DueOn === dateStr).length;
            calData[i] = {
                main: `New: ${newCount}`,
                sub: `Due: ${dueCount}`
            };
        }
        setCalendarData(calData);
    };

    // Initial Load
    useEffect(() => {
        calculateStats();
    }, [enquiries]); // Recalculate when enquiries change

    const handleGenerate = () => {
        calculateStats();
    };

    return (
        <DashboardLayout>
            {/* Header */}
            <div className="dashboard-header">
                <div className="dashboard-title">
                    <FileText size={24} color="#ffd700" />
                    ENQUIRY MANAGEMENT DASHBOARD
                </div>
                <div className="dashboard-controls">
                    <div className="control-group">
                        <span className="control-label">Day</span>
                        <input
                            type="text"
                            className="control-input"
                            value={day}
                            onChange={(e) => setDay(e.target.value)}
                            style={{ width: '40px' }}
                        />
                        <span className="control-label">Month</span>
                        <select
                            className="control-input"
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            style={{ width: '60px' }}
                        >
                            {Object.keys(months).map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <span className="control-label">Year</span>
                        <input
                            type="text"
                            className="control-input"
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            style={{ width: '60px' }}
                        />
                    </div>
                    <button className="generate-btn" onClick={handleGenerate}>Generate</button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="kpi-grid">
                {kpiData.map((kpi, index) => (
                    <KPICard
                        key={index}
                        title={kpi.title}
                        mainValue={kpi.main}
                        subValue={kpi.sub}
                        footer="EMS Metrics"
                        colorClass={kpi.color}
                    />
                ))}
            </div>

            {/* Gauge Charts */}
            <div className="gauge-grid">
                {gaugeData.map((gauge, index) => (
                    <GaugeChart
                        key={index}
                        value={gauge.value}
                        subLabel={gauge.label}
                    />
                ))}
            </div>

            {/* Main Content Grid */}
            <div className="main-content-grid">
                {/* Left Column: Calendar */}
                <div>
                    <div style={{ marginBottom: '10px', color: '#333', textAlign: 'center', fontWeight: 'bold' }}>
                        {month}/{year}
                    </div>
                    <CalendarView month={month} year={year} data={calendarData} />
                </div>

                {/* Right Column: Charts */}
                <div className="charts-column">
                    <StatBarChart
                        data={barDataTrend}
                        color="#00bfff"
                        title={`${month}-${year.slice(2)} ENQUIRY TREND (DAILY)`}
                        icon={<TrendingUp size={16} color="#00bfff" />}
                    />
                    <StatBarChart
                        data={barDataSource}
                        color="#32cd32"
                        title={`${month}-${year.slice(2)} ENQUIRIES BY SOURCE`}
                        icon={<Mail size={16} color="#32cd32" />}
                    />
                    <StatBarChart
                        data={barDataTrend}
                        color="#ff8c00"
                        title={`${month}-${year.slice(2)} SITE VISITS SCHEDULED`}
                        icon={<Users size={16} color="#ff8c00" />}
                    />
                </div>
            </div>
        </DashboardLayout>
    );
};

export default Dashboard;
