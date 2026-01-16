
const { sql, connectDB } = require('./dbConfig');

async function checkSchema() {
    try {
        await connectDB();
        const result = await sql.query(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryMaster'
            ORDER BY COLUMN_NAME
        `);
        console.log('--- ENQUIRYMASTER COLUMNS ---');
        result.recordset.forEach(col => {
            console.log(`${col.COLUMN_NAME} (${col.DATA_TYPE})`);
        });
    } catch (err) {
        console.error("Error:", err);
    } finally {
        // sql.close();
    }
}

checkSchema();
