const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function fixSchema() {
    try {
        await sql.connect(config);
        console.log('Connected to database...');

        const missingCols = [
            { name: 'ShowBillOfQuantity', type: 'BIT DEFAULT 1' },
            { name: 'BillOfQuantity', type: 'NVARCHAR(MAX)' }
        ];

        for (const col of missingCols) {
            const checkQuery = `
                IF COL_LENGTH('EnquiryQuotes', '${col.name}') IS NULL
                BEGIN
                    ALTER TABLE EnquiryQuotes ADD ${col.name} ${col.type};
                    PRINT 'Added column ${col.name}';
                END
                ELSE
                BEGIN
                    PRINT 'Column ${col.name} already exists';
                END
            `;
            await sql.query(checkQuery);
        }

        console.log('Schema fix complete.');
    } catch (err) {
        console.error('Error fixing schema:', err);
    } finally {
        await sql.close();
    }
}

fixSchema();
