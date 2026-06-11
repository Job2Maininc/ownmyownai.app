import type { ReactNode } from "react";

type IconProps = { size?: number; className?: string };

function Svg({ size = 16, className = "", children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </Svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </Svg>
  );
}

export function GitBranchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <line x1="6" x2="6" y1="3" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </Svg>
  );
}

export function HardDriveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <line x1="22" x2="2" y1="12" y2="12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      <line x1="6" x2="6.01" y1="16" y2="16" />
      <line x1="10" x2="10.01" y1="16" y2="16" />
    </Svg>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Svg>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </Svg>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </Svg>
  );
}

export function PackageIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </Svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </Svg>
  );
}

export type SourceIconId = "file" | "folder" | "repo" | "drive";

const SOURCE_ICONS: Record<SourceIconId, (props: IconProps) => ReactNode> = {
  file: FileIcon,
  folder: FolderIcon,
  repo: GitBranchIcon,
  drive: HardDriveIcon,
};

export function SourceIcon({ id, ...props }: IconProps & { id: SourceIconId }) {
  const Component = SOURCE_ICONS[id];
  return <Component {...props} />;
}

export type ReviewIconId = "unstaged" | "staged" | "head" | "github-pr";

const REVIEW_ICONS: Record<ReviewIconId, (props: IconProps) => ReactNode> = {
  unstaged: PencilIcon,
  staged: PackageIcon,
  head: ClockIcon,
  "github-pr": GitBranchIcon,
};

export function ReviewIcon({ id, ...props }: IconProps & { id: ReviewIconId }) {
  const Component = REVIEW_ICONS[id];
  return <Component {...props} />;
}

function DocSourceIcon({ linked, ...props }: IconProps & { linked: boolean }) {
  return linked ? <LinkIcon {...props} /> : <UploadIcon {...props} />;
}

export function InlineDocIcon({ linked }: { linked: boolean }) {
  return (
    <span className="inline-icon" aria-hidden>
      <DocSourceIcon linked={linked} size={14} />
    </span>
  );
}

export function InlineLinkIcon() {
  return (
    <span className="inline-icon" aria-hidden>
      <LinkIcon size={14} />
    </span>
  );
}
