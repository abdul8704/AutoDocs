import { ModuleEdge, FileRecord } from "../pipeline.types";
import { normalizePath, dirOf } from "../pipeline.helper"
import { Module } from "../pipeline.types";


const IMPORT_REGEXES: RegExp[] = [
    /(?:import|export)\s[^;'"]*?from\s+['"]([^'"]+)['"]/g,   // TS/JS: import x from "y"
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,                    // CJS: require("y")
    /^[ \t]*from[ \t]+([\w.]+)[ \t]+import/gm,                 // Python: from a.b import c
    /^[ \t]*import[ \t]+(?:static[ \t]+)?([\w.]+?)(?:\.\*)?[ \t]*;/gm, // Java/C#-ish: import a.b.C;
    /^[ \t]*import[ \t]+([\w.]+)[ \t]*$/gm,                    // Python/Kotlin: import a.b
    /^[ \t]*using[ \t]+([\w.]+)[ \t]*;/gm,                     // C#: using A.B;
    /^[ \t]*(?:[\w.]+[ \t]+)?"([\w./\-]+)"[ \t]*$/gm,          // Go: "acme/internal/orders"
    /^[ \t]*use[ \t]+([\w\\:]+)/gm,                            // PHP/Rust: use A\B; use a::b
];

export function extractImportSpecs(source: string): string[] {
    const specs = new Set<string>();
    for (const re of IMPORT_REGEXES) {
        re.lastIndex = 0;                       // /g regexes are stateful — always reset
        for (const m of source.matchAll(re)) specs.add(m[1]);
    }
    return [...specs];
}

function buildBasenameIndex(paths: Iterable<string>): Map<string, string[]> {
    const index = new Map<string, string[]>();
    for (const p of paths) {
        const base = p.slice(p.lastIndexOf("/") + 1).replace(/\.[^.]+$/, ""); // "a/b/Svc.java" -> "Svc"
        index.set(base, [...(index.get(base) ?? []), p]);
    }
    return index;
}

const RESOLVE_SUFFIXES = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".py",
    "/index.ts", "/index.tsx", "/index.js", "/__init__.py"];

export function resolveSpec(spec: string, importerPath: string,
    manifest: Set<string>,
    byBase: Map<string, string[]>): string | null {
    if (spec.startsWith(".")) {                                   // relative import
        const parts = dirOf(importerPath).split("/").filter(Boolean);
        for (const seg of spec.split("/")) {
            if (seg === "..") parts.pop();
            else if (seg !== "." && seg !== "") parts.push(seg);
        }
        const base = parts.join("/");
        for (const suffix of RESOLVE_SUFFIXES) {
            if (manifest.has(base + suffix)) return base + suffix;
        }
        return null;
    }
    // Package-style: "com.acme.orders.OrderService" / "a::b::Thing" / "acme/internal/orders"
    const segments = spec.replace(/\\/g, "/").split(/[./:]+/).filter(Boolean);
    for (let i = segments.length - 1; i >= 0 && i >= segments.length - 2; i--) {
        const hits = byBase.get(segments[i]) ?? [];                 // try last, then 2nd-last segment
        if (hits.length === 1 && hits[0] !== importerPath) return hits[0];
        if (hits.length > 1) {                                      // ambiguous -> path-tail tiebreak
            const tail = segments.slice(Math.max(0, i - 2), i + 1).join("/");
            const narrowed = hits.filter(h => h.replace(/\.[^.]+$/, "").endsWith(tail));
            if (narrowed.length === 1 && narrowed[0] !== importerPath) return narrowed[0];
            return null;                                              // still ambiguous -> no edge
        }
    }
    return null;                                                  // external package -> no edge
}

export function buildModuleEdges(codeFiles: FileRecord[],
    readFile: (path: string) => string,
    fileToModule: Map<string, string>,
): { edges: ModuleEdge[]; resolutionRate: number } {
    const manifest = new Set(codeFiles.map(f => normalizePath(f.path)));
    const byBase = buildBasenameIndex(manifest);
    const counts = new Map<string, number>();
    let total = 0, resolved = 0;

    for (const file of codeFiles) {
        const from = fileToModule.get(normalizePath(file.path));
        if (!from) continue;
        for (const spec of extractImportSpecs(readFile(file.path))) {
            total++;
            const target = resolveSpec(spec, normalizePath(file.path), manifest, byBase);
            if (!target) continue;
            resolved++;
            const to = fileToModule.get(target);
            if (!to || to === from) continue;                         // same-module -> not an edge
            const key = `${from}\u0000${to}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
    }
    const edges = [...counts.entries()]
        .map(([key, count]) => {
            const [from, to] = key.split("\u0000");
            return { from, to, count };
        })
        .sort((a, b) => b.count - a.count);
    return { edges, resolutionRate: total === 0 ? 0 : resolved / total };
}

export function buildFileToModuleIndex(modules: Module[]): Map<string, string> {
    const index = new Map<string, string>();
    for (const m of modules) for (const f of m.files) index.set(normalizePath(f.path), m.id);
    return index;
}