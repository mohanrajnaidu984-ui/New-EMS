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
        trustServerCertificate: true
    }
};

async function fix() {
    try {
        await sql.connect(config);

        const requestNo = '107';
        const customerName = 'TCS';
        const itemName = 'L2 - BMS';
        const optionName = 'Base Price';

        console.log(`Checking for ${itemName} / ${optionName} for ${customerName}...`);

        // Check if exists
        const check = await sql.query`
            SELECT ID FROM EnquiryPricingOptions
            WHERE RequestNo = ${requestNo}
            AND CustomerName = ${customerName}
            AND ItemName = ${itemName}
            AND OptionName = ${optionName}
        `;

        if (check.recordset.length > 0) {
            console.log('Already exists.');
        } else {
            console.log('Missing. Creating...');

            // Get SortOrder
            const sortRes = await sql.query`
                SELECT ISNULL(MAX(SortOrder), 0) + 1 as NextOrder 
                FROM EnquiryPricingOptions 
                WHERE RequestNo = ${requestNo} AND CustomerName = ${customerName}
            `;
            const sortOrder = sortRes.recordset[0].NextOrder;

            await sql.query`
                INSERT INTO EnquiryPricingOptions (RequestNo, OptionName, SortOrder, ItemName, CustomerName)
                VALUES (${requestNo}, ${optionName}, ${sortOrder}, ${itemName}, ${customerName})
            `;
            console.log('Created successfully.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

fix();
