require('dotenv').config();
const nodemailer = require('nodemailer');

const run = async () => {
    console.log('Testing SMTP Auth...');
    console.log('Host:', process.env.SMTP_HOST);
    console.log('User:', process.env.SMTP_USER); // Should show acg\ems
    console.log('Pass:', process.env.SMTP_PASS ? '******' : 'MISSING');

    let user = process.env.SMTP_USER;
    let pass = process.env.SMTP_PASS;

    // Logic from index.js
    if (user && (user.startsWith('"') || user.startsWith("'"))) {
        user = user.substring(1, user.length - 1);
    }
    if (pass && (pass.startsWith('"') || pass.startsWith("'"))) {
        pass = pass.substring(1, pass.length - 1);
    }

    console.log('Cleaned User:', user);

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 25,
        secure: process.env.SMTP_PORT == 465,
        auth: {
            user: user,
            pass: pass
        },
        tls: {
            rejectUnauthorized: false
        },
        logger: false,
        debug: false
    });

    try {
        await transporter.verify();
        console.log('SMTP Config Verified Successfully!');

        // Try sending
        const info = await transporter.sendMail({
            from: 'ems@almoayyedcg.com',
            to: 'mohanraj.naidu984@gmail.com', // User's email from logs
            subject: 'SMTP Test - acg\\ems',
            text: 'If you receive this, the new SMTP_USER works.'
        });
        console.log('Test email sent:', info.messageId);

    } catch (err) {
        console.error('SMTP Error:', err);
    }
};

run();
