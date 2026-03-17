const sql = require('mssql');
const fs = require('fs');
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
    let output = "";
    const log = (msg) => { output += msg + "\n"; };

    try {
        log("Connecting to: " + config.server);
        await sql.connect(config);

        log("\n--- Profiles in Master_EnquiryFor ---");
        const profiles = await sql.query(`
            SELECT ItemName, DivisionCode, DepartmentCode, CompanyName 
            FROM Master_EnquiryFor
        `);
        profiles.recordset.forEach(p => {
            log(`${p.ItemName} | ${p.DivisionCode} | ${p.DepartmentCode} | ${p.CompanyName}`);
        });

        log("\n--- User Info for 'Arun' ---");
        const users = await sql.query(`
            SELECT FullName, Department, Roles, EmailId 
            FROM Master_ConcernedSE 
            WHERE FullName LIKE '%Arun%'
        `);
        users.recordset.forEach(u => {
            log(`${u.FullName} | ${u.Department} | ${u.Roles} | ${u.EmailId}`);
        });

        await sql.close();
    } catch (err) {
        log("Error: " + err.message);
    }
    fs.writeFileSync('db_debug_output.txt', output);
}

debug();
