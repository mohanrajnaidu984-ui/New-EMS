const sql = require('mssql');
require('dotenv').config();

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

async function check() {
    try {
        await sql.connect(config);
        const userRes = await sql.query`SELECT EmailId, FullName, Department, Roles FROM Master_ConcernedSE WHERE FullName LIKE '%Arun%' AND FullName LIKE '%Venkatesh%'`;
        console.log('--- USER DATA ---');
        console.log(JSON.stringify(userRes.recordset, null, 2));

        const allAruns = await sql.query`SELECT EmailId, FullName, Department FROM Master_ConcernedSE WHERE FullName LIKE '%Arun%'`;
        console.log('--- ALL ARUNS ---');
        console.log(JSON.stringify(allAruns.recordset, null, 2));

        console.log('\n--- PROFILE CHECK: BMS Project ---');
        const masterRes = await sql.query`SELECT ItemName, DivisionCode, DepartmentCode FROM Master_EnquiryFor WHERE ItemName LIKE '%BMS%'`;
        console.log(JSON.stringify(masterRes.recordset, null, 2));

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

check();
