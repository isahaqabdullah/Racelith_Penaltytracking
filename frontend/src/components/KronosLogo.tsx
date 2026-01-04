interface RacelithLogoProps {
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg";
}

export function RacelithLogo({ variant = "light", size = "lg" }: RacelithLogoProps) {
  const sizeClasses = {
    sm: "h-20",
    md: "h-32",
    lg: "h-48"
  };

  const primaryColor = variant === "light" ? "#ffffff" : "#ffffff";
  const accentColor = variant === "light" ? "#fbbf24" : "#fbbf24";

  return (
    <div className={`${sizeClasses[size]} inline-flex items-center gap-4`}>
      {/* Icon - Abstract K with circular time element */}
      <svg
        viewBox="0 0 120 120"
        className="h-full w-auto"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Circular orbit rings */}
        <circle
          cx="60"
          cy="60"
          r="52"
          stroke={accentColor}
          strokeWidth="2"
          opacity="0.3"
          strokeDasharray="4 4"
        />
        
        {/* Main K shape formed by geometric elements */}
        <path
          d="M 30 20 L 30 100 L 38 100 L 38 20 Z"
          fill={primaryColor}
        />
        
        {/* Upper diagonal of K */}
        <path
          d="M 38 60 L 90 15 L 95 22 L 43 67 Z"
          fill={accentColor}
        />
        
        {/* Lower diagonal of K */}
        <path
          d="M 38 60 L 90 105 L 95 98 L 43 53 Z"
          fill={accentColor}
        />
        
        {/* Orbital dot */}
        <circle
          cx="85"
          cy="35"
          r="5"
          fill={primaryColor}
        >
          <animateTransform
            attributeName="transform"
            attributeType="XML"
            type="rotate"
            from="0 60 60"
            to="360 60 60"
            dur="8s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
      {/* Wordmark */}
      <div className="flex flex-col">
        <span 
          className="tracking-tight"
          style={{ 
            color: primaryColor,
            fontSize: size === "sm" ? "1.5rem" : size === "md" ? "2.5rem" : "3.5rem",
            fontWeight: 700,
            lineHeight: 1
          }}
        >
          RACELITH
        </span>
        <span 
          className="tracking-widest mt-1"
          style={{ 
            color: accentColor,
            fontSize: size === "sm" ? "0.5rem" : size === "md" ? "0.65rem" : "0.75rem",
            fontWeight: 400
          }}
        >
          PENALTY TRACKING SYSTEM
        </span>
      </div>
    </div>
  );
}
