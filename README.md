# 永狐发布中心

这里是永狐桌面端的公开发布仓库，用于存放 Windows 安装包、更新公告和自动更新清单。

## 下载

- 发布页：https://heiyue0110.github.io/yonghu-release/
- 最新版本：1.2.7
- 最新安装包：永狐_1.2.7_x64_安装程序.exe
- 更新公告：更新公告_1.2.7.md
- 自动更新清单：latest.json

## 自动更新

永狐客户端会读取本仓库 GitHub Pages 上的 `latest.json` 检查新版本。发现新版后，必须由用户在软件内确认，才会继续下载、安装并重启。

当前 `latest.json` 已包含 Tauri updater 所需的 Windows 平台下载地址和签名信息。

## 文件说明

- `index.html`：公开下载页。
- `latest.json`：Tauri 自动更新清单。
- `更新公告_*.md`：版本更新说明。
- `永狐_*_安装程序.exe`：Windows 安装包。
- `*.exe.sig`：安装包签名文件。

## 说明

本仓库只用于永狐发布与更新源维护，不是主源码仓库。
