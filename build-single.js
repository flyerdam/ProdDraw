const fs = require('fs');
const path = require('path');

// === Configuration ===
const PROJECT_ROOT = __dirname;
const INDEX_FILE = path.join(PROJECT_ROOT, 'index.html');
const CSS_FILE = path.join(PROJECT_ROOT, 'css', 'styles.css');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'ProdDraw.html');

// Explicit, ordered list of JS files (order is critical — shared global scope)
const JS_FILES = [
  'js/01-state.js',
  'js/projects.js',
  'js/02-i18n.js',
  'js/03-undo.js',
  'js/04-geometry.js',
  'js/05-zip.js',
  'js/06-svg.js',
  'js/07-snap.js',
  'js/08-interaction.js',
  'js/09-props.js',
  'js/10-groups.js',
  'js/11-library.js',
  'js/12-shapes-modal.js',
  'js/13-variants.js',
  'js/14-project.js',
  'js/15-xlsx.js',
  'js/16-canvas-format.js',
  'js/17-config.js',
  'js/18-help.js',
  'js/19-settings.js',
  'js/20-menus-dnd.js',
  'js/21-init.js'
].map(relPath => path.join(PROJECT_ROOT, relPath));

// === Helper: check if file exists ===
function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// === Helper: read file with error handling ===
function readFile(filePath) {
  const name = path.relative(PROJECT_ROOT, filePath);
  if (!fileExists(filePath)) {
    throw new Error(`Missing file: ${name}`);
  }
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read ${name}: ${err.message}`);
  }
}

// === Main ===
console.log('Building single-file bundle...');

// 1. Read index.html
let html = readFile(INDEX_FILE);

// 2. Read CSS file
const css = readFile(CSS_FILE);

// 3. Read all JS files in order
const jsContents = JS_FILES.map(filePath => readFile(filePath));
const combinedJs = jsContents.join('\n');

// 4. Transform HTML:
//    - Replace <link rel="stylesheet" href="css/styles.css"> with inline <style>
//    - Replace all <script src="js/..."></script> tags with one inline <script>

// NOTE: replacement MUST be a function, not a string. As a string, $$ -> $,
// $& etc. are special in String.replace and would corrupt JS/CSS containing '$'.

// Replace CSS link with inline style
html = html.replace(
  /<link\s+rel="stylesheet"\s+href="css\/styles\.css">/,
  () => '<style>\n' + css + '\n</style>'
);

// Replace all contiguous <script src="js/..."></script> tags with single inline <script>
// This regex matches one or more script tags on separate lines
html = html.replace(
  /(<script src="js\/[^"]*\.js"><\/script>\s*)+/g,
  () => '<script>\n' + combinedJs + '\n</script>'
);

// 5. Write output file
try {
  fs.writeFileSync(OUTPUT_FILE, html, 'utf-8');
} catch (err) {
  throw new Error(`Failed to write output file: ${err.message}`);
}

// 6. Report success
const fileSizeKB = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2);
console.log(`✓ Bundle created: ${path.relative(PROJECT_ROOT, OUTPUT_FILE)} (${fileSizeKB} KB)`);
