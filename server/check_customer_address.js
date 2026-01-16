const { connectDB, sql } = require('./dbConfig');

async function checkAddress() {
    try {
        await connectDB();
        console.log('Connected to DB');

        const customerName = 'Almoayyed Air Conditioning';

        // Check exact match
        const result = await sql.query`SELECT * FROM Master_CustomerName WHERE CustomerName = ${customerName}`;
        console.log(`Searching for: "${customerName}"`);

        if (result.recordset.length > 0) {
            console.log('Found Customer Record:', result.recordset[0]);
        } else {
            console.log('No exact match found. Searching with LIKE...');
            const likeResult = await sql.query`SELECT * FROM Master_CustomerName WHERE CustomerName LIKE '%Almoayyed Air Conditioning%'`;
            console.log('Like Results:', likeResult.recordset);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkAddress();
