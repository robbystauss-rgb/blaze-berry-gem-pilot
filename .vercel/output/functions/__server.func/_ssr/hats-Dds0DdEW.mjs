import { x as require_jsx_runtime, y as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { i as MASTER } from "./router-ETEjALf_.mjs";
import { d as familyHero, n as FAMILIES, r as FAMILY_ORDER } from "./stage-photos-BcL74VQI.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/hats-Dds0DdEW.js
var import_jsx_runtime = require_jsx_runtime();
function familyTo(id) {
	if (id === "112") return "/112";
	if (id === "168") return "/168";
	if (id === "256") return "/256";
	if (id === "112FP" || id === "112FPR") return "/order";
	return "/printed-camo";
}
function HatsPage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "mx-auto w-[min(1180px,94vw)] py-10",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs font-semibold tracking-[0.16em] text-primary uppercase",
				children: "Hat families"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "mt-2 font-display text-5xl font-semibold text-ink",
				children: "Colorways stay with the right model."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-3 max-w-2xl text-base leading-7 text-bark",
				children: "You cannot put a 256 color on a 112. Names below are the official model names. A photo in the library is not the same as a color the shop offers, and a Richardson listing is not automatically a REC Mama Made color."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-8 grid gap-4 md:grid-cols-2",
				children: FAMILY_ORDER.map((id) => {
					const model = MASTER.models.find((item) => item.id === id);
					const photos = model?.colorways.filter((color) => color.views.front).length ?? 0;
					const incomplete = model?.bucket === "incomplete" || id === "112FP";
					const photo = familyHero(id);
					const search = id === "112FP" || id === "112FPR" ? {
						type: "hat",
						family: id
					} : void 0;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: familyTo(id),
						search,
						className: "grid grid-cols-[140px_1fr] overflow-hidden rounded-3xl bg-stage-photo shadow-stage ring-1 ring-ink/10 sm:grid-cols-[180px_1fr]",
						children: [photo ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src: photo,
							alt: "",
							className: "h-full min-h-36 w-full bg-white object-contain"
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid min-h-36 place-items-center bg-white text-xs text-bark",
							children: "No photo"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "p-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-xs font-semibold tracking-wide text-bark uppercase",
									children: ["Richardson ", id]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "font-display text-3xl text-ink",
									children: FAMILIES[id].label
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-1 text-sm leading-6 text-bark",
									children: FAMILIES[id].blurb
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-2 text-sm text-ink",
									children: incomplete ? "Assets incomplete. Kept in the catalog, not a color library to sell." : `${photos} supplied color photos.`
								})
							]
						})]
					}, id);
				})
			})
		]
	});
}
//#endregion
export { HatsPage as component };
