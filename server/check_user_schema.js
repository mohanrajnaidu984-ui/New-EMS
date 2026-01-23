const { sql, connectDB } = require('./dbConfig');

async function checkUserTable() {
    try {
        await connectDB();
        const res = await sql.query`SELECT TOP 5 * FROM Master_ConcernedSE`;
        console.log(JSON.stringify(res.recordset, null, 2));
        process.exit(0);
    } catch (err) { console.error(err); process.exit(1); }
}
checkUserTable();
