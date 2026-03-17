const { sql, connectDB } = require('./dbConfig');

async function checkPricingData() {
    try {
        await connectDB();
        const requestNo = '21';

        // Get Enquiry Master
        const masterRes = await sql.query`SELECT LeadJobPrefix, CustomerName FROM EnquiryMaster WHERE RequestNo = ${requestNo}`;
        console.log('Master:', masterRes.recordset[0]);

        // Get EnquiryFor items
        const jobsResult = await sql.query`
            SELECT 
                ef.ID, ef.ParentID, ef.ItemName, ef.LeadJobCode,
                mef.CommonMailIds, mef.CCMailIds, mef.CompanyLogo,
                mef.DepartmentName, mef.CompanyName, mef.Address, mef.Phone, mef.FaxNo,
                mef.DivisionCode, mef.DepartmentCode
            FROM EnquiryFor ef
            LEFT JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName)
            WHERE ef.RequestNo = ${requestNo}
            ORDER BY ef.ID ASC
        `;
        console.log('Jobs with Codes:');
        console.table(jobsResult.recordset);

        // Get Existing Quotes
        const quotesRes = await sql.query`SELECT QuoteNumber, ID, EnquiryNo, ToName, RevisionNo FROM EnquiryQuotes WHERE EnquiryNo = ${requestNo}`;
        console.log('Existing Quotes:');
        console.table(quotesRes.recordset);

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkPricingData();
