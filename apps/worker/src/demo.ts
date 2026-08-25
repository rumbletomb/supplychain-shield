import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanWorkspace } from "@scs/core";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.resolve(currentDirectory, "../../../fixtures/vulnerable-node");
const result = await scanWorkspace(fixture);

console.log(JSON.stringify(result, null, 2));
if (result.status !== "failed") process.exitCode = 1;
