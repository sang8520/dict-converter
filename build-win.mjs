/**
 * 一键构建 Windows 免安装 exe（Node SEA）
 * 用法：node build-win.mjs [node.exe 路径]
 *
 * 步骤：esbuild 打包 → 生成 SEA blob → 复制 node.exe → 注入 blob
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = import.meta.dirname;
const nodeExe =
  process.argv[2] ??
  join(process.execPath);
const build = join(root, "build");
mkdirSync(build, { recursive: true });

const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit" });

console.log("[1/4] 打包脚本");
run("npx", ["esbuild", "src/main.mjs", "--bundle", "--platform=node", "--format=cjs", "--target=node20", "--outfile=build/dict-converter.cjs"]);

console.log("[2/4] 生成 SEA blob");
run("node", ["--experimental-sea-config", "sea-config.json"]);

console.log("[3/4] 复制 node.exe");
copyFileSync(nodeExe, join(build, "dict-converter.exe"));

console.log("[4/4] 注入 blob");
run("npx", [
  "postject",
  join("build", "dict-converter.exe"),
  "NODE_SEA_BLOB",
  join("build", "sea-prep.blob"),
  "--sentinel-fuse",
  "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
]);

console.log(`完成：${join(build, "dict-converter.exe")}`);
