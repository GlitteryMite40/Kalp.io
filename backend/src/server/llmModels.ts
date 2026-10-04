export type ModelTier = "pro" | "flash" | "flash-lite";

export interface ParsedModel {
  name: string;
  version: number;
  tier: ModelTier;
  preview: boolean;
}

export interface ApiModel {
  name: string;
  supportedGenerationMethods?: string[];
}

const TIER_RANK: Record<ModelTier, number> = {
  pro: 3,
  flash: 2,
  "flash-lite": 1,
};

const EXCLUDED_REST_PATTERN =
  /(?:image|tts|audio|live|embedding|computer|robotics|vision|exp|latest|customtools)/i;

/**
 * Parses a Gemini model name returned by the API.
 * Strips 'models/' prefix, matches regex, and filters out non-text/experimental/alias variants.
 */
export function parseModel(apiName: string): ParsedModel | null {
  const name = apiName.startsWith("models/") ? apiName.slice(7) : apiName;

  // Ignore "-latest" aliases
  if (name.endsWith("-latest")) {
    return null;
  }

  const match = /^gemini-(\d+(?:\.\d+)?)-(pro|flash-lite|flash)(.*)$/.exec(
    name,
  );
  if (!match) {
    return null;
  }

  const versionStr = match[1];
  const tier = match[2] as ModelTier;
  const rest = match[3];

  // Return null if rest contains excluded features or aliases
  if (EXCLUDED_REST_PATTERN.test(rest)) {
    return null;
  }

  const version = parseFloat(versionStr);
  const preview = rest.toLowerCase().includes("preview");

  return {
    name,
    version,
    tier,
    preview,
  };
}

/**
 * Filters models supporting generateContent, parses them, and sorts them:
 * 1. Version descending
 * 2. Tier rank descending (pro: 3, flash: 2, flash-lite: 1)
 * 3. Stable before preview
 * 4. Name ascending
 */
export function rankModels(listApiModels: ApiModel[]): ParsedModel[] {
  const parsed: ParsedModel[] = [];

  for (const m of listApiModels) {
    if (!m.supportedGenerationMethods?.includes("generateContent")) {
      continue;
    }
    const p = parseModel(m.name);
    if (p) {
      parsed.push(p);
    }
  }

  return parsed.sort((a, b) => {
    // 1. version desc
    if (b.version !== a.version) {
      return b.version - a.version;
    }
    // 2. tier rank desc (pro > flash > flash-lite)
    const tierDiff = TIER_RANK[b.tier] - TIER_RANK[a.tier];
    if (tierDiff !== 0) {
      return tierDiff;
    }
    // 3. stable before preview (false before true)
    if (a.preview !== b.preview) {
      return a.preview ? 1 : -1;
    }
    // 4. name asc
    return a.name.localeCompare(b.name);
  });
}
