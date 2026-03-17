const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true
    },
    port: parseInt(process.env.DB_PORT)
};

async function checkUsers() {
    try {
        const pool = await sql.connect(dbConfig);
        const emails = [
            'ai@almoayyedcg.com', 'sunil.mp@almoayyedcg.com', 'aiqs2@almoayyedcg.com',
            'ai@almcg.com', 'sunil.mp@almcg.com', 'aiqs2@almcg.com'
        ];

        console.log('Checking emails:', emails);

        const result = await pool.request()
            .query(`SELECT FullName, EmailId, Roles, Department, Status FROM Master_ConcernedSE`);

        const allUsers = result.recordset;
        console.log(`Total users in DB: ${allUsers.length}`);

        const matches = allUsers.filter(u => {
            const m = (u.EmailId || '').toLowerCase().trim();
            return emails.includes(m);
        });

        console.log('Matches found:');
        console.log(JSON.stringify(matches, null, 2));

        // Let's also check for Sunil or AI in any email
        const partialMatches = allUsers.filter(u => {
            const m = (u.EmailId || '').toLowerCase();
            return m.includes('sunil') || m.includes('aiqs');
        });
        console.log('Partial matches (sunil/aiqs):');
        console.log(JSON.stringify(partialMatches, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkUsers();
