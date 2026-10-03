FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "const c=require('fs').readFileSync('/proc/1/cmdline','utf8'); process.exit(c.includes('src/index.js') ? 0 : 1)"]

USER node

CMD ["node", "src/index.js"]
