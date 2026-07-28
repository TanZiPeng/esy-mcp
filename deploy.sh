#!/bin/bash

echo "============================================"
echo "   ESY AI MCP Service - Docker 部署脚本"
echo "============================================"
echo ""

# 询问后端地址
read -p "请输入 ESY 后端地址 [默认: http://120.79.138.205:7072]: " BASE_URL
BASE_URL=${BASE_URL:-http://120.79.138.205:7072}

# 询问端口号
read -p "请输入服务监听端口 [默认: 3000]: " PORT
PORT=${PORT:-3000}

# 询问容器名
read -p "请输入容器名称 [默认: esy-mcp]: " CONTAINER_NAME
CONTAINER_NAME=${CONTAINER_NAME:-esy-mcp}

echo ""
echo "--------------------------------------------"
echo "  后端地址: $BASE_URL"
echo "  服务端口: $PORT"
echo "  容器名称: $CONTAINER_NAME"
echo "--------------------------------------------"
read -p "确认部署？(y/n) [默认: y]: " CONFIRM
CONFIRM=${CONFIRM:-y}

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "已取消部署。"
  exit 0
fi

echo ""

# 停止并删除旧容器（如果存在）
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo ">>> 停止并删除旧容器: $CONTAINER_NAME"
  docker stop "$CONTAINER_NAME" 2>/dev/null
  docker rm "$CONTAINER_NAME" 2>/dev/null
fi

# 构建镜像
echo ">>> 构建 Docker 镜像..."
docker build --no-cache -t "$CONTAINER_NAME" .

if [ $? -ne 0 ]; then
  echo "❌ 镜像构建失败！"
  exit 1
fi

# 运行容器
echo ">>> 启动容器..."
docker run -d \
  -p "$PORT:3000" \
  -e "ESY_API_BASE_URL=$BASE_URL" \
  -e "PORT=3000" \
  --restart unless-stopped \
  --name "$CONTAINER_NAME" \
  "$CONTAINER_NAME"

if [ $? -ne 0 ]; then
  echo "❌ 容器启动失败！"
  exit 1
fi

# 等待启动
sleep 2

echo ""
echo "============================================"
echo "  ✅ 部署成功！"
echo ""
echo "  MCP 端点: http://$(hostname -I | awk '{print $1}'):$PORT/mcp"
echo "  查看日志: docker logs -f $CONTAINER_NAME"
echo "  停止服务: docker stop $CONTAINER_NAME"
echo "  重启服务: docker restart $CONTAINER_NAME"
echo "============================================"

# 显示最近日志
echo ""
echo ">>> 最近日志:"
docker logs "$CONTAINER_NAME"
