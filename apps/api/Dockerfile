FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/adapters/package.json ./packages/adapters/package.json
COPY packages/crypto/package.json ./packages/crypto/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/api/prisma/schema.prisma ./apps/api/prisma/schema.prisma

RUN npm install -g pnpm@12.8.1 && \
    pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @autoapply/api exec prisma generate --schema prisma/schema.prisma
RUN node -e "const fs = require('fs'); const path = require('path'); const client = path.dirname(require.resolve('@prisma/client', { paths: ['./apps/api'] })); fs.cpSync(path.resolve(client, '../../.prisma/client'), '/app/generated-prisma-client', { recursive: true });"
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Install runtime libraries required by Prisma and dumb-init for signal handling.
RUN apk add --no-cache dumb-init openssl

COPY package*.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/adapters/package.json ./packages/adapters/package.json
COPY packages/crypto/package.json ./packages/crypto/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/api/prisma/schema.prisma ./apps/api/prisma/schema.prisma

RUN npm install -g pnpm@12.8.1 && \
    PRISMA_SKIP_POSTINSTALL_GENERATE=true pnpm install --frozen-lockfile --prod

COPY --from=builder /app/generated-prisma-client /tmp/generated-prisma-client
RUN node -e "const fs = require('fs'); const path = require('path'); const client = path.dirname(require.resolve('@prisma/client', { paths: ['./apps/api'] })); const generated = path.resolve(client, '../../.prisma/client'); fs.mkdirSync(path.dirname(generated), { recursive: true }); fs.cpSync('/tmp/generated-prisma-client', generated, { recursive: true });"

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages/crypto/dist ./packages/crypto/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/adapters/dist ./packages/adapters/dist

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/api/dist/main.js"]
