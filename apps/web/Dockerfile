FROM node:22-alpine
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@scs/web", "start"]
