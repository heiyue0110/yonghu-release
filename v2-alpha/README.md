# 永狐 2.0 Alpha 私测通道

该目录与永狐 1.4.16 稳定通道隔离，不会改变稳定版 `latest.json` 或 `/releases/latest`。

- Windows 私测安装器：`EverFox_2.0.0-alpha.4_x64_setup.exe`
- Tauri 更新签名：`EverFox_2.0.0-alpha.4_x64_setup.exe.sig`
- Alpha 更新清单：`latest.json`
- 配装数据清单：`fitting-data/stable/manifest.json`
- 配装数据更新：GitHub Actions 每日检查 `eve-fit-engine` 最新数据；只有通过 Alpha.4 固定引擎兼容计算、文件 SHA-256 和不可变版本校验后才发布。

配装数据更新不提升应用版本，用户打开配装页时会检查并原子切换；失败时继续使用上一次可用数据或安装包内置数据。

