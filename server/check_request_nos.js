const { sql, connectDB } = require('./dbConfig');

const checkRequestNos = async () => {
    try {
        await connectDB();
        const result = await sql.query`SELECT TOP 20 RequestNo, CreatedAt FROM EnquiryMaster ORDER BY CreatedAt DESC`;
        console.log('Latest RequestNos:');
        console.table(result.recordset);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

checkRequestNos();
