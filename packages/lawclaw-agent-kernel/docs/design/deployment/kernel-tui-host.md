---
doc_id: TUI-DEP-001
level: deployment
layer: Client Interface
component: KernelTUI
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "TUI与本地宿主装配"
parent: SYS-DES-001
interfaces: [TUI-CON-001]
diagrams: []
supersedes: []
---

# TUI与本地宿主装配

TUI与KernelHost为两个进程。TUI Application装配pi-tui视图、Client、Connector和用户私有本地存储；KernelHost装配认证端点、ConversationPreparationService、Facade/Gateway及内部组件。KernelHost的“唯一Composition Root”限定为Kernel内部依赖，不禁止客户端装配自己的界面。

TUI通过HostLauncherPort.resolve取得唯一已就绪宿主，锁、打开存储、恢复和端点发布由提供方保证，TUI不实现或检查这些步骤。模型是否可用和协议readiness分别报告。既有HTTP服务缺少会话协议时不被视为新宿主就绪。

宿主独立于终端会话，日志进入私有文件，不继承TUI stdout；退出客户端仅释放客户端资源，宿主持续运行。停机通过独立受信维护入口执行，本TUI不提供运维控制台。客户端连接约束见[SR-01](../clients/components/kernel-tui/sr-01-host-connection.md)。

profile/描述符/凭据位于用户私有状态目录，每profile独立；不使用工作区内可被项目内容修改的脚本或token作为可信启动来源。启动器只调用安装时确定的KernelHost可执行入口，无shell拼接。平台首期macOS/Linux；OS锁及脱离终端适配必须在目标平台验收，Windows未承诺。未知本地记录主版本失败关闭，不以新版本打开旧库并自动迁移。
