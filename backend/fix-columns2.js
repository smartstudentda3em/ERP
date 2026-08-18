const fs = require('fs');
const { execSync } = require('child_process');

const files = execSync("find src -name '*.entity.ts'").toString().split('\n').filter(Boolean);

let count = 0;
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replace any instance of `propertyName: type | null;`
  // as long as the type is string, number, boolean, or Date.
  // E.g., `email: string | null;` -> `email: string;`
  const regex = /([a-zA-Z0-9_]+)\s*:\s*(string|number|boolean|Date)\s*\|\s*null;/g;
  content = content.replace(regex, '$1: $2;');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    count++;
    console.log('Fixed', file);
  }
}
console.log(`Fixed ${count} files.`);
