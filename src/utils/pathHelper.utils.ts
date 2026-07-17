import path from "path";

export const createPath = (...segments: string[]) =>
    path.resolve(process.cwd(), ...segments);

export const constructPath = (repoName: string) => {
    return path.join(
        process.cwd(),
        "codebases",
        repoName
    );
}

