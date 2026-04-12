const { sql, connectDB } = require('./dbConfig');

const verifyColumns = async () => {
    try {
        await connectDB();
        const result = await sql.query`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Enquiries'
        `;
        console.log(JSON.stringify(result.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

verifyColumns();
