const sql = require('mssql');
const { dbConfig } = require('./dbConfig');
const fs = require('fs');

async function debugPricing() {
    let output = '';
    const log = (msg) => {
        console.log(msg);
        output += (typeof msg === 'object' ? JSON.stringify(msg, null, 2) : msg) + '\n';
    };

    try {
        await sql.connect(dbConfig);
        log('Connected to DB');

        const userEmail = 'mohanraj.naidu984@gmail.com';
        const enquiryId = 107;

        // 1. Check User Division
        const userResult = await sql.query`SELECT * FROM users WHERE email = ${userEmail}`;
        log('\n--- User Details ---');
        if (userResult.recordset.length > 0) {
            log(userResult.recordset[0]);
        } else {
            log('User not found');
        }

        // 2. Check Pricing Data for Enquiry 107
        // Selecting * to be safe
        const pricingResult = await sql.query`
            SELECT *
            FROM pricing 
            WHERE enquiryId = ${enquiryId}
        `;

        log('\n--- Pricing Data for Enquiry 107 ---');
        if (pricingResult.recordset.length === 0) {
            log("No pricing records found for enquiry 107");
        } else {
            // Map to show relevant columns + count
            log(`Found ${pricingResult.recordset.length} records.`);
            log(pricingResult.recordset.map(r => ({
                id: r.id,
                enquiryId: r.enquiryId,
                scope: r.scope, // 'Civil', 'Plumbing', etc.
                division: r.division, // sometimes used instead of scope
                item_name: r.item_name,
                base_price: r.base_price,
                status: r.status
            })));
        }

    } catch (err) {
        log('Error: ' + err.message);
        log(err.stack);
    } finally {
        await sql.close();
        fs.writeFileSync('debug_107_output.txt', output);
        console.log("Output written to debug_107_output.txt");
    }
}

debugPricing();
