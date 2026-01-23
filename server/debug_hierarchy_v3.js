const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');

async function checkHierarchy() {
    try {
        await connectDB();

        const result = await sql.query`
            SELECT ID, ParentID, ItemName 
            FROM EnquiryFor 
            WHERE RequestNo = '12';
        `;

        fs.writeFileSync('hierarchy_data.json', JSON.stringify(result.recordset, null, 2));
        console.log('Written to hierarchy_data.json');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

checkHierarchy();
