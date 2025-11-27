import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json to get version
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
const version = packageJson.version;

// Read control.html
const controlHtmlPath = join(__dirname, '../web-server/control.html');
let controlHtml = readFileSync(controlHtmlPath, 'utf-8');

// Replace version placeholder with actual version
controlHtml = controlHtml.replace(/v\d+\.\d+\.\d+(\s*BETA)?/g, `v${version}`);

// Write back to control.html
writeFileSync(controlHtmlPath, controlHtml, 'utf-8');

console.log(`✓ Injected version ${version} into control.html`);
