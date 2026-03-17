interface PrimaryButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  children: React.ReactNode
  size?: "default" | "sm" | "lg"
}

const sizeClasses = {
  sm: "px-4 py-2 text-sm",
  default: "px-6 py-3 text-sm",
  lg: "px-8 py-4 text-base",
}

export function PrimaryButton({
  children,
  size = "default",
  className = "",
  ...props
}: PrimaryButtonProps): React.JSX.Element {
  return (
    <a
      className={`inline-block rounded-full font-semibold text-background transition-all hover:brightness-110 ${sizeClasses[size]} ${className}`}
      style={{
        background: 'linear-gradient(180deg, #f0b060 0%, #e8a04a 40%, #c47a30 100%)',
        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.15)',
      }}
      {...props}
    >
      {children}
    </a>
  )
}
