const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false, // Use true for Azure, false for local dev usually (unless configured)
        trustServerCertificate: true, // Change to false for production
        connectionTimeout: 30000, // 30 seconds
        requestTimeout: 30000 // 30 seconds
    }
};

const connectDB = async () => {
    try {
        await sql.connect(config);
        console.log('Connected to MSSQL Database');
    } catch (err) {
        console.error('Database connection failed:', err);
        process.exit(1);
    }
};

module.exports = { sql, connectDB };
