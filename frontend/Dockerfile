# Dev-oriented image: runs the Vite dev server (HMR) against bind-mounted
# source. For production the frontend isn't containerized at all -- it's a
# static build deployed to OSS+CDN (see docs/deployment/).
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev"]
