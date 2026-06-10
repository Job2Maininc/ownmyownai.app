import iconUrl from "../assets/icon.png";

type BrandMarkProps = {
  size?: "sm" | "md";
  className?: string;
};

export function BrandMark({ size = "md", className = "" }: BrandMarkProps) {
  const iconPx = size === "sm" ? 28 : 40;

  return (
    <div className={`brand-mark ${className}`}>
      <img
        src={iconUrl}
        alt=""
        width={iconPx}
        height={iconPx}
        className="brand-mark__icon"
      />
      <span className="brand-mark__text">
        OwnMyOwn<span className="brand-mark__accent">AI</span>
      </span>
      <span className="brand-mark__host">Host</span>
    </div>
  );
}
