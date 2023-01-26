// SOURCE: https://github.com/peterpeterparker/create-ic/blob/main/esbuild.mjs
import esbuild from 'esbuild';
import {existsSync, mkdirSync, writeFileSync} from 'fs';
import {join} from 'path';

const dist = join(process.cwd(), 'dist');

if (!existsSync(dist)) {
  mkdirSync(dist);
}

const script = esbuild.buildSync({
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: false,
  platform: 'node',
  write: false
});

writeFileSync('dist/index.js', `${script.outputFiles[0].text}`);