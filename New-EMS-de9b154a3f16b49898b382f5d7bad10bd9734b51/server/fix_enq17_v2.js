const { sql, connectDB } = require('./dbConfig');

async function fixData() {
    try {
        await connectDB();

        console.log('Fixing Enquiry 17 BMS Project Customer Names...');

        // 1. Update EnquiryPricingOptions
        // Any option for 'BMS Project' under 'Interiors Project' should have 'HVAC Maint' as customer
        const optRes = await sql.query`
            UPDATE EnquiryPricingOptions 
            SET CustomerName = 'HVAC Maint'
            WHERE RequestNo = '17' 
              AND ItemName = 'BMS Project' 
              AND LeadJobName = 'Interiors Project'
              AND CustomerName != 'HVAC Maint'
        `;
        console.log(`Updated ${optRes.rowsAffected[0]} options.`);

        // 2. Update EnquiryPricingValues
        // Any value for 'BMS Project' under Enquiry 17 should have 'HVAC Maint' as customer
        const valRes = await sql.query`
            UPDATE EnquiryPricingValues
            SET CustomerName = 'HVAC Maint'
            WHERE RequestNo = '17'
              AND EnquiryForItem = 'BMS Project'
              AND CustomerName != 'HVAC Maint'
        `;
        console.log(`Updated ${valRes.rowsAffected[0]} values.`);

        console.log('Done.');
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fixData();
