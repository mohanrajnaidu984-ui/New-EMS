const { connectDB, sql } = require('./dbConfig');

const checkDebug = async () => {
    try {
        await connectDB();
        console.log('Connected to DB');

        console.log('--- USERS ---');
        const users = await sql.query`SELECT ID, FullName, EmailId FROM Master_ConcernedSE`;
        console.log(JSON.stringify(users.recordset, null, 2));

        console.log('--- NOTIFICATIONS ---');
        const notifs = await sql.query`SELECT TOP 10 * FROM Notifications ORDER BY ID DESC`;
        console.log(JSON.stringify(notifs.recordset, null, 2));

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

checkDebug();
