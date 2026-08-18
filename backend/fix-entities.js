const fs = require('fs');
const glob = require('glob');

// We need to find all .entity.ts files and replace property types `Type | null` with `Type` or add `?`
// But the user specifically asked to check User.email and check other columns missing explicit types.

// First let's just grep for columns with `| null`
const execSync = require('child_process').execSync;
try {
  const result = execSync("grep -rn ' | null' src/**/*.entity.ts").toString();
  console.log(result);
} catch (e) {
  console.log(e.stdout.toString());
}
