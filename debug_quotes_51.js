const sql = require('mssql');
require('dotenv').config({ path: './server/.env' });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function debug() {
    try {
        await sql.connect(config);
        const result = await sql.query`SELECT ID, QuoteNumber, ToName, Status, RevisionNo, PreparedBy, PreparedByEmail FROM QuoteMaster WHERE RequestNo = '51'`;
        console.log('Quotes for Enquiry 51:');
        console.table(result.recordset);
        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

debug();
