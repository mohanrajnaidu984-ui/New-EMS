const { sql, connectDB } = require('./dbConfig');

async function checkUser() {
    try {
        await connectDB();
        const email = 'ranigovardhan@gmail.com';
        const result = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${email}`;
        console.log('User check result:', JSON.stringify(result.recordset, null, 2));

        const allUsers = await sql.query`SELECT TOP 5 FullName, EmailId FROM Master_ConcernedSE`;
        console.log('Other sample users:', JSON.stringify(allUsers.recordset, null, 2));

        process.exit(0);
    } catch (err) {
        console.error('Error checking user:', err);
        process.exit(1);
    }
}

checkUser();
