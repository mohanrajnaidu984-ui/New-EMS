const { sql, connectDB } = require('./dbConfig');

async function checkCols() {
    try {
        await connectDB();
        const res = await sql.query`SELECT TOP 1 * FROM Master_CustomerName`;
        console.log('Master_CustomerName columns:', Object.keys(res.recordset[0]));

        const res2 = await sql.query`SELECT TOP 1 * FROM Master_EnquiryFor`;
        console.log('Master_EnquiryFor columns:', Object.keys(res2.recordset[0]));
    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkCols();
