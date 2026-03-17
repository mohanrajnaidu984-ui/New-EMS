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

async function findUsers() {
    try {
        const pool = await sql.connect(dbConfig);

        console.log('Querying Master_ConcernedSE (Harees Mon)...');
        const res7 = await pool.request().query("SELECT FullName, EmailId, Designation FROM Master_ConcernedSE WHERE EmailId = 'MEPGM@almoayyedcg.com'");
        console.log(JSON.stringify(res7.recordset, null, 2));

        console.log('Querying Master_ConcernedSE...');
        const res2 = await pool.request().query("SELECT FullName, EmailId, Department FROM Master_ConcernedSE");
        fs.writeFileSync('all_users_details.json', JSON.stringify(res2.recordset, null, 2));
        console.log('--- ALL USERS WRITTEN TO all_users_details.json ---');

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

findUsers();
