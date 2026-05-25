const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: String(process.env.DB_SERVER || '').trim(),
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectionTimeout: 30000,
        requestTimeout: 30000,
        enableArithAbort: true,
        useUTC: false
    }
};

const connectDB = async () => {
    const missing = [];
    if (!String(config.user || '').trim()) missing.push('DB_USER');
    if (config.password === undefined || config.password === null) missing.push('DB_PASSWORD');
    if (!String(config.server || '').trim()) missing.push('DB_SERVER');
    if (!String(config.database || '').trim()) missing.push('DB_DATABASE');
    if (missing.length) {
        const msg =
            `Missing or empty in server/.env: ${missing.join(', ')}. ` +
            'Set these for SQL Server authentication, then restart the server.';
        console.error(msg);
        throw new Error(msg);
    }
    try {
        await sql.connect(config);
        console.log('Connected to MSSQL Database');
    } catch (err) {
        console.error('Database connection failed:', err);
        throw err;
    }
};

module.exports = { sql, connectDB, dbConfig: config };
