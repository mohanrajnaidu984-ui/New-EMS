const { sql, connectDB } = require('./dbConfig');

async function getFullCalendar() {
    await connectDB();
    const request = new sql.Request();

    const month = 2;
    const year = 2026;
    request.input('month', sql.Int, month);
    request.input('year', sql.Int, year);
    request.input('today', sql.VarChar(10), '2026-03-04');

    const userName = 'S. Venkata Siril Reddy';
    const userEmail = 's.venkatasirilreddy@almoayyedcg.com';
    request.input('currentUserName', sql.NVarChar, userName);
    request.input('currentUserEmail', sql.NVarChar, userEmail);

    let baseFilter = ` AND (
        em.CreatedBy = @currentUserName
        OR EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = em.RequestNo AND cse.SEName = @currentUserName)
        OR EXISTS (
            SELECT 1 FROM EnquiryFor ef
            JOIN Master_EnquiryFor mef ON ef.ItemName = mef.ItemName
            WHERE ef.RequestNo = em.RequestNo
            AND (
                ',' + REPLACE(REPLACE(mef.CommonMailIds, ' ', ''), ';', ',') + ',' LIKE '%,' + @currentUserEmail + ',%'
                OR ',' + REPLACE(REPLACE(mef.CCMailIds, ' ', ''), ';', ',') + ',' LIKE '%,' + @currentUserEmail + ',%'
            )
        )
    ) `;

    const query = `
        WITH FilteredEnquiries AS (
            SELECT RequestNo, EnquiryDate, DueDate, SiteVisitDate, Status 
            FROM EnquiryMaster em
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
        ORDER BY Date ASC
    `;

    const result = await request.query(query);
    console.log("Monthly view:");
    console.table(result.recordset);
    process.exit(0);
}
getFullCalendar();
