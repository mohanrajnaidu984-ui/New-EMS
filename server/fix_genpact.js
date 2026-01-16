const sql = require('mssql');
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

        console.log('Inserting Genpact for 97...');
        // Check if exists first to avoid dupes
        const check = await pool.request().query("SELECT * FROM EnquiryCustomer WHERE RequestNo = '97' AND CustomerName = 'Genpact'");
        if (check.recordset.length === 0) {
            await pool.request().query("INSERT INTO EnquiryCustomer (RequestNo, CustomerName) VALUES ('97', 'Genpact')");
            console.log('Inserted Genpact for 97.');
        } else {
            console.log('Genpact already exists for 97.');
        }

    } catch (e) {
        console.error(e);
    } finally {
        setTimeout(() => process.exit(), 1000);
    }
})();
