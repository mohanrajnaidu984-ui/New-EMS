const { sql, connectDB } = require('./dbConfig');

async function debugSearch() {
    try {
        await connectDB();
        // Search in ContactName and CompanyName
        const res = await sql.query`SELECT * FROM Master_ReceivedFrom WHERE ContactName LIKE '%sfSFf%' OR CompanyName LIKE '%sfSFf%'`;
        console.log('Records found:', JSON.stringify(res.recordset, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

debugSearch();
