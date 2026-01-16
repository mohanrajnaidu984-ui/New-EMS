const { connectDB, sql } = require('./dbConfig');

async function fixSchema() {
    try {
        await connectDB();
        console.log('Connected.');

        await sql.query`
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[EnquiryPricingOptions]') AND name = 'ItemName')
            BEGIN
                ALTER TABLE [dbo].[EnquiryPricingOptions] ADD [ItemName] NVARCHAR(255) NULL;
                PRINT 'Added ItemName';
            END
            ELSE
            BEGIN
                PRINT 'ItemName exists';
            END
        `;
        console.log('Schema update complete.');
        process.exit(0);
    } catch (err) {
        console.error('Schema update failed:', err);
        process.exit(1);
    }
}

fixSchema();
