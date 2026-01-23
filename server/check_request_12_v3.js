const { sql, connectDB } = require('./dbConfig');

async function checkData() {
    try {
        await connectDB();

        const result = await sql.query`
            SELECT RequestNo, ClientName, ConsultantName FROM EnquiryMaster WHERE RequestNo IN ('12', '9');
            SELECT RequestNo, ItemName FROM EnquiryFor WHERE RequestNo IN ('12', '9');
        `;

        console.log('--- EnquiryMaster (12, 9) ---');
        console.log(JSON.stringify(result.recordsets[0], null, 2));
        console.log('--- EnquiryFor (12, 9) ---');
        console.log(JSON.stringify(result.recordsets[1], null, 2));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkData();
