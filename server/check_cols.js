const sql = require('mssql');
const fs = require('fs/promises');
const path = require('path');
require('dotenv').config();

(async () => {
    try {
        const config = {
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_DATABASE,
            options: { encrypt: false, trustServerCertificate: true }
        };
        const pool = await sql.connect(config);
        const res = await pool.request().query("SELECT TOP 1 * FROM EnquiryCustomer");
        const cols = res.recordset.length > 0 ? Object.keys(res.recordset[0]) : ['(empty)'];

        await fs.writeFile(path.join(__dirname, 'cols.txt'), 'Cols: ' + cols.join(', '));
        console.log('Done');
    } catch (e) {
        console.error(e);
    } finally {
        setTimeout(() => process.exit(), 500);
    }
})();
