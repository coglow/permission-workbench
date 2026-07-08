import { createApp } from './app.ts';
import { openDatabase } from './db/database.ts';

const database = openDatabase();
const app = createApp(database);
const port = Number(process.env.PORT ?? 3001);

app.listen(port, '127.0.0.1', () => {
  console.log(`API listening at http://127.0.0.1:${port}`);
});
