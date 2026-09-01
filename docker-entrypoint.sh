#!/bin/sh

echo "Installing dependencies..."

npm install

echo "Running database migrations..."

npx prisma migrate deploy

echo "Starting application..."

exec npm run dev