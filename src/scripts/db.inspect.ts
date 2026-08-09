// Read-only: prints the live shape of RepoDocState so schema drift is visible
// without guessing from migration files.
//
//   npx tsx src/scripts/db.inspect.ts
//
import "../config/env";
import prisma from "../prisma/prisma";

const main = async () => {

    const columns = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string; column_default: string | null }>>(
        `SELECT column_name, data_type, column_default
         FROM information_schema.columns
         WHERE table_name = 'RepoDocState'
         ORDER BY ordinal_position`,
    );

    console.log("\nRepoDocState columns:");
    for (const c of columns) {
        console.log(`  ${c.column_name.padEnd(20)} ${c.data_type}${c.column_default ? ` default ${c.column_default}` : ""}`);
    }

    const fks = await prisma.$queryRawUnsafe<Array<{ table_name: string; constraint_name: string; column_name: string; foreign_table: string; foreign_column: string }>>(
        `SELECT tc.table_name, tc.constraint_name, kcu.column_name,
                ccu.table_name  AS foreign_table,
                ccu.column_name AS foreign_column
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
         JOIN information_schema.constraint_column_usage ccu
           ON tc.constraint_name = ccu.constraint_name
         WHERE tc.constraint_type = 'FOREIGN KEY'
           AND tc.table_name IN ('RepoDocState', 'ModuleDoc', 'Notification')`,
    );

    console.log("\nForeign keys:");
    for (const f of fks) {
        console.log(`  ${f.table_name}.${f.column_name} -> ${f.foreign_table}.${f.foreign_column}`);
    }

    const applied = await prisma.$queryRawUnsafe<Array<{ migration_name: string; finished_at: Date | null }>>(
        `SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at`,
    );

    console.log("\nApplied migrations:");
    for (const m of applied) {
        console.log(`  ${m.finished_at ? "ok  " : "FAIL"} ${m.migration_name}`);
    }

    const counts = await prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
        `SELECT (SELECT count(*) FROM "Repo")         AS repos,
                (SELECT count(*) FROM "RepoDocState") AS doc_states,
                (SELECT count(*) FROM "ModuleDoc")    AS module_docs,
                (SELECT count(*) FROM "Notification") AS notifications`,
    );

    console.log("\nRow counts:");
    for (const [k, v] of Object.entries(counts[0])) {
        console.log(`  ${k.padEnd(15)} ${Number(v)}`);
    }

    // Would re-pointing the FKs at Repo.github_repo_id orphan anything?
    const orphanState = await prisma.$queryRawUnsafe<unknown[]>(
        `SELECT s.repo_id FROM "RepoDocState" s
         LEFT JOIN "Repo" r ON r.github_repo_id = s.repo_id WHERE r.id IS NULL`,
    );
    const orphanDocs = await prisma.$queryRawUnsafe<unknown[]>(
        `SELECT m.repo_id FROM "ModuleDoc" m
         LEFT JOIN "Repo" r ON r.github_repo_id = m.repo_id WHERE r.id IS NULL`,
    );

    console.log("\nRows that would violate an FK on Repo.github_repo_id:");
    console.log(`  RepoDocState   ${orphanState.length}`);
    console.log(`  ModuleDoc      ${orphanDocs.length}`);

    console.log();
    await prisma.$disconnect();
};

main();
