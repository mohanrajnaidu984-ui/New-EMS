const { connectDB, sql } = require('./dbConfig');

async function checkMasterContacts() {
    try {
        await connectDB();
        console.log('Connected to DB');

        const result = await sql.query`SELECT * FROM Master_ReceivedFrom`;
        console.log('Master_ReceivedFrom count:', result.recordset.length);
        console.table(result.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

checkMasterContacts();
