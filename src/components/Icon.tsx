/** Jeu d'icônes linéaires 16 px (style des glyphes EUI), sans dépendance. */
const PATHS = {
  menu: 'M3 6h18M3 12h18M3 18h18',
  home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  list: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zM4 19a2 2 0 0 1 2-2h13',
  gantt: 'M4 5h9M7 10h10M5 15h7M10 20h10M3 3v18',
  columns: 'M4 4h5v16H4zM10 4h5v10h-5zM16 4h4v13h-4z',
  report: 'M14 3H6v18h12V7l-4-4zM14 3v4h4M9 13h6M9 17h6M9 9h2',
  table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3zM8.5 12l2.5 2.5 4.5-5',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  copy: 'M8 8h11v12H8zM5 16V4h11',
  archive: 'M3 5h18v4H3zM5 9v11h14V9M10 13h4',
  restore: 'M4 12a8 8 0 1 0 2.3-5.7M4 5v6h6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  paperclip: 'M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  file: 'M14 3H6v18h12V7l-4-4zM14 3v4h4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 3',
  alert: 'M12 3l10 18H2L12 3zM12 10v4M12 17.5v.5',
  check: 'M5 12l5 5 9-10',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17.5v.5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  cycle: 'M20 7h-6M20 7V1M20 7a9 9 0 1 0 1.5 7',
  x: 'M6 6l12 12M18 6L6 18',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
}

export type IconName = keyof typeof PATHS

interface IconProps {
  name: IconName
  size?: number
  className?: string
  title?: string
}

export default function Icon({ name, size = 16, className = '', title }: IconProps) {
  const d = PATHS[name]
  return (
    <svg
      className={`icon-svg ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' ? 3.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={d} />
    </svg>
  )
}
