
const { sql, poolPromise } = require('./dbConfig');
const fs = require('fs');

async function check() {
    try {
        const pool = await poolPromise;
        let output = '';

        const t1 = await pool.request().query("SELECT TOP 1 * FROM Master_EnquiryFor");
        output += 'Master_EnquiryFor:\n' + Object.keys(t1.recordset[0] || {}).join(', ') + '\n\n';

        const t2 = await pool.request().query("SELECT TOP 1 * FROM Master_ConcernedSE");
        output += 'Master_ConcernedSE:\n' + Object.keys(t2.recordset[0] || {}).join(', ') + '\n\n';

        const t3 = await pool.request().query("SELECT TOP 1 EnquiryDate FROM EnquiryMaster");
        output += 'EnquiryMaster:\nEnquiryDate exists? ' + (t3.recordset.length > 0 ? 'Yes' : 'No') + '\n';

        fs.writeFileSync('schema_check_output.txt', output);
        console.log('Done');
    } catch (e) {
        console.error(e);
        fs.writeFileSync('schema_check_output.txt', e.message);
    }
    process.exit();
}
check();
