const { connectDB, sql } = require('./dbConfig');

async function run() {
    try {
        await connectDB();

        console.log('--- ENQUIRY Master ---');
        // Try RequestNo '17'
        const enq = await sql.query(`SELECT ID, RequestNo, LeadJobPrefix, ProjectName FROM EnquiryMaster WHERE RequestNo = '17' OR ID = 17`);
        console.table(enq.recordset);
        if (enq.recordset.length === 0) {
            console.log('No Enquiry found with RequestNo or ID 17');
            process.exit(1);
        }
        const reqNo = enq.recordset[0].RequestNo;

        console.log('--- ENQUIRY ITEMS (EnquiryFor) ---');
        const jobs = await sql.query(`SELECT ID, ItemName, ParentID, LeadJobCode FROM EnquiryFor WHERE RequestNo = '${reqNo}'`);
        console.table(jobs.recordset);

        console.log('--- PRICING OPTIONS ---');
        const opts = await sql.query(`SELECT ID, Name, ItemName, CustomerName, LeadJobName FROM EnquiryPricingOptions WHERE RequestNo = '${reqNo}'`);
        console.table(opts.recordset);

        console.log('--- PRICING VALUES (Sample) ---');
        const vals = await sql.query(`SELECT OptionID, EnquiryForItem, EnquiryForID, Price, CustomerName, LeadJobName FROM EnquiryPricingValues WHERE RequestNo = '${reqNo}' AND Price > 0`);
        console.table(vals.recordset);

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
run();
