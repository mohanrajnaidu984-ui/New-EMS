const { sql, connectDB } = require('./dbConfig');

async function checkCalendar() {
    await connectDB();
    const request = new sql.Request();

    // Simulate what the dashboard API does
    const month = 2;
    const year = 2026;
    const salesEngineer = 'S. Venkata Siril Reddy';
    request.input('month', sql.Int, month);
    request.input('year', sql.Int, year);
    request.input('salesEngineer', sql.NVarChar, salesEngineer);

    let baseFilter = ` AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = em.RequestNo AND cse.SEName = @salesEngineer) `;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    request.input('today', sql.VarChar(10), todayStr);

    const query = `
        WITH FilteredEnquiries AS (
            SELECT RequestNo, EnquiryDate, DueDate, SiteVisitDate, Status 
            FROM EnquiryMaster em
            WHERE 1=1 ${baseFilter}
        ),
        FilteredQuotes AS (
            SELECT eq.CreatedAt, eq.QuoteDate, eq.RequestNo
            FROM EnquiryQuotes eq
            JOIN EnquiryMaster em ON eq.RequestNo = em.RequestNo
            WHERE 1=1 ${baseFilter}
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
            UNION ALL
            SELECT MIN(ISNULL(QuoteDate, CreatedAt)) as DateVal, 'Quote' as Type 
            FROM FilteredQuotes 
            WHERE MONTH(ISNULL(QuoteDate, CreatedAt)) = @month AND YEAR(ISNULL(QuoteDate, CreatedAt)) = @year
            GROUP BY RequestNo, CAST(ISNULL(QuoteDate, CreatedAt) AS DATE)
        )
        SELECT 
            CONVERT(VARCHAR(10), DateVal, 23) as Date,
            SUM(CASE WHEN Type = 'Enquiry' THEN 1 ELSE 0 END) as Enquiries,
            SUM(CASE WHEN Type = 'Due' THEN 1 ELSE 0 END) as Due,
            SUM(CASE WHEN Type = 'Lapsed' THEN 1 ELSE 0 END) as Lapsed,
            SUM(CASE WHEN Type = 'SiteVisit' THEN 1 ELSE 0 END) as SiteVisits,
            SUM(CASE WHEN Type = 'Quote' THEN 1 ELSE 0 END) as Quoted
        FROM Dates
        WHERE DateVal IS NOT NULL
        GROUP BY CONVERT(VARCHAR(10), DateVal, 23)
    `;

    const result = await request.query(query);
    console.table(result.recordset);
    process.exit(0);
}
checkCalendar();
