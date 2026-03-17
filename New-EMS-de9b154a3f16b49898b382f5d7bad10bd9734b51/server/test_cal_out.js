const { sql, connectDB } = require('./dbConfig');

async function testCalendarOutput() {
    await connectDB();
    const request = new sql.Request();

    request.input('month', sql.Int, 2);
    request.input('year', sql.Int, 2026);
    request.input('today', sql.VarChar(10), '2026-03-04'); // user is in march currently

    const query = `
        WITH FilteredEnquiries AS (
            SELECT RequestNo, EnquiryDate, DueDate, SiteVisitDate, Status 
            FROM EnquiryMaster em
            WHERE RequestNo = '11'
        ),
        Dates AS (
            SELECT EnquiryDate as DateVal, 'Enquiry' as Type FROM FilteredEnquiries WHERE MONTH(EnquiryDate) = @month AND YEAR(EnquiryDate) = @year
            UNION ALL
            SELECT DueDate as DateVal, 'Due' as Type FROM FilteredEnquiries WHERE MONTH(DueDate) = @month AND YEAR(DueDate) = @year
            UNION ALL
            SELECT DueDate as DateVal, 'Lapsed' as Type 
            FROM FilteredEnquiries 
            WHERE MONTH(DueDate) = @month AND YEAR(DueDate) = @year
            AND CAST(DueDate AS DATE) < CAST(@today AS DATE)
            AND (Status IS NULL OR Status NOT IN ('Quote', 'Won', 'Lost', 'Quoted', 'Submitted'))
            UNION ALL
            SELECT SiteVisitDate as DateVal, 'SiteVisit' as Type FROM FilteredEnquiries WHERE MONTH(SiteVisitDate) = @month AND YEAR(SiteVisitDate) = @year
        )
        SELECT 
            CONVERT(VARCHAR(10), DateVal, 23) as Date,
            SUM(CASE WHEN Type = 'Enquiry' THEN 1 ELSE 0 END) as Enquiries,
            SUM(CASE WHEN Type = 'Due' THEN 1 ELSE 0 END) as Due,
            SUM(CASE WHEN Type = 'Lapsed' THEN 1 ELSE 0 END) as Lapsed,
            SUM(CASE WHEN Type = 'SiteVisit' THEN 1 ELSE 0 END) as SiteVisits
        FROM Dates
        WHERE DateVal IS NOT NULL
        GROUP BY CONVERT(VARCHAR(10), DateVal, 23)
    `;

    const result = await request.query(query);
    console.log("Calendar days:", result.recordset);
    process.exit(0);
}
testCalendarOutput();
