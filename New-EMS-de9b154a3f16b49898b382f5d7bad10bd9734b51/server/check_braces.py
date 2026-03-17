
import sys

def check_brace_balance(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    line_num = 1
    col_num = 0
    
    in_single_quote = False
    in_double_quote = False
    in_template_literal = False
    in_line_comment = False
    in_block_comment = False
    
    for i, char in enumerate(content):
        if char == '\n':
            line_num += 1
            col_num = 0
            in_line_comment = False
            continue
        
        col_num += 1
        
        if in_line_comment:
            continue
            
        if in_block_comment:
            if char == '/' and content[i-1] == '*':
                in_block_comment = False
            continue
            
        if in_single_quote:
            if char == "'" and content[i-1] != '\\':
                in_single_quote = False
            continue
            
        if in_double_quote:
            if char == '"' and content[i-1] != '\\':
                in_double_quote = False
            continue
            
        if in_template_literal:
            if char == '`' and content[i-1] != '\\':
                in_template_literal = False
            continue
            
        # Check for comments start
        if char == '/' and i + 1 < len(content):
            if content[i+1] == '/':
                in_line_comment = True
                continue
            if content[i+1] == '*':
                in_block_comment = True
                continue
                
        # Check for quotes start
        if char == "'":
            in_single_quote = True
            continue
        if char == '"':
            in_double_quote = True
            continue
        if char == '`':
            in_template_literal = True
            continue
            
        if char == '{':
            stack.append(('{', line_num, col_num))
        elif char == '}':
            if not stack:
                print(f"Extra closing brace '}}' at line {line_num}, col {col_num}")
                # Print context
                start_line = max(1, line_num - 5)
                end_line = line_num + 5
                print(f"Context (lines {start_line}-{end_line}):")
                lines = content.split('\n')
                for j in range(start_line-1, min(len(lines), end_line)):
                    print(f"{j+1}: {lines[j]}")
                return
            stack.pop()
        elif char == '(':
            stack.append(('(', line_num, col_num))
        elif char == ')':
            if not stack or stack[-1][0] != '(':
                # We only track braces strictly but sometimes mismatch in parens causes issues too
                pass
            else:
                stack.pop()

    if stack:
        for item in stack:
            print(f"Unclosed '{item[0]}' starting at line {item[1]}, col {item[2]}")
    else:
        print("Braces are balanced (strictly speaking)")

if __name__ == "__main__":
    check_brace_balance(sys.argv[1])
