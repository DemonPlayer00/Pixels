#!/bin/bash

# 批量导入作者名字到virtual_users表
# 用法：./import_authors.sh [目录路径] [数据库用户名] [数据库密码] [数据库名]

# 检查参数
if [ $# -lt 1 ]; then
    echo "用法: $0 [目录路径] [数据库用户名] [数据库密码] [数据库名]"
    echo "示例: $0 /path/to/authors root password Pixels"
    exit 1
fi

# 设置参数
DIR_PATH="$1"
DB_USER=${2:-root}
DB_PASS=${3:-password}
DB_NAME=${4:-Pixels}

# 检查mariadb客户端
if ! command -v mariadb &> /dev/null; then
    echo "错误：mariadb客户端未安装"
    exit 1
fi

# 检查目录是否存在
if [ ! -d "$DIR_PATH" ]; then
    echo "错误：目录 $DIR_PATH 不存在"
    exit 1
fi

# 获取所有文件夹名称
echo "正在扫描目录: $DIR_PATH"
AUTHOR_NAMES=()
while IFS= read -r -d $'\0' folder; do
    folder_name=$(basename "$folder")
    AUTHOR_NAMES+=("$folder_name")
done < <(find "$DIR_PATH" -mindepth 1 -maxdepth 1 -type d -print0)

# 检查是否找到作者
if [ ${#AUTHOR_NAMES[@]} -eq 0 ]; then
    echo "错误：目录中没有找到任何作者文件夹"
    exit 1
fi

echo "找到 ${#AUTHOR_NAMES[@]} 位作者:"
printf ' - %s\n' "${AUTHOR_NAMES[@]}"

# 确认操作
read -p "确认将这些作者导入数据库吗？(y/n): " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "操作已取消"
    exit 0
fi

# 导入数据
SUCCESS=0
FAILED=0
TOTAL=${#AUTHOR_NAMES[@]}

for name in "${AUTHOR_NAMES[@]}"; do
    # 转义单引号以便SQL使用
    ESCAPED_NAME=$(echo "$name" | sed "s/'/''/g")
    
    # 执行SQL插入
    SQL="INSERT INTO virtual_users (name, description) VALUES ('$ESCAPED_NAME', NULL)"
    
    if mariadb -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "$SQL" &> /dev/null; then
        echo "成功导入: $name"
        ((SUCCESS++))
    else
        echo "导入失败: $name"
        ((FAILED++))
    fi
done

# 显示结果
echo ""
echo "导入完成!"
echo "成功: $SUCCESS"
echo "失败: $FAILED"
echo "总计: $TOTAL"

if [ $FAILED -gt 0 ]; then
    exit 1
fi
