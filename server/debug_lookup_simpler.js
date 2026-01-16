const sql = require('mssql');
const { dbConfig } = require('./dbConfig');

async function checkCustomer() {
    try {
        await sql.connect(dbConfig);
        console.log('Connected. Searching for Almoayyed...');

        const r1 = await sql.query("SELECT CompanyName FROM Master_CustomerName WHERE CompanyName LIKE '%Almoayyed%'");
        console.log('Master_CustomerName matches:', r1.recordset);

        const r2 = await sql.query("SELECT CompanyName FROM Master_ClientName WHERE CompanyName LIKE '%Almoayyed%'");
        console.log('Master_ClientName matches:', r2.recordset);

        const r3 = await sql.query("SELECT CompanyName FROM Master_ConsultantName WHERE CompanyName LIKE '%Almoayyed%'");
        console.log('Master_ConsultantName matches:', r3.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}
checkCustomer();
