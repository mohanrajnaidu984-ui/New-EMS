
const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');
const path = require('path');

async function debugSchema() {
    try {
        await connectDB();

        console.log('--- EnquiryFor Schema Sample ---');
        // LIMIT 1 for MSSQL is TOP 1
        const result = await sql.query("SELECT TOP 1 * FROM EnquiryFor");
        const output = {
            columns: Object.keys(result.recordset[0] || {}),
            data: result.recordset
        };
        fs.writeFileSync(path.join(__dirname, 'schema.txt'), JSON.stringify(output, null, 2));
        console.log('Written to schema.txt');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

debugSchema();
