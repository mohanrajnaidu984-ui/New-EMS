
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

    if (in_single_quote) {
        if (char === "'" && content[i - 1] !== '\\') {
            in_single_quote = false;
        }
        continue;
    }

    if (in_double_quote) {
        if (char === '"' && content[i - 1] !== '\\') {
            in_double_quote = false;
        }
        continue;
    }

    if (in_template_literal) {
        if (char === '`' && content[i - 1] !== '\\') {
            in_template_literal = false;
        }
        continue;
    }

    // Check for comments start
    if (char === '/' && i + 1 < content.length) {
        if (content[i + 1] === '/') {
            in_line_comment = true;
            continue;
        }
        if (content[i + 1] === '*') {
            in_block_comment = true;
            continue;
        }
    }

    // Check for quotes start
    if (char === "'") {
        in_single_quote = true;
        continue;
    }
    if (char === '"') {
        in_double_quote = true;
        continue;
    }
    if (char === '`') {
        in_template_literal = true;
        continue;
    }

    if (char === '{') {
        stack.push({ char: '{', line: line_num, col: col_num });
    } else if (char === '}') {
        if (stack.length === 0) {
            console.log(`Extra closing brace '}' at line ${line_num}, col ${col_num}`);
            printContext(content, line_num);
            process.exit(0);
        }
        stack.pop();
    }
}

if (stack.length > 0) {
    stack.forEach(item => {
        console.log(`Unclosed '${item.char}' starting at line ${item.line}, col ${item.col}`);
    });
} else {
    console.log("Braces are balanced (strictly speaking)");
}

function printContext(text, line) {
    const lines = text.split('\n');
    const start = Math.max(0, line - 6);
    const end = Math.min(lines.length, line + 5);
    for (let i = start; i < end; i++) {
        console.log(`${i + 1}: ${lines[i]}`);
    }
}
