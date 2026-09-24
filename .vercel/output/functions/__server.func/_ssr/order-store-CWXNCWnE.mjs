import { n as create, t as persist } from "../_libs/zustand.mjs";
import { n as FAMILIES } from "./stage-photos-BcL74VQI.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/order-store-CWXNCWnE.js
var DEFAULTS = {
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
	promo: ""
};
var useOrder = create()(persist((set) => ({
	...DEFAULTS,
	set: (key, value) => set({ [key]: value }),
	patch: (partial) => set(partial),
	reset: () => set(DEFAULTS),
	setFamily: (family) => set({
		family,
		tier: FAMILIES[family].tier,
		colorway: ""
	})
}), {
	name: "rec-mama-order",
	partialize: (s) => {
		const { set: _set, patch: _patch, reset: _reset, setFamily: _sf, artworkDataUrl, ...rest } = s;
		return {
			...rest,
			artworkDataUrl: artworkDataUrl.length < 4e5 ? artworkDataUrl : ""
		};
	}
}));
function resizeImage(file) {
	if (file.type === "application/pdf" || file.type === "image/svg+xml") return fileToDataUrl(file).then((url) => ({
		url,
		width: 0,
		height: 0
	}));
	return new Promise((resolve, reject) => {
		const img = new Image();
		const url = URL.createObjectURL(file);
		img.onload = () => {
			const scale = Math.min(1, 900 / Math.max(img.width, img.height));
			const canvas = document.createElement("canvas");
			canvas.width = Math.round(img.width * scale);
			canvas.height = Math.round(img.height * scale);
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				reject(/* @__PURE__ */ new Error("Canvas unavailable"));
				return;
			}
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			URL.revokeObjectURL(url);
			resolve({
				url: canvas.toDataURL("image/jpeg", .86),
				width: img.width,
				height: img.height
			});
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(/* @__PURE__ */ new Error("Could not read image"));
		};
		img.src = url;
	});
}
function fileToDataUrl(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(/* @__PURE__ */ new Error("Could not read file"));
		reader.readAsDataURL(file);
	});
}
//#endregion
export { useOrder as n, resizeImage as t };
