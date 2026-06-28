import express from 'express';
import cookieParser from 'cookie-parser';
import { createAuthRouter } from './auth.ts';
import { openDatabase } from './db/database.ts';
import { createProjectsRouter } from './projects.ts';

const app = express();
const database = openDatabase();
const port = Number(process.env.PORT ?? 3001);

app.use(express.json());
// 必须先解析 Cookie，再挂载会读取 req.cookies 的身份路由。
app.use(cookieParser());
app.use('/api/auth', createAuthRouter(database));
app.use('/api/projects', createProjectsRouter(database));

app.get('/api/health', (_request, response) => {
  database.prepare('SELECT 1').get();
  response.json({ status: 'ok', database: 'ok' });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`API listening at http://127.0.0.1:${port}`);
});
