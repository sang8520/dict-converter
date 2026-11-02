# dict-converter

把 MDict 格式的 `.mdx` 词典转换成「英语学习」应用可以导入的词典包（`.dictpack.zip`）。

一个单文件、零安装的命令行工具：不联网、不上传、不依赖运行时。

## 它做什么

```
你的词典.mdx  ──►  你的词典.dictpack.zip  ──►  「英语学习」→ 查词 → 管理词典 → 导入
```

转换后的词典包只保存在使用者自己的浏览器（IndexedDB）里，不会上传到任何服务器。

## 使用

### 方式一：拖拽（最简单）

把 `.mdx` 文件直接拖到 `dict-converter.exe` 图标上，转换结果会生成在 `.mdx` 同目录下。

### 方式二：交互输入

双击 `dict-converter.exe`，把 `.mdx` 拖进窗口或粘贴完整路径，回车。

### 方式三：命令行

```bash
dict-converter.exe "D:\词典\朗文.mdx"
```

### 提示

- 小词典几十秒；10 万词条的大词典约 1~3 分钟，期间会打印进度。
- 转换需要约「源文件大小 × 2」的内存，大词典建议先关掉其他程序。
- 只处理 `.mdx` 内的文字释义。**不支持 `.mdd`**（图片、发音）和加密词条。

## 词典包格式

`.dictpack.zip` 内部结构：

| 文件 | 内容 |
| --- | --- |
| `meta.json` | `title` / `count` / `encoding` / `sourceFile` / `generatedAt` |
| `index.json` | `{ words: string[], ids: number[] }`，按小写字母排序 |
| `offsets.json` | `{ [id]: [start, length] }`，释义在 `defs.bin.gz` 中的字节区间 |
| `defs.bin.gz` | 所有释义 JSON 首尾相接后 gzip |

每条释义是一个 JSON 对象：

- 普通词条：`{ "d": "<html>" }`，转换时已剥离外链 `<link>`、`<script>`、`<style>`
- 重定向词条（`@@@LINK=`）：`{ "link": "目标词条" }`
- 空释义：`{ "d": "" }`

读取顺序：解压 `defs.bin.gz` → 按 `offsets.json` 切片 → 用词条 id 取释义。这样整个释义表只解压一次，查词时无需随机读取。

## 从源码构建

需要 Node.js ≥ 20。

```bash
npm install

# 打包成 CJS
npm run build:bundle

# Windows 免安装 exe（Node SEA）
node build-win.mjs
# 或指定 node.exe 路径
node build-win.mjs "C:\Program Files\nodejs\node.exe"
```

产物在 `build/dict-converter.exe`。构建流程：esbuild 打包 → 生成 SEA blob → 复制 `node.exe` → `postject` 注入。

## 常见问题

**提示「文件不是标准 MDict v2 格式」**
该 `.mdx` 可能已损坏，或使用了本工具不支持的旧版/特殊格式。

**转换后释义是空的**
少数词典把正文放在 `.mdd` 资源包里，或使用了加密词条。本工具只处理 `.mdx` 内的文本释义。

**导入时提示「词典包缺少 meta.json」**
不要解压或改名 zip 内部文件，直接把整个 `.dictpack.zip` 导入。

**能转 `.mdd`（图片/发音）吗**
不能。只转换文字释义。

## 许可

本项目基于 **AGPL-3.0** 发布，完整条款见 [LICENSE](LICENSE)。

原因：转换核心复用 [js-mdict](https://github.com/zhangxiao/js-mdict)（AGPL-3.0），
因此本仓库及其二进制分发物同样受 AGPL-3.0 约束。分发本工具的二进制时请一并提供本仓库源码。

如果你的项目不能接受 AGPL，需要改用其他许可的 MDict 解析实现，或从作者处获取商业授权。

## 致谢

- [js-mdict](https://github.com/zhangxiao/js-mdict) — MDict 格式解析
- [fflate](https://github.com/101arrowz/fflate) — 压缩 / zip 打包
- [esbuild](https://esbuild.github.io/)、[postject](https://github.com/nodejs/postject) — 构建工具链
