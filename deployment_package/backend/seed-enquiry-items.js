const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectionTimeout: 30000,
        requestTimeout: 30000,
        enableArithAbort: true
    }
};

// Mock data from frontend
const storedEnqItems = [
    { ItemName: "Electrical", CompanyName: "Dept A", DepartmentName: "Elect", CommonMailIds: "elect_common@a.com", Status: "Active" },
    { ItemName: "Mechanical", CompanyName: "Dept B", DepartmentName: "Mech", CCMailIds: "mech_cc1@b.com", Status: "Active" },
    { ItemName: "BMS", CompanyName: "Dept C", DepartmentName: "BMS", CommonMailIds: "bms@example.com", Status: "Active" },
    { ItemName: "HVAC", CompanyName: "Dept D", DepartmentName: "HVAC", CommonMailIds: "hvac@example.com", Status: "Active" },
    { ItemName: "Plumbing", CompanyName: "Dept E", DepartmentName: "Plumbing", CommonMailIds: "plumbing@example.com", Status: "Active" },
    { ItemName: "Fire Fighting", CompanyName: "Dept F", DepartmentName: "Fire", CommonMailIds: "fire@example.com", Status: "Active" }
];

async function seedEnquiryItems() {
    try {
        console.log('Connecting to database...');
        const pool = await sql.connect(config);
        console.log('Connected!');

        // First check what exists
        console.log('\n=== Current Enquiry Items ===');
        const existing = await pool.request().query(`SELECT * FROM Master_EnquiryFor`);
        console.log(`Count: ${existing.recordset.length}`);
        if (existing.recordset.length > 0) {
            console.table(existing.recordset);
        }

        // Seed enquiry items
        for (const item of storedEnqItems) {
            const { ItemName, CompanyName, DepartmentName, CommonMailIds, CCMailIds, Status } = item;

            // Check if item already exists
            const checkQuery = `SELECT * FROM Master_EnquiryFor WHERE ItemName = @ItemName`;
            const existingItem = await pool.request()
                .input('ItemName', sql.NVarChar, ItemName)
                .query(checkQuery);

            if (existingItem.recordset.length === 0) {
                console.log(`Adding ${ItemName}...`);
                const insertQuery = `
                    INSERT INTO Master_EnquiryFor (ItemName, CompanyName, DepartmentName, Status, CommonMailIds, CCMailIds)
                    VALUES (@ItemName, @CompanyName, @DepartmentName, @Status, @CommonMailIds, @CCMailIds)
                `;
                await pool.request()
                    .input('ItemName', sql.NVarChar, ItemName || '')
                    .input('CompanyName', sql.NVarChar, CompanyName || '')
                    .input('DepartmentName', sql.NVarChar, DepartmentName || '')
                    .input('Status', sql.NVarChar, Status || 'Active')
                    .input('CommonMailIds', sql.NVarChar, CommonMailIds || '')
                    .input('CCMailIds', sql.NVarChar, CCMailIds || '')
                    .query(insertQuery);
                console.log(`✅ Added ${ItemName}`);
            } else {
                console.log(`⏭️  ${ItemName} already exists, skipping`);
            }
        }

        console.log('\n✅ Enquiry items seeding complete!');

        // Show final state
        console.log('\n=== Final Enquiry Items ===');
        const final = await pool.request().query(`SELECT * FROM Master_EnquiryFor`);
        console.log(`Count: ${final.recordset.length}`);
        console.table(final.recordset);

        await pool.close();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

seedEnquiryItems();
