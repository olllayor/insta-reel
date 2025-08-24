FROM node:20-alpine

# Enable pnpm via corepack (no need to install pnpm separately)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install Python, download tools, and Chrome dependencies for browser cookie extraction
RUN apk add --no-cache \
    python3 py3-pip \
    chromium \
    chromium-chromedriver \
    firefox \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont && \
    pip3 install --break-system-packages gallery-dl yt-dlp

# Set working directory
WORKDIR /app

# Copy package files first for caching during builds
COPY package.json pnpm-lock.yaml ./

# Install dependencies with frozen lockfile for reproducibility
RUN pnpm install --frozen-lockfile --prod

# Copy the rest of the app code
COPY . .

# Set Chrome environment variables for yt-dlp browser cookie extraction
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV CHROME_PATH=/usr/bin/chromium-browser
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

# Volume for cookies (mount at runtime)

VOLUME /app/cookies

# Expose the app port
EXPOSE 3000

# Run the app with pnpm
CMD ["pnpm", "start"]