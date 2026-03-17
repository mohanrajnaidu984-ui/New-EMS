const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const fs = require('fs');

const logFile = 'seed_check.log';
function log(msg) {
    const s = `[${new Date().toISOString()}] ${msg}\n`;
    console.log(msg);
    fs.appendFileSync(logFile, s);
}

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: 10000
    }
};

async function check() {
    log('--- START SEED CHECK ---');
    log(`Config: Server=${config.server}, DB=${config.database}, User=${config.user}`);

    try {
        log('Attempting to connect...');
        const pool = await sql.connect(config);
        log('CONNECTED.');

        const email = 'bmselveng1@almoayyedcg.com';
        log(`Checking for ${email}...`);

        const res = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT * FROM Master_ConcernedSE WHERE EmailId = @email');

        log(`Results found: ${res.recordset.length}`);
        if (res.recordset.length > 0) {
            log(`MATCH: ID=${res.recordset[0].ID}, FullName=${res.recordset[0].FullName}`);
        } else {
            log('NOT FOUND. Listing first 10 users:');
            const all = await pool.request().query('SELECT TOP 10 FullName, EmailId FROM Master_ConcernedSE');
            all.recordset.forEach(u => log(`- ${u.FullName} (${u.EmailId})`));
        }

    } catch (err) {
        log(`ERROR: ${err.message}`);
        if (err.originalError) log(`ORIGINAL ERROR: ${err.originalError.message}`);
    } finally {
        await sql.close();
        log('--- END SEED CHECK ---');
        process.exit();
    }
}

check();
