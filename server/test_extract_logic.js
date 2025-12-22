const rawText = "Regards,\n\nMohanraj Naidu.G\n\nAsst. General Manager — Control Business\nAlmoayyed Air Conditioning\n\nP.O. Box 32232, Manama, Kingdom of Bahrain\n\nEmail: mohan.naidu@almoayyedcg.com | Tel: +973 17400407 |\nExt: 280 | Mob: +973 39770106\n";

function extract() {
    const processedText = rawText.replace(/\|/g, '\n');
    const lines = processedText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    console.log("Lines:", lines);

    // 3. Address (Heuristic)
    let address = '';
    const addressKeywords = ['p.o. box', 'box', 'block', 'road', 'avenue', 'st', 'building', 'flat', 'manama', 'bahrain', 'kingdom of'];
    for (const line of lines) {
        const lower = line.toLowerCase();
        // If line contains significant address keywords
        if (addressKeywords.some(kw => lower.includes(kw))) {
            console.log(`Checking line for address: "${line}"`);
            if (line.length > 10) { // filter out short noise
                address = line; // Take the first strong match
                console.log(" -> MATCHED ADDRESS");
                break;
            } else {
                console.log(" -> Too short");
            }
        }
    }

    console.log("Final Address:", address);
    const fs = require('fs');
    fs.writeFileSync('test_result.json', JSON.stringify({ lines, address }, null, 2));
}

extract();
