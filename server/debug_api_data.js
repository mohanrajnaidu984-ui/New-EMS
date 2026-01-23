
const { sql, connectDB } = require('./dbConfig');

async function debugPricingApiResponse() {
    try {
        await connectDB();
        const requestNo = '11';

        // Simulating the API query
        const jobsResult = await sql.query(`
            SELECT 
                ef.ID, ef.ParentID, ef.ItemName, ef.ParentItemName, 
                mef.CommonMailIds, mef.CCMailIds, mef.CompanyLogo,
                mef.DepartmentName, mef.CompanyName, mef.Address, mef.Phone, mef.FaxNo
            FROM EnquiryFor ef
            LEFT JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName)
            WHERE ef.RequestNo = '${requestNo}'
            ORDER BY ef.ID ASC
        `);

        const jobs = jobsResult.recordset;
        const mappedJobs = jobs.map(j => ({
            id: j.ID,
            itemName: j.ItemName,
            companyLogo: j.CompanyLogo ? j.CompanyLogo.replace(/\\/g, '/') : null,
            companyName: j.CompanyName,
            hasLogoInRaw: !!j.CompanyLogo
        }));

        const fs = require('fs');
        fs.writeFileSync('api_debug_output.json', JSON.stringify(mappedJobs, null, 2), 'utf8');
        console.log('Results written to api_debug_output.json');

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
debugPricingApiResponse();
