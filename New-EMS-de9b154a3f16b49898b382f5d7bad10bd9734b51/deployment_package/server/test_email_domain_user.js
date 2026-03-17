const nodemailer = require('nodemailer');
require('dotenv').config();

const cleanPass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/^"|"$/g, '') : '';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: 'ALMOAYYEDCG\\ems', // Trying domain prefix
        pass: cleanPass
    },
    tls: {
        rejectUnauthorized: false
    },
    logger: true,
    debug: true
});

async function test() {
    console.log('Testing sending with DOMAIN\\User...');
    try {
        await transporter.sendMail({
            from: process.env.SMTP_USER, // Still send FROM the email address
            to: 'mohanraj.naidu984@gmail.com',
            subject: 'Test Domain User',
            text: 'Testing email sending with domain prefix.'
        });
        console.log('✅ Success! Domain prefix worked.');
    } catch (err) {
        console.error('❌ Failed with domain prefix:', err.message);
    }
}

test();
