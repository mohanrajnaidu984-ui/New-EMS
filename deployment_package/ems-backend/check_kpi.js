const { sql, connectDB } = require('./dbConfig');

async function checkDashboardData() {
    try {
        await connectDB();

        // 1. KPI Summary
        const summary = await sql.query(`
            SELECT
                (SELECT COUNT(*) FROM EnquiryMaster WHERE CAST(EnquiryDate AS DATE) = CAST(GETDATE() AS DATE)) as EnquiriesToday,
                (SELECT COUNT(*) FROM EnquiryMaster WHERE CAST(DueDate AS DATE) = CAST(GETDATE() AS DATE)) as DueToday,
                (SELECT COUNT(*) FROM EnquiryMaster WHERE CAST(DueDate AS DATE) > CAST(GETDATE() AS DATE)) as UpcomingDues
        `);
        console.log('KPI_SUMMARY_START');
        console.log(JSON.stringify(summary.recordset[0]));
        console.log('KPI_SUMMARY_END');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkDashboardData();
