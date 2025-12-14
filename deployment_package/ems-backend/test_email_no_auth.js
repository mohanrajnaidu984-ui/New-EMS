const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    tls: { rejectUnauthorized: false },
    logger: true,
    debug: true
});

async function test() {
    console.log('Testing sending WITHOUT authentication...');
    try {
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: 'mohanraj.naidu984@gmail.com',
            subject: 'Test No Auth',
            text: 'Testing email sending without authentication.'
        });
        console.log('✅ Success! Server accepts no-auth sending.');
    } catch (err) {
        console.error('❌ Failed without auth:', err.message);
    }
}

test();
