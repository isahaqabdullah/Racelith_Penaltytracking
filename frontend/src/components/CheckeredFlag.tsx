export function CheckeredFlag() {
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-5"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern
          id="checkered"
          x="0"
          y="0"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <rect x="0" y="0" width="20" height="20" fill="currentColor" />
          <rect x="20" y="20" width="20" height="20" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#checkered)" />
    </svg>
  );
}
