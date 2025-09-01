#!/usr/bin/env node
const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const database = require('./utils/database');
const rate_limit = require('express-rate-limit');
const compare = require('./utils/compare');
const errors = require('./utils/errors');
const multer = require('multer'); // 用于处理 multipart/form-data
const path = require('path');
const r_limit = require('./utils/Rlimit')
const sharp = require('sharp');
const imagectl = require('./utils/imagectl');


BigInt.prototype.toJSON = function () {
  return this.toString();
};

process.on('SIGINT', () => {
  console.log('\nHandling SIGINT signal');
  process.exit(0);
});
process.on('SIGHUP', () => {
  console.log('\nHandling SIGHUP signal');
  process.exit(0);
})

const app = express();

app.use(express.static('server'));
app.use(express.json()); // 添加JSON解析中间件
app.use(express.urlencoded({ extended: true })); // 添加URL编码解析中间件
app.use(cookieParser());

app.get('/', (req, res) => {
  res.redirect('/index.html');
});

app.get('/api/throw', (req, res) => {
  try {
    const code = parseInt(req.query.code) || 500;
    console.log(`Throwing ${code} error`);
    errors.sendError(res, code);
  } catch (err) {
    console.error('Error:', err);
    errors.sendError(res, 500);
  }
});
// 配置multer将文件暂存到缓存目录
const diskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const cacheDir = path.join(__dirname, 'stockroom', 'artworks.cache', 'temp_' + Date.now() + '_' + crypto.randomBytes(16).toString('hex'));
    fs.mkdirSync(cacheDir, { recursive: true });
    req.uploadCacheDir = cacheDir; // 保存缓存目录路径到请求对象
    cb(null, cacheDir);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname); // 保留原始文件名便于调试
  }
});

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 } // 限制5GB
});
app.post('/api/real_users/login', rate_limit({
  windowMs: 5 * 60 * 1000, // 5分钟
  max: 15,
  keyGenerator: (req) => rate_limit.ipKeyGenerator(req),
  message: 'Too many requests from this IP. Please wait 5 minutes.'
}), upload.none(), async (req, res) => {
  let conn;
  try {
    let { symbol, password, login_type } = req.body;

    if (login_type !== 'phone') {
      symbol = BigInt(symbol);
    }

    if (!symbol || !password) {
      return res.status(400).json({ error: 'Phone and password are required' });
    }

    conn = await database.getConnection();
    await conn.beginTransaction();

    // 1. 查询用户（包含令牌过期时间戳）
    const [user] = await conn.execute(
      `SELECT id, password_hash, token, token_expires_at FROM real_users WHERE ${login_type === 'phone' ? 'phone' : 'id'} = ?`,
      [symbol]
    );

    if (!user) {
      await conn.rollback();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const currentTimestamp = Date.now();

    console.log(req.ip, user.password_hash);
    // 2. 验证密码
    if (!user.password_hash) {
      console.log('No password hash found, creating new one');
      await conn.execute(
        'UPDATE real_users SET password_hash = ? WHERE id = ?',
        [bcrypt.hashSync(password, 12), user.id]
      )
    } else {
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        await conn.rollback();
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    }

    // 3. 检查现有token是否有效（使用时间戳比较）
    let tokenToUse = user.token;
    let expiresAt = user.token_expires_at;

    // 如果token无效（为空或已过期），则生成新token
    if (!tokenToUse || (expiresAt && expiresAt < currentTimestamp)) {
      tokenToUse = crypto.randomBytes(64).toString('hex');
      expiresAt = currentTimestamp + 30 * 24 * 60 * 60 * 1000; // 30天后的时间戳

      // 4. 更新用户令牌和过期时间（仅在需要时）
      await conn.execute(
        'UPDATE real_users SET token = ?, token_expires_at = ? WHERE id = ?',
        [tokenToUse, expiresAt, user.id]
      );
    } else {
      // 现有token有效，延长过期时间（可选）
      expiresAt = currentTimestamp + 30 * 24 * 60 * 60 * 1000;
      await conn.execute(
        'UPDATE real_users SET token_expires_at = ? WHERE id = ?',
        [expiresAt, user.id]
      );
    }

    await conn.commit();

    // 5. 设置 Cookie
    res.cookie('token', tokenToUse, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/'
    });

    res.json({
      token: tokenToUse,
      expires_at: expiresAt // 返回时间戳格式的过期时间
    });

  } catch (err) {
    if (conn) await conn.rollback();
    console.error('Login error:', err);
    errors.sendError(res, 500);
  } finally {
    if (conn) conn.release();
  }
});

app.use('/api', async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token' });
  }

  let conn;
  try {
    conn = await database.getConnection();

    // 验证令牌有效性和过期时间（使用时间戳比较）
    const [user] = await conn.execute(
      `SELECT id, phone, virtual_user_id, allow_r18, allow_r18g FROM real_users 
       WHERE token = ? 
       AND token_expires_at > ?`, // 使用当前时间戳比较
      [token, Date.now()]
    );

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }

    // 将用户信息附加到请求对象
    req.real_user = user;
    next();

  } catch (err) {
    console.error('Token validation error:', err);
    errors.sendError(res, 500);
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/real_users/get_info', async (req, res) => {
  res.json(req.real_user);
});

app.get('/api/real_users/refresh_token',
  rate_limit({
    windowMs: 60 * 1000,
    max: 1,
    keyGenerator: (req) => req.real_user?.id,
    message: 'Too frequent requests. Please wait 60 seconds.'
  }),
  rate_limit({
    windowMs: 60 * 1000,
    max: 1,
    keyGenerator: (req) => rate_limit.ipKeyGenerator(req),
    message: 'Too many requests from this IP. Please wait 1 hour.'
  }),
  async (req, res) => {
    let conn;
    try {
      const token = req.cookies.token;

      if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      conn = await database.getConnection();

      // 验证旧令牌是否有效
      const [user] = await conn.execute(
        'SELECT id FROM real_users WHERE token = ? AND token_expires_at > ?',
        [token, Date.now()]
      );

      if (!user) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      // 生成新令牌
      const newToken = crypto.randomBytes(64).toString('hex');
      const newExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

      // 更新数据库
      await conn.beginTransaction();
      await conn.execute(
        'UPDATE real_users SET token = ?, token_expires_at = ? WHERE token = ?',
        [newToken, newExpiresAt, token]
      );
      await conn.commit();

      // 设置新令牌到Cookie
      res.cookie('token', newToken, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/'
      });

      res.json({
        token: newToken,
        expires_at: newExpiresAt
      });

    } catch (err) {
      if (conn) await conn.rollback();
      console.error('Token refresh error:', err);
      errors.sendError(res, 500);
    } finally {
      if (conn) conn.release();
    }
  }
);
app.post('/api/real_users/update_config', async (req, res) => {
  const { allow_r18, allow_r18g } = req.body;

  if (typeof allow_r18 !== 'boolean' || typeof allow_r18g !== 'boolean') {
    return res.status(400).json({ error: 'allow_r18 and allow_r18g must be boolean' });
  }

  let conn;
  try {
    conn = await database.getConnection();

    await conn.execute(
      'UPDATE real_users SET allow_r18 = ?, allow_r18g = ? WHERE id = ?',
      [allow_r18, allow_r18g, req.real_user.id]
    );

    res.json({
      allow_r18,
      allow_r18g
    });

  } catch (err) {
    console.error('Update user config error:', err);
    errors.sendError(res, 500);
  } finally {
    if (conn) conn.release();
  }
});
app.post('/api/real_users/logout', async (req, res) => {
  res.cookie('token', '', {
    maxAge: 0,
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/'
  });
  res.send('Logout success');
})

app.get('/api/virtual_users/get_info', async (req, res) => {
  let conn;
  try {
    let { virtual_user_id, full } = req.query;
    virtual_user_id = BigInt(virtual_user_id);

    if (!compare.is_sqlUBigInt(virtual_user_id)) {
      return res.status(400).json({ error: 'virtual user ID is required' });
    }

    conn = await database.getConnection();

    const [user] = await conn.execute(
      `SELECT id, name${full === 'true' ? ', description, created_at' : ''} 
      FROM virtual_users WHERE id = ?`,
      [virtual_user_id]
    );

    if (!user) {
      return res.status(404).json({ error: 'virtual user not found' });
    }

    res.json(user);

  } catch (err) {
    console.error('Get virtual user info error:', err);
    errors.sendError(res, 500);
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/virtual_users/get_avatar', async (req, res) => {
  try {
    let { virtual_user_id, black } = req.query;
    virtual_user_id = BigInt(virtual_user_id);
    if (!compare.is_sqlUBigInt(virtual_user_id)) {
      return res.status(400).json({ error: 'virtual user ID is required' });
    }

    black = black === 'true';

    const avatar_path = path.join(__dirname, 'stockroom', 'avatars', virtual_user_id.toString());
    const avatar_path_default = path.join(__dirname, 'server', 'src', 'assets', `default-avatar${black ? '-black' : ''}.png`);

    res.sendFile(avatar_path, {
      headers: {
        'Content-Type': 'image/png'
      }
    }, err => {
      if (err) {
        res.sendFile(avatar_path_default, {
          headers: {
            'Content-Type': 'image/png'
          }
        });
      }
    });
  } catch (err) {
    console.error('Get virtual user avatar error:', err);
    errors.sendError(res, 500);
  }
});

app.get('/api/virtual_users/get_artwork_list', async (req, res) => {
  let conn;
  try {
    let { virtual_user_id, last_id, last_created, limit } = req.query;
    virtual_user_id = BigInt(virtual_user_id);

    if (!compare.is_sqlUBigInt(virtual_user_id)) {
      return res.status(400).json({ error: 'virtual user ID is required' });
    }
    limit = limit ? BigInt(limit) : 25n;
    if (limit < 1n || limit > 25n) limit = 25n;

    conn = await database.getConnection();

    // 游标分页条件
    let cursor_condition = '';
    const cursor_params = [virtual_user_id];

    if (last_id && last_created) {
      last_id = BigInt(last_id);
      last_created = BigInt(last_created);
      if (!compare.is_sqlUBigInt(last_id) || !compare.is_sqlUBigInt(last_created)) {
        return res.status(400).json({ error: 'last_id and last_created must be valid integers' });
      }
      cursor_condition = 'AND (created_at < ? OR (created_at = ? AND work_id < ?))';
      cursor_params.push(last_created, last_created, last_id);
    }

    // 执行查询
    const artworks = await conn.execute(
      `SELECT work_id, title, created_at 
       FROM artworks 
       WHERE user_id = ? 
       ${cursor_condition}
       ${r_limit.getLimitSqlText(req)}
       ORDER BY created_at DESC, work_id DESC
       LIMIT ?`,
      [...cursor_params, limit]
    );

    //console.log(limit, artworks.length);
    res.json(artworks);
  } catch (err) {
    console.error('Get virtual user artworks error:', err);
    errors.sendError(res, 500);
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/artworks/info', async (req, res) => {
  try {
    const work_id = validate.validateBigInt(req.query.work_id, 'work_id');

    const artwork = await db.withConnection(async (conn) => {
      const [artworks] = await conn.execute(
        `SELECT title, user_id, description, created_at 
         FROM artworks WHERE work_id = ?
         ${r_limit.getLimitSqlText(req)}`,
        [work_id]
      );

      if (!artworks.length) {
        throw { status: 404, message: 'Artwork not found' };
      }

      // 获取图片数量
      const artworkDir = path.join(__dirname, 'stockroom', 'artworks', work_id.toString());
      let page_count = 0;

      try {
        const files = await fs.promises.readdir(artworkDir);
        page_count = files.filter(file => {
          return /^\d+$/.test(file);
        }).length;
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }

      return { ...artworks[0], page_count };
    });

    res.json(artwork);
  } catch (err) {
    console.error('Get artwork info error:', err);
    errors.sendError(res, err.status || 500);
  }
});

app.get('/api/artworks/image', async (req, res) => {
  let conn;
  try {
    let { work_id, page, small } = req.query;
    work_id = BigInt(work_id);
    real_user_id = req.real_user.id;
    page = parseInt(page) || 1;
    small = small === 'true';

    if (!compare.is_sqlUBigInt(work_id)) {
      return res.status(400).json({ error: 'work ID is required' });
    }

    if (page < 1) {
      return res.status(400).json({ error: 'Invalid page number' });
    }

    conn = await database.getConnection();

    const { allow_r18, allow_r18g } = req.real_user;

    // 检查作品是否包含敏感标签
    const artwork_tags = await conn.execute(
      `SELECT tag FROM artworks_tags WHERE work_id = ? AND (tag = 'r18' OR tag = 'r18g')`,
      [work_id]
    );

    // 验证访问权限
    const hasR18 = artwork_tags.some(tag => tag.tag === 'r18');
    const hasR18G = artwork_tags.some(tag => tag.tag === 'r18g');

    if ((hasR18 && !allow_r18) || (hasR18G && !allow_r18g)) {
      return errors.sendError(res, 403);
    }

    // 安全构建图片目录路径
    const safeWorkId = work_id.toString();
    const imageDir = path.join(__dirname, 'stockroom', 'artworks', safeWorkId);
    let imagePath = null;
    // 检查目录是否存在
    try {
      await fs.promises.access(imageDir, fs.constants.R_OK);
    } catch (err) {
      return errors.sendError(res, 404);
    }

    if (small) {
      const imageFile = path.join(imageDir, 'SMALL');
      if (!await imagectl.checkSmallImageAvailable(safeWorkId)) await imagectl.generateSmallImage(safeWorkId);
      imagePath = imageFile;
    } else {
      const safePage = page.toString();

      // 读取目录内容，查找匹配的图片文件
      const files = await fs.promises.readdir(imageDir);
      const imageFile = files.find(file => {
        const fileName = path.parse(file).name; // 获取不带扩展名的文件名
        return fileName === safePage;
      });

      if (!imageFile) {
        return errors.sendError(res, 404);
      }

      imagePath = path.join(imageDir, imageFile);
    }
    // 流式传输图片
    const stat = await fs.promises.stat(imagePath);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Last-Modified', stat.mtime.toUTCString());
    res.setHeader('ETag', `"${stat.size}-${stat.mtime.getTime()}"`);

    // 处理条件请求（If-Modified-Since/If-None-Match）
    if (req.fresh) {
      return res.status(304).end();
    }

    if (small) {
      const buffer = await imagectl.getSmallImageBuffer(safeWorkId);
      res.send(buffer);
    } else {
      const stream = fs.createReadStream(imagePath);
      stream.on('error', err => {
        console.error('Read image error:', err);
        errors.sendError(res, 500);
      });
      stream.pipe(res);
    }
  } catch (err) {
    console.error('Get artwork images error:', err);
    errors.sendError(res, 500);
  } finally {
    if (conn) conn.release();
  }
});

app.use('/api/search/', (req, res, next) => {
  try {
    let { keyword, last_work_id, last_created } = req.query;
    if (!keyword || !(keyword = keyword.trim())) {
      return res.status(400).json({ error: 'Valid keyword is required' });
    }
    last_work_id = BigInt(last_work_id);
    if (last_work_id && !compare.is_sqlUBigInt(last_work_id)) {
      return res.status(400).json({ error: 'last_work_id must be a valid integer' });
    }
    last_created = BigInt(last_created);
    if (last_created && !compare.is_sqlUBigInt(last_created)) {
      return res.status(400).json({ error: 'last_created must be a valid integer' });
    }
    req.query.keyword = keyword;
    req.query.last_work_id = last_work_id;
    req.query.last_created = last_created;
    next();
  } catch (err) {
    console.error('Search error:', err);
    errors.sendError(res, 500);
  }
});

app.get('/api/search/artworks', async (req, res) => {
  let conn;
  try {
    let { keyword, last_work_id, last_created } = req.query;
    const keywords = keyword.split(' ').filter(word => word.trim() !== '');

    if (keywords.length === 0) {
      return res.status(400).json({ error: 'Valid keyword is required' });
    }

    // 构建标签条件
    let tag_conditions = [];
    let tag_params = [];

    keywords.forEach(word => {
      const isExclude = word[0] === '-';
      const tag = isExclude ? word.slice(1) : word;
      tag_conditions.push(`artworks_tags.tag ${isExclude ? '!' : ''}= ?`);
      tag_params.push(tag);
    });

    const tag_condition = tag_conditions.join(' AND ');

    // 游标处理
    let cursor_condition = '';
    const cursor_params = [];

    if (last_work_id && last_created) {
      try {
        cursor_condition = `AND (artworks.created_at < ? OR (artworks.created_at = ? AND artworks.work_id < ?))`;
        cursor_params.push(last_created, last_created, last_work_id);
      } catch (e) {
        return res.status(400).json({ error: 'last_work_id and last_created must be valid integers' });
      }
    }

    conn = await database.getConnection();

    // 使用完整表名的查询
    const results = await conn.execute(
      `SELECT DISTINCT combined.work_id, combined.title, combined.created_at
       FROM (
        (SELECT artworks.work_id, artworks.title, artworks.created_at
          FROM artworks
          WHERE MATCH(artworks.title) AGAINST(? IN NATURAL LANGUAGE MODE)
          ${cursor_condition}
          ${r_limit.getLimitSqlText(req)}
          ORDER BY artworks.created_at DESC, artworks.work_id DESC
          LIMIT 25)
     
        UNION ALL
     
        (SELECT artworks.work_id, artworks.title, artworks.created_at
          FROM artworks
          JOIN artworks_tags ON artworks.work_id = artworks_tags.work_id
          WHERE ${tag_condition}
          ${cursor_condition}
          ${r_limit.getLimitSqlText(req)}
          ORDER BY artworks.created_at DESC, artworks.work_id DESC
          LIMIT 25)
      ) AS combined
      ORDER BY created_at DESC, work_id DESC`,
      [keyword, ...cursor_params, ...tag_params, ...cursor_params]
    );

    res.json(results);
  } catch (err) {
    console.error('Search error:', err);
    errors.sendError(res, 500);
  } finally {
    if (conn) conn.release();
  }
});
app.get('/api/search/virtual_users', async (req, res) => {
  let conn;
  try {
    let { keyword, last_id, last_created } = req.query;

    // 游标分页处理
    let cursor_condition = '';
    const cursor_params = [];

    if (last_id && last_created) {
      try {
        cursor_condition = `AND (created_at < ? OR (created_at = ? AND id < ?))`;
        cursor_params.push(last_created, last_created, last_id);
      } catch (e) {
        return res.status(400).json({ error: 'last_id and last_created must be valid integers' });
      }
    }

    conn = await database.getConnection();

    // 优化查询
    const results = await conn.execute(
      `SELECT id, name, description
       FROM virtual_users
       WHERE MATCH(name) AGAINST(? IN NATURAL LANGUAGE MODE)
       ${cursor_condition}
       ORDER BY created_at DESC, id DESC
       LIMIT 25`,
      [keyword, ...cursor_params]
    );

    res.json({ results });
  } catch (err) {
    console.error('Search error:', err);
    errors.sendError(res, 500);
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/push/new_artworks', async (req, res) => {
  let conn;
  try {
    let { last_id } = req.query;
    if (!last_id) last_id = compare.sqlUBigInt_max;
    last_id = BigInt(last_id);

    if (!compare.is_sqlUBigInt(last_id)) {
      return res.status(400).json({ error: 'last_work_id must be a valid integer' });
    }

    conn = await database.getConnection();

    const artworks = await conn.execute(
      `SELECT work_id, title FROM artworks 
      WHERE work_id < ? 
      ${r_limit.getLimitSqlText(req)}
      ORDER BY work_id DESC 
      LIMIT 30`,
      [last_id]
    );

    res.json(artworks);
  } catch (err) {
    console.error('Get new artworks error:', err);
    errors.sendError(res, 500);
  } finally {
    if (conn) conn.release();
  }
});
app.get('/api/push/new_artists', async (req, res) => {
  let conn;
  try {
    let { last_id } = req.query;
    if (!last_id) last_id = compare.sqlUBigInt_max;
    last_id = BigInt(last_id);
    if (!compare.is_sqlUBigInt(last_id)) {
      return res.status(400).json({ error: 'last_id must be a valid integer' });
    }

    conn = await database.getConnection();

    const virtual_users = await conn.execute(
      `SELECT id, name 
      FROM virtual_users 
      WHERE id < ? 
      AND EXISTS (
        SELECT 1 
        FROM artworks 
        WHERE artworks.user_id = virtual_users.id
      )
      ORDER BY id DESC 
      LIMIT 30`,
      [last_id]
    );

    console.log(virtual_users);
    res.json(virtual_users);
  } catch (err) {
    console.error('Get new artists error:', err);
    errors.sendError(res, 500);
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/artworks/upload', upload.fields([
  { name: 'images', maxCount: 32 },
  { name: 'tags', maxCount: 1 },
  { name: 'description', maxCount: 1 },
  { name: 'title', maxCount: 1 },
  { name: 'execute_user_id', maxCount: 1 }
]), async (req, res) => {
  let conn;
  let work_id;
  try {
    let { tags, description, title, execute_user_id } = req.body;
    const images = req.files.images;
    const real_user_id = req.real_user.id;

    if (!images || images.length === 0) return res.status(400).json({ error: 'At least one image is required' });
    tags = JSON.parse(tags);
    console.log(tags);
    if (!tags || tags.length === 0) return res.status(400).json({ error: 'At least one tag is required' });
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
    if (!description || !description.trim()) description = '';

    const { allow_r18, allow_r18g } = req.real_user;
    if ((!allow_r18 && tags.includes('r18')) || (!allow_r18g && tags.includes('r18g')))
      return res.status(403).json({ error: 'You are not allowed to upload unsafe artworks' });

    conn = await database.getConnection();
    conn.beginTransaction();

    if (real_user_id == 1n) {
      execute_user_id = execute_user_id ? BigInt(execute_user_id) : 1n;
    } else {
      const execute_granted = await conn.execute(
        `SELECT permission FROM permissions WHERE user_id = ? AND permission = 'SuperManager'`,
        [req.real_user.id]
      );
      if (!execute_granted.length) {
        execute_user_id = req.real_user.id;
      } else {
        execute_user_id = execute_user_id ? BigInt(execute_user_id) : req.real_user.id;
      }
    }


    results = await conn.execute(
      `INSERT INTO artworks (title, description, user_id) VALUES (?,?,?)`,
      [title, description, execute_user_id]
    );
    console.log(results);
    work_id = results.insertId;

    let tags_promises = [];
    tags.forEach(tag => {
      tags_promises.push(conn.execute(
        `INSERT INTO artworks_tags (work_id, tag) VALUES (?,?)`,
        [work_id, tag.toLowerCase()]
      ));
    });
    await Promise.all(tags_promises);

    const artwork_dir = path.join(__dirname, 'stockroom', 'artworks', work_id.toString());
    //console.log(images);
    fs.mkdirSync(artwork_dir, { recursive: true });
    move_promises = [];
    for (let i = 0; i < images.length; i++) {
      console.log(images[i]);
      const dest = path.join(images[i].path);
      move_promises.push(fs.promises.rename(dest, path.join(artwork_dir, (i + 1).toString())));
    }
    await Promise.all(move_promises);
    fs.rmdirSync(images[0].destination);

    await conn.commit();
    res.json({ work_id });
  } catch (err) {
    if (conn) await conn.rollback();
    if (work_id) await fs.promises.rm(path.join(__dirname, 'stockroom', 'artworks', work_id.toString()), { recursive: true });
    console.log("Artwork upload error: ", err);
    errors.sendError(res, 500);
  } finally {
    if (conn) conn.release();
  }
});
// 在所有路由之后添加 404 处理器
app.use((req, res) => {
  errors.sendError(res, 404);
});

// 统一错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  errors.sendError(res, err.status || 500);
});

// 启动服务器
const options = {
  key: fs.readFileSync('ssl/server.key'),
  cert: fs.readFileSync('ssl/server.crt')
};

https.createServer(options, app).listen(443, () => {
  console.log('HTTPS Server running on port 443');
});

http.createServer((req, res) => {
  res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
  res.end();
}).listen(80, () => {
  console.log('HTTP redirect server running on port 80');
});