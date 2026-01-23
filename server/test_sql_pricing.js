const { connectDB, sql } = require('./dbConfig');

async function testSQL() {
    try {
        await connectDB();
        const requestNo = '102';

        console.log('Testing Options Query...');
        const q1 = await sql.query`
            SELECT ID, OptionName, SortOrder, ItemName, CustomerName
            FROM EnquiryPricingOptions 
            WHERE RequestNo = ${requestNo}
            ORDER BY SortOrder ASC, ID ASC
        `;
        console.log('Options OK:', q1.recordset.length);

        console.log('Testing Values Query...');
        const q2 = await sql.query`
            SELECT OptionID, EnquiryForItem, EnquiryForID, Price, UpdatedBy, UpdatedAt, CustomerName
            FROM EnquiryPricingValues 
            WHERE RequestNo = ${requestNo}
        `;
        console.log('Values OK:', q2.recordset.length);

    } catch (err) {
        console.error('SQL Error:', err);
    } finally {
        process.exit();
    }
}

testSQL();
