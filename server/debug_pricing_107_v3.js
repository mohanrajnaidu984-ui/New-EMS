const sql = require('mssql');
const { dbConfig } = require('./dbConfig');
const fs = require('fs');

async function debugPricingData() {
    let output = '';
    const log = (msg) => {
        console.log(msg);
        output += (typeof msg === 'object' ? JSON.stringify(msg, null, 2) : msg) + '\n';
    };

    try {
        await sql.connect(dbConfig);
        log('Connected to DB');

        const requestNo = '107';
        const userEmail = 'mohanraj.naidu984@gmail.com';

        // 1. Check User
        const user = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${userEmail}`;
        log('\n--- User Details ---');
        log(user.recordset);

        // 2. Check Options
        const options = await sql.query`SELECT * FROM EnquiryPricingOptions WHERE RequestNo = ${requestNo}`;
        log('\n--- EnquiryPricingOptions (107) ---');
        log(options.recordset);

        // 3. Check Values
        const values = await sql.query`SELECT * FROM EnquiryPricingValues WHERE RequestNo = ${requestNo}`;
        log('\n--- EnquiryPricingValues (107) ---');
        log(values.recordset);

        // 4. Check master enquiry for for mapping
        const enqFor = await sql.query`SELECT * FROM Master_EnquiryFor`;
        log('\n--- Master_EnquiryFor ---');
        log(enqFor.recordset);


    } catch (err) {
        log('Error: ' + err.message);
    } finally {
        await sql.close();
        fs.writeFileSync('debug_pricing_107_data.txt', output);
        console.log("Output written to debug_pricing_107_data.txt");
    }
}

debugPricingData();
