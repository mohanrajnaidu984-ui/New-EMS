require('dotenv').config();
const { sql, connectDB } = require('./dbConfig');

(async () => {
    try {
        await connectDB();
        // Get all columns for 97 to find value fields
        const res = await sql.query("SELECT * FROM EnquiryQuotes WHERE RequestNo = '97'");
        console.log("Record Count:", res.recordset.length);
        if (res.recordset.length > 0) {
            const row = res.recordset[0];
            console.log("QuoteDate:", row.QuoteDate);
            console.log("TotalAmount:", row.TotalAmount);
            // Check for other potential value columns
            const valueCols = Object.keys(row).filter(k => k.toLowerCase().includes('amount') || k.toLowerCase().includes('value') || k.toLowerCase().includes('price') || k.toLowerCase().includes('net') || k.toLowerCase().includes('total'));
            console.log("Potential Value Columns:");
            valueCols.forEach(col => {
                console.log(`  ${col}: ${row[col]}`);
            });
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit();
    }
})();
