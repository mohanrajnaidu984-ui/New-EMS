const sql = require('mssql');
const { dbConfig } = require('./dbConfig');

async function checkUser() {
    try {
        await sql.connect(dbConfig);
        const email = 'vigneshgovardhan5163@gmail.com';

        console.log(`Checking user: ${email}`);
        const result = await sql.query`SELECT * FROM Master_ConcernedSE WHERE EmailId = ${email}`;

        if (result.recordset.length > 0) {
            console.log('User found:', result.recordset[0]);
        } else {
            console.log('User NOT found.');
        }

    } catch (err) {
        console.error('Error checking user:', err);
    } finally {
        await sql.close();
    }
}

checkUser();
