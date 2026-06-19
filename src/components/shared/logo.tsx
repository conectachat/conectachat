type LogoProps = { variant?: "icon" | "horizontal" | "vertical"; className?: string };

const SRC: Record<NonNullable<LogoProps["variant"]>, string> = {
  icon: "/ConectaChat_icon.svg",
  horizontal: "/ConectaChat_horizontal.svg",
  vertical: "/ConectaChat_vertical.svg",
};

export function Logo({ variant = "horizontal", className }: LogoProps) {
  return <img src={SRC[variant]} alt="ConectaChat" className={className} />;
}
