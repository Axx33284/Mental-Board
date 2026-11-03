/* Builds the setup file from App\ — `npm run setup`, after `npm run build`.

   Writes dist\Mental-Board-Setup-<version>.exe with Inno Setup 6 (ISCC.exe),
   from tools/setup.iss. The release workflow runs this on its Windows runner,
   where Inno Setup is preinstalled; on your own machine it needs Inno Setup 6
   installed (https://jrsoftware.org/isinfo.php), or ISCC=<path to ISCC.exe>.

   It packages App\ exactly as `npm run build` left it, and refuses an App\
   that is not this version's: a setup carrying an older build is the
   stale-copy problem MAP.md §6 is about, with an installer on top. Nothing
   here ships. */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'App');
const OUT = path.join(ROOT, 'dist');
const pkg = require(path.join(ROOT, 'package.json'));
const EXE = `${pkg.productName}.exe`;

function iscc() {
  if (process.env.ISCC && fs.existsSync(process.env.ISCC)) return process.env.ISCC;
  const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, 'C:\\Program Files (x86)', 'C:\\Program Files'].filter(Boolean);
  for (const dir of pf) {
    const p = path.join(dir, 'Inno Setup 6', 'ISCC.exe');
    if (fs.existsSync(p)) return p;
  }
  try { return execSync('where iscc', { encoding: 'utf8' }).split(/\r?\n/)[0].trim() || ''; } catch (_) { return ''; }
}

function main() {
  if (process.platform !== 'win32') { console.error('The setup file is built on Windows. Nothing was written.'); process.exit(1); }
  if (!fs.existsSync(path.join(APP, EXE))) { console.error(`There is no ${path.join('App', EXE)}. Run npm run build first.`); process.exit(1); }
  // the App\ being packaged must be this version's build, not one left from before
  let built = '';
  try { built = (fs.readFileSync(path.join(APP, 'BUILD.txt'), 'utf8').match(/\b(\d+\.\d+\.\d+)\b/) || [])[1] || ''; } catch (_) {}
  if (built !== pkg.version) {
    console.error(`App\\ is version ${built || 'unknown'}, package.json says ${pkg.version}. Run npm run build first.`);
    process.exit(1);
  }
  const compiler = iscc();
  if (!compiler) {
    console.error('Inno Setup 6 is not installed (no ISCC.exe). Install it from https://jrsoftware.org/isinfo.php, or set ISCC to its path.');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const name = `Mental-Board-Setup-${pkg.version}.exe`;
  try { fs.rmSync(path.join(OUT, name), { force: true }); } catch (_) {}
  console.log(`building ${name} with ${compiler}`);
  const r = spawnSync(compiler, [
    `/DAppVersion=${pkg.version}`, `/DAppDir=${APP}`, `/DOutDir=${OUT}`, '/Q',
    path.join(__dirname, 'setup.iss')
  ], { stdio: 'inherit' });
  if (r.status !== 0 || !fs.existsSync(path.join(OUT, name))) { console.error('\nthe setup file was not built'); process.exit(1); }
  const mb = (fs.statSync(path.join(OUT, name)).size / 1048576).toFixed(0);
  console.log(`\n${path.join('dist', name)} — ${mb} MB. It installs to %LOCALAPPDATA%\\Programs\\${pkg.productName} and nowhere else.`);
}
main();
