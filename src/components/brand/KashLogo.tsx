type KashLogoProps = {
  compact?: boolean;
  className?: string;
};

export function KashLogo({ compact = false, className = "" }: KashLogoProps) {
  return (
    <img
      alt={compact ? "KASH icon" : "KASH"}
      className={className}
      src={compact ? "/logo/SVG/KASH icon.svg" : "/logo/SVG/KASH Logo.svg"}
    />
  );
}
