import type { VNode } from "preact";

export interface TocProps {
  toc: { level: number; slug: string; text: string; children?: unknown[] }[];
}

export function Toc(_props: TocProps): VNode | null {
  return null;
}
