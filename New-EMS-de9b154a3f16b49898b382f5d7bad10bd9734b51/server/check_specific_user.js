const { connectDB, sql } = require('./dbConfig');

async function checkUser() {
    try {
        await connectDB();
        const email = 'bmselveng1@almoayyedcg.com';

        console.log(`Searching for email: "${email}"`);

        // Exact match
        const exactResult = await sql.query`SELECT ID, FullName, EmailId, Status FROM Master_ConcernedSE WHERE EmailId = ${email}`;
        console.log('Exact match result:', exactResult.recordset);

        // Like match (case insensitive and ignore whitespace)
        const likeResult = await sql.query`SELECT ID, FullName, EmailId, Status FROM Master_ConcernedSE WHERE EmailId LIKE ${'%' + email + '%'}`;
        console.log('Like match result:', likeResult.recordset);

        // Trimmed match
        const allUsers = await sql.query`SELECT ID, FullName, EmailId FROM Master_ConcernedSE`;
        const similar = allUsers.recordset.filter(u => u.EmailId && u.EmailId.trim().toLowerCase() === email.toLowerCase());
        console.log('Trimmed/Case-insensitive matches:', similar);

        if (exactResult.recordset.length === 0 && similar.length > 0) {
            console.log('Found a match with different casing or whitespace!');
        } else if (exactResult.recordset.length === 0 && likeResult.recordset.length === 0) {
            console.log('No similar emails found in Master_ConcernedSE.');

            // Check other tables just in case? Usually users are in Master_ConcernedSE
            const tables = await sql.query`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'`;
            console.log('Available tables:', tables.recordset.map(t => t.TABLE_NAME));
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkUser();
