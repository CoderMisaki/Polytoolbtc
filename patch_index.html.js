const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const searchHtml = `
                    <label class="arb-label-min">Min Spread (%):</label>
                    <input type="number" id="arb-min-spread" value="0.1" step="0.01" class="arb-input-min" />

                    <label class="arb-label-min">Pos Size (USDT):</label>
                    <input type="number" id="arb-pos-size" value="1000" step="100" class="arb-input-pos" />
`;

const replaceHtml = `
                    <label class="arb-label-min">Interval:</label>
                    <select id="arb-interval-preset" class="arb-input-min">
                        <option value="1H">1 Hour</option>
                        <option value="4H">4 Hours</option>
                        <option value="8H">8 Hours</option>
                    </select>

                    <label class="arb-label-min">Pos Size (USDT):</label>
                    <select id="arb-pos-size" class="arb-input-pos">
                        <option value="1000">$1,000</option>
                        <option value="5000">$5,000</option>
                        <option value="10000">$10,000</option>
                    </select>
`;

html = html.replace(searchHtml, replaceHtml);
fs.writeFileSync('index.html', html);
console.log('HTML patched successfully');
