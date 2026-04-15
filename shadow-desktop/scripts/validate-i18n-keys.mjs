import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '../src');
const i18nDir = path.join(srcDir, 'i18n');

const enUS = JSON.parse(fs.readFileSync(path.join(i18nDir, 'en-US.json'), 'utf-8'));
const zhCN = JSON.parse(fs.readFileSync(path.join(i18nDir, 'zh-CN.json'), 'utf-8'));

function getNestedKeys(obj, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...getNestedKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

const enKeys = new Set(getNestedKeys(enUS));
const zhKeys = new Set(getNestedKeys(zhCN));

const allKeys = new Set([...enKeys, ...zhKeys]);

const tsxFiles = [];
function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      walkDir(fullPath);
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      tsxFiles.push(fullPath);
    }
  }
}

walkDir(srcDir);

const usedKeys = new Set();
const keyPattern = /(?<=[\s({[=,\n])t\(['"]([a-zA-Z0-9._]+)['"]\)/g;

for (const file of tsxFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  let match;
  while ((match = keyPattern.exec(content)) !== null) {
    usedKeys.add(match[1]);
  }
}

const missingInEN = [];
const missingInZH = [];

for (const key of usedKeys) {
  if (!enKeys.has(key)) {
    missingInEN.push(key);
  }
  if (!zhKeys.has(key)) {
    missingInZH.push(key);
  }
}

let hasErrors = false;

if (missingInEN.length > 0) {
  hasErrors = true;
  console.error('\n❌ Missing keys in en-US.json:');
  missingInEN.forEach(k => console.error(`   - ${k}`));
}

if (missingInZH.length > 0) {
  hasErrors = true;
  console.error('\n❌ Missing keys in zh-CN.json:');
  missingInZH.forEach(k => console.error(`   - ${k}`));
}

if (hasErrors) {
  console.error('\n💡 Tip: Add missing keys to both translation files\n');
  process.exit(1);
} else {
  console.log('✅ All i18n keys are present in both languages');
  process.exit(0);
}
