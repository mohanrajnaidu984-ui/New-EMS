const { sql, connectDB } = require('./dbConfig');

async function checkContactEmail() {
    await connectDB();
    try {
        console.log('Checking email for contact: vignesh Govardhan');
        const result = await sql.query`
            SELECT ContactName, CompanyName, EmailId 
            FROM Master_ReceivedFrom 
            WHERE ContactName = 'vignesh Govardhan'
        `;

        if (result.recordset.length > 0) {
            console.log('Found Contact:', result.recordset[0]);
        } else {
            console.log('❌ Contact "vignesh Govardhan" not found in Master_ReceivedFrom');
            // List all contacts to be sure
            const all = await sql.query`SELECT TOP 10 ContactName, EmailId FROM Master_ReceivedFrom`;
            console.log('First 10 contacts:', all.recordset);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

checkContactEmail();
