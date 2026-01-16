const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');

async function checkSchema() {
    try {
        await connectDB();
        const quotesCols = await sql.query`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryQuotes'
        `;
        const usersCols = await sql.query`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Users'
        `;

        const data = {
            EnquiryQuotes: quotesCols.recordset,
            Users: usersCols.recordset
        };

        fs.writeFileSync('schema_full.json', JSON.stringify(data, null, 2));
        console.log('Schema written to schema_full.json');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSchema();
