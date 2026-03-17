const { sql, dbConfig } = require('./dbConfig');
const fs = require('fs');

async function checkSchema() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`
            SELECT 
                COLUMN_NAME, 
                DATA_TYPE, 
                CHARACTER_MAXIMUM_LENGTH,
                IS_NULLABLE
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'EnquiryQuotes'
            ORDER BY ORDINAL_POSITION
        `;
        fs.writeFileSync('quotes_schema_clean.json', JSON.stringify(result.recordset, null, 2));
        console.log('Results written to quotes_schema_clean.json');
    } catch (err) {
        console.error('Error fetching schema:', err);
    } finally {
        await sql.close();
    }
}

checkSchema();
