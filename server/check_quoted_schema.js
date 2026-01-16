const { sql, connectDB } = require('./dbConfig');

async function checkSchema() {
    try {
        await connectDB();
        const result = await sql.query`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryQuotes'
        `;
        console.log('EnquiryQuotes Columns:');
        result.recordset.forEach(c => {
            console.log(`${c.COLUMN_NAME} (${c.DATA_TYPE})`);
        });

        const result2 = await sql.query`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Users'
        `;
        console.log('\nUsers Columns:');
        result2.recordset.forEach(c => {
            console.log(`${c.COLUMN_NAME} (${c.DATA_TYPE})`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSchema();
