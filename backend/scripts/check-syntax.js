#!/usr/bin/env node
'use strict';
// Lightweight lint step: syntax-check every backend source file.
const { readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
})(join(__dirname, '..', 'src'));
files.push(...readdirSync(__dirname).filter((f) => f.endsWith('.js')).map((f) => join(__dirname, f)));
for (const f of files) execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' });
console.log(`syntax ok: ${files.length} files`);
