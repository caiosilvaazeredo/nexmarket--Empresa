# Servidor de pagamentos Nexmarket — imagem para Cloud Run / Fly.io / Railway.
#   docker build -t nexmarket-payments ./server
#   docker run -p 8787:8787 --env-file server/.env nexmarket-payments
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Cloud Run injeta PORT; o server já lê process.env.PORT.
ENV PORT=8787
EXPOSE 8787

USER node
CMD ["node", "index.js"]
