const sql = require('mssql');
const { dbConfig } = require('./dbConfig');
const fs = require('fs');

async function listTables() {
    let output = '';
    const log = (msg) => {
        console.log(msg);
        output += (typeof msg === 'object' ? JSON.stringify(msg, null, 2) : msg) + '\n';
    };

    try {
        await sql.connect(dbConfig);
        log('Connected to DB');

        const result = await sql.query`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_TYPE = 'BASE TABLE'
        `;

        log('\n--- Tables ---');
        log(result.recordset);

    } catch (err) {
        log('Error: ' + err.message);
    } finally {
        await sql.close();
        fs.writeFileSync('debug_tables_output.txt', output);
        console.log("Output written to debug_tables_output.txt");
    }
}

listTables();
