const { sql, dbConfig } = require('./dbConfig');

async function migrate() {
    try {
        await sql.connect(dbConfig);
        console.log('Connected to database.');

        // Add ToAttention to EnquiryQuotes
        const checkColumn = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'EnquiryQuotes' AND COLUMN_NAME = 'ToAttention'
        `;

        if (checkColumn.recordset.length === 0) {
            console.log('Adding ToAttention column to EnquiryQuotes...');
            await sql.query`ALTER TABLE EnquiryQuotes ADD ToAttention NVARCHAR(255) NULL`;
            console.log('ToAttention column added.');
        } else {
            console.log('ToAttention column already exists.');
        }

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await sql.close();
    }
}

migrate();
