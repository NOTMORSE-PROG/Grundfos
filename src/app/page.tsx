import Link from "next/link";
import { Button } from "@/components/ui/button";
import {  } from "lucide-react";
import { MessageSquare,
  LogIn,
  Globe,
  Zap,
  Lightbulb,
  Waves,
  Flame,
  Trash2,
  Factory,
  Trees,
  Bath,
  Pipette,
  Settings, } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <FeatureSection />
      <ProductSection />
      <ExcellenceSection />
      <Footer />
    </div>
  );
}

export function Navbar() {
  return (
    <nav className="flex items-center justify-between px-4 sm:px-6 md:px-12 py-6 bg-background border-b border-border">
      <div className="flex items-center gap-2">
        <img src="/gm_logo.png" alt="GrundMatch" className="h-8 w-auto" />
        <span className="font-bold text-xl text-grundfos-dark">GrundMatch</span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <Button
          variant="outline"
          size="sm"
          className="border-grundfos-blue/30 text-grundfos-blue hover:bg-grundfos-light"
          asChild
        >
          <Link href="/login">
            <LogIn className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Sign In</span>
          </Link>
        </Button>
        <Button
          size="sm"
          className="bg-grundfos-blue hover:bg-grundfos-dark text-white"
          asChild
        >
          <Link href="/chat">
            <MessageSquare className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Try Now</span>
          </Link>
        </Button>
      </div>
    </nav>
  );
}

export function HeroSection() {
  return (
    <section className="relative overflow-hidden text-white py-20 md:py-28">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source src="/sample-background-video.mp4" type="video/mp4" />
      </video>

      <div className="absolute inset-0 bg-gradient-to-br from-grundfos-dark via-grundfos-blue to-grundfos-mid opacity-[0.70]" />

      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        <span className="inline-block bg-white/15 text-white text-xs font-semibold uppercase tracking-wider px-4 py-1.5 rounded-full mb-6">
          Smarter Pump Selection
        </span>

        <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6">
          Choose the Right Pump.
          <br />
          Save Energy from Day One.
        </h1>

        <p className="text-white/75 max-w-2xl mx-auto mb-10 text-sm md:text-base leading-relaxed text-center">
          85% of pumps are often oversized — creating unnecessary energy costs and carbon emissions for decades.
          GrundMatch helps you select the right-sized Grundfos pump based on your real requirements,
          so you can reduce waste, cut operating costs, and make efficiency the standard.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/chat">
            <Button
              size="lg"
              className="bg-white text-grundfos-dark hover:bg-grundfos-light font-semibold px-8"
            >
              <MessageSquare className="h-5 w-5 mr-2" />
              Chat Without Signing In
            </Button>
          </Link>
          <Button
            size="lg"
            variant="outline"
            className="bg-white/50 border-transparent text-white hover:bg-white/70 font-semibold px-8"
            asChild
          >
            <Link href="/signup">
              <LogIn className="h-5 w-5 mr-2" />
              Sign Up / Log In
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function FeatureSection() {
  return (
    <section className="py-16 bg-muted text-justify">
      <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          {
            icon: MessageSquare,
            title: "Simple Selection Process",
            desc: "Describe your building in plain language. GrundMatch determines the correct flow and head requirements — no formulas required.",
          },
          {
            icon: Lightbulb,
            title: "Optimized for Efficiency",
            desc: "Right-sizing reduces energy consumption and operating costs — without compromising performance or reliability.",
          },
          {
            icon: Zap,
            title: "Instant Results",
            desc: "Get immediate pump recommendations, performance insights, and cost estimates in seconds.",
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
            <p className="text-sm text-muted-foreground leading-relaxed text-justify">
              {f.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProductSection() {
  return (
    <section className="py-16 bg-grundfos-blue">
      <div className="max-w-5xl mx-auto px-6 md:px-12 text-center">
        <span className="inline-block bg-white/20 text-white text-xs font-semibold uppercase tracking-wider px-4 py-1.5 rounded-full mb-4">
          How It Works
        </span>
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
          From Conversation to Right-Sized Pump
        </h2>
        <p className="text-white/75 text-sm mb-10">
          A guided process that ensures accurate, efficient pump selection.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: MessageSquare, label: "Describe Entry Point	", description: "Tell us about your building — floors, water source, application. GrundMatch calculates the hydraulics for you." },
            { icon: Settings, label: "Direct Entry Point	", description: "Already have your flow and head values? Enter them directly and get a matched pump instantly." },
            { icon: Zap, label: "Pump Comparison", description: "Compare two Grundfos models head-to-head with a \"Better\" badge that flags the winner on efficiency and cost." },
            { icon: Lightbulb, label: "PDF Business Case	", description: "Download a complete report with annual savings, 10-year ROI, payback period, and CO₂ reduction — ready for executive sign-off." },
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
          We don&apos;t just sell pumps – we provide solutions backed by data and expertise.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
          {[
            {
              num: 1,
              title: "Confident Decisions",
              desc: "GrundMatch determines the appropriate duty point based on your inputs, helping you select a pump with clarity and confidence.",
            },
            {
              num: 2,
              title: "Clear Cost Insights",
              desc: "View estimated annual energy savings, projected long-term returns, and payback period — all in one place.",
            },
            {
              num: 3,
              title: "Transparent Carbon Impact",
              desc: "Each recommendation includes estimated annual CO₂ reduction, making sustainability performance clear and measurable.",
            },
            {
              num: 4,
              title: "Designed for Efficiency",
              desc: "Because most pump emissions occur during operation, selecting the right size from the start supports long-term energy performance.",
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

export function Footer() {
  return (
    <footer className="bg-grundfos-dark text-white py-12 items-center">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <img src="/gm_logo.png" alt="GrundMatch" className="h-5 w-auto brightness-0 invert" />
              <span className="font-bold">GrundMatch</span>
            </div>
            <p className="text-white/60 text-xs leading-relaxed text-justify">
              GrundMatch is a pump selection platform designed to reduce oversizing,
              lower operating costs, and make energy efficiency the default.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-3">Products</h4>
            <ul className="space-y-2 text-white/60 text-xs">
              <li>Water Supply</li>
              <li>Heating</li>
              <li>Industrial</li>
              <li>Water Waste</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-3">Company</h4>
            <ul className="space-y-2 text-white/60 text-xs">
              <li>About Us</li>
              <li>Careers</li>
              <li>Sustainability</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-3">Support</h4>
            <ul className="space-y-2 text-white/60 text-xs">
              <li>Contact</li>
              <li>FAQ</li>
              <li>Service</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 pt-6 text-center text-white/40 text-xs">
          2026 GrundMatch. All rights reserved. | Privacy Policy |
          Terms of Service
        </div>
      </div>
    </footer>
  );
}