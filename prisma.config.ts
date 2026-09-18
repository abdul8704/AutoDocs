import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
    schema: "src/prisma/schema.prisma",
    migrations: {
        path: "src/prisma/migrations",
    },
    datasource: {
        url: process.env.DATABASE_URL || "postgres://admin:123@localhost:5432/autoDocs",
    },
});