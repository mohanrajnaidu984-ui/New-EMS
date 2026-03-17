const http = require('http');
http.get('http://localhost:5001/api/quotes/by-enquiry/13', (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
        try {
            const quotes = JSON.parse(d);
            const fs = require('fs');
            const out = quotes.map((x, i) => {
                const qn = (x.QuoteNumber || '').replace(/[\r\n]/g, '').trim();
                const tn = (x.ToName || '').replace(/[\r\n]/g, '').trim();
                const st = (x.Status || '').replace(/[\r\n]/g, '').trim();
                return `${i}: QuoteNumber=${qn} | ToName=${tn} | Status=${st}`;
            }).join('\n');
            fs.writeFileSync('enq13_quotes_out.txt', `Total: ${quotes.length}\n${out}\n`);
            console.log('Done. Wrote to enq13_quotes_out.txt');
        } catch (e) {
            require('fs').writeFileSync('enq13_quotes_out.txt', 'ERROR: ' + e.message + '\nData: ' + d);
        }
    });
}).on('error', e => {
    require('fs').writeFileSync('enq13_quotes_out.txt', 'HTTP ERROR: ' + e.message);
});
