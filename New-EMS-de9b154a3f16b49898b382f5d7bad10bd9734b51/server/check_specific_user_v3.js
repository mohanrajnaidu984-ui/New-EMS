const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: 5000 // 5 seconds
    }
};

async function checkUser() {
    try {
        console.log(`Trying to connect to: "${config.server}" as "${config.user}"...`);
        const pool = await sql.connect(config);
        console.log('CONNECTED successfully.');

        const emailToSearch = 'bmselveng1@almoayyedcg.com';
        console.log(`Querying Master_ConcernedSE for "${emailToSearch}"...`);

        const result = await pool.request()
            .input('email', sql.NVarChar, emailToSearch)
            .query('SELECT * FROM Master_ConcernedSE WHERE EmailId = @email');

        console.log(`Results found: ${result.recordset.length}`);

        if (result.recordset.length > 0) {
            console.log('MATCH FOUND:');
            console.log(JSON.stringify(result.recordset[0], null, 2));
        } else {
            console.log('NO EXACT MATCH.');
            // Search with LIKE
            const part = emailToSearch.split('@')[0];
            const resultLike = await pool.request()
                .input('part', sql.NVarChar, '%' + part + '%')
                .query('SELECT FullName, EmailId, Roles, Status FROM Master_ConcernedSE WHERE EmailId LIKE @part OR FullName LIKE @part');

            console.log(`Similar records found: ${resultLike.recordset.length}`);
            console.log(JSON.stringify(resultLike.recordset, null, 2));

            // Show all tables
            const tables = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'");
            console.log('Total tables:', tables.recordset.length);
        }

    } catch (err) {
        console.error('ERROR during check:', err.message);
        if (err.originalError) console.error('Original error:', err.originalError.message);
    } finally {
        await sql.close();
        process.exit();
    }
}

checkUser();
