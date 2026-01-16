require('dotenv').config();
const { sql, connectDB } = require('./dbConfig');

const fs = require('fs');
(async () => {
    try {
        await connectDB();
        const res = await sql.query("SELECT * FROM EnquiryQuotes WHERE RequestNo = '97'");
        let output = '';
        if (res.recordset.length > 0) {
            output += "--- ROW DATA ---\n";
            const row = res.recordset[0];
            for (const [key, value] of Object.entries(row)) {
                output += `${key}: ${value}\n`;
            }
            output += "--- END ROW DATA ---\n";
        } else {
            output += "No record found for 97\n";
        }
        fs.writeFileSync('debug_output.txt', output);
        console.log("Written to debug_output.txt");
    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit();
    }
})();
