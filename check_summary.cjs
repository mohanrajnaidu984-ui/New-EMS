const { sql, connectDB } = require('./server/dbConfig');

async function check() {
    try {
        await connectDB();
        const year = 2026;
        const request = new sql.Request();
        request.input('year', sql.Int, year);
        
        // Emulate winLossQuery for year 2026
        const winLossQuery = `
            SELECT 
                Status, 
                COUNT(*) as Count
            FROM EnquiryMaster E
            WHERE YEAR(COALESCE(ExpectedOrderDate, EnquiryDate)) = @year
              AND Status IN ('Won', 'Lost', 'Follow-up', 'FollowUp')
            GROUP BY Status
        `;
        const res = await request.query(winLossQuery);
        console.log("Win-Loss Results for 2026:");
        console.table(res.recordset);

        // Check first item dates and status
        const items = await sql.query("SELECT TOP 5 RequestNo, EnquiryDate, ExpectedOrderDate, Status FROM EnquiryMaster");
        console.log("Sample Data from EnquiryMaster:");
        console.table(items.recordset.map(i => ({
            RequestNo: i.RequestNo,
            ED: i.EnquiryDate,
            EOD: i.ExpectedOrderDate,
            S: i.Status,
            EDYear: i.EnquiryDate ? new Date(i.EnquiryDate).getFullYear() : 'null',
            EODYear: i.ExpectedOrderDate ? new Date(i.ExpectedOrderDate).getFullYear() : 'null'
        })));

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
