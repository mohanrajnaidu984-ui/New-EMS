const sql = require('mssql');
const { dbConfig } = require('./dbConfig');

async function checkCustomer() {
    try {
        await sql.connect(dbConfig);
        const term = '%Almoayyed%';
        console.log(`Searching for ${term}...`);

        const tables = ['Master_CustomerName', 'Master_ClientName', 'Master_ConsultantName'];

        for (const table of tables) {
            try {
                const res = await sql.query`SELECT * FROM ${table} WHERE CompanyName LIKE ${term}`; // Note: This parameterization might fail if tablename is variable in tagged template.
                // Actually sql.query`...` doesn't support dynamic table names easily with tagged templates for safety.
                // Let's use standard string injection for this debug script since it's local.

                const result = await sql.query(`SELECT CompanyName FROM ${table} WHERE CompanyName LIKE '%Almoayyed%'`);
                if (result.recordset.length > 0) {
                    console.log(`Found in ${table}:`);
                    console.table(result.recordset);
                } else {
                    console.log(`Not found in ${table}`);
                }
            } catch (queryErr) {
                console.error(`Error querying ${table}:`, queryErr.message);
            }
        }

    } catch (err) {
        console.error('Connection error:', err);
    } finally {
        await sql.close();
    }
}
checkCustomer();
