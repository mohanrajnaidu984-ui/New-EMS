const { sql, dbConfig } = require('./dbConfig');

async function checkValues() {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`SELECT OptionID, Price, EnquiryForItem FROM EnquiryPricingValues WHERE RequestNo = '10'`;
        console.log(JSON.stringify(result.recordset, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await sql.close();
    }
}

checkValues();
