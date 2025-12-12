const { connectDB, sql } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        // Check table for Enquiry For items
        // Based on UI screenshot "Enquiry For Item Details", table might be Master_EnqItem or similar.
        // Let's list tables first if unsure, but I recall Master_EnqItem from previous context or generic names.
        // Actually, let's look at `index.js` /api/enquiry-items endpoint.

        // But I'll just check Master_EnquiryFor or Master_EnqItem columns
        const result = await sql.query`SELECT TOP 1 * FROM Master_EnqItem`;
        if (result.recordset.length > 0) {
            console.log('Master_EnqItem columns:', Object.keys(result.recordset[0]));
            console.log('Sample Data:', result.recordset[0]);
        } else {
            console.log('Master_EnqItem is empty or does not exist');
            // Try Master_EnquiryFor
            const res2 = await sql.query`SELECT TOP 1 * FROM Master_EnquiryFor`;
            console.log('Master_EnquiryFor columns:', res2.recordset.length > 0 ? Object.keys(res2.recordset[0]) : 'Empty');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
