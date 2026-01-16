const { connectDB, sql } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const requestNo = '99';

        const ef = await sql.query`SELECT ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
        console.log('EnquiryFor Items:', JSON.stringify(ef.recordset, null, 2));

        const ec = await sql.query`SELECT CustomerName FROM EnquiryCustomer WHERE RequestNo = ${requestNo}`;
        console.log('EnquiryCustomer Items:', JSON.stringify(ec.recordset, null, 2));

        if (ef.recordset.length > 0) {
            for (const item of ef.recordset) {
                const mef = await sql.query`SELECT ItemName, DepartmentCode, CompanyLogo FROM Master_EnquiryFor WHERE ItemName = ${item.ItemName}`;
                console.log(`Master Data for '${item.ItemName}':`, JSON.stringify(mef.recordset, null, 2));
            }
        }
    } catch (err) { console.error(err); }
    finally { process.exit(); }
};

run();
