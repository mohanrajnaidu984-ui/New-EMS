const { sql, dbConfig } = require('./dbConfig');

async function checkValues() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`SELECT * FROM EnquiryPricingValues WHERE RequestNo = '10'`;
        console.table(result.recordset);
    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkValues();
