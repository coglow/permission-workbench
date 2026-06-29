import { rmSync } from 'node:fs';
import { openDatabase, resolveDatabasePath } from './database.ts';
import { initializeSchema } from './schema.ts';
import { seedIdentityData } from './seed.ts';
rmSync(resolveDatabasePath(), { force: true });

const database = openDatabase();
// 先建表再写入预置关系数据；种子写入本身在 seedIdentityData 中按事务执行。
initializeSchema(database);
seedIdentityData(database);
database.close();
console.log('初始化数据库成功');
