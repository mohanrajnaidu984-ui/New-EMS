const { sql, connectDB } = require('./dbConfig');

async function debug() {
    await connectDB();
    try {
        const result = await sql.query("SELECT DISTINCT RequestNo FROM EnquiryQuotes WHERE RequestNo LIKE '%97%'");
        if (result.recordset.length > 0) {
            const raw = result.recordset[0].RequestNo;
            console.log('Raw RequestNo in EnquiryQuotes:', JSON.stringify(raw));
            console.log('Length:', raw.length);
            for (let i = 0; i < raw.length; i++) {
                console.log(`Char at ${i}: [${raw[i]}] (code: ${raw.charCodeAt(i)})`);
            }
        } else {
            console.log('No quotes found for 97 in debug script');
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

debug();
