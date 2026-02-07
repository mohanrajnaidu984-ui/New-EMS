const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');
const run = async () => {
    try {
        await connectDB();
        const tables = ['Master_ConcernedSE', 'Users', 'EnquiryMaster', 'EnquiryFor'];
        const results = {};
        for (const table of tables) {
            const res = await new sql.Request().query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${table}'`);
            results[table] = res.recordset.map(c => c.COLUMN_NAME);
        }
        fs.writeFileSync('schema_debug.json', JSON.stringify(results, null, 2));
        console.log("Done");
    } catch (err) { console.error(err); }
    process.exit(0);
};
run();
