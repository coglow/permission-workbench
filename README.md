# permission-workbench
## 本地启动

需要 Node.js 22.18 或更高版本，以及 pnpm 11。

```sh
pnpm install
pnpm db:init
pnpm dev
```

前端地址为 <http://127.0.0.1:5173>，API 健康检查为 <http://127.0.0.1:3001/api/health>。Vite 将前端的 `/api` 请求代理到 Node API。

SQLite 文件默认创建在 `data/permission-workbench.sqlite`。可通过 `DATABASE_PATH` 指定其他文件路径。
