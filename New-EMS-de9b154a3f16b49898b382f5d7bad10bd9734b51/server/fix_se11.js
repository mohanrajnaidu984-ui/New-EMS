const { sql, connectDB } = require('./dbConfig');
async function run() {
    await connectDB();
    const request = new sql.Request();

    // add S. Venkata Siril Reddy to Request 11 so she/he can see it!
    let res = await request.query(`INSERT INTO ConcernedSE (RequestNo, SEName) VALUES ('11', 'S. Venkata Siril Reddy')`);
    console.log("Inserted S. Venkata Siril Reddy into Enquiry 11!");

    // test the calendar endpoint simulating Dashboard
    const res2 = await request.query(`
        DECLARE @today VARCHAR(10) = '2026-03-04';
        WITH FilteredEnquiries AS (
            SELECT em.RequestNo, em.EnquiryDate 
            FROM EnquiryMaster em
            WHERE 1=1 AND EXISTS (SELECT 1 FROM ConcernedSE cse WHERE cse.RequestNo = em.RequestNo AND cse.SEName = 'S. Venkata Siril Reddy')
        )
        SELECT * FROM FilteredEnquiries;
    `);
    console.table(res2.recordset);
    process.exit(0);
}
run();
