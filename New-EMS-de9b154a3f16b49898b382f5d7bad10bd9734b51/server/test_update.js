const { sql, connectDB } = require('./dbConfig');

async function doUpdate() {
    await connectDB();
    const request = new sql.Request();

    // First read what was there to be safe
    const result1 = await request.query(`SELECT EnquiryDate, DueDate, SiteVisitDate FROM EnquiryMaster WHERE RequestNo='11'`);
    console.log("Before:");
    console.table(result1.recordset);

    console.log("Updating to 2026-02-24, 2026-03-03, 2026-03-02 respectively...");

    // We update strings directly so SQL Server converts '2026-02-24' implicitly without any timezone!
    await request.query(`
        UPDATE EnquiryMaster 
        SET 
            EnquiryDate = '2026-02-24',
            DueDate = '2026-03-03',
            SiteVisitDate = '2026-03-02'
        WHERE RequestNo = '11'
    `);

    const result2 = await request.query(`SELECT EnquiryDate, DueDate, SiteVisitDate FROM EnquiryMaster WHERE RequestNo='11'`);
    console.log("After:");
    console.table(result2.recordset);

    process.exit(0);
}
doUpdate();
