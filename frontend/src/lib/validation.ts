export const MAX_UPLOAD_SIZE_BYTES = 4.5 * 1024 * 1024; // 4,718,592 bytes (Vercel 4.5 MB request body limit)
export const MAX_CHAR_LIMIT = 12000;
export const MIN_CHAR_LIMIT = 5;

export function validateProjectIdea(idea: string): {
  valid: boolean;
  error: string | null;
} {
  const trimmed = idea.trim();
  if (trimmed.length === 0) {
    return {
      valid: false,
      error:
        "Project idea cannot be empty. Please enter your idea or upload a specification file.",
    };
  }
  if (trimmed.length < MIN_CHAR_LIMIT) {
    return {
      valid: false,
      error: `Project idea is too short. Please provide at least ${MIN_CHAR_LIMIT} characters.`,
    };
  }
  if (trimmed.length > MAX_CHAR_LIMIT) {
    return {
      valid: false,
      error: `Project idea exceeds maximum length of ${MAX_CHAR_LIMIT.toLocaleString()} characters.`,
    };
  }
  return { valid: true, error: null };
}

export function validateUploadFile(file: { name: string; size: number }): {
  valid: boolean;
  error: string | null;
} {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const validExtensions = ["txt", "md"];
  if (!extension || !validExtensions.includes(extension)) {
    return {
      valid: false,
      error:
        "Invalid file type. Only text (.txt) and markdown (.md) files are supported.",
    };
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    const sizeInMb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size (${sizeInMb} MB) exceeds the 4.5 MB limit (Vercel request body limit). Please choose a smaller file.`,
    };
  }
  return { valid: true, error: null };
}
