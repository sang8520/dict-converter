/**
 * 词典转换工具：.mdx → .dictpack.zip
 *
 * 产物是「英语学习」应用可直接导入的词典包，内含：
 *   meta.json    title / count / encoding / sourceFile
 *   index.json   { words: [], ids: [] } 按小写字母排序
 *   offsets.json { id: [start, len] }
 *   defs.bin.gz  所有释义 JSON 首尾相接后 gzip
 *
 * 用法：把 .mdx 拖到 exe 上，或双击后按提示输入路径。
 */
import { existsSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { gzipSync } from "node:zlib";
import { MDX } from "js-mdict";
import { zipSync } from "fflate";

const line = (s = "") => process.stdout.write(`${s}\n`);

/** 剥离外部 css/js/style：桌面端 MDX 的样式与脚本在浏览器里无效 */
function stripExternalRefs(html) {
  return html
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<script\b[^>]*>([\s\S]*?<\/script>)?/gi, "")
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, "");
}

/** 解析 @@@LINK 重定向；释义里可能夹 \u0000，需先剔除 */
function parseLink(def) {
  if (!def) return null;
  const cleaned = def.split("\u0000").join("").trim();
  const m = cleaned.match(/^@@@LINK=(.+)$/);
  return m ? m[1].trim() : null;
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) =>
    rl.question(question, (a) => {
      rl.close();
      res(a.trim());
    }),
  );
}

/** 等一次回车，避免双击运行时窗口闪退 */
async function pause() {
  if (!process.stdin.isTTY) return;
  await ask("\n按回车键关闭窗口…");
}

function convert(inputFile) {
  const t0 = Date.now();
  line(`[1/5] 读取 ${inputFile}`);
  const dict = new MDX(inputFile);
  const keywords = dict.keywordList;
  const sizeMb = (statSync(inputFile).size / 1024 / 1024).toFixed(1);
  line(`  ${keywords.length.toLocaleString()} 词条（源文件 ${sizeMb} MB）`);

  const headerAttr = dict.header?.Dictionary?._attributes ?? dict.header ?? {};
  const meta = {
    title: headerAttr.Title || basename(inputFile, ".mdx"),
    count: keywords.length,
    encoding: dict.meta?.encoding || "UTF-8",
    sourceFile: basename(inputFile),
    generatedAt: new Date().toISOString(),
  };
  line(`  标题：${meta.title}  编码：${meta.encoding}`);

  line("[2/5] 提取释义…");
  const words = new Array(keywords.length);
  const ids = new Array(keywords.length);
  const chunks = new Array(keywords.length);
  let linkCount = 0;
  let emptyCount = 0;
  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    const def = dict.lookup(kw.keyText)?.definition ?? "";
    const link = parseLink(def);
    let content;
    if (link) {
      content = JSON.stringify({ link });
      linkCount++;
    } else if (def) {
      content = JSON.stringify({ d: stripExternalRefs(def) });
    } else {
      content = JSON.stringify({ d: "" });
      emptyCount++;
    }
    words[i] = kw.keyText;
    ids[i] = i;
    chunks[i] = Buffer.from(content, "utf-8");
    if ((i + 1) % 20000 === 0) line(`  已处理 ${(i + 1).toLocaleString()}/${keywords.length.toLocaleString()}`);
  }
  dict.close();
  line(`  完成：重定向 ${linkCount.toLocaleString()} 条，空释义 ${emptyCount.toLocaleString()} 条`);

  line("[3/5] 排序索引…");
  const order = words.map((_, i) => i).sort((a, b) => {
    const wa = words[a].toLowerCase();
    const wb = words[b].toLowerCase();
    return wa < wb ? -1 : wa > wb ? 1 : 0;
  });
  const sortedWords = order.map((i) => words[i]);
  const sortedIds = order.map((i) => ids[i]);

  line("[4/5] 拼接释义表并压缩…");
  const offsets = {};
  let cursor = 0;
  for (let i = 0; i < chunks.length; i++) {
    offsets[i] = [cursor, chunks[i].length];
    cursor += chunks[i].length;
  }
  const defs = gzipSync(Buffer.concat(chunks), { level: 6 });
  const indexJson = Buffer.from(JSON.stringify({ words: sortedWords, ids: sortedIds }), "utf-8");
  const offsetsJson = Buffer.from(JSON.stringify(offsets), "utf-8");
  const metaJson = Buffer.from(JSON.stringify(meta, null, 2), "utf-8");

  line("[5/5] 打包…");
  const zipped = zipSync(
    {
      "meta.json": new Uint8Array(metaJson),
      "index.json": new Uint8Array(indexJson),
      "offsets.json": new Uint8Array(offsetsJson),
      "defs.bin.gz": new Uint8Array(defs),
    },
    { level: 0 }, // 内容多为 gzip/JSON，再压缩收益极低且耗时
  );
  const outFile = join(dirname(inputFile), `${basename(inputFile, ".mdx")}.dictpack.zip`);
  writeFileSync(outFile, zipped);

  line("");
  line(`完成，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  line(`  ${basename(outFile)}  ${(zipped.length / 1024 / 1024).toFixed(1)} MB`);
  line(`  ${outFile}`);
  return outFile;
}

async function main() {
  line("=== 词典转换工具： .mdx → .dictpack.zip ===");
  line("");
  let input = process.argv[2];
  if (input && existsSync(input)) {
    input = resolve(input);
  } else {
    if (!process.stdin.isTTY) {
      line("用法：dict-converter.exe <你的词典.mdx>");
      process.exitCode = 1;
      return;
    }
    let answer = await ask("把 .mdx 文件拖到这里，或直接输入完整路径，然后回车：\n> ");
    answer = answer.replace(/^["']|["']$/g, "").trim();
    if (!answer) {
      line("未输入路径，已退出。");
      return;
    }
    input = resolve(answer);
    if (!existsSync(input)) {
      line(`文件不存在：${input}`);
      await pause();
      process.exitCode = 1;
      return;
    }
  }

  if (!/\.mdx$/i.test(input)) {
    line(`注意：${basename(input)} 不是 .mdx 文件，仍尝试按 mdx 解析。`);
  }

  const out = convert(input);
  line("");
  line("下一步：打开「英语学习」→ 查词 → 管理词典 → 导入词典包，选择这个文件。");
  line("（词典只存在你自己的浏览器里，不会上传）");
  await pause();
  return out;
}

main().catch(async (e) => {
  line("");
  line(`转换失败：${e?.stack || e?.message || e}`);
  line("常见原因：文件不是标准 MDict v2 格式、已加密但未提供密码、文件损坏。");
  await pause();
  process.exitCode = 1;
});
