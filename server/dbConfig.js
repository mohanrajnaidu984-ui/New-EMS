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
    if (!config.server) {
        const msg =
            'DB_SERVER is missing or empty. Ensure server/.env exists next to dbConfig.js with DB_USER, DB_PASSWORD, DB_SERVER, and DB_DATABASE (see EMS_Active/server/.env in the repo root).';
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
