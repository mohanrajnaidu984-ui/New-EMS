const { sql, dbConfig } = require('./dbConfig');
const fs = require('fs');

sql.connect(dbConfig, err => {
    if (err) return console.error(err);
    const query = `
        SELECT OptionID, EnquiryForItem, EnquiryForID, Price, CustomerName, LeadJobName
        FROM EnquiryPricingValues
        WHERE RequestNo = '13'
    `;
    new sql.Request().query(query, (err, result) => {
        if (err) console.error(err);
        else {
            const out1 = "Prices:\n" + JSON.stringify(result.recordset, null, 2);
            const q2 = `SELECT ID, OptionName, ItemName, CustomerName, LeadJobName FROM EnquiryPricingOptions WHERE RequestNo = '13'`;
            new sql.Request().query(q2, (err, r2) => {
                if (err) console.error(err);
                else {
                    const out2 = "Options:\n" + JSON.stringify(r2.recordset, null, 2);
                    fs.writeFileSync('pricing_out_fixed.txt', out1 + '\n\n' + out2);
                }
                sql.close();
            });
        }
    });
});
