SEcode 编程智能体

项目简介
SEcode 是本地编程智能体，能理解需求，完成规划、开发、测试和服务交付。重点优化长对话管理、危险操作审批、失败恢复和任务收尾，让开发过程更连贯、更安全、更易追踪。

代码仓库
https://github.com/StarKirbyyy/SEcode

环境要求
Node.js >=20.9.0，pnpm 10.33.3。

Web 运行方式
1. pnpm install --frozen-lockfile
2. cp .env.example .env.local
3. 在 .env.local 中配置模型，并将 SECODE_WORKSPACE_PICKER_ROOT 设为项目所在的绝对目录。请勿提交该文件。
4. pnpm dev
5. 浏览器打开 http://localhost:3000

Terminal 运行方式
Terminal 不会自动加载 .env 文件，请先在环境中配置模型变量。
查看帮助：pnpm agent -- --help
创建会话：pnpm agent -- --workspace /absolute/path/to/project --model deepseek
恢复会话：pnpm agent -- --session <session-uuid> --data-dir /absolute/path/to/data

核心特色
支持 DeepSeek、LongCat 和 Generic OpenAI-compatible 配置；提供 list_directory、read_file、search_text、write_file、replace_in_file、run_process 六个本地工具；支持普通模式、Plan Mode、危险操作审批、预算、取消、上下文压缩和 Session 恢复。

注意事项
文件与进程受工作区边界和风险策略限制，凭据仅从服务端环境读取。本项目不是恶意代码安全沙箱。LongCat 与 Generic 取决于兼容端点；不会自动 commit、push、发布或部署。
