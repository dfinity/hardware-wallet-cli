// SOURCE: https://github.com/peterpeterparker/create-ic/blob/main/esbuild.mjs
import esbuild from "esbuild";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import NodeResolve from "@esbuild-plugins/node-resolve";

const dist = join(process.cwd(), "dist");

if (!existsSync(dist)) {
  mkdirSync(dist);
}

const script = await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: true,
  platform: "node",
  write: false,
  plugins: [
    NodeResolve.NodeResolvePlugin({
      extensions: [".ts", ".js"],
      onResolved: (resolved) => {
        // We want all node modules in the same bundle.
        // Except for the node-hid module which needs to be outside to work properly.
        // There is another library with the name "hw-transport-node-hid-noevents"
        // That's why need such a fine-grained check.
        if (
          resolved.includes("node_modules") &&
          resolved.includes("node-hid") &&
          !resolved.includes("noevents")
        ) {
          return {
            external: true,
          };
        }
        return resolved;
      },
    }),
  ],
});

writeFileSync("dist/index.js", `${script.outputFiles[0].text}`);
