const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function run() {
    try {
        await sql.connect(config);
        const r = await sql.query`SELECT * FROM EnquiryFor WHERE RequestNo = '102'`;
        console.log(JSON.stringify(r.recordset, null, 2));
    } catch (err) { console.error(err); } finally { await sql.close(); }
}
run();
