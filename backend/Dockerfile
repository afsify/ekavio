FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM build AS development

ENV NODE_ENV=development
CMD ["npm", "start"]

FROM node:20-alpine AS production

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/postgres ./postgres

EXPOSE 5000

CMD ["npm", "start"]
