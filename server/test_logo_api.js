
const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');
const path = require('path');

async function testPricingApiLogic() {
    try {
        await connectDB();

        const requestNo = '11';
        const jobsResult = await sql.query`
            SELECT 
                ef.ID, ef.ParentID, ef.ItemName, ef.ParentItemName, 
                mef.CommonMailIds, mef.CCMailIds, mef.CompanyLogo,
                mef.DepartmentName, mef.CompanyName, mef.Address, mef.Phone, mef.FaxNo
            FROM EnquiryFor ef
            LEFT JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName)
            WHERE ef.RequestNo = ${requestNo}
            ORDER BY ef.ID ASC
        `;

        fs.writeFileSync(path.join(__dirname, 'logo_api_test.json'), JSON.stringify(jobsResult.recordset, null, 2));
        console.log('Results written to logo_api_test.json');

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
testPricingApiLogic();
