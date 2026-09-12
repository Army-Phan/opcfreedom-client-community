const fs = require('fs');

let appJs = fs.readFileSync('public/app.js', 'utf8');

// Replace body: JSON.stringify({ name, url, prompt }) with body: JSON.stringify({ name, url, prompt, toolType, profileName }) in BOTH places.
appJs = appJs.replace(
  /body:\s*JSON\.stringify\(\{\s*name,\s*url,\s*prompt\s*\}\)/g,
  'body: JSON.stringify({ name, url, prompt, toolType: typeof toolType !== "undefined" ? toolType : undefined, profileName: typeof profileName !== "undefined" ? profileName : undefined })'
);

fs.writeFileSync('public/app.js', appJs);
console.log('App.js patched successfully for tool generate body!');
