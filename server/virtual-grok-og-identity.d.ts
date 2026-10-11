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
        background_color?: string;
        theme_color?: string;
        icons?: { src: string; sizes: string; type: string; purpose?: string }[];
      };
    };
  };
}
