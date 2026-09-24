import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  FamilyId,
  HatTier,
  LeatheretteId,
  OrderType,
  PatchShape,
  PatchSize,
  Placement,
} from "./catalog";
import { FAMILIES } from "./catalog";

export type OrderDraft = {
  customerName: string;
  customerEmail: string;
  orderType: OrderType;
  family: FamilyId;
  colorway: string;
  tier: HatTier;
  patchShape: PatchShape;
  patchSize: PatchSize;
  placement: Placement;
  leatherette: LeatheretteId;
  quantity: number;
  patchText: string;
  artworkDataUrl: string;
  notes: string;
  promo: string;
};

const DEFAULTS: OrderDraft = {
  customerName: "",
  customerEmail: "",
  orderType: "hat",
  family: "112",
  colorway: "Black",
  tier: "standard",
  patchShape: "Rounded Rectangle",
  patchSize: "medium",
  placement: "front-center",
  leatherette: "buckskin",
  quantity: 1,
  patchText: "",
  artworkDataUrl: "",
  notes: "",
  promo: "",
};

type Store = OrderDraft & {
  set: <K extends keyof OrderDraft>(key: K, value: OrderDraft[K]) => void;
  patch: (partial: Partial<OrderDraft>) => void;
  reset: () => void;
  setFamily: (family: FamilyId) => void;
};

export const useOrder = create<Store>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as Partial<OrderDraft>),
      patch: (partial) => set(partial),
      reset: () => set(DEFAULTS),
      setFamily: (family) =>
        set({
          family,
          tier: FAMILIES[family].tier,
          colorway: "",
        }),
    }),
    {
      name: "rec-mama-order",
      partialize: (s) => {
        const {
          set: _set,
          patch: _patch,
          reset: _reset,
          setFamily: _sf,
          artworkDataUrl,
          ...rest
        } = s;
        return { ...rest, artworkDataUrl: artworkDataUrl.length < 400000 ? artworkDataUrl : "" };
      },
    },
  ),
);

export function resizeImage(file: File): Promise<{ url: string; width: number; height: number }> {
  if (file.type === "application/pdf" || file.type === "image/svg+xml") {
    return fileToDataUrl(file).then((url) => ({ url, width: 0, height: 0 }));
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 900;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve({ url: canvas.toDataURL("image/jpeg", 0.86), width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}
