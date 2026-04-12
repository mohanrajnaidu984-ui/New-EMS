const sql = require('mssql');
const dbConfig = require('./dbConfig');

async function checkColumns() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryMaster'
        `;
        console.log('Columns in EnquiryMaster:', result.recordset.map(r => r.COLUMN_NAME));
        await sql.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

checkColumns();
