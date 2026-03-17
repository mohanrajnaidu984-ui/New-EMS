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

async function debug() {
    try {
        console.log("Connecting to:", config.server);
        await sql.connect(config);

        console.log("\n--- Profiles in Master_EnquiryFor ---");
        const profiles = await sql.query(`
            SELECT ItemName, DivisionCode, DepartmentCode, CompanyName, CompanyLogo 
            FROM Master_EnquiryFor
        `);
        console.table(profiles.recordset);

        console.log("\n--- User Info for 'Arun' ---");
        const users = await sql.query(`
            SELECT FullName, Department, Roles, EmailId 
            FROM Master_ConcernedSE 
            WHERE FullName LIKE '%Arun%'
        `);
        console.table(users.recordset);

        await sql.close();
    } catch (err) {
        console.error("Error:", err.message);
    }
}

debug();
