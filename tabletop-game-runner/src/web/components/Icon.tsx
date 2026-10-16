const PATHS = {
  restart: "M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5",
  reset: "M18 5l-9 7 9 7zM6 5v14",
  step: "M6 5l9 7-9 7zM18 5v14",
  play: "M7 4.5l12 7.5-12 7.5z",
  pause: "M8 5v14M16 5v14",
  swap: "M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4",
  sparkle: "M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9zM19 16v4M17 18h4",
  code: "M8 7l-5 5 5 5M16 7l5 5-5 5",
  close: "M6 6l12 12M18 6L6 18",
  prev: "M15 5l-7 7 7 7",
  next: "M9 5l7 7-7 7",
};

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
