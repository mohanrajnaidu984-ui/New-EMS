const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');

async function checkData() {
    try {
        await connectDB();

        const result = await sql.query`
            SELECT RequestNo, ClientName, ConsultantName FROM EnquiryMaster WHERE RequestNo IN ('12', '9');
            SELECT RequestNo, ItemName FROM EnquiryFor WHERE RequestNo IN ('12', '9');
        `;

        const output = `
--- EnquiryMaster (12, 9) ---
${JSON.stringify(result.recordsets[0], null, 2)}
--- EnquiryFor (12, 9) ---
${JSON.stringify(result.recordsets[1], null, 2)}
        `;

        fs.writeFileSync('check_output.txt', output);
        console.log('Done writing check_output.txt');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkData();
