#!/bin/bash

# virtual_users数据录入脚本 (使用mariadb客户端)
# 用法：./add_virtual_user.sh [数据库用户名] [数据库密码] [数据库名]

# 设置默认值
DB_USER=${1:-root}
DB_PASS=${2:-NachoNO1}
DB_NAME=${3:-Pixels}

# 检查mariadb客户端是否安装
if ! command -v mariadb &> /dev/null; then
    echo "错误：mariadb客户端未安装，请先安装MariaDB客户端"
    echo "在Debian/Ubuntu上可以运行: sudo apt-get install mariadb-client"
    echo "在RHEL/CentOS上可以运行: sudo yum install mariadb"
    exit 1
fi

# 显示表结构
echo "=============================================="
echo " virtual_users表结构"
echo "=============================================="
mariadb -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "DESCRIBE virtual_users;"
echo ""

# 函数：获取用户输入
function get_input() {
    local prompt="$1"
    local is_required="$2"
    local input
    
    while true; do
        read -p "$prompt: " input
        if [[ "$is_required" == "required" && -z "$input" ]]; then
            echo "错误：此项为必填项，请重新输入"
        else
            break
        fi
    done
    
    echo "$input"
}

# 收集用户数据
echo "请输入virtual_users表数据 (按Ctrl+C退出)"
echo "----------------------------------------------"

# 必填字段
NAME=$(get_input "名称 (name) - 必填" "required")

# 选填字段
DESCRIPTION=$(get_input "描述 (description) - 选填 (直接回车跳过)" "optional")

# 确认输入
echo ""
echo "=============================================="
echo " 请确认输入数据"
echo "=============================================="
echo "名称: $NAME"
echo "描述: $DESCRIPTION"
echo "创建时间: 自动生成(当前时间戳)"
echo "=============================================="

read -p "确认插入数据吗？(y/n): " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "操作已取消"
    exit 0
fi

# 构建并执行SQL
SQL="INSERT INTO virtual_users (name, description) VALUES ('$NAME', "
if [[ -z "$DESCRIPTION" ]]; then
    SQL+="NULL)"
else
    SQL+="'$DESCRIPTION')"
fi

echo "执行SQL: $SQL"
mariadb -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "$SQL"

# 检查结果
if [[ $? -eq 0 ]]; then
    echo "数据插入成功！"
    echo "新记录ID: $(mariadb -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -Bse "SELECT LAST_INSERT_ID();")"
else
    echo "错误：数据插入失败"
    exit 1
fi
