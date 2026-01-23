const { sql, connectDB } = require('./dbConfig');

async function debugRoute() {
    try {
        await connectDB();
        const requestNo = '104';

        const rawItemsResult = await sql.query`SELECT ItemName FROM EnquiryFor WHERE RequestNo = ${requestNo}`;
        const rawItems = rawItemsResult.recordset;
        console.log('Raw Items:', rawItems.map(r => r.ItemName));

        const availableProfiles = [];

        for (const item of rawItems) {
            let itemName = item.ItemName;
            let cleanName = itemName.replace(/^(L\d+|Sub Job)\s*-\s*/i, '').trim();
            console.log(`Checking: '${itemName}' / Clean: '${cleanName}'`);

            // Replicate exactly
            let masterRes = await sql.query`SELECT * FROM Master_EnquiryFor WHERE ItemName = ${itemName} OR ItemName = ${cleanName}`;

            console.log(`Found: ${masterRes.recordset.length} matches`);

            if (masterRes.recordset.length > 0) {
                const m = masterRes.recordset[0];
                console.log(`   -> Match: ${m.CompanyName}`);
            }
        }

    } catch (err) { console.error(err); }
    process.exit(0);
}
debugRoute();
