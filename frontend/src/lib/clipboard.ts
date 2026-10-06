/**
 * Clipboard utilities with progressive fallback support:
 * 1. navigator.clipboard.writeText (Modern async clipboard API)
 * 2. document.execCommand('copy') (Legacy fallback using offscreen textarea)
 * 3. Manual selection fallback (for restricted/denied environments)
 */

export interface CopyResult {
  success: boolean;
  method: "clipboard" | "execCommand" | "manual";
  error?: string;
}

export interface CopyOptions {
  clipboardApi?: { writeText: (text: string) => Promise<void> } | null;
  execCommandFn?: ((commandId: string) => boolean) | null;
  targetDocument?: Document | null;
}

/**
 * Copies text to the system clipboard using modern APIs with robust fallback.
 * Resolves with the execution method and success status.
 */
export async function copyToClipboard(
  text: string,
  options?: CopyOptions,
): Promise<CopyResult> {
  if (!text || typeof text !== "string") {
    return {
      success: false,
      method: "manual",
      error: "No text provided to copy.",
    };
  }

  // 1. Try modern navigator.clipboard API
  const clipboardApi =
    options?.clipboardApi !== undefined
      ? options.clipboardApi
      : typeof navigator !== "undefined" && navigator.clipboard
        ? navigator.clipboard
        : null;

  if (clipboardApi && typeof clipboardApi.writeText === "function") {
    try {
      await clipboardApi.writeText(text);
      return { success: true, method: "clipboard" };
    } catch {
      // Permission denied, not in secure context, or window inactive
      // Gracefully fall through to execCommand
    }
  }

  // 2. Try document.execCommand('copy') fallback via temporary offscreen element
  const doc =
    options?.targetDocument !== undefined
      ? options.targetDocument
      : typeof document !== "undefined"
        ? document
        : null;

  const execCommandFn =
    options?.execCommandFn !== undefined
      ? options.execCommandFn
      : doc && typeof doc.execCommand === "function"
        ? (cmd: string) => doc.execCommand(cmd)
        : null;

  if (doc && execCommandFn && typeof doc.createElement === "function") {
    try {
      const textarea = doc.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.top = "-999999px";
      textarea.style.left = "-999999px";
      textarea.style.opacity = "0";
      textarea.setAttribute("readonly", "");
      doc.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, text.length);

      const successful = execCommandFn("copy");
      doc.body.removeChild(textarea);

      if (successful) {
        return { success: true, method: "execCommand" };
      }
    } catch {
      // execCommand threw or failed -> fall through to manual fallback
    }
  }

  // 3. Fallback: Clipboard access denied or unsupported
  return {
    success: false,
    method: "manual",
    error: "Clipboard access was denied. Please select and copy manually.",
  };
}

/**
 * Formats a comprehensive fallback task prompt for a node if node.prompt is not pre-populated.
 */
export function formatNodePromptFallback(node: {
  node_key?: string;
  title?: string;
  phase?: string;
  explanation?: string | null;
  requirement_key?: string | null;
  dependencies?: string[];
  files?: string[];
  acceptance?: string[];
  tests?: string[];
}): string {
  const lines: string[] = [];

  lines.push(
    `# TASK: [${node.node_key || "TASK"}] ${node.title || "Unnamed task"}`,
  );
  if (node.phase) {
    lines.push(`PHASE: ${node.phase}`);
  }
  if (node.requirement_key) {
    lines.push(`REQUIREMENT: ${node.requirement_key}`);
  }
  if (node.explanation) {
    lines.push(`\n## PURPOSE & CONTEXT\n${node.explanation}`);
  }

  if (node.dependencies && node.dependencies.length > 0) {
    lines.push(`\n## PREREQUISITES & DEPENDENCIES`);
    node.dependencies.forEach((dep) => lines.push(`- ${dep}`));
  } else {
    lines.push(`\n## PREREQUISITES & DEPENDENCIES\n- None (Root Foundation)`);
  }

  if (node.files && node.files.length > 0) {
    lines.push(`\n## TARGET FILES`);
    node.files.forEach((file) => lines.push(`- ${file}`));
  }

  if (node.acceptance && node.acceptance.length > 0) {
    lines.push(`\n## ACCEPTANCE CRITERIA`);
    node.acceptance.forEach((item) => lines.push(`- [ ] ${item}`));
  }

  if (node.tests && node.tests.length > 0) {
    lines.push(`\n## VERIFICATION & TESTS`);
    node.tests.forEach((cmd) => lines.push(`$ ${cmd}`));
  }

  lines.push(
    `\n## COMMIT RULE\nCommit with: [${node.node_key || "TASK"}] ${node.title || "implementation"}`,
  );

  return lines.join("\n");
}
