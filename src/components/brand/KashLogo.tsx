import kashLogo from "../../../logo/SVG/KASHLogo.svg";
import kashIcon from "../../../logo/SVG/KASHicon.svg";

type KashLogoProps = {
    compact?: boolean;
    className?: string;
};

export function KashLogo({ compact = false, className = "" }: KashLogoProps) {
    return (
        <img
            alt={compact ? "KASH icon" : "KASH"}
            className={className}
            src={compact ? kashIcon : kashLogo}
        />
    );
}
