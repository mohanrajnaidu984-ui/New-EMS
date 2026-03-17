const { connectDB, sql } = require('./dbConfig');
const fs = require('fs');

async function run() {
    try {
        await connectDB();
        const request = new sql.Request();

        const data = {};

        const enq = await request.query(`SELECT RequestNo, ProjectName, CreatedBy, CustomerName FROM EnquiryMaster WHERE RequestNo = '17'`);
        data.enquiry = enq.recordset;
        if (enq.recordset.length === 0) {
            console.log('No Enquiry found with RequestNo 17');
            process.exit(1);
        }
        const reqNo = enq.recordset[0].RequestNo;

        const jobs = await request.query(`SELECT ID, ItemName, ParentID, LeadJobCode FROM EnquiryFor WHERE RequestNo = '${reqNo}'`);
        data.jobs = jobs.recordset;

        const opts = await request.query(`SELECT ID, OptionName, ItemName, CustomerName, LeadJobName FROM EnquiryPricingOptions WHERE RequestNo = '${reqNo}'`);
        data.options = opts.recordset;

        const vals = await request.query(`SELECT OptionID, EnquiryForItem, EnquiryForID, Price, CustomerName, LeadJobName FROM EnquiryPricingValues WHERE RequestNo = '${reqNo}' AND Price > 0`);
        data.values = vals.recordset;

        fs.writeFileSync('debug17.json', JSON.stringify(data, null, 2));
        console.log('Saved to debug17.json');

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
run();
