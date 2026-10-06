# 永狐发布中心

这里是永狐桌面端的公开发布仓库，用于存放 Windows 安装包、更新公告和自动更新清单。

## 下载

- 发布页：https://heiyue0110.github.io/yonghu-release/
- GitHub Releases：https://github.com/heiyue0110/yonghu-release/releases
- 最新正式版本：1.4.16
- 最新安装包：EverFox_1.4.16_x64_setup.exe
- 更新公告：更新公告_1.4.16.md
- 自动更新清单：latest.json

## 自动更新

永狐客户端会读取本仓库 GitHub Pages 上的 `latest.json` 检查新版本。发现新版本后，必须由用户在软件内确认，才会继续下载、安装并重启。

当前 `latest.json` 已包含 Tauri updater 所需的 Windows x64 下载地址和签名信息。

## 文件说明

- `index.html`：公开下载页。
- `latest.json`：Tauri 自动更新清单。
- `更新公告_*.md` / `EverFox_*_release_notes.md`：版本更新说明与 Release 下载资产。
- `EverFox_*_x64_setup.exe`：Windows 安装包。
- `*.exe.sig`：安装包签名文件。

## 说明

本仓库只用于永狐发布与更新源维护，不是主源码仓库。

## Beta 测试版

- 当前 Windows 测试版：2.0.0-beta.2（2026-10-06）
- [下载安装包](https://github.com/heiyue0110/yonghu-release/releases/download/v2.0.0-beta.2/EverFox_2.0.0-beta.2_x64_setup.exe)
- [更新公告](https://github.com/heiyue0110/yonghu-release/releases/download/v2.0.0-beta.2/EverFox_2.0.0-beta.2_release_notes.md)
- [测试版更新清单](https://heiyue0110.github.io/yonghu-release/v2-alpha/latest-beta.json)
- 安装包 SHA256：`8FDE9D834B69533A5A0B551DB88961449D0E31FE62D7922955D954C3AB8233EC`

这是测试版，不是正式版。部分功能可能不完整；请与正式版分目录安装，不要同时运行。9 月 25 日 beta.1 用户需开启“测试版通道”后检查更新。正式版仍为 1.4.16。本次仅发布 Windows x64，手机 APK 沿用 Alpha。
