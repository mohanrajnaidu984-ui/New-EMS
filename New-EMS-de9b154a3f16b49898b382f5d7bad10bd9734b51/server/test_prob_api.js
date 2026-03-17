const { sql } = require('./dbConfig');

async function test() {
    try {
        let query = `
            SELECT
                LTRIM(RTRIM(E.RequestNo)) as RequestNo, E.ProjectName, E.EnquiryDate, E.Status,
                E.Probability, E.ProbabilityOption, E.ExpectedOrderDate, E.ProbabilityRemarks
            FROM EnquiryMaster E
            WHERE 1 = 1
                AND (
                    (E.Status IS NULL OR E.Status = '' OR E.Status IN ('Pending', 'Enquiry', 'Priced', 'Estimated', 'Quote', 'Quoted'))
                    OR (E.Status IN('FollowUp', 'Follow-up') AND (E.ProbabilityOption IS NULL OR E.ProbabilityOption = ''))
                )
                AND (E.Status NOT IN('Won', 'Lost', 'Cancelled', 'OnHold', 'On Hold', 'Retendered') OR E.Status IS NULL OR E.Status = '')
                AND EXISTS(
                    SELECT 1 FROM EnquiryQuotes Q 
                    WHERE LTRIM(RTRIM(Q.RequestNo)) = LTRIM(RTRIM(E.RequestNo)) 
                    AND DATEDIFF(day, Q.QuoteDate, GETDATE()) >= 0
                )
        `;

        const dbConfig = require('./dbConfig');
        await dbConfig.connectDB();
        const request = new dbConfig.sql.Request();
        const now = new Date();
        request.input('userEmail', sql.NVarChar, 'mohan.naidu@almoayyedcg.com');
        request.input('userDepartment', sql.NVarChar, '');
        request.input('now', sql.DateTime, now);

        const result = await request.query(query.replace(/GETDATE\(\)/g, '@now'));
        console.log("Count:", result.recordset.length);
        console.dir(result.recordset, { depth: null });

        // Let's also run without the EXISTS clause to see if that's filtering it out
        let query2 = `
            SELECT
                LTRIM(RTRIM(E.RequestNo)) as RequestNo, E.ProjectName, E.EnquiryDate, E.Status,
                E.Probability, E.ProbabilityOption, E.ExpectedOrderDate, E.ProbabilityRemarks
            FROM EnquiryMaster E
            WHERE 1 = 1
                AND (
                    (E.Status IS NULL OR E.Status = '' OR E.Status IN ('Pending', 'Enquiry', 'Priced', 'Estimated', 'Quote', 'Quoted'))
                    OR (E.Status IN('FollowUp', 'Follow-up') AND (E.ProbabilityOption IS NULL OR E.ProbabilityOption = ''))
                )
        const request3 = new dbConfig.sql.Request();
        const result3 = await request3.query("SELECT ToName, QuoteDate, DATEDIFF(day, QuoteDate, @now) as Diff FROM EnquiryQuotes WHERE LTRIM(RTRIM(RequestNo)) = '11'");
        console.log("Quotes for 11:", result3.recordset);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}
test();
