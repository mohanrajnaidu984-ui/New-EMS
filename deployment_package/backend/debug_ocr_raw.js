const Tesseract = require('tesseract.js');
const path = require('path');
const fs = require('fs');

// Path to the user's uploaded image (from metadata)
const imagePath = 'C:/Users/Vignesh/.gemini/antigravity/brain/9c1e9acf-c32d-40ce-b05c-e8b59031bf69/uploaded_image_0_1766297355600.png';

async function runDebug() {
    try {
        if (!fs.existsSync(imagePath)) {
            console.error('Image file not found at:', imagePath);
            return;
        }

        console.log('Running Tesseract on:', imagePath);
        const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');

        console.log('---------------- OCR RAW TEXT START ----------------');
        // console.log(text);
        fs.writeFileSync('ocr_text.json', JSON.stringify({ rawText: text }, null, 2));
        console.log('Saved raw text to ocr_text.json');
        console.log('---------------- OCR RAW TEXT END ----------------');

        // Test the parsing logic directly here
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        console.log('Lines found:', lines.length);

        // Quick extraction test (mirroring index.js)
        let mobile = '';
        const addressKeywords = ['p.o. box', 'box', 'block', 'road', 'manama', 'bahrain'];
        let address = '';

        for (const line of lines) {
            console.log(`Processing Line: "${line}"`);

            // Mobile Check
            if (/\d{6,}/.test(line)) {
                if (line.toLowerCase().includes('mob') || line.toLowerCase().includes('cell') || line.startsWith('+')) {
                    const match = line.match(/[+]?[\d\s-]{8,}/);
                    if (match) console.log('  -> Found Mobile Candidates:', match[0]);
                }
            }

            // Address Check
            if (addressKeywords.some(kw => line.toLowerCase().includes(kw))) {
                console.log('  -> Found Address Candidate:', line);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

runDebug();
