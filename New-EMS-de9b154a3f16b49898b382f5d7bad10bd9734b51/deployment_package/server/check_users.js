const { connectDB, sql } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        const result = await sql.query`SELECT ID, FullName, EmailId FROM Master_ConcernedSE WHERE FullName LIKE '%Mohan%'`;
        console.log(result.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
