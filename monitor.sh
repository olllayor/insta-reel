#!/bin/bash

# Production Monitoring Script

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📊 Instagram Downloader - Production Monitoring${NC}"
echo "================================================"

# Service status
echo -e "${YELLOW}🔧 Service Status:${NC}"
docker-compose -f docker-compose.prod.yml ps

echo ""

# Health check
echo -e "${YELLOW}🏥 Health Check:${NC}"
if curl -f http://localhost:3000/ >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Service is healthy${NC}"
else
    echo -e "${RED}❌ Service is unhealthy${NC}"
fi

echo ""

# Resource usage
echo -e "${YELLOW}💾 Resource Usage:${NC}"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" $(docker-compose -f docker-compose.prod.yml ps -q)

echo ""

# Recent logs (last 20 lines)
echo -e "${YELLOW}📝 Recent Logs (last 20 lines):${NC}"
docker-compose -f docker-compose.prod.yml logs --tail=20 app

echo ""

# Redis info
echo -e "${YELLOW}🗃️  Redis Info:${NC}"
REDIS_INFO=$(docker-compose -f docker-compose.prod.yml exec -T redis redis-cli info stats | grep -E "(total_commands_processed|instantaneous_ops_per_sec)")
echo "$REDIS_INFO"

# Cache usage
CACHE_KEYS=$(docker-compose -f docker-compose.prod.yml exec -T redis redis-cli dbsize)
echo "Cache keys: $CACHE_KEYS"

echo ""

# Disk usage
echo -e "${YELLOW}💿 Disk Usage:${NC}"
df -h | grep -E "(Filesystem|/var/lib/docker)"

echo ""

# Network connectivity test
echo -e "${YELLOW}🌐 External Connectivity:${NC}"
if ping -c 1 google.com >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Internet connectivity OK${NC}"
else
    echo -e "${RED}❌ Internet connectivity issues${NC}"
fi

if curl -f https://www.instagram.com >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Instagram reachable${NC}"
else
    echo -e "${RED}❌ Instagram unreachable${NC}"
fi

echo ""
echo -e "${BLUE}📋 Quick Commands:${NC}"
echo "  View live logs: docker-compose -f docker-compose.prod.yml logs -f"
echo "  Restart app:    docker-compose -f docker-compose.prod.yml restart app"
echo "  Update cookies: docker-compose -f docker-compose.prod.yml exec app npm run refresh-cookies"
echo "  Scale up:       docker-compose -f docker-compose.prod.yml up -d --scale app=2"
