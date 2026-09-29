# Game server image (DESIGN.md §2, §10 M4). Built by Render from render.yaml.
FROM node:24-slim AS build
WORKDIR /app
RUN npm install -g pnpm@12.6.0
COPY . .
RUN pnpm install --frozen-lockfile --filter "@wire-lock/server..."
# tsup bundles shared/ into server/dist; `pnpm deploy` then gathers the server's production dependencies.
RUN pnpm --filter @wire-lock/server build \
 && pnpm --filter @wire-lock/server deploy --prod /out

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
USER node
EXPOSE 10000
CMD ["node", "dist/index.js"]
