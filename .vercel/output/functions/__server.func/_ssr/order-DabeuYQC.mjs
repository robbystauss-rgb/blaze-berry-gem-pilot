import { i as __toESM } from "../_runtime.mjs";
import { B as require_react, x as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { s as Check } from "../_libs/lucide-react.mjs";
import { S as Button, n as Route$2, w as cn } from "./router-ETEjALf_.mjs";
import { a as PATCH_SHAPES, c as colorsForFamily, d as familyHero, i as LEATHERETTES, m as stageThumb, n as FAMILIES, o as PLACEMENTS, p as getLeatherette, r as FAMILY_ORDER, s as PRICING, t as ETSY_LISTING, u as estimateTotal } from "./stage-photos-BcL74VQI.mjs";
import { r as ShapeMark, t as HatPreview } from "./hat-preview-7102pxhS.mjs";
import { n as useOrder, t as resizeImage } from "./order-store-CWXNCWnE.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/order-DabeuYQC.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var STEP_LABEL = {
	hat: "Hat",
	color: "Color",
	material: "Material",
	shape: "Shape",
	design: "Design",
	position: "Place",
	review: "Review"
};
function stepsFor(patchOnly) {
	return patchOnly ? [
		"material",
		"shape",
		"design",
		"review"
	] : [
		"hat",
		"color",
		"material",
		"shape",
		"design",
		"position",
		"review"
	];
}
function tooLarge(size, placement) {
	return size === "large" && (placement === "side" || placement === "rear");
}
function Builder({ focus }) {
	const draft = useOrder();
	const patchOnly = draft.orderType === "patch";
	const steps = stepsFor(patchOnly);
	const [step, setStep] = (0, import_react.useState)(focus ?? (patchOnly ? "material" : "hat"));
	const [warn, setWarn] = (0, import_react.useState)("");
	const [drawer, setDrawer] = (0, import_react.useState)(false);
	const [materialOpen, setMaterialOpen] = (0, import_react.useState)(false);
	const active = steps.includes(step) ? step : steps[0] ?? "hat";
	const index = steps.indexOf(active);
	const family = FAMILIES[draft.family];
	const colors = colorsForFamily(draft.family);
	const leather = getLeatherette(draft.leatherette);
	const qty = Math.max(1, Number(draft.quantity) || 1);
	const est = estimateTotal({
		orderType: draft.orderType,
		tier: draft.tier,
		quantity: qty,
		family: draft.family,
		promo: draft.promo
	});
	const shape = draft.patchShape === "Louisiana" ? "Rounded Rectangle" : draft.patchShape;
	(0, import_react.useEffect)(() => {
		if (draft.patchShape === "Louisiana") draft.set("patchShape", "Rounded Rectangle");
	}, [draft.patchShape, draft]);
	(0, import_react.useEffect)(() => {
		if (focus) setStep(focus);
	}, [focus]);
	(0, import_react.useEffect)(() => {
		setStep((current) => stepsFor(patchOnly).includes(current) ? current : stepsFor(patchOnly)[0]);
	}, [patchOnly]);
	(0, import_react.useEffect)(() => {
		if (active !== "color" || !draft.colorway) return;
		document.getElementById(`swatch-${draft.colorway}`)?.scrollIntoView({
			inline: "center",
			block: "nearest"
		});
	}, [active, draft.colorway]);
	const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.customerEmail.trim());
	const missingDesign = !draft.patchText.trim() && !draft.artworkDataUrl;
	const continueLabel = active === "review" ? !draft.customerName.trim() ? "Add your name" : !emailOk ? "Add your email" : missingDesign ? "Add a design" : "Continue on Etsy" : active === "hat" ? "Choose color" : active === "color" && !draft.colorway ? "Choose color" : active === "design" && missingDesign ? "Add a design" : "Continue";
	const summary = (0, import_react.useMemo)(() => {
		return [
			"REC Mama Made custom order",
			`Name: ${draft.customerName || "(not provided)"}`,
			`Email: ${draft.customerEmail || "(not provided)"}`,
			`Type: ${patchOnly ? "Patch only" : "Custom patch hat"}`,
			patchOnly ? "" : `Hat: Richardson ${family.id} ${family.label}`,
			patchOnly ? "" : `Color: ${draft.colorway || "(not selected)"}`,
			patchOnly ? "" : `Placement: ${PLACEMENTS.find((item) => item.id === draft.placement)?.label}`,
			`Material: ${leather.name} · ${leather.engrave}`,
			`Shape: ${shape}`,
			`Size: ${draft.patchSize}`,
			`Quantity: ${qty}`,
			`Design: ${draft.patchText || (draft.artworkDataUrl ? "Uploaded artwork" : "(none)")}`,
			`Notes: ${draft.notes || "(none)"}`,
			draft.promo ? `Promo: ${draft.promo}` : "",
			est.zaddy ? "Price: classic 112 at $25 with ZADDY." : "",
			"Proof included before production."
		].filter(Boolean).join("\n");
	}, [
		draft,
		family,
		leather,
		patchOnly,
		qty,
		shape
	]);
	function go(next) {
		const target = steps[Math.min(steps.length - 1, Math.max(0, next))];
		if (target) setStep(target);
		setDrawer(false);
	}
	async function onUpload(file) {
		if (!file) return;
		if (file.size > 12582912) {
			setWarn("Please choose a file smaller than 12 MB.");
			return;
		}
		if (file.type && ![
			"image/png",
			"image/jpeg",
			"image/webp",
			"image/svg+xml",
			"application/pdf"
		].includes(file.type)) {
			setWarn("Use a PNG, JPG, SVG, or PDF.");
			return;
		}
		try {
			const result = await resizeImage(file);
			draft.set("artworkDataUrl", result.url);
			const longest = Math.max(result.width, result.height);
			setWarn(longest > 0 && longest < 600 ? "This image may be too small for clean engraving. We’ll review it before production." : "");
		} catch {
			setWarn("Could not read that file.");
		}
	}
	function choosePlacement(id) {
		if (tooLarge(draft.patchSize, id)) {
			setWarn("This patch size is too large for this position.");
			return;
		}
		setWarn("");
		draft.set("placement", id);
	}
	const next = steps[index + 1];
	const ready = Boolean(draft.customerName.trim()) && emailOk && !missingDesign;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "lg:grid lg:min-h-[calc(100dvh-7.25rem)] lg:grid-cols-[minmax(0,1.28fr)_minmax(320px,0.92fr)]",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative min-h-[58vh] bg-[radial-gradient(90%_70%_at_50%_32%,#fff_0%,#f6f1ea_58%,#e8e0d4_100%)] lg:sticky lg:top-[7.25rem] lg:h-[calc(100dvh-7.25rem)]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "absolute top-4 left-5 text-[11px] font-semibold tracking-[0.16em] text-stage-muted uppercase",
						children: "Customization preview"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "absolute top-4 right-5 max-w-[240px] text-right text-[11px] leading-snug text-stage-muted",
						children: "Final engraving and placement are confirmed in your digital proof."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "h-[58vh] lg:h-full",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HatPreview, {
							family: draft.family,
							colorway: draft.colorway,
							leatherette: draft.leatherette,
							shape,
							size: draft.patchSize,
							placement: draft.placement,
							patchText: draft.patchText,
							artworkUrl: draft.artworkDataUrl || void 0,
							patchOnly,
							placementMode: active === "position",
							onPlacement: choosePlacement
						})
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "flex flex-col border-t border-stage-line bg-stage-photo pb-28 lg:max-h-[calc(100dvh-7.25rem)] lg:overflow-hidden lg:border-t-0 lg:border-l lg:pb-0",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-2 overflow-x-auto px-3 py-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex shrink-0 rounded-full bg-stage p-1 ring-1 ring-stage-line",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									draft.set("orderType", "hat");
									setStep("hat");
								},
								className: cn("min-h-11 rounded-full px-3 text-sm font-semibold", !patchOnly ? "bg-primary text-primary-fg" : "text-stage-ink"),
								children: "Hat"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									draft.set("orderType", "patch");
									setStep("material");
								},
								className: cn("min-h-11 rounded-full px-3 text-sm font-semibold", patchOnly ? "bg-primary text-primary-fg" : "text-stage-ink"),
								children: "Patch only"
							})]
						}), steps.map((id, stepIndex) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => setStep(id),
							className: cn("min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold", id === active ? "bg-primary text-primary-fg" : "text-stage-muted"),
							children: [
								String(stepIndex + 1).padStart(2, "0"),
								" ",
								STEP_LABEL[id]
							]
						}, id))]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-h-0 flex-1 overflow-auto",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-center justify-between gap-3 px-3 pt-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "truncate text-sm font-semibold text-stage-ink",
									children: [
										patchOnly ? "Patch only" : `${family.id} ${family.label}`,
										draft.colorway ? ` · ${draft.colorway}` : "",
										` · ${leather.name}`
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "price-tick shrink-0 text-lg font-semibold tabular-nums",
									children: ["$", est.total.toFixed(2)]
								}, est.total)]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "px-3 text-xs text-stage-muted",
								children: "Heat adhesive only. Laser holes are fine. No sewing and no thread."
							}),
							active === "hat" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex gap-3 overflow-x-auto px-3 py-3",
								children: FAMILY_ORDER.map((id) => {
									const item = FAMILIES[id];
									const photo = familyHero(id);
									const count = colorsForFamily(id).length;
									const on = draft.family === id;
									return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										type: "button",
										onClick: () => draft.setFamily(id),
										className: cn("w-44 shrink-0 overflow-hidden rounded-2xl bg-stage-photo text-left ring-1 transition-transform duration-150", on ? "ring-2 ring-primary" : "ring-stage-line hover:-translate-y-0.5"),
										children: [photo ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
											src: photo,
											alt: "",
											className: "h-28 w-full object-contain"
										}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "grid h-28 place-items-center text-xs text-stage-muted",
											children: "Photos coming"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "flex items-start justify-between gap-2 px-3 py-2",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
												className: "block text-sm font-semibold",
												children: [
													id,
													" ",
													item.label
												]
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
												className: "text-xs text-stage-muted",
												children: [
													count ? `${count} colors` : "Colors later",
													" · $",
													item.tier === "premium" ? PRICING.premium : PRICING.standard
												]
											})] }), on && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "mt-0.5 size-4 shrink-0 text-primary" })]
										})]
									}, id);
								})
							}),
							active === "color" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "px-3 pt-3 text-sm text-stage-muted",
								children: [colors.length ? `${colors.length} colors` : "No colors listed yet", " · tap one and the hat changes"]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex gap-2 overflow-x-auto px-3 py-3",
								children: colors.map((name) => {
									const thumb = stageThumb(draft.family, name);
									const on = draft.colorway === name;
									return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										id: `swatch-${name}`,
										type: "button",
										onClick: () => draft.set("colorway", name),
										className: cn("w-32 shrink-0 rounded-2xl bg-stage-photo p-1.5 text-left ring-1", on ? "ring-2 ring-primary" : "ring-stage-line"),
										children: [thumb ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
											src: thumb,
											alt: "",
											className: "h-20 w-full object-contain"
										}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "grid h-20 place-items-center text-xs text-stage-muted",
											children: "No photo yet"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "mt-1 flex items-start justify-between gap-1 px-1 pb-1 text-xs font-semibold",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "line-clamp-2",
												children: name
											}), on && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-3.5 shrink-0 text-primary" })]
										})]
									}, name);
								})
							})] }),
							active === "material" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex gap-3 overflow-x-auto px-3 py-3",
								children: LEATHERETTES.map((item) => {
									const on = draft.leatherette === item.id;
									return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										type: "button",
										onClick: () => {
											if (on) setMaterialOpen(true);
											else draft.set("leatherette", item.id);
										},
										className: cn("w-40 shrink-0 overflow-hidden rounded-2xl text-left ring-1 transition-transform duration-150", on ? "ring-2 ring-primary" : "ring-stage-line hover:-translate-y-0.5"),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "grid h-24 place-items-center bg-stage px-3 text-center text-xs text-stage-muted",
											children: "Image being updated"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "flex items-start justify-between gap-2 px-3 py-2",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "block text-sm font-semibold",
												children: item.name
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-xs text-stage-muted",
												children: on ? "Tap again to inspect" : item.engrave
											})] }), on && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-4 shrink-0 text-primary" })]
										})]
									}, item.id);
								})
							}),
							active === "shape" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "px-3 py-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "flex gap-2 overflow-x-auto",
									children: PATCH_SHAPES.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										type: "button",
										onClick: () => draft.set("patchShape", item),
										className: cn("w-28 shrink-0 rounded-2xl bg-stage px-2 py-3 text-center ring-1", shape === item ? "ring-2 ring-primary" : "ring-stage-line"),
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShapeMark, {
												shape: item,
												texture: leather.texture,
												className: "mx-auto w-14"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "mt-2 block text-xs font-semibold",
												children: item
											}),
											shape === item && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "mx-auto mt-1 size-3.5 text-primary" })
										]
									}, item))
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "mt-3 flex flex-wrap gap-2",
									children: [
										"small",
										"medium",
										"large"
									].map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => {
											if (tooLarge(item, draft.placement)) {
												setWarn("This patch size is too large for this position.");
												return;
											}
											setWarn("");
											draft.set("patchSize", item);
										},
										className: cn("min-h-11 rounded-full px-4 text-sm font-semibold capitalize", draft.patchSize === item ? "bg-primary text-primary-fg" : "bg-stage ring-1 ring-stage-line"),
										children: item
									}, item))
								})]
							}),
							active === "design" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "grid gap-3 px-3 py-3 md:grid-cols-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: "block",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-sm font-semibold",
											children: "Text on the patch"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
											value: draft.patchText,
											onChange: (event) => draft.set("patchText", event.target.value),
											placeholder: "Type it. It shows on the hat.",
											className: "mt-2 w-full rounded-xl bg-stage px-3 py-3 text-base ring-1 ring-stage-line"
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: "block rounded-xl bg-stage px-3 py-3 ring-1 ring-stage-line",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "text-sm font-semibold",
												children: "Upload artwork"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "mt-1 block text-xs text-stage-muted",
												children: "PNG, JPG, WEBP, SVG, or PDF"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
												type: "file",
												accept: "image/png,image/jpeg,image/webp,image/svg+xml,application/pdf",
												className: "mt-2 block w-full text-sm",
												onChange: (event) => void onUpload(event.target.files?.[0])
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-sm text-stage-muted md:col-span-2",
										children: "No REC Mama Made designs are in the library yet."
									})
								]
							}),
							active === "position" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "px-3 py-4",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-sm text-stage-ink",
									children: ["Tap a spot on the hat. The patch moves there.", draft.placement ? ` Now: ${PLACEMENTS.find((item) => item.id === draft.placement)?.label}.` : ""]
								})
							}),
							active === "review" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "px-3 py-3",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
										className: "grid gap-2 text-sm md:grid-cols-2",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRow, {
												label: patchOnly ? "Patch only" : `Richardson ${family.id}`,
												value: patchOnly ? "Loose patch" : `${family.label}${draft.colorway ? ` · ${draft.colorway}` : ""}`,
												onEdit: () => setStep(patchOnly ? "material" : "hat")
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRow, {
												label: "Material",
												value: `${leather.name} · ${leather.engrave}`,
												onEdit: () => setStep("material")
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRow, {
												label: "Shape",
												value: `${shape} · ${draft.patchSize}`,
												onEdit: () => setStep("shape")
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRow, {
												label: "Design",
												value: draft.patchText || (draft.artworkDataUrl ? "Uploaded artwork" : "Not added"),
												onEdit: () => setStep("design")
											}),
											!patchOnly && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReviewRow, {
												label: "Position",
												value: PLACEMENTS.find((item) => item.id === draft.placement)?.label ?? "",
												onEdit: () => setStep("position")
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_6rem]",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
												value: draft.customerName,
												onChange: (event) => draft.set("customerName", event.target.value),
												placeholder: "Name",
												className: "rounded-xl bg-stage px-3 py-3 ring-1 ring-stage-line"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
												value: draft.customerEmail,
												onChange: (event) => draft.set("customerEmail", event.target.value),
												placeholder: "Email",
												type: "email",
												className: "rounded-xl bg-stage px-3 py-3 ring-1 ring-stage-line"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
												type: "number",
												min: 1,
												"aria-label": "Quantity",
												value: draft.quantity,
												onChange: (event) => draft.set("quantity", Number(event.target.value) || 1),
												className: "rounded-xl bg-stage px-3 py-3 ring-1 ring-stage-line"
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "mt-2 text-sm text-stage-muted",
										children: [
											patchOnly ? "Patch only" : draft.tier === "premium" ? "Premium hat + patch" : "Standard hat + patch",
											" · $",
											est.unit,
											" each",
											est.bonus ? ` · ${est.bonus} bonus hat${est.bonus === 1 ? "" : "s"}` : "",
											" · Proof included before engraving."
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
										value: draft.promo,
										onChange: (event) => draft.set("promo", event.target.value),
										placeholder: "Promo code",
										"aria-label": "Promo code",
										className: "mt-2 w-full rounded-xl bg-stage px-3 py-3 text-sm ring-1 ring-stage-line"
									}),
									est.zaddy && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1 text-sm text-stage-ink",
										children: "ZADDY applied. Classic 112 is $25."
									}),
									draft.promo.trim().toUpperCase() === "ZADDY" && !est.zaddy && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1 text-sm text-stage-muted",
										children: "ZADDY only prices the classic 112. Premium hats and patch only stay at full price."
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
										value: draft.notes,
										onChange: (event) => draft.set("notes", event.target.value),
										rows: 2,
										placeholder: "Notes for the proof",
										className: "mt-2 w-full rounded-xl bg-stage px-3 py-3 text-sm ring-1 ring-stage-line"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-3 flex flex-wrap gap-2",
										children: [
											ready ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
												href: "https://www.etsy.com/listing/4435836820",
												target: "_blank",
												rel: "noreferrer",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
													type: "button",
													children: "Continue on Etsy"
												})
											}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
												type: "button",
												disabled: true,
												children: continueLabel
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
												type: "button",
												variant: "outline",
												onClick: () => void navigator.clipboard.writeText(summary),
												children: "Copy build"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
												href: `mailto:?subject=${encodeURIComponent("REC Mama Made order")}&body=${encodeURIComponent(summary)}`,
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
													type: "button",
													variant: "outline",
													children: "Email this build"
												})
											})
										]
									})
								]
							}),
							warn && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "px-3 pb-2 text-sm text-stage-ink",
								children: warn
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "hidden items-center justify-between gap-3 border-t border-stage-line px-3 py-3 lg:flex",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-lg font-semibold tabular-nums",
							children: ["$", est.total.toFixed(2)]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							onClick: () => next ? go(index + 1) : ready && window.open("https://www.etsy.com/listing/4435836820", "_blank", "noopener"),
							children: next ? `Continue · ${STEP_LABEL[next]}` : continueLabel
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "fixed inset-x-0 bottom-0 z-40 border-t border-stage-line bg-stage/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "mb-1 text-xs font-semibold text-stage-muted",
					onClick: () => setDrawer((value) => !value),
					children: "Your build"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "h-12 w-16 overflow-hidden rounded-lg bg-stage-photo ring-1 ring-stage-line",
							children: patchOnly ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "grid h-full place-items-center text-[0.6rem]",
								children: "Patch"
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
								src: stageThumb(draft.family, draft.colorway) ?? familyHero(draft.family) ?? "",
								alt: "",
								className: "h-full w-full object-contain"
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "font-semibold",
								children: ["$", est.total.toFixed(2)]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "truncate text-xs text-stage-muted",
								children: [
									STEP_LABEL[active],
									" · ",
									index + 1,
									" of ",
									steps.length
								]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							size: "sm",
							onClick: () => {
								if (active !== "review") go(index + 1);
								else if (ready) window.open(ETSY_LISTING, "_blank", "noopener");
							},
							children: continueLabel
						})
					]
				})]
			}),
			drawer && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "fixed inset-0 z-50 flex items-end bg-bg/50 lg:hidden",
				onClick: () => setDrawer(false),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "max-h-[80dvh] w-full overflow-auto rounded-t-3xl bg-stage p-5 pb-24 text-stage-ink",
					onClick: (event) => event.stopPropagation(),
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-3xl",
							children: "Your build"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 text-sm",
							children: patchOnly ? "Patch only" : `${family.id} ${family.label}`
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm",
							children: draft.colorway || "Color not chosen"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-sm",
							children: [
								leather.name,
								" · ",
								leather.engrave
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-sm",
							children: [
								shape,
								" · ",
								draft.patchSize
							]
						}),
						!patchOnly && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm",
							children: PLACEMENTS.find((item) => item.id === draft.placement)?.label
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm",
							children: draft.patchText || (draft.artworkDataUrl ? "Uploaded artwork" : "No design yet")
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-2 text-lg font-semibold",
							children: ["$", est.total.toFixed(2)]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-4 flex flex-wrap gap-2",
							children: [
								!patchOnly && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "button",
									variant: "outline",
									size: "sm",
									onClick: () => {
										setStep("color");
										setDrawer(false);
									},
									children: "Edit color"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "button",
									variant: "outline",
									size: "sm",
									onClick: () => {
										setStep("material");
										setDrawer(false);
									},
									children: "Edit material"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "button",
									variant: "outline",
									size: "sm",
									onClick: () => {
										setStep("design");
										setDrawer(false);
									},
									children: "Edit design"
								})
							]
						})
					]
				})
			}),
			materialOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "fixed inset-0 z-50 grid place-items-center bg-bg/70 p-4",
				role: "dialog",
				"aria-modal": "true",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "w-[min(560px,100%)] overflow-hidden rounded-3xl bg-stage text-stage-ink",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid aspect-[4/3] place-items-center bg-stage text-sm text-stage-muted",
						children: "Image being updated"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "p-5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "font-display text-4xl",
								children: leather.name
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-sm",
								children: leather.engrave
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-4 flex gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "button",
									onClick: () => setMaterialOpen(false),
									children: "Use this material"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "button",
									variant: "outline",
									onClick: () => setMaterialOpen(false),
									children: "Close"
								})]
							})
						]
					})]
				})
			})
		]
	});
}
function ReviewRow({ label, value, onEdit }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
		className: "flex items-center justify-between gap-3 rounded-xl bg-stage px-3 py-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "block text-xs text-stage-muted",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "font-medium",
			children: value
		})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			className: "text-sm font-semibold text-primary",
			onClick: onEdit,
			children: "Edit"
		})]
	});
}
function isFamily(value) {
	return value in FAMILIES;
}
function OrderPage() {
	const search = Route$2.useSearch();
	(0, import_react.useEffect)(() => {
		if (search.family && isFamily(search.family)) {
			useOrder.getState().setFamily(search.family);
			useOrder.getState().set("orderType", "hat");
		}
		if (search.type === "patch") useOrder.getState().set("orderType", "patch");
		if (search.type === "hat") useOrder.getState().set("orderType", "hat");
		if (search.color) useOrder.getState().set("colorway", search.color);
	}, [
		search.family,
		search.color,
		search.type
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Builder, { focus: search.color ? "material" : search.family ? "color" : void 0 });
}
//#endregion
export { OrderPage as component };
