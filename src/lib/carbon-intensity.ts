/**
 * Live grid carbon intensity for the Philippines Luzon zone (PH-LU).
 *
 * PH-LU = the Luzon island electricity grid (not country-wide, not a single city).
 * It covers Metro Manila, Central Luzon, and all of Luzon island — the Meralco service
 * territory and ~75% of Philippine GDP.  The Philippines has three separate grids:
 * PH-LU (Luzon), PH-VI (Visayas), PH-MI (Mindanao).
 *
 * API caching: Next.js `revalidate: 900` (15 min) keeps upstream calls ≤4/hr,
 * well within the free-tier limit of 50 req/hr.
 *
 * Sandbox detection: if the API key is a sandbox/test token the response carries
 * `estimationMethod: "SANDBOX_MODE_DATA"` — we treat that as a fallback so the
 * app never shows intentionally-inaccurate test data to users.
 *
 * Static fallback: 0.62 kg CO2eq/kWh — Philippine DOE/DPWH grid emission factor
 * (Luzon grid, lifecycle basis). Used when API is unavailable or in sandbox mode.
 */

/** kg CO2eq/kWh — Philippine DOE/DPWH Luzon grid average (lifecycle, 2023) */
const STATIC_FALLBACK_KG = 0.62;
/** gCO2eq/kWh equivalent of the static fallback */
const STATIC_FALLBACK_G = STATIC_FALLBACK_KG * 1000; // 620 g

const MERALCO_RATE_PHP = 13.1734; // PHP/kWh — Meralco Feb 2026
const MERALCO_RATE_LABEL = "Meralco Feb 2026";
const ZONE = "PH-LU"; // Luzon island electricity grid

export interface CarbonIntensityResult {
  /** CO2 intensity in kg CO2eq/kWh */
  co2: number;
  /** true = live Luzon grid data; false = static DOE/DPWH average */
  isLive: boolean;
  /** ISO 8601 timestamp of the measurement (undefined when using fallback) */
  updatedAt?: string;
  /** Raw gCO2eq/kWh for display (e.g. "620 g CO₂/kWh") */
  gCO2perKwh: number;
  /** Current Meralco electricity rate in PHP/kWh */
  ratePhp: number;
  /** Human-readable label for the electricity rate source */
  rateLabel: string;
  /** Zone description for display */
  zoneLabel: string;
}

const FALLBACK: CarbonIntensityResult = {
  co2: STATIC_FALLBACK_KG,
  isLive: false,
  gCO2perKwh: STATIC_FALLBACK_G,
  ratePhp: MERALCO_RATE_PHP,
  rateLabel: MERALCO_RATE_LABEL,
  zoneLabel: "PH-LU Luzon grid (DOE avg)",
};

export async function getLiveCarbonIntensity(): Promise<CarbonIntensityResult> {
  const apiKey = process.env.ELECTRICITY_MAPS_API_KEY;
  if (!apiKey) return FALLBACK;

  try {
    const res = await fetch(
      `https://api.electricitymaps.com/v3/carbon-intensity/latest?zone=${ZONE}`,
      {
        headers: { "auth-token": apiKey },
        next: { revalidate: 900 },
      }
    );

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as {
      carbonIntensity: number;
      datetime?: string;
      updatedAt?: string;
      isEstimated?: boolean;
      estimationMethod?: string;
    };

    // Sandbox keys return intentionally-inaccurate test data — fall back to static
    if (data.estimationMethod === "SANDBOX_MODE_DATA") {
      return FALLBACK;
    }

    const gCO2perKwh = data.carbonIntensity;
    const co2 = gCO2perKwh / 1000; // g → kg

    return {
      co2,
      isLive: true,
      updatedAt: data.updatedAt ?? data.datetime,
      gCO2perKwh,
      ratePhp: MERALCO_RATE_PHP,
      rateLabel: MERALCO_RATE_LABEL,
      zoneLabel: "PH-LU Luzon grid (live)",
    };
  } catch {
    return FALLBACK;
  }
}
