const { sql, connectDB } = require('./dbConfig');

async function checkData() {
    try {
        await connectDB();

        console.log('--- EnquiryFor (103) ---');
        const items = await sql.query`SELECT ItemName FROM EnquiryFor WHERE RequestNo = '103'`;
        console.log(JSON.stringify(items.recordset, null, 2));

        console.log('\n--- Master_EnquiryFor Sample ---');
        const masterItems = await sql.query`SELECT TOP 5 ItemName, DivisionCode, DepartmentCode FROM Master_EnquiryFor`;
        console.log(JSON.stringify(masterItems.recordset, null, 2));

        // Check for specific join
        if (items.recordset.length > 0) {
            const firstItem = items.recordset[0].ItemName;
            console.log(`\nChecking fuzzy match for '${firstItem}'...`);
            // Try to match ignoring L1- prefix
            let searchName = firstItem;
            if (firstItem.includes('-')) {
                searchName = firstItem.split('-')[1].trim();
            }
            console.log(`Searching Master for '${searchName}'...`);

            const match = await sql.query`SELECT ItemName, DivisionCode, DepartmentCode FROM Master_EnquiryFor WHERE ItemName = ${searchName}`;
            console.log('Match result:', JSON.stringify(match.recordset, null, 2));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkData();
