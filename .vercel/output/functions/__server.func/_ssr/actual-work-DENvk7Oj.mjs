import { i as __toESM } from "../_runtime.mjs";
import { B as require_react, x as require_jsx_runtime, y as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { C as buttonVariants, b as useStudio, i as MASTER, l as drivePhoto } from "./router-ETEjALf_.mjs";
import { f as galleryWork, n as FAMILIES } from "./stage-photos-BcL74VQI.mjs";
import { n as useOrder } from "./order-store-CWXNCWnE.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/actual-work-DENvk7Oj.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function isFamily(value) {
	return value in FAMILIES;
}
function WorkPage() {
	const work = useStudio((state) => state.work);
	const photos = galleryWork(work);
	const [open, setOpen] = (0, import_react.useState)(0);
	const current = photos[open] ?? photos[0];
	const tagged = current?.decision.modelId && isFamily(current.decision.modelId) ? current.decision.modelId : null;
	const taggedColor = tagged ? MASTER.models.find((model) => model.id === tagged)?.colorways.find((color) => color.id === current?.decision.colorId)?.officialName : void 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "mx-auto w-[min(1240px,94vw)] py-8 pb-16",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap items-end justify-between gap-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "font-display text-5xl",
					children: "Actual work"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/order",
					className: buttonVariants(),
					children: "Build your hat"
				})]
			}),
			current && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", {
				className: "mt-6 overflow-hidden rounded-[28px] bg-stage-photo shadow-stage ring-1 ring-stage-line",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: drivePhoto(current.item.driveId, 1600) ?? "",
					alt: current.decision.title || "Finished REC Mama Made hat",
					className: "max-h-[78dvh] w-full object-contain"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figcaption", {
					className: "flex flex-wrap items-center justify-between gap-3 px-4 py-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-stage-muted",
						children: current.decision.title || "Finished build"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "min-h-11 px-3 text-sm font-semibold",
								onClick: () => setOpen((value) => (value - 1 + photos.length) % photos.length),
								children: "Previous"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "min-h-11 px-3 text-sm font-semibold",
								onClick: () => setOpen((value) => (value + 1) % photos.length),
								children: "Next"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: "/order",
								search: tagged ? {
									family: tagged,
									color: taggedColor
								} : {},
								onClick: () => {
									if (tagged) useOrder.getState().setFamily(tagged);
									if (taggedColor) useOrder.getState().set("colorway", taggedColor);
									useOrder.getState().set("orderType", "hat");
								},
								className: buttonVariants({ size: "sm" }),
								children: "Build something like this"
							})
						]
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-4 flex gap-3 overflow-x-auto pb-2",
				children: photos.map((entry, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => setOpen(index),
					className: `w-28 shrink-0 overflow-hidden rounded-2xl bg-stage-photo ring-2 ${index === open ? "ring-primary" : "ring-transparent"}`,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						src: drivePhoto(entry.item.driveId, 320) ?? "",
						alt: "",
						className: "h-36 w-full object-cover"
					})
				}, entry.item.id))
			})
		]
	});
}
//#endregion
export { WorkPage as component };
