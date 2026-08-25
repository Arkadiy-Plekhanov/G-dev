# Dev-oriented image: runs the Vite dev server (HMR) against bind-mounted
# source. For production the frontend isn't containerized at all -- it's a
# static build deployed to OSS+CDN (see docs/deployment/).
FROM node:22-slim

WORKDIR /app

# python3 + psycopg2 + python-jose: needed ONLY by src/test/mint_session.py
# (integration tests mint a real session by talking to Postgres directly --
# see that file's docstring for why it doesn't just call the backend).
# Not needed for `npm run dev` itself; the extra ~60MB only matters for the
# test image, and a dev-only image is not the place to split that out.
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \
    && pip3 install --no-cache-dir --break-system-packages psycopg2-binary python-jose \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev"]
