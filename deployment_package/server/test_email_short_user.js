const nodemailer = require('nodemailer');
require('dotenv').config();

const cleanPass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/^"|"$/g, '') : '';
// Extract username before @
const shortUser = process.env.SMTP_USER.split('@')[0];

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: shortUser, // Trying just 'ems'
        pass: cleanPass
    },
    tls: {
        rejectUnauthorized: false
    },
    logger: true,
    debug: true
});

async function test() {
    console.log(`Testing sending with Short User: '${shortUser}'...`);
    try {
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: 'mohanraj.naidu984@gmail.com',
            subject: 'Test Short User',
            text: 'Testing email sending with short username.'
        });
        console.log('✅ Success! Short username worked.');
    } catch (err) {
        console.error('❌ Failed with short username:', err.message);
    }
}

test();
