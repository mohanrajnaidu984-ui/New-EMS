const { connectDB, sql } = require('./dbConfig');

async function fixSchema() {
    try {
        await connectDB();
        console.log('Connected to DB');

        // Add ReceivedFrom column if not exists
        try {
            await sql.query`ALTER TABLE EnquiryMaster ADD ReceivedFrom NVARCHAR(255)`;
            console.log('Added ReceivedFrom column');
        } catch (err) {
            console.log('ReceivedFrom column likely already exists or error:', err.message);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

fixSchema();
