const sql = require('mssql');
const { dbConfig } = require('./dbConfig');
const fs = require('fs');

async function debugSchema() {
    let output = '';
    const log = (msg) => {
        console.log(msg);
        output += (typeof msg === 'object' ? JSON.stringify(msg, null, 2) : msg) + '\n';
    };

    try {
        await sql.connect(dbConfig);
        log('Connected to DB');

        const tables = ['Master_ConcernedSE', 'EnquiryPricingOptions', 'EnquiryPricingValues'];

        for (const table of tables) {
            log(`\n--- Schema for ${table} ---`);
            const result = await sql.query`
                SELECT COLUMN_NAME, DATA_TYPE 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = ${table}
            `;
            log(result.recordset);
        }

    } catch (err) {
        log('Error: ' + err.message);
    } finally {
        await sql.close();
        fs.writeFileSync('debug_schema_output.txt', output);
        console.log("Output written to debug_schema_output.txt");
    }
}

debugSchema();
