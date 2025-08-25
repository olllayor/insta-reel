#!/bin/bash

# Production Deployment Script for Instagram Downloader (with sudo detection)

set -e  # Exit on any error

echo "🚀 Starting production deployment..."

# Determine if docker requires sudo
SUDO=""
if ! docker info >/dev/null 2>&1; then
    if sudo docker info >/dev/null 2>&1; then
        SUDO="sudo"
        echo "🔐 Docker requires sudo; using sudo for docker commands."
    else
        echo "❌ Docker is not running or not accessible. Please start Docker and try again."
        exit 1
    fi
fi

# Build docker command prefix (either "docker" or "sudo docker")
DOCKER_CMD="${SUDO:+$SUDO }docker"

# Check if cookies file exists
if [ ! -f "./cookies/instagram.com_cookies.txt" ]; then
    echo "⚠️  Warning: No cookies file found at ./cookies/instagram.com_cookies.txt"
    echo "📋 To add cookies:"
    echo "   1. Install 'Get cookies.txt LOCALLY' Chrome extension"
    echo "   2. Go to instagram.com and login"
    echo "   3. Export cookies and save as ./cookies/instagram.com_cookies.txt"
    echo "   4. Or run: npm run refresh-cookies"
    echo ""
    read -p "Continue without cookies? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Pull latest images
echo "📦 Pulling latest base images..."
$DOCKER_CMD compose -f docker-compose.prod.yml pull redis

# Build the application
echo "🔨 Building application..."
$DOCKER_CMD compose -f docker-compose.prod.yml build --no-cache app

# Stop existing containers
echo "🛑 Stopping existing containers..."
$DOCKER_CMD compose -f docker-compose.prod.yml down

# Start services
echo "🌟 Starting services..."
$DOCKER_CMD compose -f docker-compose.prod.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Health check
echo "🏥 Checking service health..."
if curl -f http://localhost:3000/ >/dev/null 2>&1; then
    echo "✅ Service is healthy!"
else
    echo "❌ Service health check failed"
    echo "📋 Checking logs..."
    $DOCKER_CMD compose -f docker-compose.prod.yml logs app
    exit 1
fi

# Test download functionality
echo "🧪 Testing download functionality..."
if curl -f -X POST \
    -H "Content-Type: application/json" \
    -d '{"reelURL":"https://www.instagram.com/p/DNqAuFLM0Es/"}' \
    http://localhost:3000/download >/dev/null 2>&1; then
    echo "✅ Download test passed!"
else
    echo "⚠️  Download test failed (this might be normal if cookies are needed)"
fi

echo ""
echo "🎉 Deployment completed successfully!"
echo "📊 Service status:"
$DOCKER_CMD compose -f docker-compose.prod.yml ps

echo ""
echo "📋 Useful commands:"
echo "   View logs:     $DOCKER_CMD compose -f docker-compose.prod.yml logs -f"
echo "   Stop services: $DOCKER_CMD compose -f docker-compose.prod.yml down"
echo "   Check status:  curl http://localhost:3000/status"
echo "   Refresh cookies: $DOCKER_CMD compose -f docker-compose.prod.yml exec app npm run refresh-cookies"
