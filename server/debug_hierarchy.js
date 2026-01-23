const { sql, connectDB } = require('./dbConfig');

async function checkHierarchy() {
    try {
        await connectDB();

        console.log('--- Checking Hierarchy for Enquiry 12 ---');
        const result = await sql.query`
            SELECT ID, ParentID, ItemName 
            FROM EnquiryFor 
            WHERE RequestNo = '12';
        `;

        console.table(result.recordset);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkHierarchy();
