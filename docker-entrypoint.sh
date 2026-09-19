#!/bin/sh
set -e

echo "Installing dependencies..."
npm install

echo "Generating Prisma Client..."
npx prisma generate

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting application..."
if [ $# -gt 0 ]; then
  exec "$@"
else
  exec npm run dev
fi