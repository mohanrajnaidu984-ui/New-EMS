
const fs = require('fs');

const file_path = process.argv[2];
const content = fs.readFileSync(file_path, 'utf8');

let stack = [];
let line_num = 1;

let in_single_quote = false;
let in_double_quote = false;
let in_template_literal = false;
let in_line_comment = false;
let in_block_comment = false;

for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '\n') {
        line_num++;
        in_line_comment = false;
        continue;
    }

    if (in_line_comment) continue;

    if (in_block_comment) {
        if (char === '/' && content[i - 1] === '*') in_block_comment = false;
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
        stack.push(line_num);
    } else if (char === '}') {
        if (stack.length === 0) {
            console.log(`Extra close brace at line ${line_num}.`);
        } else {
            stack.pop();
            if (stack.length === 0 && line_num > 204 && line_num < 5851) {
                console.log(`Stack EMPTY at line ${line_num}. It was opened at line 204? No, that's not necessarily true, but it means QuoteForm (or whatever was top level) just closed.`);
            }
        }
    }
}
if (stack.length > 0) console.log(`Stack not empty at end: ${stack.length} items. Top item from line ${stack[stack.length - 1]}`);
