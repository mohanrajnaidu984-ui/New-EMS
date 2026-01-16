
const { sql, connectDB } = require('./dbConfig');

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

async function main() {
    console.log('Starting debug script...');
    try {
        console.log('Connecting to DB...');
        await connectDB();
        console.log('Connected.');

        console.log('Querying EnquiryMaster for 97...');
        const master = await sql.query(`SELECT RequestNo, Status, EnquiryDate FROM EnquiryMaster WHERE RequestNo = '97'`);
        console.log('MASTER RESULT:', master.recordset);

        if (master.recordset.length === 0) {
            console.log('Checking if ANY records exist...');
            const count = await sql.query(`SELECT COUNT(*) as total FROM EnquiryMaster`);
            console.log('Total Records in EnquiryMaster:', count.recordset[0].total);

            console.log('Checking RequestNo format...');
            const sample = await sql.query(`SELECT TOP 5 RequestNo FROM EnquiryMaster`);
            console.log('Sample RequestNos:', sample.recordset.map(r => r.RequestNo));
        }

    } catch (err) {
        console.error('CRITICAL ERROR:', err);
    } finally {
        process.exit(0);
    }
}

main();
