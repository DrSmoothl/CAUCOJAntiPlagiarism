#!/bin/bash

# 比赛代码查重插件安装脚本

echo "开始安装比赛代码查重插件..."

# 检查是否在HydroOJ环境中
if [ ! -f "package.json" ]; then
    echo "错误：请在HydroOJ项目根目录下运行此脚本"
    exit 1
fi

# 复制插件文件到addons目录
ADDON_DIR="addons/contest-plagiarism-detector"

echo "创建插件目录..."
mkdir -p "$ADDON_DIR"

echo "复制插件文件..."
cp index.ts "$ADDON_DIR/"
cp package.json "$ADDON_DIR/"
cp README.md "$ADDON_DIR/"
cp -r templates "$ADDON_DIR/"

# 安装插件依赖
echo "安装插件依赖..."
cd "$ADDON_DIR"
npm install

echo "插件安装完成！"
echo ""
echo "请按以下步骤完成配置："
echo "1. 重启HydroOJ服务："
echo "   pm2 restart hydrooj"
echo ""
echo "2. 确保管理员账户具有 PRIV_EDIT_SYSTEM 权限"
echo ""
echo "3. 访问以下地址开始使用："
echo "   /plagiarism - 查重系统主界面"
echo "   /plagiarism/contest - 比赛查重列表"
echo ""
echo "插件功能："
echo "- 比赛代码相似度检测"
echo "- 多语言支持（C/C++/Python/Java）"
echo "- 可视化查重结果展示"
echo "- 代码片段对比分析"
