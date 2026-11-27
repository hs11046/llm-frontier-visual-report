# COMP7507 Group 3 — Final Submission Draft & Revision Guide

本目录用于存放 HKU COMP7507（2026–27 Sem 1）Group 3 最终课程提交材料的**初稿压缩包**、**可编辑 HTML 源文件**以及**后续修改与合稿说明**。

> **提交截止日期（Moodle）：2026 年 11 月 30 日**  
> **课程提交要求（单一 ZIP 文件）：**
> 1. **Final Report（单一合并 PDF）**：Part I Overall Work（≤ 20 页，不含封面与参考文献）+ Part II Individual Contributions（每人 ≤ 5 页）
> 2. **Work Package**：完整可运行的本地网页工作包 + 根目录 `index.html` 导航页
> 3. **AI Usage Report（PDF）**：说明 AI 辅助的模块、使用的模型/工具及提示词记录

---

## 一、目录结构

```text
report_submission/
├── README.md                              # 本说明文档
├── COMP7507_Group3_submission_DRAFT.zip   # 当前完整提交包初稿（14.5 MB，207 个文件）
└── editable_sources/
    ├── ai_usage_report.html               # AI 使用报告源码（可直接编辑第 5 页预留栏位）
    ├── final_report.html                  # 最终报告源码（可直接微调 Part I / Part II 文案）
    └── rebuild_pdfs.sh                    # 修改 HTML 后一键重新渲染两份 PDF 的脚本
```

### `COMP7507_Group3_submission_DRAFT.zip` 解压后内容
- `index.html`：统一提交入口页（直连两份 PDF、`work_package/index.html`、`README.md` 与 `VERIFICATION.md`）
- `final_report_draft.pdf`（19 页）：
  - 封面（1 页，含项目题目、Group 3、全员姓名与学号）
  - **Part I Overall Work（正文 12 页 + 参考文献 1 页）**：项目目标、3 条 Highlights、8 大冻结数据源与分析准则、Ch1–Ch5 实机截图与矢量数据图、假设验证修订总表、方法架构与取舍、困难与未实现计划（*Anything we wanted to do but haven't*）、数据/可视化/工具局限、13 条学术与数据引用
  - **Part II Individual Contributions（5 页，每人 1 页）**：按成员依次为 Ruan Lixin（p.14）、Qi Yingying（p.15）、Wong Yan Yuet（p.16）、Wang Ling（p.17）、Huang Shan（p.18）
- `ai_usage_report_draft.pdf`（6 页）：
  - 工具/模型说明（OpenAI Codex 整合与初稿 + Google Antigravity 排版重构与核查）
  - 第 2–4 页：23 条统筹与整合阶段中英双语提示词记录
  - 第 5 页：**已预留 5 张待补充卡片**（Early Proposal Stage 及 Ch1–Ch4 各组员）
  - 第 6 页：核验记录与提交前检查清单
- `work_package/`：203 个 Git 追踪文件（不含 `.venv`、`__pycache__`、`.DS_Store`），已内置全部冻结数据与字体，可离线运行 `bash start.sh`。
- `REVIEW_BEFORE_SUBMITTING.md`：提交前核查清单（打最终包 `--final` 时会自动剔除）。

---

## 二、各位组员需要检查与补充的内容

请各位组员下载并解压 `COMP7507_Group3_submission_DRAFT.zip`，重点核对以下两项内容：

| 成员 | 学号 | 核对 Final Report（Part II 页码） | 需在 AI Usage Report（第 5 页）补充的留空项 |
| --- | --- | --- | --- |
| **Ruan Lixin** | 3036838453 | 第 14 页（Ch1 + 全站重构 & QA） | Ch1 与全站重构使用的 AI 工具、模型及代表性提示词 |
| **Qi Yingying** | 3036791019 | 第 15 页（Ch2 Scale & Output） | Ch2 数据处理与网页搭建使用的 AI 工具、模型及提示词 |
| **Wong Yan Yuet** | 3036656878 | 第 16 页（Ch3 Cost Cliff） | Ch3 数据分析与网页搭建使用的 AI 工具、模型及提示词 |
| **Wang Ling** | 3036839055 | 第 17 页（Ch4 Parallel Trends） | Ch4 数据整理与网页搭建使用的 AI 工具、模型及提示词 |
| **Huang Shan** | 3036807507 | 第 18 页（Proposal Lead + Ch5 + 统筹） | **Early Proposal Stage**（Huang Shan 主导、全员讨论完善）的 AI 工具、模型与提示词；汇总全组修改并打最终提交包 |

### 核对要点
1. **Part II 个人贡献陈述**：确认个人任务描述、PR 贡献、核心数据结论与方法反思准确无误（如有新增细节可补充，每人上限 5 页，当前每人 1 页排版已完整对齐）。
2. **Part I 关键数值与引用**：抽查本人负责章节的图表、数据口径、局限表述是否与最终交付网页完全一致。
3. **AI Usage Report 第 5 页留空卡片**：
   - 如使用过 AI：请写明 **工具与具体模型**（如 ChatGPT GPT-4o / Claude / Cursor / Codex 等）、**辅助工作范围**、**原版提示词或代表性提示词摘录**（如为中文建议保留原文并附简短英文翻译，与第 2–4 页风格一致）。
   - 如未使用 AI：直接填写 `None used`。
   - 若某成员提示词较长，可在第 5 页之后新增一个 `<section class="page">` 延续页放置 `.prompt-item` 卡片，避免单页溢出。

---

## 三、后续修改与合稿方式（两种任选）

### 方式 A：通过 GitHub Pull Request 直接修改源码（推荐）
1. 拉取最新 `main` 分支并新建分支（如 `report/ch1-ai-prompts`）。
2. 直接编辑：
   - `report_submission/editable_sources/ai_usage_report.html`（搜索 `Pending Member Input` 定位到本人卡片，填入工具、模型、辅助工作与提示词，并将红色标签改为 `Completed` 或移除）。
   - 如需调整个人贡献陈述，编辑 `report_submission/editable_sources/final_report.html` 中对应的成员页。
3. 本地重新渲染 PDF 检查排版（需本机安装 Google Chrome / Chromium）：
   ```bash
   bash report_submission/editable_sources/rebuild_pdfs.sh
   ```
   生成的 PDF 位于 `report_submission/rendered_pdfs/`，请打开逐页检查有无溢出或换行问题。
4. 提交 PR 到 `main`，由 Huang Shan 审核合并并统一重新打包最终提交 ZIP。

> **注意**：`editable_sources/*.html` 已内嵌字体与截图，用任意浏览器双击打开即可直接预览页面效果；如果没有命令行环境，也可以在浏览器中按 `Cmd/Ctrl + P`（选择 A4、边距无、开启背景图形）快速预览分页。

### 方式 B：将文本发给 Huang Shan 统一合稿
如果不方便编辑 HTML，可直接将以下内容发至群聊或 PR 评论区，由 Huang Shan 统一填入并重新渲染终稿：
- `Member & Section`（如 Ch2 / Early Proposal Stage）
- `AI Tool(s) & Model(s)`
- `Parts of Work Assisted`
- `Prompts Used`（原文摘录）
- Part II 个人陈述的修改意见（如有）

---

## 四、生成最终提交版 ZIP（供统筹人执行）

待全员确认 Part II 并填完第 5 页 AI 披露后：
1. 将最终合并后的 `ai_usage_report.html` 与 `final_report.html` 同步回本地构建目录（`proj/report/draft_sources/`）。
2. 去掉 `ai_usage_report.html` 第 1 页底部的 `Pending Group Completion Notice` 提示框，并勾选第 6 页检查清单。
3. 运行最终打包命令（自动去掉 `_draft` / `_DRAFT` 后缀并剔除 `REVIEW_BEFORE_SUBMITTING.md`）：
   ```bash
   bash proj/report/draft_sources/rebuild_pdfs.sh --final
   ```
   这将生成可直接上传 Moodle 的最终压缩包：`COMP7507_Group3_submission.zip`。
4. **最终提交前验收**：
   - 将最终 ZIP 解压到一个全新空目录；
   - 打开根目录 `index.html` 确认 4 个入口链接全部可正常跳转；
   - 逐页检查 `COMP7507_Group3_Final_Report.pdf` 与 `COMP7507_Group3_AI_Usage_Report.pdf`；
   - 进入 `work_package/` 执行 `bash start.sh`，访问 `http://127.0.0.1:8764/` 确认 Storyboard 与 Ch1–Ch5 看板均正常加载。
