import { rm } from "fs/promises";
import { constructPath } from "../utils/pathHelper.utils";

export const deleteLocalCopy = async (repoId: string) => {
    const rootPath = constructPath(repoId);

    await rm(rootPath, {
        recursive: true
    });
    console.log("deleted ", repoId);
};

const main = async () => {
    await deleteLocalCopy("ec5b95f2-7e63-4787-83c7-86f454880e9f");
}

main();