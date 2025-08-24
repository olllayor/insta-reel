# Production Deployment Guide

## 🚀 Quick Start

```bash
# Deploy to production
./deploy.sh

# Monitor the service
./monitor.sh
```

## 📋 Pre-deployment Checklist

### 1. Instagram Cookies (Recommended)
For best reliability, set up Instagram cookies:

```bash
# Method 1: Manual cookie export
# 1. Install "Get cookies.txt LOCALLY" Chrome extension
# 2. Go to instagram.com and login
# 3. Export cookies and save as ./cookies/instagram.com_cookies.txt

# Method 2: Automatic refresh (requires GUI)
npm run refresh-cookies
```

### 2. Environment Configuration
Edit `.env.production` if needed:
```env
NODE_ENV=production
PORT=3000
REDIS_URL=redis://redis:6379
```

### 3. System Requirements
- Docker & Docker Compose
- At least 2GB RAM (recommended 4GB)
- 10GB free disk space

## 🐳 Docker Configurations

### Development
```bash
docker-compose up -d
```

### Production
```bash
# Full production deployment
docker-compose -f docker-compose.prod.yml up -d

# Or use the deployment script
./deploy.sh
```

### Production Features
- Health checks with automatic restart
- Resource limits (CPU: 0.5 cores, RAM: 512MB)
- Redis persistence
- Optimized Docker layers
- Browser support for cookie extraction

## 📊 Monitoring

### Service Status
```bash
# Quick status check
curl http://localhost:3000/status

# Detailed monitoring
./monitor.sh

# View logs
docker-compose -f docker-compose.prod.yml logs -f app
```

### Performance Metrics
- CPU usage should stay under 50%
- Memory usage should stay under 400MB
- Response time should be under 30 seconds
- Success rate should be above 80%

## 🔧 Maintenance

### Update Cookies
```bash
# Refresh browser cookies
docker-compose -f docker-compose.prod.yml exec app npm run refresh-cookies

# Or manually replace the file
cp new_cookies.txt ./cookies/instagram.com_cookies.txt
docker-compose -f docker-compose.prod.yml restart app
```

### Scale the Service
```bash
# Scale to 2 instances
docker-compose -f docker-compose.prod.yml up -d --scale app=2

# Scale back to 1
docker-compose -f docker-compose.prod.yml up -d --scale app=1
```

### Update the Application
```bash
# Pull latest code
git pull

# Rebuild and redeploy
./deploy.sh
```

## 🛠️ Troubleshooting

### Common Issues

1. **Service won't start**
   ```bash
   # Check logs
   docker-compose -f docker-compose.prod.yml logs app
   
   # Rebuild container
   docker-compose -f docker-compose.prod.yml build --no-cache app
   ```

2. **Downloads failing**
   ```bash
   # Test with a known good URL
   curl -X POST -H "Content-Type: application/json" \
     -d '{"reelURL":"https://www.instagram.com/p/DNqAuFLM0Es/"}' \
     http://localhost:3000/download
   
   # Check if cookies need refresh
   docker-compose -f docker-compose.prod.yml exec app npm run refresh-cookies
   ```

3. **High memory usage**
   ```bash
   # Check container stats
   docker stats
   
   # Restart if needed
   docker-compose -f docker-compose.prod.yml restart app
   ```

4. **Instagram blocking requests**
   - The service automatically tries 4 different strategies
   - First strategy uses fresh browser cookies (most reliable)
   - Falls back to file cookies, Firefox, and embed-only mode
   - No user rate limiting implemented as requested

### Authentication Strategies

The service uses a 4-tier fallback system:

1. **fresh_browser_cookies**: Extracts fresh cookies from Chrome
2. **file_cookies_enhanced**: Uses saved cookies with mobile user-agent
3. **firefox_fallback**: Extracts cookies from Firefox
4. **embed_only**: Downloads using embed mode (lower quality)

### Health Endpoints

- `GET /`: Basic health check
- `GET /status`: Detailed service status
- `POST /download`: Download Instagram reel

## 🔒 Security Considerations

1. **Firewall**: Only expose port 3000 if needed externally
2. **Cookies**: Keep cookie files secure and rotate regularly
3. **Logs**: Monitor for suspicious activity
4. **Updates**: Keep Docker images updated

## 📈 Performance Tuning

### High Traffic Optimization
```yaml
# In docker-compose.prod.yml, increase resources:
deploy:
  resources:
    limits:
      cpus: '1.0'      # Increase from 0.5
      memory: 1024M    # Increase from 512M
```

### Cache Configuration
The service uses Redis for caching with:
- 1-hour cache for successful downloads
- Metadata storage for debugging
- Automatic cleanup of old entries

## 🚨 Emergency Procedures

### Service Down
```bash
# Quick restart
docker-compose -f docker-compose.prod.yml restart

# Full reset
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

### Data Corruption
```bash
# Clear Redis cache
docker-compose -f docker-compose.prod.yml exec redis redis-cli flushall

# Reset containers
docker-compose -f docker-compose.prod.yml down -v
docker-compose -f docker-compose.prod.yml up -d
```

### Logs Too Large
```bash
# Rotate logs
docker-compose -f docker-compose.prod.yml logs --tail=1000 > backup.log
docker-compose -f docker-compose.prod.yml restart app
```
