import type { LucideIcon, LucideProps } from "lucide-react";

type IconProps = Omit<LucideProps, "color" | "size" | "strokeWidth"> & {
  icon: LucideIcon;
  size?: number;
  strokeWidth?: number;
};

export function Icon({
  icon: LucideComponent,
  size = 20,
  strokeWidth = 1.75,
  className,
  ...props
}: IconProps): React.ReactElement {
  const hasAccessibleName = Boolean(props["aria-label"] || props["aria-labelledby"]);

  return (
    <LucideComponent
      size={size}
      strokeWidth={strokeWidth}
      color="currentColor"
      className={className}
      aria-hidden={hasAccessibleName ? undefined : true}
      focusable="false"
      {...props}
    />
  );
}
