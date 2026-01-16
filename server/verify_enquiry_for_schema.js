const { connectDB, sql } = require('./dbConfig');

const run = async () => {
    try {
        await connectDB();
        console.log('Verifying Master_EnquiryFor schema...');

        // 1. Verify Columns
        const columns = ['DivisionCode', 'DepartmentCode', 'Phone', 'Address', 'FaxNo', 'CompanyLogo'];
        let allExist = true;
        for (const col of columns) {
            const check = await sql.query`
                SELECT COL_LENGTH('Master_EnquiryFor', ${col}) AS ColLength
            `;
            if (check.recordset[0].ColLength !== null) {
                console.log(`[OK] Column ${col} exists.`);
            } else {
                console.error(`[FAIL] Column ${col} MISSING.`);
                allExist = false;
            }
        }

        if (allExist) {
            console.log('Schema verification passed.');
        } else {
            console.error('Schema verification failed.');
            process.exit(1);
        }

        process.exit(0);
    } catch (err) {
        console.error('Error verifying schema:', err);
        process.exit(1);
    }
};

run();
