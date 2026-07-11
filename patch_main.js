const fs = require('fs');
let js = fs.readFileSync('src/main.js', 'utf8');

js = js.replace(
  "document.getElementById('arb-min-spread')?.addEventListener('input', () => {",
  "document.getElementById('arb-interval-preset')?.addEventListener('change', () => {"
);
js = js.replace(
  "document.getElementById('arb-pos-size')?.addEventListener('input', () => {",
  "document.getElementById('arb-pos-size')?.addEventListener('change', () => {"
);

fs.writeFileSync('src/main.js', js);
