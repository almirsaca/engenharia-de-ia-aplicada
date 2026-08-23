FROM node:18-slim

WORKDIR /app

# Install build tools for native modules (tfjs-node may require this)
RUN apt-get update && \
    apt-get install -y python3 build-essential gcc g++ make ca-certificates --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Copy package manifests and install production dependencies
COPY package.json package-lock.json* ./
RUN npm install --production --no-audit --no-fund

# Try to install tfjs-node in the image (optional). If it fails, continue.
RUN npm install @tensorflow/tfjs-node@latest --no-audit --no-fund || true

# Copy source
COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
