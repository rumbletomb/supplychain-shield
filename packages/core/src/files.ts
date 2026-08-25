import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";

const ignored = [
  "**/.git/**",
  "**/node_modules/**",
  "**/.next/**",
  "**/dist/**",
  "**/coverage/**",
  "**/vendor/**",
  "**/*.min.js",
  "**/*.map",
  "**/pnpm-lock.yaml",
];

export interface WorkspaceFile {
  relativePath: string;
  absolutePath: string;
  size: number;
  content: string;
}

export async function readWorkspaceFiles(root: string): Promise<WorkspaceFile[]> {
  const entries = await fg("**/*", {
    cwd: root,
    onlyFiles: true,
    dot: true,
    ignore: ignored,
    followSymbolicLinks: false,
  });

  const files: WorkspaceFile[] = [];
  for (const relativePath of entries) {
    const absolutePath = path.join(root, relativePath);
    const fileStat = await stat(absolutePath);
    if (fileStat.size > 1_000_000) continue;
    const buffer = await readFile(absolutePath);
    if (buffer.includes(0)) continue;
    files.push({
      relativePath: relativePath.replaceAll("\\", "/"),
      absolutePath,
      size: fileStat.size,
      content: buffer.toString("utf8"),
    });
  }
  return files;
}
