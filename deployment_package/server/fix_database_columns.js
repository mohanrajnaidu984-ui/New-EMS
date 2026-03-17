const { sql, connectDB } = require('./dbConfig');

async function fixColumns() {
    await connectDB();
    try {
        console.log('Checking and fixing database columns...');

        const columnsToAdd = [
            { name: 'EnquiryStatus', type: 'NVARCHAR(50)', default: "'Active'" },
            { name: 'AcknowledgementSE', type: 'NVARCHAR(100)', default: null },
            { name: 'AdditionalNotificationEmails', type: 'NVARCHAR(MAX)', default: null }
        ];

        for (const col of columnsToAdd) {
            try {
                // Check if column exists
                const checkRes = await sql.query`
                    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = 'EnquiryMaster' AND COLUMN_NAME = ${col.name}
                `;

                if (checkRes.recordset.length === 0) {
                    console.log(`Adding missing column: ${col.name}...`);
                    let query = `ALTER TABLE EnquiryMaster ADD ${col.name} ${col.type}`;
                    if (col.default) {
                        query += ` DEFAULT ${col.default} WITH VALUES`;
                    }
                    await sql.query(query);
                    console.log(`✅ Added ${col.name}`);
                } else {
                    console.log(`ℹ️  Column ${col.name} already exists.`);
                }
            } catch (err) {
                console.error(`Error checking/adding ${col.name}:`, err.message);
            }
        }

        console.log('Database schema update complete.');
    } catch (err) {
        console.error('Main Error:', err);
    } finally {
        process.exit(0);
    }
}

fixColumns();
