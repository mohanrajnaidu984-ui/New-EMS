const sql = require('mssql');
const config = require('./dbConfig');

async function checkData() {
    try {
        await sql.connect(config);

        const result = await sql.query`
            SELECT RequestNo, ClientName, ConsultantName FROM EnquiryMaster WHERE RequestNo = '12';
            SELECT RequestNo, ItemName FROM EnquiryFor WHERE RequestNo = '12';
        `;

        console.log('--- EnquiryMaster (12) ---');
        console.log(JSON.stringify(result.recordsets[0], null, 2));
        console.log('--- EnquiryFor (12) ---');
        console.log(JSON.stringify(result.recordsets[1], null, 2));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkData();
