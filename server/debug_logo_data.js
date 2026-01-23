
const { sql, connectDB, dbConfig } = require('./dbConfig');
const fs = require('fs');
const path = require('path');

async function debugLogo() {
    try {
        await connectDB();

        // 1. Check Master_EnquiryFor for Civil Project
        console.log('--- querying Master_EnquiryFor for Civil Project ---');
        const result = await sql.query("SELECT ItemName, CompanyLogo, DivisionCode FROM Master_EnquiryFor WHERE ItemName LIKE '%Civil%' OR ItemName LIKE '%BMS%'");
        console.table(result.recordset);

        // Output to file for the agent to read
        const output = JSON.stringify(result.recordset, null, 2);
        fs.writeFileSync(path.join(__dirname, 'logo_debug.txt'), output);

        console.log('Debug info written to logo_debug.txt');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

debugLogo();
