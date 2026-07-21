import { cn } from "@/lib/utils";

interface KushLogoProps {
  className?: string;
  iconOnly?: boolean;
}

export function KushLogo({ className, iconOnly = false }: KushLogoProps) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      {/* Mark: stylised "K" in a rounded square */}
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="28" height="28" rx="6" fill="#0f766e" />
        <path
          d="M8 7h3v5.8l5-5.8h3.6l-5.4 6 5.8 8H16l-4.2-5.9-0.8 0.9V21H8V7Z"
          fill="white"
        />
      </svg>
      {!iconOnly && (
        <span className="text-base font-semibold tracking-tight text-foreground">
          KushHR
        </span>
      )}
    </span>
  );
}
