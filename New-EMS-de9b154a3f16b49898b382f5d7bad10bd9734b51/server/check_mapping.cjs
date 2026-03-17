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

async function check() {
    try {
        await sql.connect(config);

        const users = await sql.query`SELECT DISTINCT Department FROM Master_ConcernedSE WHERE Department IS NOT NULL`;
        const masters = await sql.query`SELECT ItemName, DepartmentCode, DivisionCode FROM Master_EnquiryFor`;

        const fs = require('fs');
        const results = {
            userDepartments: users.recordset,
            masterProfiles: masters.recordset
        };
        fs.writeFileSync('mapping_results.json', JSON.stringify(results, null, 2));
        console.log('Results written to mapping_results.json');

        await sql.close();
    } catch (err) {
        console.error(err);
    }
}

check();
