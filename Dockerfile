FROM node:22-alpine

WORKDIR /app

# simple-git shells out to the real git binary, which the node alpine image
# does not ship.
RUN apk add --no-cache git

COPY package*.json ./

RUN npm install

COPY . .
COPY docker-entrypoint.sh .

RUN chmod +x docker-entrypoint.sh
RUN npm run build


EXPOSE 5000

ENTRYPOINT ["./docker-entrypoint.sh"]