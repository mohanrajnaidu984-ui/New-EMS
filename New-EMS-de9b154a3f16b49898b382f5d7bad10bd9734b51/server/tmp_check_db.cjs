const sql = require('mssql/msnodesqlv8');
const config = {
    server: 'localhost',
    database: 'EMS_DB',
    driver: 'msnodesqlv8',
    options: { trustedConnection: true }
};

async function check() {
    try {
        await sql.connect(config);
        const result = await sql.query("SELECT ItemName, DivisionCode, DepartmentCode, CompanyName FROM Master_EnquiryFor");
        console.log(JSON.stringify(result.recordset, null, 2));

        const users = await sql.query("SELECT FullName, Department, Roles, EmailId FROM Master_ConcernedSE WHERE FullName LIKE '%Arun%'");
        console.log("Users:", JSON.stringify(users.recordset, null, 2));

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}
check();
