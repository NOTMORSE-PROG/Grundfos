/**
 * Parse special metadata blocks from assistant messages.
 * Handles multiple AI output variations:
 * - [SUGGESTIONS: opt1 | opt2 | opt3]
 * - [OPT1 | OPT2 | OPT3]  (no prefix)
 * - [REQUIREMENTS: key=val | key=val]
 * Also strips any leftover bracket patterns from content.
 */

export interface ParsedMessage {
  content: string;
  suggestions?: string[];
  requirements?: Array<{ label: string; value: string }>;
}

export function parseMessageMetadata(rawContent: string): ParsedMessage {
  let content = rawContent;
  let suggestions: string[] | undefined;
  let requirements: Array<{ label: string; value: string }> | undefined;

  // 1. Parse explicit [SUGGESTIONS: opt1 | opt2 | opt3]
  const suggestionsMatch = content.match(/\[SUGGESTIONS?:\s*([^\]]+)\]/i);
  if (suggestionsMatch) {
    suggestions = suggestionsMatch[1]
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    content = content.replace(suggestionsMatch[0], "").trim();
  }

  // 2. Parse explicit [REQUIREMENTS: key=val | key=val]
  const requirementsMatch = content.match(/\[REQUIREMENTS?:\s*([^\]]+)\]/i);
  if (requirementsMatch) {
    requirements = requirementsMatch[1]
      .split("|")
      .map((pair) => {
        const eqIndex = pair.indexOf("=");
        if (eqIndex === -1) return null;
        const label = pair.slice(0, eqIndex).trim();
        const value = pair.slice(eqIndex + 1).trim();
        return { label, value };
      })
      .filter((r): r is { label: string; value: string } => r !== null && !!r.label && !!r.value);
    content = content.replace(requirementsMatch[0], "").trim();
  }

  // 3. Catch any remaining bracket patterns that look like options:
  //    [Option 1 | Option 2 | Option 3] (with pipes, no = signs)
  if (!suggestions) {
    const bracketOptions = content.match(/\[([^\]]*\|[^\]]*)\]/);
    if (bracketOptions) {
      const parts = bracketOptions[1].split("|").map((s) => s.trim()).filter(Boolean);
      // Only treat as suggestions if there are 2+ options and none contain '='
      if (parts.length >= 2 && !parts.some((p) => p.includes("="))) {
        suggestions = parts;
        content = content.replace(bracketOptions[0], "").trim();
      }
    }
  }

  // 4. Clean up any remaining empty bracket artifacts
  content = content
    .replace(/\[\s*\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { content, suggestions, requirements };
}
