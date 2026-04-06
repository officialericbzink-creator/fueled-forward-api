FROM node:22.22.1
WORKDIR /app
EXPOSE 3000

COPY package.json .
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

CMD ["npm", "run", "start:prod"]
