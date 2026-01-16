const { connectDB, sql } = require('./dbConfig');

async function checkKeys() {
    try {
        await connectDB();
        console.log('Connected to DB');

        const result = await sql.query`SELECT TOP 1 * FROM Master_CustomerName`;
        const keys = Object.keys(result.recordset[0]);
        console.log('KEYS:', keys.join(', '));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkKeys();
