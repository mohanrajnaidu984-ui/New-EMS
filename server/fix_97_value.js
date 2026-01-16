require('dotenv').config();
const { sql, connectDB } = require('./dbConfig');

(async () => {
    try {
        await connectDB();
        // Update TotalAmount for RequestNo 97
        // Based on the debug output showing Grand Total 5678
        const result = await sql.query`
            UPDATE EnquiryQuotes 
            SET TotalAmount = 5678 
            WHERE RequestNo = '97'
        `;
        console.log("Updated rows:", result.rowsAffected);
    } catch (err) {
        console.error("Error:", err);
    } finally {
        process.exit();
    }
})();
