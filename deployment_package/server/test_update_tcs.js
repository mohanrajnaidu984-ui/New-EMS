const { sql, connectDB } = require('./dbConfig');

async function testUpdate() {
    try {
        await connectDB();

        // Find TCS ID
        const res = await sql.query`SELECT TOP 1 ID FROM Master_ReceivedFrom WHERE CompanyName = 'TCS'`;
        if (res.recordset.length === 0) {
            console.log('TCS not found');
            return;
        }
        const id = res.recordset[0].ID;
        console.log('TCS ID:', id);

        // Update to Miss
        console.log('Updating to Miss...');
        await sql.query`UPDATE Master_ReceivedFrom SET Prefix = 'Miss' WHERE ID = ${id}`;

        // Verify
        const verify = await sql.query`SELECT Prefix FROM Master_ReceivedFrom WHERE ID = ${id}`;
        console.log('New Prefix:', verify.recordset[0].Prefix);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

testUpdate();
