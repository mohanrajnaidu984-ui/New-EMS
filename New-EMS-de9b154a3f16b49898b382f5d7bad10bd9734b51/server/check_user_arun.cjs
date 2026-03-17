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
        const res = await sql.query`SELECT EmailId, FullName, Department, Roles FROM Master_ConcernedSE WHERE FullName LIKE '%Arun%' OR EmailId LIKE '%arun%'`;
        console.log(JSON.stringify(res.recordset, null, 2));
        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

check();
