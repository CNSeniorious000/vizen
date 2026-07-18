import type { VNode } from "preact";

export interface SidebarProps {
  nav: { title: string; url?: string; children?: unknown[] }[];
  page?: string;
}

export function Sidebar(_props: SidebarProps): VNode | null {
  return null;
}
