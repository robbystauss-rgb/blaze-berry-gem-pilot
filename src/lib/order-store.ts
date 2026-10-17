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
import type { CrownPosition } from "./crown-geometry";
import { MAX_NEW_UPLOAD_BYTES } from "./upload-limits";
import { isRetiredHatModel } from "./catalog-lifecycle";
import type { ReorderSettings } from "./commerce/reorder-types";

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
  patchOffsetX: number;
  patchOffsetY: number;
  patchScale: number;
  /** Versioned crown-local center; missing means legacy container percentages. */
  patchPosition?: CrownPosition;
  previewIdentity?: {
    family: string;
    colorway: string;
    photoId: string;
    imageVersion: string;
    geometrySignature: string;
  };
  leatherette: LeatheretteId;
  quantity: number;
  patchText: string;
  artworkDataUrl: string;
  notes: string;
  promo: string;
  /** Informational account-to-builder transition; never persisted across sessions. */
  reorderNotice?: string;
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
  patchOffsetX: 0,
  patchOffsetY: 0,
  patchScale: 1,
  patchPosition: undefined,
  leatherette: "buckskin",
  quantity: 1,
  patchText: "",
  artworkDataUrl: "",
  notes: "",
  promo: "",
  reorderNotice: undefined,
};

type Store = OrderDraft & {
  set: <K extends keyof OrderDraft>(key: K, value: OrderDraft[K]) => void;
  patch: (partial: Partial<OrderDraft>) => void;
  reset: () => void;
  setFamily: (family: FamilyId) => void;
  restoreReorder: (settings: ReorderSettings, notice: string) => void;
};

export function restoreActiveOrderDraft(saved: Partial<OrderDraft>, current: Store): Store {
  if (isRetiredHatModel(saved.family))
    return {
      ...current,
      ...saved,
      family: "112",
      tier: "standard",
      colorway: "",
      patchPosition: undefined,
      previewIdentity: undefined,
      reorderNotice:
        "Your saved hat model is no longer offered. Choose an available model and color; your artwork is retained.",
    };
  return { ...current, ...saved };
}

export const useOrder = create<Store>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as Partial<OrderDraft>),
      patch: (partial) => set(partial),
      reset: () => set(DEFAULTS),
      restoreReorder: (settings, notice) =>
        set({
          ...DEFAULTS,
          ...settings,
          tier: FAMILIES[settings.family].tier,
          previewIdentity: undefined,
          reorderNotice: notice,
        }),
      setFamily: (family) =>
        set({
          family,
          tier: FAMILIES[family].tier,
          colorway: "",
        }),
    }),
    {
      name: "rec-mama-order",
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<OrderDraft>;
        return restoreActiveOrderDraft(saved, current);
      },
      partialize: (s) => {
        const {
          set: _set,
          patch: _patch,
          reset: _reset,
          setFamily: _sf,
          restoreReorder: _restore,
          reorderNotice: _notice,
          artworkDataUrl,
          ...rest
        } = s;
        return { ...rest, artworkDataUrl: artworkDataUrl.length < 400000 ? artworkDataUrl : "" };
      },
    },
  ),
);

export function resizeImage(file: File): Promise<{ url: string; width: number; height: number }> {
  if (file.size > MAX_NEW_UPLOAD_BYTES)
    return Promise.reject(new Error("Upload artwork up to 3 MB."));
  if (file.type === "application/pdf" || file.type === "image/svg+xml") {
    return fileToDataUrl(file).then((url) => ({ url, width: 0, height: 0 }));
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Read the original file bytes. A canvas JPEG flattened PNG transparency
      // and replaced the production original with a lossy 900px derivative.
      fileToDataUrl(file).then(
        (data) => resolve({ url: data, width: img.width, height: img.height }),
        reject,
      );
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
