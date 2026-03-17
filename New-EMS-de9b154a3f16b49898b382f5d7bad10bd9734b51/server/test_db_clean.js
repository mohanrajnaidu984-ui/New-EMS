const { sql, dbConfig } = require('./dbConfig');

async function testConnection() {
    const cleanConfig = { ...dbConfig };
    if (cleanConfig.password) cleanConfig.password = cleanConfig.password.replace(/^"|"$/g, '');
    if (cleanConfig.user) cleanConfig.user = cleanConfig.user.replace(/^"|"$/g, '');

    try {
        console.log('Testing connection with clean config:', { ...cleanConfig, password: '***' });
        await sql.connect(cleanConfig);
        console.log('✅ Connection successful with clean config!');
    } catch (err) {
        console.error('❌ Connection FAILED even with clean config!');
        console.error('Error Code:', err.code);
        console.error('Error Message:', err.message);
    } finally {
        await sql.close();
    }
}

testConnection();
