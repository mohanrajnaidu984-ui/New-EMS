const sql = require('mssql');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function main() {
    try {
        await sql.connect(config);
        console.log('DB connected');
        const result = await sql.query('SELECT TOP 5 FullName, EmailId, Roles FROM Master_ConcernedSE');
        console.log(JSON.stringify(result.recordset, null, 2));
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await sql.close();
    }
}

main();
