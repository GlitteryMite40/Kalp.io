/**
 * Commit Message Node ID Parser (Task 06.3: Parse node ID)
 *
 * Extracts Kalp node keys from git commit messages.
 * Pure module with zero database or network dependencies.
 */

const NODE_KEY_TOKEN_REGEX = /\[(\d{2}\.\d{1,3})\]/g;

/**
 * Parses node keys from the first line of a commit message.
 *
 * Requirements:
 * - Only the FIRST line of the message is read.
 * - Matches every token `[(\d{2}\.\d{1,3})]` in that line.
 * - Returns unique keys in order of appearance.
 * - Ignores anything else (e.g. "[3.5]", "[01.1.2]", "[abc]", and IDs on subsequent lines).
 */
export function parseNodeKeys(message: string): string[] {
  if (typeof message !== "string") {
    return [];
  }

  // Read only the first line of the commit message
  const firstLine = message.split(/\r?\n/)[0] ?? "";
  if (!firstLine) {
    return [];
  }

  const matches = Array.from(firstLine.matchAll(NODE_KEY_TOKEN_REGEX));
  const uniqueKeys = new Set<string>();

  for (const match of matches) {
    const key = match[1];
    if (key) {
      uniqueKeys.add(key);
    }
  }

  return Array.from(uniqueKeys);
}
