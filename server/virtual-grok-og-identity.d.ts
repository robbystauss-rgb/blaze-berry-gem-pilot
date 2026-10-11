declare module "virtual:grok-og-identity" {
  export const grokOgIdentity: {
    site: {
      title?: string;
      description?: string;
      type?: string;
      card?: string;
      image?: string;
      banner?: string;
      color?: string;
      assetVersion?: string;
      pwa?: {
        apple_touch_icon?: string;
        inline_apple_touch_icon?: boolean;
        apple_touch_icon_inline_src?: string;
        background_color?: string;
        theme_color?: string;
        icons?: { src: string; sizes: string; type: string; purpose?: string }[];
      };
    };
  };
}
