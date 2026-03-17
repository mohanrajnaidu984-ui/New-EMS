const { sql, connectDB, dbConfig } = require('./dbConfig');

async function testConnection() {
    try {
        console.log('Testing connection with config:', { ...dbConfig, password: '***' });
        await sql.connect(dbConfig);
        console.log('✅ Connection successful!');
        const res = await sql.query`SELECT @@VERSION as version`;
        console.log('DB Version:', res.recordset[0].version);
    } catch (err) {
        console.error('❌ Connection FAILED!');
        console.error('Error Code:', err.code);
        console.error('Error Message:', err.message);
        if (err.originalError) {
            console.error('Original Error:', err.originalError.message);
        }
    } finally {
        await sql.close();
    }
}

testConnection();
