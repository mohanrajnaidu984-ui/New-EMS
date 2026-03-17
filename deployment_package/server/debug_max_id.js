const { connectDB, sql } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const result = await sql.query`
            SELECT MAX(TRY_CAST(RequestNo AS BIGINT)) as MaxID 
            FROM EnquiryMaster 
            WHERE RequestNo NOT LIKE '%/%' AND TRY_CAST(RequestNo AS BIGINT) IS NOT NULL
        `;
        console.log('MaxID from query:', result.recordset[0].MaxID);

        // Also let's check if '25' exists
        const check25 = await sql.query`SELECT * FROM EnquiryMaster WHERE RequestNo = '25'`;
        console.log('Does 25 exist?', check25.recordset.length > 0);
        if (check25.recordset.length > 0) {
            console.log('25 row:', check25.recordset[0]);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
