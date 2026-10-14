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

- 当前 Windows / Android ARM64 测试版：2.0.0-beta.3（2026-10-14）
- [Windows 安装包](https://github.com/heiyue0110/yonghu-release/releases/download/v2.0.0-beta.3/EverFox_2.0.0-beta.3_x64_setup.exe) · [Android 测试 APK](https://github.com/heiyue0110/yonghu-release/releases/download/v2.0.0-beta.3/EverFox_2.0.0-beta.3_android-arm64-test.apk)
- [更新公告](https://github.com/heiyue0110/yonghu-release/releases/download/v2.0.0-beta.3/EverFox_2.0.0-beta.3_release_notes.md) · [文件校验](https://github.com/heiyue0110/yonghu-release/releases/download/v2.0.0-beta.3/SHA256_2.0.0-beta.3.txt)
- [测试版更新清单](https://heiyue0110.github.io/yonghu-release/v2-alpha/latest-beta.json)
- Windows SHA256：`91B06696FE047CD1DAE0AA6F9ED354DB1F9EC593E2049CCE215CF8A9E3D60326`
- Android SHA256：`E90988F7DAF618BCED0E375416C142FF0E9FF99BFC1C57565701F7EC9FB8356C`

完善便捷小窗、市场与配装工作台、游戏通知历史、手机设置及双端恢复。正式版仍为 1.4.16，旧 Alpha 清单保留。Windows 须开启测试版通道；手机 Beta/RC 使用测试清单。安装和真实游戏写入由用户主动确认。

Windows 有 Tauri 更新签名，未做商业代码签名。Android 为现有 Debug 测试签名，包名不变，versionCode 2000010。最新真机远控、实际 EVE 写入与手机覆盖升级尚未验收，详见公告。
