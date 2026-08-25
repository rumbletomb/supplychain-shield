import { createHash } from "node:crypto";

export function fingerprint(...parts: Array<string | number | undefined>): string {
  return createHash("sha256")
    .update(parts.filter((part) => part !== undefined).join("\u0000"))
    .digest("hex");
}
