const mariaDB = require('mariadb');
const path = require('path');
const env = require('dotenv').config({ path: path.join(__dirname, '../.env') });

// console.log(process.env);

// 创建连接池
const pool = mariaDB.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10, // 增加连接池大小
  connectTimeout: 5000, // 连接超时5秒
  acquireTimeout: 10000, // 获取连接超时10秒
  idleTimeout: 600000, // 空闲连接10分钟后关闭
  minDelayValidation: 2000 // 验证连接的最小延迟
});

// 导出连接池
module.exports = pool;