const { sql, connectDB } = require('./server/dbConfig');

async function check() {
    try {
        await connectDB();
        const res = await sql.query("SELECT * FROM Master_ConcernedSE");
        console.log("Total SEs:", res.recordset.length);
        if (res.recordset.length > 0) {
            console.log("First 5 SEs:");
            console.table(res.recordset.slice(0, 5).map(u => ({ Name: u.Name, EmailId: u.EmailId, Department: u.Department })));
            
            const bms = res.recordset.find(u => u.EmailId && u.EmailId.toLowerCase().includes('bmsetveng1'));
            console.log("BMS Search Result:", bms);
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

check();
