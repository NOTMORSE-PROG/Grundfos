export function ExcellenceSection() {
  return (
    <section className="py-16 bg-white">
      <div className="max-w-5xl mx-auto px-6 text-center">
        <span className="inline-block bg-grundfos-light text-grundfos-blue text-xs font-semibold uppercase tracking-wider px-4 py-1.5 rounded-full mb-4">
          Why Choose GrundMatch
        </span>
        <h2 className="text-2xl md:text-3xl font-bold text-grundfos-dark mb-2">
          Excellence in Every Detail
        </h2>
        <p className="text-muted-foreground text-sm mb-10">
          We don&apos;t just sell pumps – we provide complete solutions backed by expertise and support.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
          {[
            {
              num: 1,
              title: "Expert Consultation",
              desc: "Our AI assistant and technical team help you select the perfect pump for your specific needs, ensuring optimal performance and efficiency.",
            },
            {
              num: 3,
              title: "Quality Assurance",
              desc: "Access our AI assistant anytime, anywhere. Get instant answers to your questions and expert guidance when you need it.",
            },
            {
              num: 2,
              title: "24/7 Support",
              desc: "Every Grundfos pump undergoes rigorous testing and quality control, guaranteeing reliability and long service life.",
            },
            {
              num: 4,
              title: "Sustainable Solutions",
              desc: "Our commitment to sustainability means energy-efficient pumps that reduce costs and environmental impact.",
            },
          ].map((item) => (
            <div
              key={item.num}
              className="flex items-center gap-4 bg-card rounded-xl p-5 shadow-sm border border-border"
            >
              <div className="w-16 h-16 shrink-0 rounded-full bg-grundfos-blue text-white flex items-center justify-center font-bold text-base">
                {item.num}
              </div>
              <div>
                <h3 className="font-semibold text-grundfos-dark mb-1">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}