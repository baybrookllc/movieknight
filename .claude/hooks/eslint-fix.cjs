const fs = require('fs');
const { execSync } = require('child_process');

let data = '';
process.stdin.on('data', (chunk) => { data += chunk; });
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const filePath = input.tool_response?.filePath || input.tool_input?.file_path;
    if (filePath && /\.(ts|tsx)$/.test(filePath) && fs.existsSync(filePath)) {
      execSync(`npx eslint --fix "${filePath}"`, { stdio: 'ignore', cwd: process.cwd() });
    }
  } catch {
    // best-effort formatting only; never block the tool result on lint errors
  }
});
