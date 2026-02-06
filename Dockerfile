FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source
COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "src/server.js"]
