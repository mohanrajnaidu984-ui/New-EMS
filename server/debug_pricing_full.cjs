const sql = require('mssql');
const { dbConfig } = require('./dbConfig');

async function listPricing() {
    try {
        await sql.connect(dbConfig);
        console.log('Connected to DB');
        const requestNo = '53';
        const result = await sql.query(`
            SELECT ID, RequestNo, OptionName, ItemName, CustomerName
            FROM EnquiryPricingOptions 
            WHERE RequestNo = '${requestNo}'
            ORDER BY CustomerName, ItemName, OptionName
        `);

        console.log('\n--- Pricing Options for 53 ---');
        result.recordset.forEach(o => {
            console.log(`[${o.ID}] Customer: '${o.CustomerName}' | Job: '${o.ItemName}' | Option: '${o.OptionName}'`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

listPricing();
