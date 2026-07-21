FROM node:22-alpine
RUN mkdir -p /opt/app-root/src
WORKDIR /opt/app-root/src
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src/ src/
EXPOSE 3000
CMD ["node", "src/server.js"]
