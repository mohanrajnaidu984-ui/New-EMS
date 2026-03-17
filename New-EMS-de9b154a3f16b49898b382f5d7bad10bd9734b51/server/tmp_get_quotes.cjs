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
        const result = await pool.request()
            .query("SELECT * FROM Master_ConcernedSE WHERE EmailId = 'shijo@almoayyedcg.com'");
        console.log('Shijo Info:', JSON.stringify(result.recordset[0], null, 2));
    } catch (e) {
        console.error("ERROR:", e.message);
    } finally {
        if (pool) await pool.close();
    }
}
go();
