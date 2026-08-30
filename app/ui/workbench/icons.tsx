import type { SVGProps } from "react";

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>{children}</svg>;
}

export function ToolIcon(props: SVGProps<SVGSVGElement>) { return <Icon {...props}><path d="m14.7 6.3 3-3a5 5 0 0 1-6.4 6.4l-6.6 6.6a2.1 2.1 0 1 0 3 3l6.6-6.6a5 5 0 0 1 6.4-6.4l-3 3" /></Icon>; }
export function CheckIcon(props: SVGProps<SVGSVGElement>) { return <Icon {...props}><path d="m5 12 4 4L19 6" /></Icon>; }
export function AlertIcon(props: SVGProps<SVGSVGElement>) { return <Icon {...props}><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 9v4M12 17h.01" /></Icon>; }
export function StopIcon(props: SVGProps<SVGSVGElement>) { return <Icon {...props}><rect x="6" y="6" width="12" height="12" rx="1" /></Icon>; }
export function PlusIcon(props: SVGProps<SVGSVGElement>) { return <Icon {...props}><path d="M12 5v14M5 12h14" /></Icon>; }
export function FolderIcon(props: SVGProps<SVGSVGElement>) { return <Icon {...props}><path d="M3.5 6.5h6l2 2h9v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" /></Icon>; }
export function MenuIcon(props: SVGProps<SVGSVGElement>) { return <Icon {...props}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>; }
export function DetailsIcon(props: SVGProps<SVGSVGElement>) { return <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Icon>; }
export function SendIcon(props: SVGProps<SVGSVGElement>) { return <Icon {...props}><path d="m4 12 16-8-6 16-2-6Z" /><path d="m12 14 8-10" /></Icon>; }
export function DeleteIcon(props: SVGProps<SVGSVGElement>) { return <Icon {...props}><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></Icon>; }
