// SOURCE: https://github.com/peterpeterparker/create-ic/blob/main/esbuild.mjs
import esbuild from "esbuild";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import NodeResolve from "@esbuild-plugins/node-resolve";

const dist = join(process.cwd(), "dist");

if (!existsSync(dist)) {
  mkdirSync(dist);
}

// Packages to keep external to avoid bundling issues
const externalPatterns = [
  /^@icp-sdk/,
  /^@dfinity/,
  /^@ledgerhq/,
  /^@zondax/,
  /^node-hid/,
  /^rxjs/,
];

// Plugin to mark certain packages as external before resolution
const externalPlugin = {
  name: "external-packages",
  setup(build) {
    // Intercept imports before resolution
    build.onResolve({ filter: /.*/ }, (args) => {
      for (const pattern of externalPatterns) {
        if (pattern.test(args.path)) {
          return { path: args.path, external: true };
        }
      }
      return null; // Let other plugins handle it
    });
  },
};

const script = await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: false,
  platform: "node",
  format: "esm",
  write: false,
  banner: {
    // ESM doesn't have __dirname or require, so we create them
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
  plugins: [
    externalPlugin,
    NodeResolve.NodeResolvePlugin({
      extensions: [".ts", ".js"],
      onResolved: (resolved) => {
        // node-hid must be external for native module to work
        if (
          resolved.includes("node_modules") &&
          resolved.includes("node-hid") &&
          !resolved.includes("noevents")
        ) {
          return { external: true };
        }
        return resolved;
      },
    }),
  ],
});

writeFileSync("dist/index.mjs", `${script.outputFiles[0].text}`);
