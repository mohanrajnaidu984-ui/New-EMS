const sql = require('mssql');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }
};

async function main() {
    await sql.connect(config);

    const r1 = await sql.query`SELECT ID, RequestNo, QuoteNumber, QuoteNo, RevisionNo, ToName, Status, PreparedBy FROM EnquiryQuotes WHERE RequestNo = 13 ORDER BY ID`;
    console.log('=== QUOTES ===');
    r1.recordset.forEach(r => {
        process.stdout.write('ID=' + r.ID + ' QN=' + r.QuoteNumber + ' ToName=' + r.ToName + ' Status=' + r.Status + '\n');
    });

    const r2 = await sql.query`SELECT ID, ParentID, ItemName, LeadJobCode FROM EnquiryFor WHERE RequestNo = 13`;
    console.log('=== ENQ FOR ===');
    r2.recordset.forEach(r => {
        process.stdout.write('ID=' + r.ID + ' PID=' + r.ParentID + ' Name=' + r.ItemName + ' LJC=' + r.LeadJobCode + '\n');
    });

    await sql.close();
}

main().catch(e => process.stdout.write('ERR: ' + e.message + '\n'));
