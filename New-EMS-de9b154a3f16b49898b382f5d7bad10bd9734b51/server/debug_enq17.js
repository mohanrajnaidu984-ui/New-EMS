const { sql, connectDB } = require('./dbConfig');

async function checkData() {
    try {
        await connectDB();

        const master = await sql.query`SELECT CustomerName, ProjectName FROM EnquiryMaster WHERE RequestNo = '17'`;
        const jobs = await sql.query`SELECT ID, ItemName, ParentID, LeadJobCode FROM EnquiryFor WHERE RequestNo = '17'`;
        const options = await sql.query`SELECT ID, OptionName, CustomerName, ItemName, LeadJobName FROM EnquiryPricingOptions WHERE RequestNo = '17'`;
        const values = await sql.query`
            SELECT v.ID, v.OptionID, o.OptionName, v.CustomerName as ValueCustomer, v.EnquiryForItem, v.Price 
            FROM EnquiryPricingValues v
            JOIN EnquiryPricingOptions o ON v.OptionID = o.ID
            WHERE v.RequestNo = '17'
        `;

        console.log('ENQUIRY_17_MASTER_START');
        console.log(JSON.stringify(master.recordset, null, 2));
        console.log('ENQUIRY_17_MASTER_END');

        console.log('ENQUIRY_17_JOBS_START');
        console.log(JSON.stringify(jobs.recordset, null, 2));
        console.log('ENQUIRY_17_JOBS_END');

        console.log('ENQUIRY_17_OPTIONS_START');
        console.log(JSON.stringify(options.recordset, null, 2));
        console.log('ENQUIRY_17_OPTIONS_END');

        console.log('ENQUIRY_17_VALUES_START');
        console.log(JSON.stringify(values.recordset, null, 2));
        console.log('ENQUIRY_17_VALUES_END');

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkData();
