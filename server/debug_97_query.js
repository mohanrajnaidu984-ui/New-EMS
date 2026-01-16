require('dotenv').config();
const { sql, connectDB } = require('./dbConfig');

(async () => {
    try {
        await connectDB();
        console.log("Connected to DB");

        console.log("Checking Pending Logic for 97...");

        // 1. Check Status
        const statusRes = await sql.query("SELECT Status FROM EnquiryMaster WHERE RequestNo = '97'");
        const status = statusRes.recordset[0]?.Status;
        const invalidStatuses = ['Won', 'Lost', 'Cancelled', 'OnHold'];
        console.log(`Status: ${status} (Is Valid: ${!invalidStatuses.includes(status)})`);

        // 2. Check Quote Date Difference
        const dateRes = await sql.query(`
            SELECT RequestNo, QuoteDate, DATEDIFF(day, QuoteDate, GETDATE()) as AgeInDays 
            FROM EnquiryQuotes 
            WHERE RequestNo = '97'
        `);
        console.log("Quotes for 97:", dateRes.recordset);

        // 3. Run Exact Query Logic
        const query = `
            SELECT E.RequestNo
            FROM EnquiryMaster E
            WHERE E.RequestNo = '97'
                AND E.Status NOT IN ('Won', 'Lost', 'Cancelled', 'OnHold')
                AND EXISTS (
                    SELECT 1 FROM EnquiryQuotes Q 
                    WHERE Q.RequestNo = E.RequestNo 
                    AND DATEDIFF(day, Q.QuoteDate, GETDATE()) >= 5
                )
        `;
        const res = await sql.query(query);
        console.log("Found in Pending Query match:", res.recordset.length > 0);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit();
    }
})();
