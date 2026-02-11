export interface BuildingParams {
  application: "heating" | "cooling" | "domestic_water" | "water_supply";
  building_type: string;
  floors: number;
  units_or_sqm: number;
  region?: string;
}

export interface DutyPoint {
  estimated_flow_m3h: number;
  estimated_head_m: number;
  confidence: "estimated" | "calculated";
  assumptions: string[];
}

const SIZING_RULES = {
  heating: {
    watts_per_sqm: 20,
    delta_t: 10, // Kelvin
    floor_height_m: 3,
    friction_factor: 0.02, // m head per m pipe
    fittings_loss_pct: 0.3,
  },
  cooling: {
    watts_per_sqm: 80,
    delta_t: 5,
    floor_height_m: 3,
    friction_factor: 0.02,
    fittings_loss_pct: 0.3,
  },
  domestic_water: {
    liters_per_person_day: 200,
    persons_per_unit: 3,
    peak_factor: 2.5,
    floor_height_m: 3,
    min_pressure_bar: 1.5,
  },
  water_supply: {
    liters_per_person_day: 200,
    persons_per_unit: 3,
    peak_factor: 2.5,
    floor_height_m: 3,
    min_pressure_bar: 1.5,
  },
};

export function deriveDutyPoint(params: BuildingParams): DutyPoint {
  const assumptions: string[] = [];

  if (
    params.application === "heating" ||
    params.application === "cooling"
  ) {
    const rules = SIZING_RULES[params.application];
    const sqm =
      params.units_or_sqm > 500
        ? params.units_or_sqm // assume sqm if large number
        : params.units_or_sqm * 60; // assume units, ~60sqm per unit

    assumptions.push(
      `Estimated area: ${sqm} m² (${params.units_or_sqm > 500 ? "direct sqm" : params.units_or_sqm + " units × 60 m²/unit"})`
    );

    const heat_load_w = sqm * rules.watts_per_sqm;
    const heat_load_kw = heat_load_w / 1000;
    assumptions.push(
      `Heat load: ${heat_load_kw.toFixed(1)} kW (${rules.watts_per_sqm} W/m²)`
    );

    // flow = Q / (ΔT × cp × ρ) in m³/h
    // cp water ≈ 4.18 kJ/(kg·K), ρ ≈ 1000 kg/m³
    const flow_m3h =
      (heat_load_kw * 3600) / (rules.delta_t * 4.18 * 1000);
    assumptions.push(
      `Flow: ${flow_m3h.toFixed(2)} m³/h (ΔT = ${rules.delta_t}K)`
    );

    // head = floors × floor_height × friction × (1 + fittings) × 2 (supply + return)
    const pipe_length = params.floors * rules.floor_height_m * 2;
    const head_m =
      pipe_length *
      rules.friction_factor *
      (1 + rules.fittings_loss_pct) *
      2;
    assumptions.push(
      `Head: ${head_m.toFixed(1)} m (${params.floors} floors, ${rules.floor_height_m}m/floor)`
    );

    return {
      estimated_flow_m3h: Math.round(flow_m3h * 10) / 10,
      estimated_head_m: Math.round(head_m * 10) / 10,
      confidence: "estimated",
      assumptions,
    };
  }

  // Domestic water / water supply
  const rules = SIZING_RULES.domestic_water;
  const persons = params.units_or_sqm * rules.persons_per_unit;
  assumptions.push(
    `Estimated persons: ${persons} (${params.units_or_sqm} units × ${rules.persons_per_unit})`
  );

  const daily_demand_l = persons * rules.liters_per_person_day;
  const peak_flow_lps = (daily_demand_l * rules.peak_factor) / 86400;
  const flow_m3h = (peak_flow_lps * 3600) / 1000;
  assumptions.push(
    `Peak flow: ${flow_m3h.toFixed(2)} m³/h (peak factor ${rules.peak_factor})`
  );

  // head = static (floors × floor_height × 0.1 bar/m) + min_pressure + friction
  const static_head = params.floors * rules.floor_height_m * 1; // 1m water = ~0.1 bar
  const friction_head = static_head * 0.3;
  const head_m = static_head + friction_head + rules.min_pressure_bar * 10;
  assumptions.push(
    `Head: ${head_m.toFixed(1)} m (static ${static_head}m + friction + min pressure)`
  );

  return {
    estimated_flow_m3h: Math.round(flow_m3h * 10) / 10,
    estimated_head_m: Math.round(head_m * 10) / 10,
    confidence: "estimated",
    assumptions,
  };
}
