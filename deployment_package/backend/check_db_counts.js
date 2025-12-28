const { sql, connectDB } = require('./dbConfig');
const fs = require('fs');
const path = require('path');

async function checkCounts() {
    try {
        await connectDB();

        const queries = [
            "SELECT 'EnquiryMaster' as TableName, COUNT(*) as Count FROM EnquiryMaster",
            "SELECT 'EnquiryCustomer' as TableName, COUNT(*) as Count FROM EnquiryCustomer",
            "SELECT 'Master_CustomerName' as TableName, COUNT(*) as Count FROM Master_CustomerName",
            "SELECT 'ReceivedFrom' as TableName, COUNT(*) as Count FROM ReceivedFrom",
            "SELECT 'Master_ReceivedFrom' as TableName, COUNT(*) as Count FROM Master_ReceivedFrom",
            "SELECT 'ConcernedSE' as TableName, COUNT(*) as Count FROM ConcernedSE",
            "SELECT 'Master_ConcernedSE' as TableName, COUNT(*) as Count FROM Master_ConcernedSE",
            "SELECT 'EnquiryType' as TableName, COUNT(*) as Count FROM EnquiryType",
            "SELECT 'Master_EnquiryType' as TableName, COUNT(*) as Count FROM Master_EnquiryType",
            "SELECT 'EnquiryFor' as TableName, COUNT(*) as Count FROM EnquiryFor",
            "SELECT 'Master_EnquiryFor' as TableName, COUNT(*) as Count FROM Master_EnquiryFor"
        ];

        let output = '';

        for (const query of queries) {
            try {
                const result = await sql.query(query);
                output += `${result.recordset[0].TableName}: ${result.recordset[0].Count}\n`;
            } catch (err) {
                output += `Error running query: ${query} - ${err.message}\n`;
            }
        }

        fs.writeFileSync(path.join(__dirname, 'db_counts.txt'), output);
        console.log('Counts written to db_counts.txt');

        // sql.close(); // dbConfig might not expose close, or we can just exit
        process.exit(0);
    } catch (err) {
        console.error('Script failed:', err);
        process.exit(1);
    }
}

checkCounts();
