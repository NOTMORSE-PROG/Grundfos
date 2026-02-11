export interface PumpCalcInput {
  power_kw: number;
  annual_kwh?: number;
  operating_hours: number;
  electricity_rate: number;
  co2_factor: number;
}

export interface ROISummary {
  old_annual_cost: number;
  new_annual_cost: number;
  annual_savings: number;
  payback_months: number;
  co2_reduction_tonnes: number;
  ten_year_savings: number;
  lifecycle_cost: number;
  efficiency_improvement_pct: number;
}

export function calcAnnualEnergyCost(pump: PumpCalcInput): number {
  const kwh = pump.annual_kwh ?? pump.power_kw * pump.operating_hours;
  return kwh * pump.electricity_rate;
}

export function calcAnnualKwh(power_kw: number, operating_hours: number): number {
  return power_kw * operating_hours;
}

export function calcAnnualSavings(
  oldPump: PumpCalcInput,
  newPump: PumpCalcInput
): number {
  return calcAnnualEnergyCost(oldPump) - calcAnnualEnergyCost(newPump);
}

export function calcPaybackPeriod(
  pump_cost: number,
  annual_savings: number
): number {
  if (annual_savings <= 0) return Infinity;
  return (pump_cost / annual_savings) * 12; // in months
}

export function calcCO2Reduction(
  old_kwh: number,
  new_kwh: number,
  co2_factor: number
): number {
  return ((old_kwh - new_kwh) * co2_factor) / 1000; // in tonnes
}

export function calcLifecycleCost(
  pump_cost: number,
  annual_energy_cost: number,
  maintenance_pct: number,
  years: number
): number {
  const annual_maintenance = pump_cost * maintenance_pct;
  return pump_cost + (annual_energy_cost + annual_maintenance) * years;
}

export function calcROISummary(
  oldPump: PumpCalcInput,
  newPump: PumpCalcInput,
  pump_cost: number,
  lifecycle_years: number = 10
): ROISummary {
  const old_kwh = oldPump.annual_kwh ?? oldPump.power_kw * oldPump.operating_hours;
  const new_kwh = newPump.annual_kwh ?? newPump.power_kw * newPump.operating_hours;

  const old_annual_cost = calcAnnualEnergyCost(oldPump);
  const new_annual_cost = calcAnnualEnergyCost(newPump);
  const annual_savings = old_annual_cost - new_annual_cost;
  const payback_months = calcPaybackPeriod(pump_cost, annual_savings);
  const co2_reduction_tonnes = calcCO2Reduction(
    old_kwh,
    new_kwh,
    oldPump.co2_factor
  );
  const ten_year_savings = annual_savings * 10 - pump_cost;
  const lifecycle_cost = calcLifecycleCost(
    pump_cost,
    new_annual_cost,
    0.02,
    lifecycle_years
  );
  const efficiency_improvement_pct =
    old_kwh > 0 ? ((old_kwh - new_kwh) / old_kwh) * 100 : 0;

  return {
    old_annual_cost,
    new_annual_cost,
    annual_savings,
    payback_months,
    co2_reduction_tonnes,
    ten_year_savings,
    lifecycle_cost,
    efficiency_improvement_pct,
  };
}

// Default operating hours by application
export const DEFAULT_OPERATING_HOURS: Record<string, number> = {
  heating: 4380,
  cooling: 2190,
  water_supply: 8760,
  domestic_water: 8760,
  industrial: 6000,
};

// Default electricity rates by region
export const DEFAULT_ENERGY_RATES: Record<
  string,
  { rate: number; co2: number; currency: string }
> = {
  PH: { rate: 9.5, co2: 0.52, currency: "PHP" },
  US: { rate: 0.12, co2: 0.42, currency: "USD" },
  EU: { rate: 0.25, co2: 0.3, currency: "EUR" },
  global: { rate: 0.15, co2: 0.42, currency: "USD" },
};
