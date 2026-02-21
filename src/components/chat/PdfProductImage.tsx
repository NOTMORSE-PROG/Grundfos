"use client";

import { useEffect, useRef, useState } from "react";

// Cache the loaded library so we only initialize once per page load
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsCache: any = null;

async function getPdfjsLib() {
  if (pdfjsCache) return pdfjsCache;
  const lib = await import("pdfjs-dist");
  lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  pdfjsCache = lib;
  return lib;
}

interface PdfProductImageProps {
  pdfUrl: string;
  /** Visible height of the crop window in px. Default 160. */
  height?: number;
  className?: string;
}

/**
 * Renders the first page of a PDF as a canvas image.
 * Scales to fill the container width; clips to `height` px from the top
 * so the product photo (upper portion of Grundfos datasheets) is visible.
 */
export function PdfProductImage({
  pdfUrl,
  height = 160,
  className = "",
}: PdfProductImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      setState("loading");
      try {
        const pdfjsLib = await getPdfjsLib();
        if (cancelled) return;

        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const baseViewport = page.getViewport({ scale: 1 });
        // Scale to fill the container's rendered width (measured at render time)
        const containerWidth = container.offsetWidth || 320;
        const scale = containerWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;

        if (!cancelled) setState("done");
      } catch {
        if (!cancelled) setState("error");
      }
    };

    render();
    return () => { cancelled = true; };
  }, [pdfUrl]);

  if (state === "error") return null;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden w-full ${className}`}
      style={{ height }}
    >
      {/* Skeleton shimmer while loading */}
      {state === "loading" && (
        <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted/60 to-muted animate-pulse" />
      )}

      {/* Canvas — clipped to `height`; top of page shows logo + product image */}
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          opacity: state === "done" ? 1 : 0,
          transition: "opacity 0.4s ease",
        }}
      />

      {/* Subtle gradient fade at the bottom for a clean cut-off */}
      {state === "done" && (
        <div
          className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, transparent, hsl(var(--card)))",
          }}
        />
      )}
    </div>
  );
}
