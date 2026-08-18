const fs = require('fs');
const { execSync } = require('child_process');

// Find all .entity.ts files
const files = execSync("find src -name '*.entity.ts'").toString().split('\n').filter(Boolean);

let count = 0;
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Find all property definitions that have a union with null and are decorated with @Column
  // A simplistic approach: replace `type: Type | null;` with `type: Type;`
  // We only want to do this for primitive properties: string, number, boolean, Date
  const regex = /(@Column[^{;]*;?\s*)([a-zA-Z0-9_]+)\s*:\s*(string|number|boolean|Date)\s*\|\s*null;/g;
  content = content.replace(regex, '$1$2: $3;');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    count++;
    console.log('Fixed', file);
  }
}
console.log(`Fixed ${count} files.`);
