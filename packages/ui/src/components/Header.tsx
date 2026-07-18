import type { VNode } from "preact";

export interface HeaderProps {
  title: string;
  url?: string;
}

export function Header(_props: HeaderProps): VNode | null {
  return null; // SSR'd as raw HTML in core/render; component exists for hydration parity.
}
