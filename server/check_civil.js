const { sql, connectDB } = require('./dbConfig');

async function checkCivil() {
    try {
        await connectDB();
        const res = await sql.query`SELECT ItemName, CompanyName, DivisionCode, DepartmentCode FROM Master_EnquiryFor WHERE ItemName = 'Civil Project'`;
        console.log(JSON.stringify(res.recordset, null, 2));
        process.exit(0);
    } catch (err) { console.error(err); process.exit(1); }
}
checkCivil();
