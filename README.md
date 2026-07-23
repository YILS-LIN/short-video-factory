<a id="readme-top"></a>

<!-- 项目海报 -->
<div align="center">
  <img src="images/ScreenShot.png" alt="Poster" width="100%">
</div>

---

<!-- 项目LOGO -->
<br />
<div align="center">
  <a href="https://github.com/YILS-LIN/short-video-factory">
    <img src="public/icon.png" alt="Logo" height="100">
  </a>

<h3 align="center">AI Short Video Factory - 短视频工厂</h3>

  <p align="center">
    🚀 一键生成产品营销与泛内容短视频，AI批量自动剪辑，高颜值跨平台桌面端工具
  </p>

  <!-- 项目徽章 -->

[![贡献者][contributors-shield]][contributors-url]
[![分支][forks-shield]][forks-url]
[![星标][stars-shield]][stars-url]
[![问题][issues-shield]][issues-url]
[![最新版本][release-shield]][release-url]

<!-- ![发布日期][release-date-shield] -->

[![许可证][license-shield]][license-url]

  <p align="center">
    <a href="https://github.com/YILS-LIN/short-video-factory/issues/new?labels=bug&template=bug-report---.md">报告Bug</a>
    &middot;
    <a href="https://github.com/YILS-LIN/short-video-factory/issues/new?labels=enhancement&template=feature-request---.md">请求功能</a>
  </p>
</div>

<!-- 关于项目 -->

## 📖 关于项目

短视频工厂是一个开源的桌面端应用，旨在通过AI技术简化短视频的制作流程。用户可以通过简单的提示词文本+视频分镜素材，快速且自动的剪辑出高质量的产品营销和泛内容短视频。该项目集成了AI驱动的文案生成、语音合成、视频剪辑、字幕特效等功能，旨在为用户提供开箱即用的短视频制作体验。

### 核心功能

- 🤖 **AI驱动**：集成了最新的AI技术，提升视频制作效率和质量
- 📝 **文案生成**：基于提示词生成高质量的短视频文案
- 🎥 **自动剪辑**：支持多种视频格式，自动化批量处理视频剪辑任务
- 🎙️ **语音合成**：将生成的文案转换为自然流畅的语音
- 🎬 **字幕特效**：自动添加字幕和特效，提升视频质量
- 📦 **批量处理**：支持批量任务，按预设自动持续合成视频
- 🌐 **多语言支持**：支持中文、英文等多种语言，满足不同用户需求
- 📦 **开箱即用**：无需复杂配置，用户可以快速上手
- 📈 **持续更新**：定期发布新版本，修复bug并添加新功能
- 🔒 **安全可靠**：完全本地本地化运行，确保用户数据安全
- 🎨 **用户友好**：简洁直观的用户界面，易于操作
- 💻 **多平台支持**：支持Windows、macOS和Linux等多个操作系统

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 🚀 开始使用

前往 [Github Release](https://github.com/YILS-LIN/short-video-factory/releases) 下载最新版本

前往 [官方文档](https://short-video-factory.yils.blog) 查看使用手册

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 🗺️ 路线图

**喜欢可以点个 Star 支持一下哦！**

下面是已实现和计划中的功能：

- [x] 文案生成，兼容通用的 OpenAI 接口格式
- [x] 语音合成，支持EdgeTTS
- [x] 视频剪辑，文案、视频、音频、字幕合成，自动混剪
- [x] 批量处理，支持一个批量任务，按预设自动持续合成视频
- [x] 多语言支持，能够支持中文、英文等多种语言
- [x] 完善的使用手册
- [x] 智能剪辑（可选），集成 TwelveLabs，按文案语义匹配镜头素材
- [ ] 更全面的参数调整
- [ ] 更多的语音合成API
- [ ] 字幕特效，支持多种字幕样式和特效

### 🎬 智能剪辑（可选，基于 TwelveLabs）

默认情况下，素材片段为随机选取。若希望让入选镜头与文案更相关，可启用 **TwelveLabs 智能剪辑**：

- **Marengo 语义检索**：根据生成的文案，在你的素材索引中按相关性排序，优先选取最贴合内容的镜头，替代随机选取。
- **Pegasus 视频理解**：对视频 URL 进行亮点/摘要分析（主进程接口 `twelvelabsAnalyzeHighlights`）。

使用步骤：

1. 在 [twelvelabs.io](https://twelvelabs.io) 注册并获取 API Key（提供较为充足的免费额度）。
2. 在 TwelveLabs 控制台创建一个启用 Marengo embedding 的索引，并把素材库视频上传进去（视频文件名需与本地素材库一致）。
3. 在「视频素材」面板点击 **智能剪辑**，填入 API Key 与索引 ID 并保存。

该能力完全可选：**不填写 API Key 时，应用行为与之前完全一致（随机选取素材）**；任何匹配失败都会自动回退到随机选取，不会中断合成。

查看[开放问题](https://github.com/YILS-LIN/short-video-factory/issues)以获取提议功能（和已知问题）的完整列表。

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 🎞️ 示例视频

<table>
<thead>
<tr>
<th align="center"><g-emoji class="g-emoji" alias="arrow_forward">▶️</g-emoji> 《产品营销短视频》</th>
<th align="center"><g-emoji class="g-emoji" alias="arrow_forward">▶️</g-emoji> 《暖心治愈系语录》</th>
</tr>
</thead>
<tbody>
<tr>
<td align="center"><video src="https://github.com/user-attachments/assets/165a8f96-861b-4cf3-946c-444b9692cef8"></video></td>
<td align="center"><video src="https://github.com/user-attachments/assets/12694618-e0fe-4848-8a7e-98b3f3a7aece"></video></td>
</tr>
</tbody>
</table>

注：素材来源于网络，仅用于展示剪辑效果

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

<!-- 贡献 -->

## 🤝 贡献

贡献让开源社区成为了一个学习、启发和创造的绝佳场所。**非常感谢**您所做的任何贡献。

如果您有可以改善此项目的建议，请fork本项目仓库并创建一个pull request。您也可以简单地创建一个带有"enhancement"标签的issue。
不要忘记给项目点个Star！再次感谢！

1. Fork此项目
2. 创建您的功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启一个Pull Request

### 主要贡献者：

<a href="https://github.com/YILS-LIN/short-video-factory/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=YILS-LIN/short-video-factory" alt="contrib.rocks image" />
</a>

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 💖 鸣谢

- [rany2/edge-tts](https://github.com/rany2/edge-tts)
- [duyquangnvx/edge-tts](https://github.com/duyquangnvx/edge-tts)

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

<!-- 许可证 -->

## 🎗 许可证

[![许可证][license-shield]][license-url]

Copyright © 2025 YILS.

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

## 🐱 捐赠

如果这个项目对你有帮助，欢迎请作者喝杯咖啡(或者啤酒) 🍺

你的 **Star ⭐** 和 **捐赠** 是我持续更新的最大动力！

<div align="left">
  <img src="https://github.com/user-attachments/assets/6b832dd3-38ea-4927-9c3b-97549c77a1f0" alt="YILS的微信赞赏码" width="400">
</div>

👉 在此处查看捐赠者名单：[千古留名 - 捐赠者留言板](https://short-video-factory.yils.blog/donate/list.html)

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

<!-- 星标历史 -->

## ⭐ 星标历史

<div align="center">
  <a href="#">
    <img src="./images/StarHistory.png" alt="Star History Chart" width="800">
  </a>
</div>

<p align="right">(<a href="#readme-top">返回顶部</a>)</p>

<!-- MARKDOWN链接和图片 -->

[contributors-shield]: https://img.shields.io/github/contributors/YILS-LIN/short-video-factory.svg?color=c4f042&labelColor=black&style=flat-square
[contributors-url]: https://github.com/YILS-LIN/short-video-factory/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/YILS-LIN/short-video-factory.svg?color=8ae8ff&labelColor=black&style=flat-square
[forks-url]: https://github.com/YILS-LIN/short-video-factory/network/members
[stars-shield]: https://img.shields.io/github/stars/YILS-LIN/short-video-factory.svg?color=ffcb47&labelColor=black&style=flat-square
[stars-url]: https://github.com/YILS-LIN/short-video-factory/stargazers
[issues-shield]: https://img.shields.io/github/issues/YILS-LIN/short-video-factory.svg?labelColor=black&style=flat-square
[issues-url]: https://github.com/YILS-LIN/short-video-factory/issues
[release-shield]: https://img.shields.io/github/v/release/YILS-LIN/short-video-factory?labelColor=black&style=flat-square
[release-url]: https://github.com/YILS-LIN/short-video-factory/releases
[release-date-shield]: https://img.shields.io/github/release-date/YILS-LIN/short-video-factory?color=9cf&style=flat-round
[license-shield]: https://img.shields.io/github/license/YILS-LIN/short-video-factory.svg?labelColor=black&style=flat-square
[license-url]: https://github.com/YILS-LIN/short-video-factory/blob/main/LICENSE
