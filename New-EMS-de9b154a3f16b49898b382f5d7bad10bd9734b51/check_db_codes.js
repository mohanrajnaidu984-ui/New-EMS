const sql = require('mssql');
require('dotenv').config({ path: './server/.env' });

async function run() {
    try {
        await sql.connect(process.env.DATABASE_URL || {
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_NAME,
            options: { encrypt: true, trustServerCertificate: true }
        });
        const result = await sql.query`SELECT TOP 20 ItemName, LeadJobCode, ParentID FROM EnquiryFor WHERE LeadJobCode IS NOT NULL AND LeadJobCode != ''`;
        console.log('--- LeadJobCode Samples ---');
        console.table(result.recordset);
        
        const roots = await sql.query`SELECT TOP 10 ItemName, LeadJobCode FROM EnquiryFor WHERE ParentID IS NULL OR ParentID = 0`;
        console.log('--- Root Samples ---');
        console.table(roots.recordset);
        
        await sql.close();
    } catch (err) {
        console.error(err);
    }
}
run();
