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
    }
};

async function checkUser() {
    try {
        console.log('Connecting to:', config.server, config.database);
        await sql.connect(config);
        console.log('Connected.');

        const emailToSearch = 'bmselveng1@almoayyedcg.com';

        console.log(`Checking for: "${emailToSearch}"`);

        // Check Master_ConcernedSE
        const res1 = await sql.query`SELECT * FROM Master_ConcernedSE`;
        console.log(`Total users in Master_ConcernedSE: ${res1.recordset.length}`);

        const matches = res1.recordset.filter(u => {
            if (!u.EmailId) return false;
            const dbEmail = u.EmailId.trim().toLowerCase();
            const target = emailToSearch.trim().toLowerCase();
            return dbEmail === target;
        });

        if (matches.length > 0) {
            console.log('FOUND MATCHES (with trim/lowercase):');
            matches.forEach(m => {
                console.log(`- ID: ${m.ID}, Name: ${m.FullName}, Email: "${m.EmailId}", Status: ${m.Status}`);
            });
        } else {
            console.log('No matches found in Master_ConcernedSE.');
            console.log('Sample emails from DB:');
            res1.recordset.slice(0, 10).forEach(u => console.log(`- "${u.EmailId}"`));
        }

        // Check if there are other user-like tables
        const tables = await sql.query`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%User%' OR TABLE_NAME LIKE '%SE%'`;
        console.log('Other potential user tables:', tables.recordset.map(t => t.TABLE_NAME));

    } catch (err) {
        console.error('FAILED:', err);
    } finally {
        await sql.close();
        process.exit();
    }
}

checkUser();
