const { sql, connectDB } = require('./dbConfig');

async function debugTCS() {
    try {
        await connectDB();
        const res = await sql.query`SELECT * FROM Master_ReceivedFrom WHERE CompanyName = 'TCS'`;
        console.log('TCS Records:', JSON.stringify(res.recordset, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

debugTCS();
