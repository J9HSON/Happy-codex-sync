# happy-codex-sync

`happy-codex-sync` 是一个本地桥接器，用来把你电脑上已有的 `Codex thread` 发布成 `Happy` 会话。

它解决的是这个问题：

- 电脑上已经有一批 `Codex` thread
- 手机 `Happy` 默认看不到这些 thread
- 你希望手机和电脑都围绕同一批 thread 工作

它不做的是：

- 不接管当前已经打开着的桌面 `Codex` GUI 进程
- 不修改 `Happy` 源码
- 不要求复制 `Happy` 项目

同步单位是 `thread`，不是 GUI 进程。

## 适用场景

你在电脑里持续用 `Codex` 做项目，随后希望：

- 手机 `Happy` 能看到这些会话
- 手机 `Happy` 可以继续这些会话
- 之后回到电脑继续 `codex resume <thread-id>` 时，仍是同一条历史

这正是这个工具做的事。

## 依赖要求

- Node.js 20+
- `happy` 已安装并可运行
- `codex` 已安装，且版本至少 `0.100.0`

推荐：

```bash
npm install -g happy
npm install -g @openai/codex
```

## 安装

如果别人拿到这个项目目录，直接安装即可，不需要先跑 `npm install`，因为这个项目没有第三方运行时依赖：

```bash
cd happy-codex-sync
npm install -g .
```

安装后会得到全局命令：

```bash
happy-codex-sync
```

也可以先打包再分发：

```bash
npm pack
```

得到的 `.tgz` 包，别人执行：

```bash
npm install -g happy-codex-sync-*.tgz
```

## 开箱即用

### 1. 先做自检

```bash
happy-codex-sync doctor
```

### 2. 一键初始化

macOS 上：

```bash
happy-codex-sync setup --recent 20 --interval 30
```

这会做三件事：

1. 检查 `happy` / `codex`
2. 检查 Node 版本
3. 写入用户配置
4. 安装并启动 `launchd` 后台服务

装完以后它会自动常驻，每隔一段时间把最近的 `Codex thread` 补到 `Happy`。

非 macOS 上：

```bash
happy-codex-sync setup
```

会只写配置，不装后台服务。此时你手动跑：

```bash
happy-codex-sync watch
```

## 常用命令

### 自检

```bash
happy-codex-sync doctor
```

### 初始化并安装后台服务

```bash
happy-codex-sync setup --recent 20 --interval 30
```

### 列出本地 Codex thread

```bash
happy-codex-sync list-local
happy-codex-sync list-local --limit 20
```

### 发布一条 thread 到 Happy

```bash
happy-codex-sync publish <thread-id>
```

### 发布最近一条

```bash
happy-codex-sync publish-last
```

### 补齐最近 N 条

```bash
happy-codex-sync sync --recent 10
```

### 前台持续同步

```bash
happy-codex-sync watch --recent 20 --interval 30
```

### 查看当前已管理的 Happy 会话

```bash
happy-codex-sync list-managed
```

### 停掉一个或全部镜像会话

```bash
happy-codex-sync stop <thread-id>
happy-codex-sync stop all
```

### 后台服务管理

```bash
happy-codex-sync service status
happy-codex-sync service install --recent 20 --interval 30
happy-codex-sync service uninstall
```

## 工作原理

### 1. 发现本地 thread

桥接器读取：

- `~/.codex/session_index.jsonl`
- `~/.codex/sessions/**/*.jsonl`

然后拼出：

- `threadId`
- `threadName`
- `updatedAt`
- `cwd`

没有 `cwd` 的 thread 会被跳过，因为没法在正确项目目录里恢复。

### 2. 在原目录启动 Happy

对每条要发布的 thread，桥接器会在该 thread 原本的 `cwd` 下启动：

```bash
happy codex --resume <thread-id>
```

这一步不是 attach 旧进程，而是为同一条 thread 新开一个 Happy 入口。

### 3. 写本地状态

工具会把管理信息写到用户目录，而不是项目目录：

- 配置：`~/.config/happy-codex-sync/config.json`
- 状态：`~/.local/state/happy-codex-sync/managed-sessions.json`
- 日志：`~/.local/state/happy-codex-sync/logs/`

如果你之前用过旧版脚本，它会自动迁移项目目录下旧的 `state/`。

### 4. 自动避开旧版 codex

有些机器上会同时存在：

- 新版 `~/.local/bin/codex`
- 旧版 `/usr/local/bin/codex`

这个工具会自动把新版所在目录放到 PATH 前面，避免 `Happy` 命中旧版 `codex`。

## 目录结构

```text
happy-codex-sync/
  bin/
    happy-codex-sync.mjs
  src/
    cli.mjs
    config.mjs
    codex-sessions.mjs
    doctor.mjs
    happy-manager.mjs
    runtime.mjs
    service.mjs
    shell.mjs
    state.mjs
    user-config.mjs
  README.md
  package.json
```

## 当前能力

现在已经支持：

- 自动发现本地 `Codex thread`
- 自动推导 thread 的 `cwd`
- 自动发布到 `Happy`
- 自动回填 `happySessionId`
- 跳过已管理 thread，避免重复发布
- macOS `launchd` 常驻运行
- 用户目录配置与状态存储
- 没有本地 `~/.codex` 历史时安全降级，不直接崩溃

## 明确边界

它能做到：

- 手机 `Happy` 和电脑 `Codex` 围绕同一批 thread 工作
- 手机继续聊，电脑后续再 `resume` 能看到同一条历史

它做不到：

- 把“当前已经打开着的桌面 Codex 窗口”变成实时镜像
- 处理手机和电脑同时并发编辑同一条 thread 的冲突

## 推荐默认用法

对个人机器，最实用的方式就是：

```bash
happy-codex-sync setup --recent 20 --interval 30
```

然后平时只需要：

```bash
happy-codex-sync list-managed
happy-codex-sync service status
```

## 后续可继续做

- `publish-by-name`
- `prune` 清理死会话
- 菜单栏 UI
- 简单 Web 状态页
