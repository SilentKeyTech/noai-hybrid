// Turns the NOAI on-device redactor (TypeScript, from SilentKeyTech/noai) into
// browser JavaScript with Node's built-in type stripper. No bundler, no native code.
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
for (const n of ['names', 'redact']) {
  let js = stripTypeScriptTypes(readFileSync(`vendor-src/${n}.ts`, 'utf8'), { mode: 'strip' });
  js = js.replace(/from '\.\/(\w+)\.ts'/g, "from './$1.js'");
  writeFileSync(`public/lib/${n}.js`, js);
  console.log(`public/lib/${n}.js`, js.length, 'chars');
}
