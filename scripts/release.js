#!/usr/bin/env node

/**
 * 自动化发布脚本
 * 确保版本号、标签、代码完全同步
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function log(message) {
  console.log(`\x1b[36m[Release]\x1b[0m ${message}`);
}

function error(message) {
  console.error(`\x1b[31m[Error]\x1b[0m ${message}`);
}

function success(message) {
  console.log(`\x1b[32m[Success]\x1b[0m ${message}`);
}

function execCommand(command, description) {
  log(description);
  try {
    const result = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
    return result.trim();
  } catch (err) {
    error(`Failed to execute: ${command}`);
    error(err.message);
    process.exit(1);
  }
}

function getCurrentVersion() {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return packageJson.version;
}

function updateChangelog(version) {
  const changelogPath = 'CHANGELOG.md';
  if (!fs.existsSync(changelogPath)) {
    error('CHANGELOG.md not found!');
    process.exit(1);
  }

  const changelog = fs.readFileSync(changelogPath, 'utf8');
  const versionPattern = new RegExp(`## \\[v${version}\\]`);
  
  if (!versionPattern.test(changelog)) {
    error(`Version v${version} not found in CHANGELOG.md!`);
    error('Please add the version entry to CHANGELOG.md before releasing.');
    process.exit(1);
  }
  
  log(`✓ Found version v${version} in CHANGELOG.md`);
}

function main() {
  log('开始自动化发布流程...');

  // 1. 检查工作目录是否干净
  try {
    execCommand('git diff-index --quiet HEAD --', '检查工作目录状态');
    log('✓ 工作目录干净');
  } catch {
    error('工作目录有未提交的更改，请先提交或储藏');
    process.exit(1);
  }

  // 2. 确保在主分支
  const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD', '检查当前分支');
  if (currentBranch !== 'main') {
    error(`当前在 ${currentBranch} 分支，请切换到 main 分支`);
    process.exit(1);
  }
  log('✓ 在主分支');

  // 3. 拉取最新代码
  execCommand('git pull origin main', '拉取最新代码');
  log('✓ 代码已更新到最新');

  // 4. 获取版本号
  const version = getCurrentVersion();
  log(`当前版本: v${version}`);

  // 5. 检查 CHANGELOG
  updateChangelog(version);

  // 6. 获取当前 commit SHA
  const currentCommit = execCommand('git rev-parse HEAD', '获取当前commit');
  log(`当前commit: ${currentCommit.substring(0, 7)}`);

  // 7. 删除现有标签（如果存在）
  const tagName = `v${version}`;
  try {
    execCommand(`git tag -d ${tagName}`, `删除本地标签 ${tagName}`);
    log(`✓ 删除本地标签 ${tagName}`);
  } catch {
    log(`本地标签 ${tagName} 不存在`);
  }

  try {
    execCommand(`git push origin :refs/tags/${tagName}`, `删除远程标签 ${tagName}`);
    log(`✓ 删除远程标签 ${tagName}`);
  } catch {
    log(`远程标签 ${tagName} 不存在`);
  }

  // 8. 创建新标签
  execCommand(`git tag ${tagName}`, `创建标签 ${tagName}`);
  log(`✓ 创建标签 ${tagName} 指向 ${currentCommit.substring(0, 7)}`);

  // 9. 推送标签
  execCommand(`git push origin ${tagName}`, `推送标签 ${tagName}`);
  success(`✓ 标签 ${tagName} 已推送到远程仓库`);

  // 10. 显示构建信息
  success('🎉 发布完成！');
  log('GitHub Actions 构建链接:');
  log('https://github.com/TLS-802/TLS-Video-Factory/actions');
  log('');
  log('Release 页面:');
  log(`https://github.com/TLS-802/TLS-Video-Factory/releases/tag/${tagName}`);
  log('');
  log('请等待构建完成后下载测试！');
}

// 运行脚本
main();
