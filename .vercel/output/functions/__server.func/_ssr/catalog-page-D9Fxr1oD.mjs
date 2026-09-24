import { i as __toESM } from "../_runtime.mjs";
import { B as require_react, x as require_jsx_runtime, y as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { C as buttonVariants, i as MASTER, w as cn } from "./router-ETEjALf_.mjs";
import { d as familyHero, l as colorwaysForFamily, m as stageThumb, n as FAMILIES } from "./stage-photos-BcL74VQI.mjs";
import { i as parseColorway, n as MiniHat } from "./hat-preview-7102pxhS.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/catalog-page-D9Fxr1oD.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function ColorCard({ family, name, category }) {
	const photo = stageThumb(family, name);
	const colors = parseColorway(name);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
		to: "/order",
		search: {
			family,
			color: name
		},
		className: "group block overflow-hidden rounded-2xl bg-stage-photo p-3 shadow-stage ring-1 ring-stage-line transition-transform duration-150 hover:-translate-y-0.5",
		children: [photo ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
			src: photo,
			alt: "",
			className: "aspect-[4/3] w-full object-contain"
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MiniHat, {
			family,
			colorway: name,
			className: "aspect-[4/3] rounded-xl"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-3 flex items-start justify-between gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "min-w-0",
				children: [category && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-semibold tracking-[0.12em] text-primary uppercase",
					children: category
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "truncate font-medium text-stage-ink",
					children: name
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex shrink-0 gap-1 pt-1",
				children: [
					colors.front,
					colors.visor,
					colors.mesh
				].map((c, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "size-3.5 rounded-full ring-1 ring-black/20",
					style: { background: c }
				}, `${c}-${i}`))
			})]
		})]
	});
}
var fieldClass = "min-h-11 w-full rounded-md border-0 bg-field px-3.5 py-2.5 text-field-ink shadow-[0_0_0_1px_var(--color-border)] outline-none transition-[box-shadow] duration-150 placeholder:text-subtle focus:shadow-[0_0_0_2px_var(--color-primary)]";
function Input(props) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
		className: cn(fieldClass, props.className),
		...props
	});
}
function CatalogPage({ family }) {
	const [q, setQ] = (0, import_react.useState)("");
	const printedMode = family === "printed";
	const list = (0, import_react.useMemo)(() => {
		if (printedMode) return [];
		const items = colorwaysForFamily(family);
		const query = q.trim().toLowerCase();
		if (!query) return items;
		return items.filter((c) => c.name.toLowerCase().includes(query) || c.category.toLowerCase().includes(query));
	}, [
		family,
		printedMode,
		q
	]);
	const meta = printedMode ? {
		label: "Printed / Camo",
		blurb: "Printed and camo styles we actually have photos for. A pattern Richardson sells is not automatically a color this shop offers.",
		short: "Printed collections"
	} : FAMILIES[family];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "mx-auto w-[min(1180px,92vw)] py-10",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "kicker",
					children: printedMode ? "Printed collections" : FAMILIES[family].short
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "mt-3 font-display text-4xl text-stage-ink md:text-5xl",
					children: meta.label
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 max-w-[60ch] text-base leading-7 text-stage-ink",
					children: meta.blurb
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5 flex flex-wrap gap-3",
					children: [printedMode || MASTER.models.find((item) => item.id === family)?.bucket === "ready" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/order",
						search: {
							type: "hat",
							family: printedMode ? void 0 : family
						},
						className: buttonVariants(),
						children: "Build this family"
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-bark",
						children: "Assets incomplete. This model stays in the catalog and is not in the builder."
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/actual-work",
						className: buttonVariants({ variant: "secondary" }),
						children: "See finished work"
					})]
				})
			] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: (printedMode ? familyHero("112P") : familyHero(family)) ?? "/products/hat-112-black.jpg",
				alt: "",
				className: "w-full rounded-[28px] bg-stage-photo object-contain shadow-stage ring-1 ring-stage-line"
			})]
		}), printedMode ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-10 space-y-10",
			children: MASTER.models.filter((model) => model.id in FAMILIES && FAMILIES[model.id].kind === "printed").map((model) => {
				const fid = model.id;
				const names = model.bucket === "ready" ? colorwaysForFamily(fid) : [];
				return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h2", {
						className: "font-display text-2xl text-stage-ink",
						children: [
							model.code,
							" ",
							model.officialName
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm text-stage-muted",
						children: model.bucket === "ready" ? `${names.length} supplied color photos` : "Assets incomplete. Not a color library to sell."
					}),
					names.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
						children: names.map((color) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ColorCard, {
							family: fid,
							name: color.name,
							category: color.category
						}, color.name))
					})
				] }, model.id);
			})
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-10",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
				type: "search",
				value: q,
				onChange: (e) => setQ(e.target.value),
				placeholder: `Search ${meta.label} colorways`,
				"aria-label": "Search colorways"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-3 text-sm text-stage-muted",
				children: [list.length, " colorways shown"]
			})]
		}), list.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-6 text-sm text-bark",
			children: "No supplied color photos for this model. It is not offered in the builder."
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
			children: list.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ColorCard, {
				family,
				name: c.name,
				category: c.category
			}, c.name))
		})] })]
	});
}
//#endregion
export { CatalogPage as t };
