import { Droplets } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-grundfos-dark text-white py-12 items-center">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Droplets className="w-5 h-5" />
              <span className="font-bold">GRUNDFOS</span>
            </div>
            <p className="text-white/60 text-xs leading-relaxed">
              Pioneering pump solutions for
              a sustainable future. Trusted by
              millions worldwide for
              quality, innovation, and reliability.
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