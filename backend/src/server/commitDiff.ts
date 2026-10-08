/**
 * Commit Diff & Patch Fetching Service (Task 09.1)
 *
 * Fetches git commit patches from GitHub API, filters out noise
 * (lockfiles, binaries, images), concatenates file patches with headers,
 * and truncates safely to 12,000 characters.
 */

import { normalizeRepoUrl } from "./repo";

export interface CommitFile {
  filename: string;
  status?: string;
  patch?: string;
  additions?: number;
  deletions?: number;
}

export interface CommitPatchResult {
  text: string;
  source: "patch";
}

export const MAX_DIFF_CHARS = 12000;
export const TRUNCATED_MARKER = "[truncated]";

const LOCKFILE_PATTERNS = [
  /package-lock\.json$/i,
  /yarn\.lock$/i,
  /pnpm-lock\.yaml$/i,
  /bun\.lockb$/i,
  /composer\.lock$/i,
  /cargo\.lock$/i,
  /gemfile\.lock$/i,
  /poetry\.lock$/i,
];

const BINARY_IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "ico",
  "bmp",
  "tiff",
  "pdf",
  "exe",
  "bin",
  "map",
  "wasm",
  "zip",
  "tar",
  "gz",
  "7z",
  "mp4",
  "mp3",
  "wav",
  "mov",
  "woff",
  "woff2",
  "ttf",
  "eot",
]);

/**
 * Checks if a filename should be excluded (lockfile, image, binary, or minified bundle).
 */
export function isExcludedDiffFile(filename: string): boolean {
  if (!filename || typeof filename !== "string") return true;

  const trimmed = filename.trim();
  for (const pattern of LOCKFILE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  const parts = trimmed.split(".");
  if (parts.length > 1) {
    const ext = parts[parts.length - 1].toLowerCase();
    if (BINARY_IMAGE_EXTENSIONS.has(ext)) {
      return true;
    }
  }

  return false;
}

/**
 * Filters raw GitHub commit files and formats them into a unified patch string.
 * Cuts whole files first when truncating at 12000 chars, marking "[truncated]".
 */
export function formatCommitPatchFiles(
  files: CommitFile[],
): CommitPatchResult | null {
  if (!Array.isArray(files) || files.length === 0) {
    return null;
  }

  const validBlocks: string[] = [];

  for (const file of files) {
    if (!file || !file.filename || typeof file.patch !== "string") {
      continue;
    }
    const trimmedPatch = file.patch.trim();
    if (!trimmedPatch || isExcludedDiffFile(file.filename)) {
      continue;
    }

    validBlocks.push(`### ${file.filename}\n${trimmedPatch}`);
  }

  if (validBlocks.length === 0) {
    return null;
  }

  const fullText = validBlocks.join("\n\n");
  if (fullText.length <= MAX_DIFF_CHARS) {
    return {
      text: fullText,
      source: "patch",
    };
  }

  // Need truncation: cut whole files first, mark "[truncated]"
  const marker = `\n${TRUNCATED_MARKER}`;
  const budget = MAX_DIFF_CHARS - marker.length;

  const keptBlocks: string[] = [];
  let currentLen = 0;

  for (const block of validBlocks) {
    const additionalLen =
      keptBlocks.length === 0 ? block.length : 2 + block.length;
    if (currentLen + additionalLen <= budget) {
      keptBlocks.push(block);
      currentLen += additionalLen;
    } else {
      break;
    }
  }

  if (keptBlocks.length > 0) {
    return {
      text: `${keptBlocks.join("\n\n")}${marker}`,
      source: "patch",
    };
  }

  // If even the first block alone exceeds the budget, slice the first block
  const slicedFirst = validBlocks[0].slice(0, budget);
  return {
    text: `${slicedFirst}${marker}`,
    source: "patch",
  };
}

/**
 * Extracts owner and repo from a GitHub repo URL or shorthand owner/repo.
 */
export function parseOwnerAndRepo(
  repoUrl: string,
): { owner: string; repo: string } | null {
  if (!repoUrl || typeof repoUrl !== "string") return null;
  const trimmed = repoUrl.trim();

  try {
    if (trimmed.includes("github.com")) {
      const norm = normalizeRepoUrl(trimmed);
      return { owner: norm.owner, repo: norm.repo };
    }
  } catch {
    // continue to fallback parser
  }

  // Shorthand owner/repo
  const cleaned = trimmed
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "");
  const segments = cleaned
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length >= 2) {
    return { owner: segments[0], repo: segments[1] };
  }

  return null;
}

/**
 * Fetches a git commit patch from the GitHub API.
 * Uses 6s timeout, User-Agent, and optional GITHUB_TOKEN bearer header.
 * Returns { text, source: 'patch' } or null on any failure.
 */
export async function fetchCommitPatch(
  repoUrl: string,
  sha: string,
  options?: {
    fetcher?: typeof fetch;
    timeoutMs?: number;
    token?: string;
  },
): Promise<CommitPatchResult | null> {
  if (!repoUrl || !sha) {
    return null;
  }

  const parsed = parseOwnerAndRepo(repoUrl);
  if (!parsed) {
    return null;
  }

  const fetcher = options?.fetcher ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 6000;
  const token = options?.token ?? process.env.GITHUB_TOKEN;

  const url = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/commits/${sha.trim()}`;

  const headers: Record<string, string> = {
    "User-Agent": "Kalp.io-CommitDiff/1.0",
    Accept: "application/vnd.github.v3+json",
  };

  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetcher(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as { files?: CommitFile[] };
    if (!data || !Array.isArray(data.files)) {
      return null;
    }

    return formatCommitPatchFiles(data.files);
  } catch {
    clearTimeout(timer);
    return null;
  }
}
