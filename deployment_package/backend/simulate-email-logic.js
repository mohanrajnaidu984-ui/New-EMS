const sql = require('mssql');
require('dotenv').config();
const { sendAcknowledgementEmail } = require('./emailService');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

async function simulateEmailLogic() {
    try {
        await sql.connect(config);

        // Mock Data from Request Body
        const AutoAck = true;
        const SelectedCustomers = ['TCS', 'Infosys'];
        const ackSEName = 'vignesh Govardhan'; // Assuming this is a valid SE name
        const ceosign = false;
        const emailData = {
            RequestNo: 'TEST-123',
            ProjectName: 'Test Project',
            ClientName: 'Test Client',
            DetailsOfEnquiry: 'Test Details',
            Remark: 'Test Remark'
        };

        console.log('AutoAck:', AutoAck);

        if (AutoAck) {
            console.log('AutoAck is true, preparing to send acknowledgement emails...');

            let seEmail = '';
            if (ackSEName) {
                const seRes = await sql.query`SELECT Email FROM Users WHERE FullName = ${ackSEName}`;
                if (seRes.recordset.length > 0) {
                    seEmail = seRes.recordset[0].Email;
                    console.log('SE Email found:', seEmail);
                } else {
                    console.log('SE Email NOT found for:', ackSEName);
                }
            }

            if (SelectedCustomers && SelectedCustomers.length > 0) {
                for (const custName of SelectedCustomers) {
                    const custRes = await sql.query`SELECT Email FROM Customers WHERE CompanyName = ${custName}`;
                    if (custRes.recordset.length > 0) {
                        const custEmail = custRes.recordset[0].Email;
                        if (custEmail) {
                            console.log(`Sending email to ${custName} (${custEmail}) CC: ${seEmail}`);
                            // await sendAcknowledgementEmail(emailData, custEmail, seEmail, ceosign);
                        } else {
                            console.log(`No email found for customer ${custName}`);
                        }
                    } else {
                        console.log(`Customer not found: ${custName}`);
                    }
                }
            }
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sql.close();
    }
}

simulateEmailLogic();
