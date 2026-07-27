FROM oven/bun:1.3.14-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY drizzle ./drizzle

USER bun

EXPOSE 3000

CMD ["sh", "-c", "bun run db:wait && bun run db:migrate && exec bun run start"]
