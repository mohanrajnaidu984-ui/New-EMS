const { sql, connectDB } = require('./dbConfig');

async function checkData104() {
    try {
        await connectDB();

        console.log('--- EnquiryFor (104) ---');
        const items = await sql.query`SELECT ItemName FROM EnquiryFor WHERE RequestNo = '104'`;
        console.log(JSON.stringify(items.recordset, null, 2));

        console.log('\n--- Master_EnquiryFor Search (BMS) ---');
        const masterItems = await sql.query`SELECT ItemName, DivisionCode, DepartmentCode, CompanyName FROM Master_EnquiryFor WHERE ItemName LIKE '%BMS%'`;
        console.log(JSON.stringify(masterItems.recordset, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkData104();
