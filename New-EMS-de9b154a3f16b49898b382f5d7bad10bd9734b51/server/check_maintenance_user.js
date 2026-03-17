const { sql, connectDB } = require('./dbConfig');

async function checkUser() {
    try {
        await connectDB();
        const res = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = 'maintenance1@almoayyedcg.com'`;
        console.log('User Details:', JSON.stringify(res.recordset, null, 2));

        const user = res.recordset[0];
        const userDepartment = user && user.Department ? user.Department.toLowerCase().trim() : '';

        const jobsRes = await sql.query`
            SELECT TOP 10 EF.RequestNo, EF.ItemName, MEF.CommonMailIds, MEF.CCMailIds, MEF.DepartmentName
            FROM EnquiryFor EF
            LEFT JOIN Master_EnquiryFor MEF ON (EF.ItemName = MEF.ItemName OR EF.ItemName LIKE '% - ' + MEF.ItemName)
            WHERE EF.RequestNo = '442' OR EF.ItemName LIKE '%AC Maint%'
        `;
        console.log('Sample Jobs:', JSON.stringify(jobsRes.recordset, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkUser();
