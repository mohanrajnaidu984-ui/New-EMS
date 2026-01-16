const { connectDB, sql } = require('./dbConfig');

async function checkSchema() {
    try {
        await connectDB();
        console.log('Connected to database');

        const query = `
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'QuoteTemplates'
        `;
        const result = await sql.query(query);
        console.log('Columns in QuoteTemplates:', result.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkSchema();
