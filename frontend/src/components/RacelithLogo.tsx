interface RacelithLogoProps {
  variant?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  iconOnly?: boolean;
}

export function RacelithLogo({ 
  variant = "light", 
  size = "lg",
  iconOnly = false 
}: RacelithLogoProps) {
  const dimensions = {
    sm: { height: "h-20", fontSize: "1.5rem", iconSize: 80 },
    md: { height: "h-32", fontSize: "2.5rem", iconSize: 128 },
    lg: { height: "h-48", fontSize: "4rem", iconSize: 192 }
  };

  const color = variant === "light" ? "#ffffff" : "#000000";
  const subtitleColor = variant === "light" ? "rgba(255, 255, 255, 0.7)" : "#4a4a5a";

  const Icon = () => (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ 
        display: 'block',
        width: `${dimensions[size].iconSize}px`,
        height: `${dimensions[size].iconSize}px`,
        flexShrink: 0
      }}
    >
      {/* Shield/Badge shape - classic racing emblem */}
      <path
        d="M 100 20 L 160 50 L 160 130 Q 160 160, 100 180 Q 40 160, 40 130 L 40 50 Z"
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Checkered flag element - prominent */}
      <g>
        {/* Top checkered band */}
        <rect x="55" y="50" width="15" height="15" fill={color} />
        <rect x="85" y="50" width="15" height="15" fill={color} />
        <rect x="115" y="50" width="15" height="15" fill={color} />
        
        <rect x="70" y="65" width="15" height="15" fill={color} />
        <rect x="100" y="65" width="15" height="15" fill={color} />
        <rect x="130" y="65" width="15" height="15" fill={color} />
      </g>
        
      {/* Stylized "R" in center */}
        <path
        d="M 90 90 L 90 150 L 100 150 L 100 125 L 120 125 L 138 150 L 150 150 L 128 122 Q 142 120, 142 105 Q 142 90, 120 90 Z M 100 100 L 120 100 Q 125 100, 125 105 Q 125 110, 120 115 L 100 115 Z"
        fill={color}
        />
    </svg>
  );

  if (iconOnly) {
    return <Icon />;
  }

  return (
    <div className="inline-flex items-center gap-6" style={{ minWidth: 'fit-content' }}>
      <Icon />
      
      {/* Wordmark */}
      <div className="flex flex-col gap-0.5">
        <div 
          className="uppercase tracking-widest"
          style={{ 
            color,
            fontSize: dimensions[size].fontSize,
            fontWeight: 200,
            letterSpacing: '0.15em'
          }}
        >
          RACELITH
        </div>
        <div
          className="uppercase tracking-wide"
          style={{ 
            color: subtitleColor,
            fontSize: `calc(${dimensions[size].fontSize} * 0.3)`,
            fontWeight: 300,
            letterSpacing: '0.2em'
          }}
        >
          Penalty Tracking System
        </div>
      </div>
    </div>
  );
}
