import { NextResponse } from "next/server";
import { getLiveCarbonIntensity } from "@/lib/carbon-intensity";

export const runtime = "nodejs";
// Match the cache TTL in the fetcher so CDN and server stay in sync
export const revalidate = 900;

/**
 * GET /api/carbon-intensity
 *
 * Returns the current PH-LU grid carbon intensity and Meralco electricity rate.
 * Used by the frontend to show a live CO2 badge in the ROI card.
 *
 * Response shape:
 * {
 *   co2: number          — kg CO2eq/kWh
 *   gCO2perKwh: number   — raw g CO2eq/kWh (for display)
 *   isLive: boolean      — true = from API, false = static fallback
 *   updatedAt?: string   — ISO 8601 timestamp of the measurement
 *   ratePhp: number      — PHP/kWh (Meralco current rate)
 *   rateLabel: string    — e.g. "Meralco Feb 2026"
 * }
 */
export async function GET() {
  const data = await getLiveCarbonIntensity();
  return NextResponse.json(data);
}
