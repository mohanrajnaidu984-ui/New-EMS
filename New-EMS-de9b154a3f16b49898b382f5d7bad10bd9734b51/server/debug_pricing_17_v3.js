const { connectDB, sql } = require('./dbConfig');

async function run() {
    try {
        await connectDB();
        const request = new sql.Request();

        console.log('--- ENQUIRY Master (RequestNo: 17) ---');
        const enq = await request.query(`SELECT RequestNo, ProjectName, CreatedBy, CustomerName FROM EnquiryMaster WHERE RequestNo = '17'`);
        console.table(enq.recordset);
        if (enq.recordset.length === 0) {
            console.log('No Enquiry found with RequestNo 17');
            process.exit(1);
        }
        const reqNo = enq.recordset[0].RequestNo;

        console.log('--- ENQUIRY ITEMS (EnquiryFor) ---');
        const jobs = await request.query(`SELECT ID, ItemName, ParentID, LeadJobCode FROM EnquiryFor WHERE RequestNo = '${reqNo}'`);
        console.table(jobs.recordset.map(j => ({ id: j.ID, name: j.ItemName, pid: j.ParentID, code: j.LeadJobCode })));

        console.log('--- PRICING OPTIONS ---');
        const opts = await request.query(`SELECT ID, OptionName, ItemName, CustomerName, LeadJobName FROM EnquiryPricingOptions WHERE RequestNo = '${reqNo}'`);
        console.table(opts.recordset);

        console.log('--- PRICING VALUES (nonzero) ---');
        const vals = await request.query(`SELECT OptionID, EnquiryForItem, EnquiryForID, Price, CustomerName, LeadJobName FROM EnquiryPricingValues WHERE RequestNo = '${reqNo}' AND Price > 0`);
        console.table(vals.recordset);

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
run();
