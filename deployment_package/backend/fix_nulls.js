const { sql, connectDB } = require('./dbConfig');

async function fixNullEnquiryMaster() {
    try {
        await connectDB();
        console.log('Connected to database for fixing NULLs...');

        // 1. Update CustomerName from EnquiryCustomer
        console.log('Updating CustomerName...');
        await sql.query(`
            UPDATE EnquiryMaster
            SET CustomerName = EC.CustomerName
            FROM EnquiryMaster EM
            JOIN EnquiryCustomer EC ON EM.RequestNo = EC.RequestNo
            WHERE EM.CustomerName IS NULL
        `);

        // 2. Update ClientName from EnquiryMaster (Wait, ClientName is only in EnquiryMaster, if it's NULL, we can't recover it unless it's in another table? 
        // Actually, ClientName and ConsultantName are single fields. If they were not saved, they are lost for those specific records unless we have a backup or they are in transaction tables.
        // But wait, the previous code didn't save them to EnquiryMaster, so they might be lost for the recent few entries.
        // However, if they were saved in EnquiryCustomer (as 'Client' category?), we might recover.
        // But EnquiryCustomer only has CustomerName.

        // Let's check if Client/Consultant were saved in EnquiryCustomer with a specific category?
        // The schema for EnquiryCustomer is just ID, RequestNo, CustomerName.
        // So if Client/Consultant were treated as "Customers" in the frontend and saved to EnquiryCustomer, we might find them there.
        // But the frontend usually separates them.

        // If they are lost, we can't recover them. But we can at least fix CustomerName.

        console.log('Fix completed.');
        process.exit(0);
    } catch (err) {
        console.error('Fix failed:', err);
        process.exit(1);
    }
}

fixNullEnquiryMaster();
