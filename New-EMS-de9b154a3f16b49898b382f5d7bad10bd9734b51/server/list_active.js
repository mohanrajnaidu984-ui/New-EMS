const sql = require('mssql');
const fs = require('fs');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function listActiveUsers() {
    try {
        const pool = await sql.connect(dbConfig);
        const res = await pool.request().query("SELECT FullName, EmailId FROM Master_ConcernedSE WHERE Status = 'Active'");
        fs.writeFileSync('active_users.json', JSON.stringify(res.recordset, null, 2));
        console.log(`Active users: ${res.recordset.length}`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
listActiveUsers();
