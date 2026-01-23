const { sql, connectDB } = require('./dbConfig');

async function debugQuery() {
    try {
        await connectDB();

        let query = `
            SELECT 
                E.RequestNo, E.ProjectName, E.CustomerName, E.ClientName, E.ConsultantName, E.DueDate, E.Status,
                (
                    SELECT STRING_AGG(CAST(Items.ItemName AS NVARCHAR(MAX)) + '|' + Items.PriceStr, ';;')
                    FROM (
                        SELECT 
                            EF.ItemName,
                            COALESCE(CAST((
                                SELECT SUM(Price) 
                                FROM EnquiryPricingValues v 
                                WHERE v.RequestNo = EF.RequestNo 
                                AND (v.EnquiryForID = EF.ID OR v.EnquiryForItem = EF.ItemName)
                            ) AS NVARCHAR(50)), 'Not Updated') as PriceStr
                        FROM EnquiryFor EF
                        WHERE EF.RequestNo = E.RequestNo
                    ) Items
                ) as SubJobPrices
            FROM EnquiryMaster E
            WHERE (E.Status IN ('Open', 'Enquiry') OR E.Status IS NULL OR E.Status = '')
            ORDER BY E.DueDate DESC, E.RequestNo DESC
        `;

        const result = await sql.query(query);
        console.log('Query result count:', result.recordset.length);
        console.log(JSON.stringify(result.recordset, null, 2));

    } catch (err) {
        console.error('Query Error:', err);
    } finally {
        await sql.close();
    }
}

debugQuery();
