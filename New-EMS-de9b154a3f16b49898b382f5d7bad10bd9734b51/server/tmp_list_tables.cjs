const sql = require('mssql');
require('dotenv').config({ path: './.env' });

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

async function go() {
    let pool;
    try {
        pool = await sql.connect(config);
        const r = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'");
        console.log(JSON.stringify(r.recordset, null, 2));
    } catch (e) {
        console.error("ERROR:", e.message);
    } finally {
        if (pool) await pool.close();
    }
}
go();
