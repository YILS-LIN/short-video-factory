# 📦 发布流程文档

## 🚀 自动化发布（推荐）

现在您可以使用自动化脚本进行发布，确保版本号、标签、代码完全同步：

```bash
# 1. 确保所有更改已提交
git add .
git commit -m "feat: your feature description"
git push origin main

# 2. 更新版本号（在 package.json 中）
# 手动编辑 package.json，更新 version 字段

# 3. 更新 CHANGELOG.md
# 添加新版本的更新记录，格式如下：
# ## [v1.2.0] - 2025-09-23
# ### Added
# - 新功能描述
# ### Fixed  
# - 修复内容

# 4. 运行自动化发布脚本
pnpm run release
```

## ✅ 自动化脚本功能

`pnpm run release` 脚本会自动完成：

- ✅ **代码检查**：确保工作目录干净
- ✅ **分支验证**：确保在 main 分支
- ✅ **代码同步**：拉取最新代码  
- ✅ **版本验证**：检查 CHANGELOG 中是否有对应版本
- ✅ **标签清理**：删除本地和远程的旧标签
- ✅ **标签创建**：在当前最新 commit 创建新标签
- ✅ **标签推送**：推送标签触发 GitHub Actions
- ✅ **信息显示**：显示构建和下载链接

## 🔧 手动发布（备用）

如果需要手动发布，按以下步骤：

```bash
# 1. 确保代码最新
git pull origin main

# 2. 删除旧标签（如果存在）
git tag -d v1.1.1
git push origin :refs/tags/v1.1.1

# 3. 创建新标签
git tag v1.1.1
git push origin v1.1.1
```

## 📋 发布前检查清单

在每次发布前，请确保：

- [ ] 所有功能已测试完成
- [ ] 代码已合并到 main 分支
- [ ] `package.json` 版本号已更新
- [ ] `CHANGELOG.md` 已添加新版本记录
- [ ] macOS、Windows、Linux 构建配置正确

## 🎯 发布后验证

发布完成后：

1. 访问 [GitHub Actions](https://github.com/TLS-802/TLS-Video-Factory/actions) 确认构建状态
2. 等待所有平台构建完成（通常需要 10-15 分钟）
3. 从 [Releases](https://github.com/TLS-802/TLS-Video-Factory/releases) 页面下载测试
4. 验证 macOS FFmpeg 内置功能是否正常

## 🐛 常见问题

**Q: 发布脚本报错 "版本在 CHANGELOG.md 中不存在"**  
A: 请在 `CHANGELOG.md` 中添加对应版本的记录，格式参考现有版本

**Q: GitHub Actions 构建失败**  
A: 检查构建日志，通常是 TypeScript 错误或依赖问题

**Q: macOS 应用无法找到 FFmpeg**  
A: 确保 `electron-builder.json5` 中有 `asarUnpack: ["dist-native/**/*"]` 配置

## 📚 版本号规范

采用语义化版本 (Semantic Versioning)：

- **主版本号 (Major)**：不兼容的 API 修改
- **次版本号 (Minor)**：向下兼容的功能性新增
- **修订号 (Patch)**：向下兼容的问题修正

示例：`1.2.3` → `1.2.4`（修复）、`1.3.0`（新功能）、`2.0.0`（破坏性更改）
