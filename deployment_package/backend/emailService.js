const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const sendAcknowledgementEmail = async (enquiryData, customerEmail, seEmail, ceoSign) => {
    try {
        const { RequestNo, ProjectName, ClientName, DetailsOfEnquiry, Remark } = enquiryData;

        const htmlContent = `
            <div style="font-family: Arial, sans-serif; color: #333;">
                <p>Dear Customer,</p>
                <p>Greetings !!!</p>
                <br>
                <p>representative would get in touch with you at the earliest. We thank you and assure you of our best attention and services at all times.</p>
                <br>
                <table style="border-collapse: collapse; width: 100%; max-width: 600px; border: 1px solid #ddd;">
                    <tr style="background-color: #f2f2f2;">
                        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Enquiry Ref No. :</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${RequestNo}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Project Name:</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${ProjectName || ''}</td>
                    </tr>
                    <tr style="background-color: #f2f2f2;">
                        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Client Name:</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${ClientName || ''}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Enquiry Details :</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${DetailsOfEnquiry || ''}</td>
                    </tr>
                    <tr style="background-color: #f2f2f2;">
                        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Remarks:</td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${Remark || ''}</td>
                    </tr>
                </table>
                <br>
                <p style="color: red;">Kindly note your communication Ref No. for the subject shall be ${RequestNo}.</p>
                <br>
                <p>Best regards,</p>
                ${ceoSign ? '<p><strong>ED/CEO</strong></p>' : ''}
            </div>
        `;

        const mailOptions = {
            from: process.env.SMTP_USER,
            to: customerEmail,
            cc: seEmail,
            subject: `Enquiry Ref No. : ${RequestNo}`,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent: ' + info.response);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};

module.exports = { sendAcknowledgementEmail };
