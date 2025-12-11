const { sql, connectDB } = require('./dbConfig');

async function debugContacts() {
    await connectDB();
    try {
        console.log("--- Customers matching 'ECO' ---");
        const customers = await sql.query`SELECT * FROM Master_CustomerName WHERE CompanyName LIKE '%ECO%'`;
        console.log(JSON.stringify(customers.recordset.map(c => ({ CompanyName: c.CompanyName, ID: c.ID })), null, 2));

        console.log("\n--- All Contacts (Top 20) ---");
        const contacts = await sql.query`SELECT TOP 20 * FROM Master_ReceivedFrom`;
        console.log(JSON.stringify(contacts.recordset.map(c => ({ ContactName: c.ContactName, CompanyName: c.CompanyName })), null, 2));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

debugContacts();
