
const fs = require('fs');

const file_path = process.argv[2];
const content = fs.readFileSync(file_path, 'utf8');

let stack = [];
let line_num = 1;
let col_num = 0;

let in_single_quote = false;
let in_double_quote = false;
let in_template_literal = false;
let in_line_comment = false;
let in_block_comment = false;

for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '\n') {
        line_num++;
        col_num = 0;
        in_line_comment = false;
        continue;
    }
    col_num++;

    if (in_line_comment) continue;

    if (in_block_comment) {
        if (char === '/' && content[i - 1] === '*') {
            in_block_comment = false;
        }
        continue;
    }

    if (in_single_quote || in_double_quote || in_template_literal) {
        if (in_single_quote && char === "'" && content[i - 1] !== '\\') in_single_quote = false;
        else if (in_double_quote && char === '"' && content[i - 1] !== '\\') in_double_quote = false;
        else if (in_template_literal && char === '`' && content[i - 1] !== '\\') in_template_literal = false;
        continue;
    }

    if (char === '/') {
        if (content[i + 1] === '/') { in_line_comment = true; i++; continue; }
        if (content[i + 1] === '*') { in_block_comment = true; i++; continue; }
    }

    if (char === "'") { in_single_quote = true; continue; }
    if (char === '"') { in_double_quote = true; continue; }
    if (char === '`') { in_template_literal = true; continue; }

    if (char === '{') {
        stack.push({ char: '{', line: line_num, col: col_num });
    } else if (char === '}') {
        if (stack.length === 0) {
            console.log(`Extra closing brace '}' at line ${line_num}, col ${col_num}`);
            printContext(content, line_num);
            process.exit(0);
        }
        const popped = stack.pop();
        if (stack.length === 0) {
            console.log(`Stack became empty at line ${line_num}, col ${col_num}. Last opened '{' was from line ${popped.line}, col ${popped.col}`);
            // Check if this is the end of the file or near it
            if (line_num < 5800) {
               console.log("SUSPICIOUS: Stack became empty way before end of file.");
               printContext(content, line_num);
            }
        }
    }
}

if (stack.length > 0) {
    stack.forEach(item => {
        console.log(`Unclosed '${item.char}' starting at line ${item.line}, col ${item.col}`);
    });
}
