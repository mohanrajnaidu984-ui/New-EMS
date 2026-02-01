
const { sql, poolPromise } = require('./dbConfig');

async function checkSchema() {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT TOP 0 * FROM Master_ConcernedSE");
        console.log('Master_ConcernedSE Columns:', Object.keys(result.recordset.columns));

        const result2 = await pool.request().query("SELECT TOP 0 * FROM Master_EnquiryFor");
        console.log('Master_EnquiryFor Columns:', Object.keys(result2.recordset.columns));
    } catch (err) {
        console.error(err);
    }
    process.exit();
}

checkSchema();
