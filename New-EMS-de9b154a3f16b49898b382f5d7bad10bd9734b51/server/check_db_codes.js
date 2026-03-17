const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function run() {
    const config = {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        database: process.env.DB_DATABASE, // corrected from DB_NAME
        options: {
            encrypt: false, // Try false
            trustServerCertificate: true
        }
    };
    try {
        console.log('Connecting to server:', config.server);
        await sql.connect(config);
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
