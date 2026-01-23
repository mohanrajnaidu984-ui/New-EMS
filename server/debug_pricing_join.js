
const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');
const path = require('path');

async function debugPricingJoin() {
    try {
        await connectDB();

        // 1. Get Enquiry ID for RequestNo '11'
        const enqRes = await sql.query("SELECT ID, RequestNo FROM EnquiryMaster WHERE RequestNo = '11'");
        if (enqRes.recordset.length === 0) {
            console.log("Enquiry 11 not found in EnquiryMaster");
            return;
        }
        const enquiryId = enqRes.recordset[0].ID;
        console.log(`Enquiry ID for '11' is: ${enquiryId}`);

        // 2. Dump EnquiryFor to check ItemName
        const query = `
            SELECT Name, RequestNo, ItemName, ParentItemName
            FROM EnquiryFor 
            WHERE EnquiryId = ${enquiryId}
        `;

        const result = await sql.query(query);
        console.table(result.recordset);

        fs.writeFileSync(path.join(__dirname, 'enquiry_for_dump.txt'), JSON.stringify(result.recordset, null, 2));
        console.log('Written to enquiry_for_dump.txt');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

debugPricingJoin();
