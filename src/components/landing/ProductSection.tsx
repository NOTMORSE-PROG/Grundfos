import {
  Waves,
  Flame,
  Trash2,
  Factory,
  Trees,
  Bath,
  Pipette,
  Settings,
} from "lucide-react";

export function ProductSection() {
  return (
    <section className="py-16 bg-grundfos-blue">
      <div className="max-w-5xl mx-auto px-6 md:px-12 text-center">
        <span className="inline-block bg-white/20 text-white text-xs font-semibold uppercase tracking-wider px-4 py-1.5 rounded-full mb-4">
          Our Products
        </span>
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
          Comprehensive Pump Solutions
        </h2>
        <p className="text-white/75 text-sm mb-10">
          We have the right pump for every need.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Waves, label: "Water Supply", description: "Reliable pumps for domestic and commercial water distribution" },
            { icon: Flame, label: "Heating Systems", description: "Efficient circulation pumps for heating applications" },
            { icon: Trash2, label: "Waste Water", description: "Robust solutions for wastewater management" },
            { icon: Factory, label: "Industrial", description: "Heavy-duty pumps for industrial processes" },
            { icon: Trees, label: "Irrigation", description: "Specialized pumps for agricultural needs" },
            { icon: Bath, label: "Pool & Spa", description: "Efficient pumps for recreational water systems" },
            { icon: Pipette, label: "Dosing Pumps", description: "Precise chemical dosing solutions" },
            { icon: Settings, label: "Custom Solutions", description: "Tailored pump systems for unique requirements" },
          ].map((p) => (
            <div
              key={p.label}
              className="bg-card rounded-xl p-6 min-h-[200px] flex flex-col items-center justify-center gap-4 hover:bg-muted transition-colors cursor-pointer"
            >
              <p.icon className="w-8 h-8 text-foreground" />
              <span className="text-foreground text-sm font-medium">
                {p.label}
              </span>
              <p className="text-foreground text-xs">
                {p.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}