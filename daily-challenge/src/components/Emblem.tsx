// The Daily Challenge emblem: an open book with a flame rising from it.
export function Emblem({ size = 56, className = "", title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role={title ? "img" : undefined}
      aria-label={title} aria-hidden={title ? undefined : true}>
      {/* flame */}
      <path d="M32 33c-6.6-3.2-8.4-9.4-5.2-15.3 1.5-2.8 3.7-5 4.3-8.7 2.9 2.6 4 5.6 3.4 8.6 1.4-.8 2.3-2.2 2.6-3.9 3.6 4.4 4.8 10.6 1.4 15.4-1.5 2.1-3.7 3.4-6.5 3.9Z"
        fill="#8a5d33" />
      <path d="M32.2 31.2c-3.2-1.9-3.9-5.3-2-8.4.8-1.3 1.9-2.4 2.2-4.3 1.6 1.6 2.3 3.6 1.9 5.6 1-.4 1.6-1.2 1.8-2.2 1.7 2.6 1.8 5.8-.2 7.9-.9.8-2.1 1.3-3.7 1.4Z"
        fill="#e8c79c" />
      {/* book */}
      <path d="M31 38.5C24.8 34.6 15.6 33.4 6 35v14.2c9.6-1.6 18.8-.4 25 3.5V38.5Z" fill="#8a5d33" />
      <path d="M33 38.5c6.2-3.9 15.4-5.1 25-3.5v14.2c-9.6-1.6-18.8-.4-25 3.5V38.5Z" fill="#8a5d33" />
      <path d="M9.5 39.2c6.6-.8 13 0 18 2.4M9.5 43.2c6.6-.8 13 0 18 2.4M54.5 39.2c-6.6-.8-13 0-18 2.4M54.5 43.2c-6.6-.8-13 0-18 2.4"
        stroke="#f3e6d2" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <path d="M4 50.6c10-1.8 20.4-.6 28 3.6 7.6-4.2 18-5.4 28-3.6" stroke="#5e3d20" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
