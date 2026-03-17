const { sql, connectDB } = require('./dbConfig');

async function fixNullPrefixes() {
    try {
        await connectDB();
        console.log('Connected to database...');

        const result = await sql.query`
            UPDATE Master_ReceivedFrom 
            SET Prefix = 'Mr' 
            WHERE Prefix IS NULL
        `;

        console.log(`Updated ${result.rowsAffected[0]} rows where Prefix was NULL.`);

    } catch (err) {
        console.error('Error fixing prefixes:', err);
    } finally {
        process.exit(0);
    }
}

fixNullPrefixes();
