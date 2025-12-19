import esbuild from "esbuild";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const dist = join(process.cwd(), "dist");

if (!existsSync(dist)) {
  mkdirSync(dist);
}

const script = await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true,
  platform: "node",
  format: "esm",
  write: false,
  // Keep packages with native deps or ESM issues external
  external: [
    "@icp-sdk/*",
    "@dfinity/*",
    "@ledgerhq/*",
    "@zondax/*",
    "node-hid",
  ],
  banner: {
    // ESM doesn't have require(), so we create it for any deps that need it
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
});

writeFileSync("dist/index.mjs", script.outputFiles[0].text);
