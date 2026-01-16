const { connectDB, sql } = require('./dbConfig');

async function checkRow() {
    try {
        await connectDB();
        console.log('Connected to DB');

        const result = await sql.query`SELECT TOP 1 * FROM Master_CustomerName`;
        console.log('First Row Keys:', Object.keys(result.recordset[0]));
        console.log('First Row Data:', result.recordset[0]);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkRow();
