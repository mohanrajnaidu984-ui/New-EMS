const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function run() {
    try {
        await sql.connect(config);

        const data = await sql.query`
            SELECT ItemName, DivisionCode, DepartmentCode
            FROM Master_EnquiryFor
            WHERE ItemName IN ('L1 - Civil Project', 'Plumbing & FF', 'Civil Project')
        `;
        console.log('--- Master Data ---');
        console.log(JSON.stringify(data.recordset, null, 2));

        const enqData = await sql.query`
            SELECT E.ItemName, M.DivisionCode, M.DepartmentCode
            FROM EnquiryFor E
            LEFT JOIN Master_EnquiryFor M ON E.ItemName = M.ItemName
            WHERE E.RequestNo = '102'
        `;
        console.log('--- Enquiry 102 Data ---');
        console.log(JSON.stringify(enqData.recordset, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

run();
