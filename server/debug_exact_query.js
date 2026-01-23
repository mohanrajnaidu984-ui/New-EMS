
const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');
async function run() {
    try {
        await connectDB();
        const requestNo = '11';
        const query = `
            SELECT 
                ef.ID, ef.ParentID, ef.ItemName, ef.ParentItemName, 
                mef.CommonMailIds, mef.CCMailIds, mef.CompanyLogo,
                mef.DepartmentName, mef.CompanyName, mef.Address, mef.Phone, mef.FaxNo
            FROM EnquiryFor ef
            LEFT JOIN Master_EnquiryFor mef ON (ef.ItemName = mef.ItemName OR ef.ItemName LIKE '% - ' + mef.ItemName)
            WHERE ef.RequestNo = @requestNo
            ORDER BY ef.ID ASC
        `;
        const res = await new sql.Request()
            .input('requestNo', sql.VarChar, requestNo)
            .query(query);

        fs.writeFileSync('exact_query_debug.json', JSON.stringify(res.recordset, null, 2));
        console.log('Done. Records found:', res.recordset.length);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
