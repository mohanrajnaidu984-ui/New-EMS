const nodemailer = require('nodemailer');
require('dotenv').config();

// Determine secure flag based on port
const isSecure = process.env.SMTP_PORT == 465;

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/^"|"$/g, '') : process.env.SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false
    },
    logger: true, // Log to console
    debug: true   // Include SMTP traffic
});

const sendAcknowledgementEmail = async (enquiryData, customerEmail, seEmail, ceoSign) => {
    try {
        const { RequestNo, ProjectName, ClientName, DetailsOfEnquiry, Remark } = enquiryData;

        // Debug: Log incoming data
        console.log('--- sendAcknowledgementEmail ---');
        console.log(`To: ${customerEmail}`);
        console.log(`CC: ${seEmail}`);
        console.log(`Env SMTP_USER: ${process.env.SMTP_USER}`);

        const formattedDate = new Date(enquiryData.EnquiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');

        const htmlContent = `
            <div style="font-family: Arial, sans-serif; color: #333;">
                <p>Dear Customer,</p>
                <p>Greetings !!!</p>
                <br>
                <p>On behalf of Almoayyed Air Conditioning, please accept our grateful thanks for your valuable enquiry. Our representative would get in touch with you at the earliest. We thank you and assure you of our best attention and services at all times.</p>
                <br>
                <table style="border-collapse: collapse; width: 100%; max-width: 800px; border: 1px solid #ddd;">
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; background-color: #d4edda; width: 30%;">Enquiry Ref No. :</td>
                        <td style="padding: 8px; border: 1px solid #ddd; background-color: #ffffff;">${RequestNo}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; background-color: #d4edda;">Project Name:</td>
                        <td style="padding: 8px; border: 1px solid #ddd; background-color: #ffffff;">${ProjectName || ''}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; background-color: #d4edda;">Client Name:</td>
                        <td style="padding: 8px; border: 1px solid #ddd; background-color: #ffffff;">${ClientName || ''}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; background-color: #d4edda;">Enquiry Details :</td>
                        <td style="padding: 8px; border: 1px solid #ddd; background-color: #ffffff;">${DetailsOfEnquiry || ''}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; background-color: #d4edda;">Remarks:</td>
                        <td style="padding: 8px; border: 1px solid #ddd; background-color: #ffffff;">${Remark || ''}</td>
                    </tr>
                </table>
                <br>
                <p style="color: red; font-weight: bold;">Kindly note your communication Ref No. for the subject shall be ${RequestNo}.</p>
                <br>
                <p>Best regards,</p>
                ${ceoSign ? '<p><strong>ED/CEO</strong></p>' : ''}
            </div>
        `;

        const mailOptions = {
            from: 'ems@almoayyedcg.com', // HARDCODED ADDRESS
            to: customerEmail,
            cc: seEmail,
            subject: `Acknowledgement of enquiry - ${RequestNo} dated ${formattedDate}`,
            html: htmlContent
        };

        console.log('--- Mail Options ---');
        console.log(`From: ${mailOptions.from}`);
        console.log(`To: ${mailOptions.to}`);
        console.log(`CC: ${mailOptions.cc}`);
        console.log(`Subject: ${mailOptions.subject}`);

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully!');
        console.log('Message ID:', info.messageId);
        console.log('Response:', info.response);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        if (error.response) {
            console.error('SMTP Response:', error.response);
        }
        return false;
    }
};

module.exports = { sendAcknowledgementEmail };
