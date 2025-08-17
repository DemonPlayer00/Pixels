function getLimitSqlText(req) {
    const { allow_r18, allow_r18g } = req.real_user;
    let sqlConditions = [];

    // 如果用户不允许查看R18内容
    if (!allow_r18) {
        sqlConditions.push(`
        NOT EXISTS (
          SELECT 1 FROM artworks_tags 
          WHERE artworks_tags.work_id = artworks.work_id 
          AND artworks_tags.tag = 'R18'
        )
      `);
    }

    // 如果用户不允许查看R18G内容
    if (!allow_r18g) {
        sqlConditions.push(`
        NOT EXISTS (
          SELECT 1 FROM artworks_tags 
          WHERE artworks_tags.work_id = artworks.work_id 
          AND artworks_tags.tag = 'R18G'
        )
      `);
    }

    // 如果有任何条件，添加WHERE或AND
    if (sqlConditions.length > 0) {
            return ' AND ' + sqlConditions.join(' AND ');
    }

    return '';
}
module.exports = {
    getLimitSqlText
}