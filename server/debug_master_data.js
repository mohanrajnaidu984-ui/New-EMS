const { connectDB, sql } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();

        console.log('--- Items with Logos ---');
        const withLogo = await sql.query`SELECT ID, ItemName, DepartmentCode, CompanyLogo FROM Master_EnquiryFor WHERE CompanyLogo IS NOT NULL`;
        console.log(JSON.stringify(withLogo.recordset, null, 2));

        console.log('--- Items with DepartmentCode ---');
        const withCode = await sql.query`SELECT ID, ItemName, DepartmentCode FROM Master_EnquiryFor WHERE DepartmentCode IS NOT NULL`;
        console.log(JSON.stringify(withCode.recordset, null, 2));

    } catch (err) { console.error(err); }
    finally { process.exit(); }
};

run();
