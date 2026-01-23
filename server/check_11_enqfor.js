const sql = require('mssql');
const config = {
    user: 'sa',
    password: 'Ranihams#204',
    server: '127.0.0.1',
    database: 'EMS_DB',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function run() {
    try {
        await sql.connect(config);
        const res = await sql.query("SELECT * FROM EnquiryFor WHERE RequestNo = '11'");
        console.log(JSON.stringify(res.recordset, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
