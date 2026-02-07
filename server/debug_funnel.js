const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');

const run = async () => {
    try {
        await connectDB();
        const year = 2026;
        const division = 'BMS';

        // 1. Find the target RequestNo
        const result = await new sql.Request().query(`
            SELECT 
                RequestNo,
                ProbabilityOption, 
                Status, 
                CustomerPreferredPrice
            FROM EnquiryMaster 
            WHERE YEAR(EnquiryDate) = ${year} 
              AND ProbabilityOption LIKE 'Very High Chance%' 
              AND Status NOT IN ('Won', 'Lost')
        `);

        let output = { enquiries: result.recordset, details: [] };

        if (result.recordset.length > 0) {
            const reqNo = result.recordset[0].RequestNo;

            // 2. Check EnquiryFor Items
            const itemsRes = await new sql.Request().query(`
                SELECT * FROM EnquiryFor WHERE RequestNo = '${reqNo}'
            `);

            // 3. Check if they map to BMS
            for (const item of itemsRes.recordset) {
                const name = item.ItemName;
                const mappingRes = await new sql.Request().query(`
                    SELECT * FROM Master_EnquiryFor 
                    WHERE ItemName = '${name}' OR '${name}' LIKE '% - ' + ItemName
                `);
                output.details.push({ item: item, mapping: mappingRes.recordset });
            }
        }

        fs.writeFileSync('debug_funnel_result.json', JSON.stringify(output, null, 2));

    } catch (err) {
        console.error(err);
        fs.writeFileSync('debug_funnel_result.json', JSON.stringify({ error: err.message }));
    }
    process.exit(0);
};

run();
