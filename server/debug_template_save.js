const { connectDB, sql } = require('./dbConfig');

async function testSave() {
    try {
        await connectDB();
        console.log('Connected to DB');

        const templateName = 'Debug Template ' + Date.now();
        const clausesConfig = { test: 'data', complex: { nested: true } };
        const createdBy = 'Debugger';
        const configJson = JSON.stringify(clausesConfig);

        console.log('Attempting Insert...');
        console.log('TemplateName:', templateName);
        console.log('ClausesConfig Length:', configJson.length);
        console.log('CreatedBy:', createdBy);

        const result = await sql.query`
            INSERT INTO QuoteTemplates (TemplateName, ClausesConfig, CreatedBy)
            VALUES (${templateName}, ${configJson}, ${createdBy})
        `;
        console.log('Insert Success. Rows Affected:', result.rowsAffected);

    } catch (err) {
        console.error('INSERT FAILED');
        console.error('Code:', err.code);
        console.error('Message:', err.message);
        // console.error('Full Error:', err);
    } finally {
        await sql.close();
    }
}

testSave();
