# 漂流纪元游戏发布包

用户要求：每次游戏修改完成后，将完整可运行的游戏压缩包先提交并推送到 GitHub 仓库 `liuhuize0711git/shot_game` 的此目录，独立于仓库原有射击游戏文件。

- 目录：`/workspace/shot_game/game-releases/drifting-age/`
- 每个完成版本保存一个完整 ZIP，包含运行源码、启动说明及对应测试报告。
- 文件名使用 `drifting_age_v<版本号>.zip`；同版本再次修改时增加版本号或时间后缀，保留旧包，不覆盖历史版本。
- 归档后检查 ZIP 完整性，并在回复中提供仓库内压缩包的路径。
- 用户已授权每次完成版本后提交并推送此发布目录到 GitHub 的 `main` 分支。仅提交本次发布相关文件，不夹带其他工作区修改，不强制推送；若推送失败，明确报告未上传，不能将本地归档称为 GitHub 已保存。
- 推送后核实远端提交，并提供 GitHub 文件链接。

## 已归档

| 版本 | 文件 | SHA-256 |
| --- | --- | --- |
| 0.5.1 | [drifting_age_v0.5.1.zip](drifting_age_v0.5.1.zip) | `b0cac9e54d195eebc7b19964ebe399ec7dc11c178f4094e3f7a0bf07590e3674` |
| 0.5.2 | [drifting_age_v0.5.2.zip](drifting_age_v0.5.2.zip) | `929e428a987887d509b251115e94105691124ca048540ea68d2de8eaa434b70c` |
| 0.6.0 | [drifting_age_v0.6.0.zip](drifting_age_v0.6.0.zip) | `c98cbc52c44ddd9f40e444c0289b82614418763e3505acc3e24c7fe4b31ccbd8` |

最新版本：[0.6.0 更新说明](v0.6.0-notes.md)。

## v0.6.0 重建说明

- [供 AI 重建的完整文字规格](specifications/drifting-age-v0.6.0-recreation.md)：规则、所有材料/配方、模型比例与尺寸、控制与相机、界面、生态、音频、保存/联机、已知差异及验收场景。
- [结构化参数附件](specifications/drifting-age-v0.6.0-parameters.json)：精确数值、三首音乐音符及基准源码校验和。

复刻时将两份文件一起交给 AI；精确视觉对照使用 v0.6.0 包内截图。文档仅记录该版实际行为，未修改已归档游戏包。
