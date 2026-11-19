FROM node:24-alpine

WORKDIR /app

# No runtime dependencies: the kernel runs on Node's native TypeScript support.
COPY package.json tsconfig.json ./
COPY src ./src
COPY public ./public
COPY data/.gitkeep ./data/

ENV PORT=4177
EXPOSE 4177

# The event log lives in /app/data. Mount a volume to persist it.
CMD ["node", "src/cli.ts", "serve", "--host", "0.0.0.0", "--port", "4177"]
