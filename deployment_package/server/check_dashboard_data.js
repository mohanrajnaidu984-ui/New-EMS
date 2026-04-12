const { sql, connectDB } = require('./dbConfig');

async function checkDashboardData() {
    try {
        await connectDB();
        console.log('Connected to Database. Fetching Dashboard Metrics...');

        // 1. KPI Summary (Today)
        const summaryQuery = `
            SELECT
                (SELECT COUNT(*) FROM EnquiryMaster WHERE CAST(EnquiryDate AS DATE) = CAST(GETDATE() AS DATE)) as EnquiriesToday,
                (SELECT COUNT(*) FROM EnquiryMaster WHERE CAST(DueDate AS DATE) = CAST(GETDATE() AS DATE)) as DueToday,
                (SELECT COUNT(*) FROM EnquiryMaster WHERE CAST(DueDate AS DATE) > CAST(GETDATE() AS DATE)) as UpcomingDues
        `;
        const summary = await sql.query(summaryQuery);
        console.log('\n--- KPI Summary ---');
        console.log(JSON.stringify(summary.recordset, null, 2));

        // 2. Calendar Data (Current Month)
        const today = new Date();
        const month = today.getMonth() + 1;
        const year = today.getFullYear();

        const calendarQuery = `
            WITH FilteredEnquiries AS (
                SELECT RequestNo, EnquiryDate, DueDate, SiteVisitDate 
                FROM EnquiryMaster
            ),
            Dates AS (
                SELECT EnquiryDate as DateVal, 'Enquiry' as Type FROM FilteredEnquiries WHERE MONTH(EnquiryDate) = ${month} AND YEAR(EnquiryDate) = ${year}
                UNION ALL
                SELECT DueDate as DateVal, 'Due' as Type FROM FilteredEnquiries WHERE MONTH(DueDate) = ${month} AND YEAR(DueDate) = ${year}
                UNION ALL
                SELECT SiteVisitDate as DateVal, 'SiteVisit' as Type FROM FilteredEnquiries WHERE MONTH(SiteVisitDate) = ${month} AND YEAR(SiteVisitDate) = ${year}
            )
            SELECT 
                CAST(DateVal as DATE) as Date,
                SUM(CASE WHEN Type = 'Enquiry' THEN 1 ELSE 0 END) as Enquiries,
                SUM(CASE WHEN Type = 'Due' THEN 1 ELSE 0 END) as Due,
                SUM(CASE WHEN Type = 'SiteVisit' THEN 1 ELSE 0 END) as SiteVisits
            FROM Dates
            WHERE DateVal IS NOT NULL
            GROUP BY CAST(DateVal as DATE)
            ORDER BY Date
        `;
        const calendar = await sql.query(calendarQuery);
        console.log(`\n--- Calendar Data for ${month}/${year} ---`);
        console.log(JSON.stringify(calendar.recordset, null, 2));

        // 3. Table Data (Default Mode: Upcoming)
        const tableQuery = `
            SELECT TOP 5
                RequestNo,
                Status,
                DueDate,
                SiteVisitDate,
                EnquiryDetails
            FROM EnquiryMaster 
            WHERE 
                CAST(DueDate AS DATE) >= CAST(GETDATE() AS DATE) OR
                CAST(SiteVisitDate AS DATE) >= CAST(GETDATE() AS DATE)
            ORDER BY DueDate ASC
        `;
        const table = await sql.query(tableQuery);
        console.log('\n--- Enquiry Table (Top 5 Upcoming) ---');
        console.log(JSON.stringify(table.recordset, null, 2));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkDashboardData();
