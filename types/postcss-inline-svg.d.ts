// postcss-inline-svg ships no types; declare it as a default-exported plugin factory.
declare module "postcss-inline-svg" {
  import type { PluginCreator } from "postcss";
  interface InlineSvgOptions {
    paths?: string[];
    encode?: (svg: string) => string;
    removeFill?: boolean;
    transform?: (code: string, path: string) => string;
  }
  const plugin: PluginCreator<InlineSvgOptions>;
  export default plugin;
}
