import pumpCatalog from "@/data/pump-catalog.json";

export interface MatchedPump {
  id: string;
  model: string;
  family: string;
  category: string;
  type: string;
  image_url?: string;
  applications: string[];
  features: string[];
  specs: Record<string, unknown>;
  estimated_annual_kwh: number | string;
  price_range_usd: string;
  competitor_equivalents?: Record<string, string>;
}

/**
 * Scan AI response text for known pump model names and return matching catalog entries.
 */
export function matchPumpsFromText(text: string): MatchedPump[] {
  const pumps = pumpCatalog.pumps || [];
  const matched: MatchedPump[] = [];
  const seen = new Set<string>();

  for (const pump of pumps) {
    // Try exact model name match first
    if (text.includes(pump.model) && !seen.has(pump.id)) {
      seen.add(pump.id);
      matched.push(pump as unknown as MatchedPump);
      continue;
    }

    // Try normalized match (case-insensitive, with/without spaces)
    const normalizedModel = pump.model.toLowerCase().replace(/\s+/g, "");
    const normalizedText = text.toLowerCase().replace(/\s+/g, "");
    if (normalizedText.includes(normalizedModel) && !seen.has(pump.id)) {
      seen.add(pump.id);
      matched.push(pump as unknown as MatchedPump);
    }
  }

  return matched.slice(0, 3); // Max 3 recommendations
}

/**
 * Parse savings/calculation numbers from AI text for a specific pump model.
 */
export function parseSavingsFromText(
  text: string,
  model: string
): {
  annualEnergyCost?: string;
  annualSavings?: string;
  co2Reduction?: string;
  paybackPeriod?: string;
} | null {
  // Find the section of text relevant to this pump model
  const modelIndex = text.toLowerCase().indexOf(model.toLowerCase());
  if (modelIndex === -1) return null;

  // Look at the text after the model name (up to 800 chars or next "Recommended:")
  const afterModel = text.slice(modelIndex, modelIndex + 800);

  const result: Record<string, string> = {};

  // Parse Annual Energy Cost: ₱XX,XXX
  const costMatch = afterModel.match(/Annual Energy Cost[:\s]*([₱$€]\s*[\d,]+(?:\.\d+)?)/i);
  if (costMatch) result.annualEnergyCost = costMatch[1];

  // Parse Annual Savings: ₱XX,XXX
  const savingsMatch = afterModel.match(/Annual Savings[^:]*[:\s]*([₱$€]\s*[\d,]+(?:\.\d+)?)/i);
  if (savingsMatch) result.annualSavings = savingsMatch[1];

  // Parse CO₂ Reduction: X.X tonnes/year
  const co2Match = afterModel.match(/CO[₂2]\s*Reduction[:\s]*([\d.]+)\s*(tonnes?|t)/i);
  if (co2Match) result.co2Reduction = `${co2Match[1]} ${co2Match[2]}/yr`;

  // Parse Payback Period: X months
  const paybackMatch = afterModel.match(/Payback\s*(?:Period)?[:\s]*([\d.]+)\s*(months?|years?)/i);
  if (paybackMatch) result.paybackPeriod = `${paybackMatch[1]} ${paybackMatch[2]}`;

  return Object.keys(result).length > 0 ? result : null;
}
