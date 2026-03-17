
const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function checkData() {
    try {
        await sql.connect(config);
        console.log('Connected to DB');

        const requestNo = '20';
        console.log(`\n--- EnquiryFor for RequestNo ${requestNo} ---`);
        const efResult = await sql.query`
            SELECT EF.ID, EF.ParentID, EF.ItemName, MEF.CommonMailIds, MEF.CCMailIds, MEF.DepartmentName 
            FROM EnquiryFor EF
            LEFT JOIN Master_EnquiryFor MEF ON (
                EF.ItemName = MEF.ItemName OR 
                EF.ItemName LIKE '% - ' + MEF.ItemName OR
                EF.ItemName LIKE MEF.ItemName + ' %'
            )
            WHERE EF.RequestNo = ${requestNo}`;
        console.log(JSON.stringify(efResult.recordset, null, 2));

        console.log('\n--- Master_ConcernedSE (Full List) ---');
        const cseResult = await sql.query`SELECT FullName, EmailId, Department FROM Master_ConcernedSE WHERE Status = 'Active'`;
        console.log(JSON.stringify(cseResult.recordset, null, 2));

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

checkData();
