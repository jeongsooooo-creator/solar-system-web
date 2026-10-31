// No package installation needed. Rebuild after editing astronomy-worker.js.
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const license = '/* Astronomy Engine: MIT, Copyright (c) 2019-2025 Don Cross. See vendor/LICENSE.astronomy-engine.txt. */\n';
const source = read('vendor/astronomy.browser.min.js') + '\n' + read('astronomy-worker.js').replace("importScripts('vendor/astronomy.browser.min.js');", '');
fs.writeFileSync(path.join(__dirname, 'solar-system-worker.bundle.js'), license + 'window.SolarWorkerSource = ' + JSON.stringify(source) + ';\n');
console.log('Built solar-system-worker.bundle.js');
