import type { Finding } from "@scs/contracts";
import YAML from "yaml";
import type { WorkspaceFile } from "../files.js";
import { fingerprint } from "../fingerprint.js";

function finding(
  ruleId: string,
  severity: Finding["severity"],
  title: string,
  description: string,
  remediation: string,
  path: string,
  line?: number,
): Finding {
  return {
    fingerprint: fingerprint(ruleId, path, line),
    ruleId,
    engine: "shield-config",
    category: "configuration",
    severity,
    title,
    description,
    remediation,
    location: line ? { path, startLine: line, endLine: line } : { path },
    metadata: {},
  };
}

function lineContaining(content: string, needle: RegExp): number | undefined {
  const index = content.split("\n").findIndex((line) => needle.test(line));
  return index >= 0 ? index + 1 : undefined;
}

function scanDockerfile(file: WorkspaceFile): Finding[] {
  const results: Finding[] = [];
  const fromLatest = /^\s*FROM\s+\S+:latest(?:\s|$)/im;
  if (fromLatest.test(file.content)) {
    results.push(
      finding(
        "SCS-DOCKER-LATEST",
        "medium",
        "Container image uses the mutable latest tag",
        "Mutable image tags make builds non-reproducible and can introduce unreviewed changes.",
        "Pin the base image to a version and, for stronger provenance, to an immutable digest.",
        file.relativePath,
        lineContaining(file.content, fromLatest),
      ),
    );
  }

  if (!/^\s*USER\s+\S+/im.test(file.content)) {
    results.push(
      finding(
        "SCS-DOCKER-ROOT",
        "high",
        "Container runs as root",
        "No USER instruction was found, so the container will run with root privileges by default.",
        "Create an unprivileged user and switch to it with a USER instruction.",
        file.relativePath,
      ),
    );
  }

  const remoteAdd = /^\s*ADD\s+https?:\/\//im;
  if (remoteAdd.test(file.content)) {
    results.push(
      finding(
        "SCS-DOCKER-REMOTE-ADD",
        "medium",
        "Dockerfile downloads a remote resource with ADD",
        "Remote ADD instructions do not provide an explicit integrity check.",
        "Download the resource explicitly and verify its cryptographic checksum.",
        file.relativePath,
        lineContaining(file.content, remoteAdd),
      ),
    );
  }
  return results;
}

function scanWorkflow(file: WorkspaceFile): Finding[] {
  const results: Finding[] = [];
  let document: any;
  try {
    document = YAML.parse(file.content);
  } catch {
    return [
      finding(
        "SCS-ACTIONS-INVALID-YAML",
        "low",
        "Workflow cannot be parsed",
        "The GitHub Actions workflow is not valid YAML and could not be evaluated.",
        "Correct the YAML syntax and run the scan again.",
        file.relativePath,
      ),
    ];
  }

  if (document?.permissions === "write-all") {
    results.push(
      finding(
        "SCS-ACTIONS-WRITE-ALL",
        "high",
        "Workflow grants write-all permissions",
        "The workflow token receives write access to every available permission.",
        "Declare the minimum read/write permissions required by each job.",
        file.relativePath,
        lineContaining(file.content, /^\s*permissions:\s*write-all/im),
      ),
    );
  }

  const mutableAction = /^\s*(?:-\s*)?uses:\s*[^#\s]+@(?![a-f0-9]{40}(?:\s|#|$))[^\s#]+/gim;
  for (const match of file.content.matchAll(mutableAction)) {
    const line = file.content.slice(0, match.index ?? 0).split("\n").length;
    results.push(
      finding(
        "SCS-ACTIONS-UNPINNED",
        "medium",
        "Third-party action is not pinned to a commit",
        "Tags and branches are mutable and can change without review.",
        "Pin the action to a full 40-character commit SHA and keep the human-readable tag in a comment.",
        file.relativePath,
        line,
      ),
    );
  }
  return results;
}

export function scanConfiguration(files: WorkspaceFile[]): Finding[] {
  return files.flatMap((file) => {
    const name = file.relativePath.split("/").at(-1)?.toLowerCase();
    if (name === "dockerfile" || name?.startsWith("dockerfile.")) return scanDockerfile(file);
    if (/^\.github\/workflows\/.*\.ya?ml$/i.test(file.relativePath)) return scanWorkflow(file);
    return [];
  });
}
