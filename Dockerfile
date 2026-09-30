# ==============================================================================
# ClipForge Production Cloud Container
# ==============================================================================
FROM node:20-slim AS runner

# Install system dependencies: FFmpeg, curl, ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definition
COPY package.json package-lock.json* bun.lock* ./

# Install npm dependencies
RUN npm install

# Copy application source code
COPY . .

# Build Vite frontend and bundled Express/Worker backend
RUN npm run build

# Runtime configuration
ENV NODE_ENV=production
ENV PORT=3000
ENV TEMP_DIR=/app/temp_clips

EXPOSE 3000

# Start server
CMD ["node", "dist/server.cjs"]
