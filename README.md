# dsh-landmarks · 世界地标 3D 巡礼

> 一个带左侧边栏入口的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：在应用里打开一间可交互的 3D 展厅，转着看四座地标。
>
> A DeepSeek Harness plugin that adds an interactive 3D gallery of famous landmarks to your sidebar.

![topic](https://img.shields.io/badge/topic-dsh--plugin-1f6feb) ![license](https://img.shields.io/badge/license-MIT-green) ![three](https://img.shields.io/badge/three.js-r160%20vendored-black)

---

## 这是什么

`dsh-landmarks` 在左侧边栏加一个 **地标 3D** 入口，点开是一间全屏展厅：

| 展品 | id | 看点 |
| --- | --- | --- |
| 埃菲尔铁塔 | `eiffel-tower` | 镂空格构，330 m，1889 |
| 长城 | `great-wall` | 顺山脊走的防御体系，明代砖石 |
| 紫禁城 | `forbidden-city` | 980 座建筑沿一条中轴线展开 |
| 泰姬陵 | `taj-mahal` | 白色大理石与四座外倾宣礼塔 |

- **左键拖拽旋转、滚轮缩放、右键平移**（OrbitControls），右侧列表点一下就换展品。
- **自动旋转**可开关；切到后台标签页会自动暂停渲染，省电。
- 每件展品配一段中文/英文说明、年代、尺度、三角面数与文件大小——中英随界面语言切换。
- 展厅自带展签样式，暗色/亮色主题下都能看。

四座地标都是**程序化建模**的 glTF 2.0 模型，随插件一起分发，不联网下载。

## 第二个入口：五间安静的屋子

同一个插件现在还带一间 **五间安静的屋子 / Quiet Rooms** 展厅，侧栏第二个入口，和地标展厅互不干扰。

| 房间 | 关键词 |
| --- | --- |
| 山居 | 初春清晨的雾、玻璃东墙、松林 |
| 湖畔 | 深秋黄昏、木屋、码头与一条小船 |
| 雪夜 | 斜顶阁楼、天窗外的雪原与月亮 |
| 麦田 | 不热的夏天、一扇朝南的窗、转着的风扇 |
| 海崖 | 暴雨夜、玻璃房、远处灯塔的扫光 |

- 场景全部在 Blender 里建模、导出 GLB，three.js 实时渲染；不是图片。
- 每间有独立机位与参数滑块（时刻 / 雪势 / 雨势），左侧 01–05 或键盘 `1`–`5` 切换，`R` 复位。
- 页面是自包含的静态站点，放在 `assets/rooms/`；面板把它的 HTML 以内联 `srcdoc` 载入（相对路径统一指向 `/api/landmarks/assets/rooms/`），所以它自己的排版、键盘（1–5 / ←→ / R）与滑块都原样保留。
- 宿主另外提供 `/api/landmarks/rooms/` 直接入口，方便在浏览器里单独打开调试。

## 安装

```sh
dsh plugin --profile web add github:zeme56/dsh-landmarks
```

`--profile` 换成你实际在用的 profile（官方 Desktop 用 `desktop`，`dsh web` 一般是 `web`）。装完重启宿主：`dsh web` 重开一次，Desktop 版退出重开。

> 本地开发用 `link:`：`dsh plugin --profile web add link:C:\path\to\dsh-landmarks`。

## 加一件自己的展品

这是本插件最主要的扩展点——**加模型不用改代码**：

```sh
node tools/add-model.mjs --glb D:\models\colosseum.glb --id colosseum \
  --zh 罗马斗兽场 --en Colosseum \
  --place-zh "罗马 · 意大利" --place-en "Rome · Italy" \
  --year 80 --scale-zh "高 48 m" \
  --blurb-zh "公元 80 年落成，五万人的看台围出一圈拱廊。" \
  --accent "#c9a227" --thumb D:\models\colosseum.png
```

脚本会：复制 glb 到 `assets/models/`、复制缩略图到 `assets/thumbs/`、从 glb 里读出三角面/材质/节点数并往 `assets/manifest.json` 追加一条记录。刷新页面就能看到。

细节（glb 的要求、manifest 每个字段、缩略图规格、怎么删掉一件展品）写在 [docs/EXTENDING.md](docs/EXTENDING.md)。

## 它是怎么跑起来的

```
宿主进程 lib/index.js                    浏览器 lib/client.js
├─ /api/landmarks/health                  侧栏：地标 3D
├─ /api/landmarks/manifest  ←── fetch ──  └─ 主面板：展厅
└─ /api/landmarks/assets/*  ←── 静态资源 ──   ├─ 加载 vendor/three.min.js
   ├─ models/*.glb                             ├─ 读 manifest 建列表
   thumbs/*.png                               └─ GLTFLoader 加载当前 glb
   vendor/three.min.js + GLTFLoader.js
```

- 宿主侧只做一件事：把 `assets/` 目录用带 etag、Range、MIME 白名单的路由暴露出去，并校验路径不越界（`safeRel`）。**所有渲染都在浏览器里**。
- three.js 与两个 loader 是**随包分发的 UMD 文件**（`assets/vendor/`），在浏览器里按顺序注入 `<script>`，不依赖 import map，也不需要宿主打包 React 生态之外的东西。
- 模型统一归一化到 4.2 个单位的包围盒、相机固定距离 8.8，所以新加的模型不管真实尺寸多大，进来都是同一套构图。
- 渲染循环在 `requestAnimationFrame` 里，面板失焦/切后台时停。

## 扩展

- **加模型**（不动代码）：见上面的 `tools/add-model.mjs` 与 [docs/EXTENDING.md](docs/EXTENDING.md)。
- **改镜头、灯光、自动旋转速度**：`lib/client.js` 里的 `NORMALIZED_SIZE`、`CAMERA_DISTANCE`、`PerspectiveCamera(40, …)`、`pivot.rotation.y += dt * 0.24`。
- **换一套展签排版**：同一文件里的 `CSS` 常量。

## 写一个同款插件

宿主路由 + 静态资源 + 浏览器端拉数据渲染，这一套在 [docs/BUILD-A-PLUGIN.md](docs/BUILD-A-PLUGIN.md) 里有完整拆解。

## 一个必须知道的坑

插件激活时抛错，会让**整个网页**停在启动页（`web boot: N entries did not activate`）。本插件早期版本就踩过这个坑（槽位还没声明就去注册）。原因、排查步骤和通用规则写在 [docs/BOOT-FAILURE.md](docs/BOOT-FAILURE.md)。

## 兼容性

- 需要声明 `dsh.bundle` 的宿主（0.1.0-rc.6 起），在 `dsh` 0.2.x 上开发与验证。
- 浏览器需支持 WebGL2；不支持时展厅会给降级提示而不是白屏。
- 四件展品合计约 8.9 MB，随包分发。

## 来历

本项目是照着 DeepSeek Harness Creator Mode 官方示例 prompt 合集
（[dsh-creator-mode-prompt-collection](https://cdn.deepseek.com/harness/dsh-creator-mode-prompt-collection-en.html)）里第 1 条 **「3D gallery of famous landmarks」** 的题目动手做的。模型、界面、代码都是自己写的，不是官方产物。

## License

[MIT](LICENSE)。随包分发的 three.js 及其 loader 遵循其各自的 MIT 许可。
