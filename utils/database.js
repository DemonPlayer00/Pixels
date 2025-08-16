const mariaDB = require('mariadb');

// 创建连接池
const pool = mariaDB.createPool({
  host: 'localhost',
  user: 'pixels_user', // 使用新创建的用户
  password: 'NachoNO1',
  database: 'Pixels',
  connectionLimit: 10, // 增加连接池大小
  connectTimeout: 5000, // 连接超时5秒
  acquireTimeout: 10000, // 获取连接超时10秒
  idleTimeout: 600000, // 空闲连接10分钟后关闭
  minDelayValidation: 2000 // 验证连接的最小延迟
});

// 导出连接池
module.exports = pool;