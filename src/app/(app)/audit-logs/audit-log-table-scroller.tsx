"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type ScrollState = { overflowing: boolean; atStart: boolean; atEnd: boolean };

export function AuditLogTableScroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<ScrollState>({
    overflowing: false,
    atStart: true,
    atEnd: true,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const recompute = () => {
      const overflowing = el.scrollWidth > el.clientWidth + 1;
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      setState({ overflowing, atStart, atEnd });
    };

    recompute();
    el.addEventListener("scroll", recompute, { passive: true });
    const observer = new ResizeObserver(recompute);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", recompute);
      observer.disconnect();
    };
  }, []);

  const scrollBy = (direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div ref={ref} className="overflow-x-auto">
        {children}
      </div>
      {state.overflowing && (
        <div className="pointer-events-none sticky bottom-4 z-10 mt-2 flex justify-end gap-1 pr-4">
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={state.atStart}
            onClick={() => scrollBy(-1)}
            aria-label="Scroll audit log left"
            className="pointer-events-auto bg-background shadow-md"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={state.atEnd}
            onClick={() => scrollBy(1)}
            aria-label="Scroll audit log right"
            className="pointer-events-auto bg-background shadow-md"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
