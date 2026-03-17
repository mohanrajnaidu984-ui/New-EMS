const { sql, connectDB } = require('./dbConfig');

async function testCalendar() {
    await connectDB();
    const request = new sql.Request();

    request.input('month', sql.Int, 2);
    request.input('year', sql.Int, 2026);

    // access control simulation from dashboard.js
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
        SELECT RequestNo, EnquiryDate, DueDate, SiteVisitDate, Status 
        FROM EnquiryMaster em
        WHERE RequestNo = '11' ${baseFilter}
    `;

    const result = await request.query(query);
    console.log("Found for user:", result.recordset);
    process.exit(0);
}
testCalendar();
