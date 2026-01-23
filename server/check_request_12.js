const sql = require('mssql');
const config = require('./dbConfig');

async function checkData() {
    try {
        await sql.connect(config);

        const result = await sql.query`
            SELECT * FROM EnquiryMaster WHERE RequestNo = '12';
            SELECT * FROM EnquiryFor WHERE RequestNo = '12';
            SELECT * FROM EnquiryPricingValues WHERE RequestNo = '12';
        `;

        console.log('--- EnquiryMaster (12) ---');
        console.table(result.recordsets[0]);
        console.log('--- EnquiryFor (12) ---');
        console.table(result.recordsets[1]);
        console.log('--- EnquiryPricingValues (12) ---');
        console.table(result.recordsets[2]);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkData();
