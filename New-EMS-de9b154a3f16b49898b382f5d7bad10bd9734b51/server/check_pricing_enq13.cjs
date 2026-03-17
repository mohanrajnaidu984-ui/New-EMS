const sql = require('mssql');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
dotenv.config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }
};

async function main() {
    await sql.connect(config);

    const r2 = await sql.query`SELECT ID, ParentID, ItemName, LeadJobCode FROM EnquiryFor WHERE RequestNo = 13`;
    const r1 = await sql.query`SELECT ID, OptionName, CustomerName, LeadJobName FROM EnquiryPricingOptions WHERE RequestNo = 13`;
    const r3 = await sql.query`
        SELECT v.ID, v.OptionID, o.OptionName, v.EnquiryForID, f.ItemName, v.Price
        FROM EnquiryPricingValues v
        JOIN EnquiryPricingOptions o ON v.OptionID = o.ID
        LEFT JOIN EnquiryFor f ON v.EnquiryForID = f.ID
        WHERE o.RequestNo = 13
    `;

    const out = {
        hierarchy: r2.recordset,
        options: r1.recordset,
        values: r3.recordset
    };

    fs.writeFileSync('pricing_output13.json', JSON.stringify(out, null, 2), 'utf8');
    await sql.close();
    console.log('done');
}

main().catch(e => console.error(e.message));
