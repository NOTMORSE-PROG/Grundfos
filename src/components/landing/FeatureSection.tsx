import { Globe, Zap, Lightbulb } from "lucide-react";

export function FeatureSection() {
  return (
    <section className="py-16 bg-muted">
      <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          {
            icon: Globe,
            title: "Global Presence",
            desc: "Operating in more than 56 countries with production facilities worldwide, ensuring local support and global expertise.",
          },
          {
            icon: Zap,
            title: "Energy Efficient",
            desc: "Our pumps are designed with sustainability in mind, reducing energy consumption and environmental impact.",
          },
          {
            icon: Lightbulb,
            title: "Innovation Leader",
            desc: "Continuous research and development brings cutting-edge technology and superior performance to our products.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="bg-card rounded-xl p-6 text-left shadow-sm border border-3 border-grundfos-blue"
          >
            <div className="w-14 h-14 ml-0 mb-4 rounded-full bg-grundfos-light flex items-center justify-center">
              <f.icon className="w-7 h-7 text-grundfos-blue" />
            </div>
            <h3 className="font-semibold text-grundfos-dark mb-2">
              {f.title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {f.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}