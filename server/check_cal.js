const { sql, connectDB } = require('./dbConfig');

async function checkCal() {
    try {
        await connectDB();
        const today = new Date();
        const month = 12; // Hardcode to Dec as per usage
        const year = 2025;

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
        console.log('CAL_START');
        console.log(JSON.stringify(calendar.recordset));
        console.log('CAL_END');
    } catch (err) { console.error(err); } finally { process.exit(); }
}
checkCal();
