const { connectDB, sql } = require('./dbConfig');
const { sendAcknowledgementEmail } = require('./emailService');
const fs = require('fs');

async function simulate() {
    try {
        await connectDB();
        const res = await sql.query`SELECT TOP 1 * FROM EnquiryMaster ORDER BY CreatedAt DESC`;
        if (res.recordset.length === 0) return;

        const enq = res.recordset[0];
        const recvRes = await sql.query`SELECT * FROM ReceivedFrom WHERE RequestNo = ${enq.RequestNo}`;

        for (const contact of recvRes.recordset) {
            const masterRes = await sql.query`SELECT EmailId FROM Master_ReceivedFrom WHERE ContactName = ${contact.ContactName} AND CompanyName = ${contact.CompanyName}`;

            if (masterRes.recordset.length > 0) {
                const email = masterRes.recordset[0].EmailId;
                console.log(`TARGET_EMAIL: "${email}"`); // Quotes to see whitespace

                const emailData = {
                    RequestNo: enq.RequestNo,
                    EnquiryDate: enq.EnquiryDate,
                    CustomerName: enq.CustomerName,
                    ProjectName: enq.ProjectName,
                    ClientName: enq.ClientName,
                    ConsultantName: enq.ConsultantName,
                    DetailsOfEnquiry: enq.EnquiryDetails
                };

                try {
                    const result = await sendAcknowledgementEmail(emailData, email, 'bmselveng1@almoayyedcg.com', false);
                    console.log(`SEND_RESULT: ${result}`);
                } catch (e) {
                    console.log(`SEND_ERROR_CAUGHT: ${e.message}`);
                }
            }
        }
    } catch (err) {
        fs.writeFileSync('sim_error.txt', err.stack || err.message);
    } finally {
        setTimeout(() => process.exit(0), 2000);
    }
}

simulate();
