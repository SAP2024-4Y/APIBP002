# syntax=docker/dockerfile:1

# ---- Stage 1: build the React frontend ----
FROM node:20-bookworm-slim AS frontend
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: backend runtime (also serves the built frontend) ----
FROM node:20-bookworm-slim
# build tools required to compile the better-sqlite3 native addon
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
COPY docs ./docs
COPY --from=frontend /fe/dist ./public
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/index.js"]
