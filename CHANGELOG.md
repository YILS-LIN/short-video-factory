# Changelog

All significant changes to this project will be recorded in this file.

此项目的所有显著更改都将记录在此文件中。

## [v1.2.2] - 2026-04-07

### Fixed & Optimized

- Optimize segment duration acquisition in large media libraries by switching to offscreen metadata probing with cache, reducing undefined duration failures during composition
- Decouple preview rendering from duration dependency and improve random segment selection stability
- Add robust default folder fallback for Windows folder picker (downloads -> desktop -> documents -> home -> cwd) to avoid dialog open failures when downloads path is unavailable
- Add safer TTS audio metadata parsing guards and clearer error messages for invalid duration scenarios

### 修复与优化

- 优化大素材库场景下的分镜时长获取，改为离屏读取并缓存 metadata，降低合成阶段 duration 为空导致的失败
- 解耦预览组件与时长依赖，提升随机分镜流程稳定性
- 为 Windows 文件夹选择增加默认目录回退链路（downloads -> desktop -> documents -> home -> cwd），避免下载目录不可用时无法打开选择器
- 增强 TTS 音频元数据解析兜底与错误提示，避免无效时长引发不明确报错

## [v1.2.1] - 2026-03-12

### Added

- Add anonymous event reporting in the Electron main process for key workflow events

### Fixed & Optimized

- Fix BGM filename matching edge cases during media selection
- Resolve voice truncation caused by loudness normalization when adding BGM
- Fix TTS audio metadata parsing by specifying mimeType to avoid format detection failures
- Fix synthesis flow when BGM folder is missing and optimize related error handling
- Upgrade AI SDK dependency

### 新增

- 增加主进程匿名统计上报，覆盖关键流程事件

### 修复与优化

- 修复素材选择过程中 BGM 文件名匹配边界问题
- 解决添加 BGM 后因响度归一化导致语音截断的问题
- 通过指定 mimeType 修复 TTS 音频元数据读取，避免自动识别格式失败
- 修复 BGM 文件夹不存在时合成流程未正确中断的问题，并优化相关异常处理
- 升级 AI SDK 依赖

## [v1.2.0] - 2026-01-22

### Added

- Add error details copy button
- Automatically stop the previous sound when trying to play the next sound in the text
- Better background music and vocal volume balance control

### Fixed & Optimized

- Implementing Unicode Non Space Sentence System Matching
- Solving the problem of non Chinese subtitle sticking
- Cancel subtitle segmentation length limit
- Fix EdgeTTS synthesis failure issue
- Adjust UI Text

### 新增

- 增加报错详细信息复制按钮
- 试听文本播放下一个声音时，自动停止上一个
- 更好的背景音乐和人声音量均衡控制

### 修复与优化

- 实现Unicode非空格断句语言体系匹配
- 解决非中文字幕黏连问题
- 取消字幕分割长度限制
- 修复EdgeTTS合成失败问题
- 调整UI文本

## [v1.1.10] - 2025-10-22

### Added

- Add MAC embedding FFmpeg support

### Fixed

- Resolve the error of not setting BGM folder
- Resolve the issue of reporting errors when there are non mp3 files in the BGM folder
- Remove the restriction that the total duration of video materials should not be shorter than that of voice
- Optimize some details

### 添加

- 增加MAC嵌入FFmpeg支持

### 修复

- 解决不设置bgm文件夹报错
- 解决 BGM 文件夹存在非 mp3 文件时报错问题
- 移除视频素材总时长不的短于语音的限制
- 优化一些细节

## [v1.1.1] - 2025-08-26

### Fixed

- Fix MAC copy and paste shortcut key failure issue

### 修复

- 修复MAC复制粘贴快捷键失效问题

## [v1.1.0] - 2025-08-22

### Added

- Multi-Language Support

### 添加

- 多语言支持

## [v1.0.1] - 2025-08-12

### Fixed

- 修复混剪片段与语音时长不一致问题
- 修复渲染卡帧问题

## [v1.0.0] - 2025-08-08

### Added

- 发布第一个正式版本
- 支持使用大语言模型生成文案（推荐免费的GLM-4.5-Flash）
- 支持使用EdgeTTS免费合成语音
- 支持视频分镜自动混剪
- 支持渲染合成视频
- 支持自动化批量任务
- 美观的UI界面

## [v0.7.12] - 2025-08-08

### Added

- 构建测试
- 跨平台: macOS dmg, Windows exe, Linux AppImage.
