const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');

async function checkValues() {
    try {
        await connectDB();

        const quotes = await sql.query`SELECT TOP 10 * FROM EnquiryQuotes`;
        const enquiryFor = await sql.query`SELECT TOP 10 * FROM EnquiryFor`;

        const data = {
            EnquiryQuotes: quotes.recordset,
            EnquiryFor: enquiryFor.recordset
        };

        fs.writeFileSync('sample_values.json', JSON.stringify(data, null, 2));
        console.log('Sample values written to sample_values.json');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkValues();
