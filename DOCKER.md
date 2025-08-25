# Docker Deployment Guide - Clean Architecture

## 🏗️ **Architecture Overview**

This Instagram downloader uses a **clean, SOLID architecture** with:
- **Strategy Pattern** for download tools (yt-dlp + gallery-dl fallback)
- **Service Layer** for caching, rate limiting, and URL processing
- **Dependency Injection** for testable, maintainable code

## 🐳 **Docker Configuration**

### **Image Optimizations**
- **Multi-stage copying**: Only essential files included
- **Layer caching**: Dependencies installed before code copy
- **Security**: Browser dependencies for cookie extraction
- **Size optimization**: Unnecessary files excluded via .dockerignore

### **Architecture Support**
- **src/ directory**: Clean service and strategy organization
- **Test suite**: Architecture validation included
- **Health checks**: Enhanced endpoints for production monitoring

## 🚀 **Quick Deployment**

### **Development**
```bash
# Build and start development environment
docker-compose up -d

# Test the clean architecture
curl http://localhost:3000/status
```

### **Production**
```bash
# Build and start production environment
docker-compose -f docker-compose.prod.yml up -d

# Verify deployment
curl http://localhost:3000/status
```

### **Comprehensive Testing**
```bash
# Run full Docker test suite
./test-docker.sh
```

## 📊 **Enhanced Health Monitoring**

### **Development Health Check**
- **Endpoint**: `http://localhost:3000/`
- **Response**: Basic service info with architecture details

### **Production Health Check** 
- **Endpoint**: `http://localhost:3000/status`
- **Response**: Comprehensive metrics including:
  - Strategy success rates
  - Cache performance
  - Rate limiting status
  - Service health indicators

### **Sample Status Response**
```json
{
  "service": "instagram-downloader",
  "healthy": true,
  "metrics": {
    "totalRequests": 156,
    "cacheHitRate": "67.3%",
    "successRate": "94.2%",
    "strategiesStats": {
      "yt-dlp": {
        "attempts": 45,
        "successes": 42,
        "failures": 3,
        "successRate": "93.3%"
      },
      "gallery-dl": {
        "attempts": 8,
        "successes": 6,
        "failures": 2,
        "successRate": "75.0%"
      }
    }
  },
  "cache": {
    "totalKeys": 123,
    "memoryUsed": "2.1M",
    "connected": true
  },
  "strategies": [
    {
      "name": "yt-dlp",
      "priority": 1,
      "estimatedDuration": 45000
    },
    {
      "name": "gallery-dl", 
      "priority": 2,
      "estimatedDuration": 30000
    }
  ]
}
```

## 🔧 **Configuration Changes**

### **Environment Variables**
```yaml
environment:
  - REDIS_URL=redis://redis:6379
  - NODE_ENV=production
  - COOKIES_PATH=/app/cookies/instagram.com_cookies.txt
  - CHROME_BIN=/usr/bin/chromium-browser
  - DISPLAY=:99
```

### **Resource Limits (Production)**
```yaml
deploy:
  resources:
    limits:
      memory: 1G          # Increased for clean architecture
      cpus: '0.75'        # Increased for strategy processing
    reservations:
      memory: 512M
      cpus: '0.25'
```

### **Enhanced Health Checks**
```yaml
healthcheck:
  test: ['CMD', 'wget', '--no-verbose', '--tries=1', '--spider', 'http://localhost:3000/status']
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

## 🧪 **Testing Features**

### **Architecture Tests in Container**
```bash
# Run architecture tests inside container
docker-compose exec app npm run test

# Expected output:
# 🧪 Running Test Suite
# ✅ UrlService validates Instagram URLs correctly
# ✅ YtDlpStrategy has correct configuration
# ✅ GalleryDlStrategy has correct configuration
# ✅ RateLimitManager tracks failures correctly
# 📊 Test Results: 7 passed, 0 failed
```

### **Integration Tests**
```bash
# Test download functionality
docker-compose exec app npm run test-download

# Test specific strategy
curl -X POST -H "Content-Type: application/json" \
  -d '{"reelURL":"https://www.instagram.com/p/ABC123/"}' \
  http://localhost:3000/download
```

## 📁 **Container File Structure**

```
/app/
├── server.js                    # Express entry point
├── src/
│   ├── interfaces/
│   │   └── DownloadStrategy.js  # Strategy interface
│   ├── strategies/
│   │   ├── YtDlpStrategy.js     # Primary download tool
│   │   └── GalleryDlStrategy.js # Fallback tool
│   └── services/
│       ├── UrlService.js        # URL processing
│       ├── CacheService.js      # Redis operations
│       ├── RateLimitManager.js  # Smart backoff
│       └── DownloadOrchestrator.js # Main coordinator
├── cookies/                     # Cookie storage (mounted)
├── package.json                 # Dependencies & scripts
└── refresh-cookies.js           # Cookie management
```

## 🔄 **Fallback Flow in Container**

1. **yt-dlp Primary** (4 strategies):
   - Fresh Chrome browser cookies
   - Enhanced file cookies
   - Firefox browser fallback  
   - Embed-only extraction

2. **gallery-dl Fallback** (3 strategies):
   - Direct URL extraction
   - JSON metadata parsing
   - Simple download mode

3. **Smart Rate Limiting**:
   - Per-domain backoff tracking
   - Request stampede prevention
   - Automatic recovery on success

## 🚨 **Troubleshooting**

### **Container Won't Start**
```bash
# Check logs
docker-compose logs app

# Common issues:
# - Redis connection (check redis service)
# - Browser dependencies (check Dockerfile)
# - Port conflicts (change port mapping)
```

### **Architecture Tests Failing**
```bash
# Run tests with verbose output
docker-compose exec app node test/architecture.test.js

# Check service dependencies
docker-compose exec app npm run test
```

### **Download Failures**
```bash
# Check strategy status
curl http://localhost:3000/status | jq '.strategies'

# Check rate limiting
curl http://localhost:3000/status | jq '.rateLimiting'

# Check cache
curl http://localhost:3000/status | jq '.cache'
```

### **Performance Issues**
```bash
# Monitor container resources
docker stats

# Check strategy performance
curl http://localhost:3000/status | jq '.metrics.strategiesStats'

# Optimize cache TTL if needed
# Edit CacheService.js defaultTtl
```

## 🔒 **Security Considerations**

### **Browser Security**
- Chrome/Firefox run with `seccomp:unconfined` for cookie access
- Containers isolated from host system
- No privileged access required

### **Data Security**
- Cookies volume-mounted (not copied into image)
- Temporary files cleaned automatically
- No sensitive data in logs

## 📈 **Scaling Options**

### **Horizontal Scaling**
```bash
# Scale app instances
docker-compose -f docker-compose.prod.yml up -d --scale app=3

# Load balancer needed for multiple instances
```

### **Vertical Scaling**
```yaml
# Increase resource limits in docker-compose.prod.yml
deploy:
  resources:
    limits:
      memory: 2G
      cpus: '1.0'
```

## 🎯 **Production Checklist**

- [ ] Run `./test-docker.sh` successfully
- [ ] Verify health endpoints responding
- [ ] Check strategy configurations
- [ ] Validate cache connectivity
- [ ] Test download functionality
- [ ] Monitor resource usage
- [ ] Set up log aggregation
- [ ] Configure alerts for failures

## 🌟 **Architecture Benefits**

1. **Maintainability**: Clean separation of concerns
2. **Testability**: Each service unit tested
3. **Extensibility**: Easy to add new download tools
4. **Reliability**: Multiple fallback strategies
5. **Observability**: Comprehensive metrics and logging
6. **Performance**: Smart caching and rate limiting
