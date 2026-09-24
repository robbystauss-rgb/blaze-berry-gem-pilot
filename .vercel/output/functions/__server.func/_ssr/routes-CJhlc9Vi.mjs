import { i as __toESM } from "../_runtime.mjs";
import { B as require_react, x as require_jsx_runtime, y as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { C as buttonVariants, b as useStudio, l as drivePhoto } from "./router-ETEjALf_.mjs";
import { d as familyHero, f as galleryWork, n as FAMILIES, s as PRICING } from "./stage-photos-BcL74VQI.mjs";
import { n as useOrder } from "./order-store-CWXNCWnE.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-CJhlc9Vi.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var FEATURED = [
	{
		id: "112",
		kicker: "Classic mesh-back"
	},
	{
		id: "112P",
		kicker: "Printed trucker"
	},
	{
		id: "256",
		kicker: "Five-panel rope"
	},
	{
		id: "112PFP",
		kicker: "Camo five-panel"
	}
];
var FLOW = [
	"Hat",
	"Material",
	"Shape",
	"Design",
	"Proof",
	"Made"
];
function familyTo(id) {
	if (id === "112") return "/112";
	if (id === "168") return "/168";
	if (id === "256") return "/256";
	return "/printed-camo";
}
function Home() {
	const work = useStudio((state) => state.work);
	const photos = galleryWork(work);
	const [frame, setFrame] = (0, import_react.useState)(0);
	(0, import_react.useEffect)(() => {
		if (photos.length < 2) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		const id = window.setInterval(() => setFrame((value) => (value + 1) % Math.min(photos.length, 4)), 4800);
		return () => window.clearInterval(id);
	}, [photos.length]);
	const current = photos[frame] ?? photos[0];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "mx-auto grid w-[min(1240px,96vw)] items-center gap-6 py-6 lg:min-h-[calc(100dvh-8rem)] lg:grid-cols-[1fr_1.15fr] lg:py-8",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "px-2 lg:px-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs font-semibold tracking-[0.18em] text-accent uppercase",
						children: "Custom product studio"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", {
						className: "mt-3 font-display text-[clamp(3.2rem,6vw,5.4rem)] leading-[0.95] font-medium text-ink",
						children: [
							"Custom hats.",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
							"Built your way."
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-4 max-w-md text-lg leading-7 text-bark",
						children: "Choose the hat, material, shape and design. See your build come together before we make it."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-7 flex flex-wrap gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/order",
							search: { type: "hat" },
							onClick: () => useOrder.getState().set("orderType", "hat"),
							className: buttonVariants({ size: "lg" }),
							children: "Build your hat"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/order",
							search: { type: "patch" },
							onClick: () => useOrder.getState().set("orderType", "patch"),
							className: buttonVariants({
								variant: "outline",
								size: "lg"
							}),
							children: "Patch only"
						})]
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative grid min-h-[420px] place-items-center overflow-hidden rounded-[28px] bg-[radial-gradient(120%_80%_at_50%_18%,#fff_0%,#f3eee6_55%,#e7dfd3_100%)] shadow-stage lg:min-h-[560px]",
				children: [current ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: drivePhoto(current.item.driveId, 1400) ?? "",
					alt: "Finished REC Mama Made hat",
					className: "stage-in max-h-[78%] w-[86%] object-contain drop-shadow-[0_28px_40px_rgba(40,24,10,0.18)]"
				}, current.item.id) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-bark",
					children: "Work photos are loading."
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "absolute bottom-5 left-5 max-w-[220px] rounded-2xl bg-stage-photo/90 px-3 py-2 ring-1 ring-ink/10",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm font-semibold",
						children: "Latest finished work"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs text-bark",
						children: "Heat-adhesive patch. Proofed before it’s made."
					})]
				})]
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "mx-auto w-[min(1180px,94vw)] py-10",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-semibold tracking-[0.18em] text-accent uppercase",
					children: "How it works"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mt-2 font-display text-4xl text-ink",
					children: "Build it your way"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ol", {
					className: "mt-5 flex gap-2 overflow-x-auto",
					children: FLOW.map((step, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "min-w-28 rounded-2xl bg-stage-photo px-4 py-3 ring-1 ring-ink/10",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[11px] tracking-[0.12em] text-bark",
							children: String(index + 1).padStart(2, "0")
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-semibold",
							children: step
						})]
					}, step))
				})
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "mx-auto w-[min(1180px,94vw)] pb-10",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-end justify-between gap-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-semibold tracking-[0.18em] text-accent uppercase",
					children: "Catalog"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mt-2 font-display text-4xl text-ink",
					children: "Choose your hat"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/hats",
					className: "text-sm font-semibold",
					children: "All families"
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4",
				children: FEATURED.map(({ id, kicker }) => {
					const photo = familyHero(id);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: familyTo(id),
						className: "overflow-hidden rounded-[18px] bg-stage-photo ring-1 ring-ink/10",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid h-52 place-items-center bg-[radial-gradient(100%_80%_at_50%_20%,#fff,#efe8dc)]",
							children: photo && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
								src: photo,
								alt: "",
								className: "h-44 w-[86%] object-contain"
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "px-4 py-4",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-[11px] tracking-[0.14em] text-bark uppercase",
									children: kicker
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
									className: "text-lg font-semibold",
									children: [
										id,
										" ",
										FAMILIES[id].label
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-sm text-bark",
									children: ["From $", FAMILIES[id].tier === "premium" ? PRICING.premium : PRICING.standard]
								})
							]
						})]
					}, id);
				})
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "mx-auto w-[min(1180px,94vw)] pb-10",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-semibold tracking-[0.18em] text-accent uppercase",
					children: "Library"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mt-2 font-display text-4xl text-ink",
					children: "Real materials"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-4 max-w-xl text-sm leading-6 text-bark",
					children: "The material photos are in Studio for a visual check. They are not on the builder until you approve each one."
				})
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "mx-auto w-[min(1180px,94vw)] pb-10",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-end justify-between gap-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-semibold tracking-[0.18em] text-accent uppercase",
					children: "Portfolio"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mt-2 font-display text-4xl text-ink",
					children: "Latest builds"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/actual-work",
					className: "text-sm font-semibold",
					children: "Open the gallery"
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4",
				children: photos.slice(0, 4).map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
					to: "/actual-work",
					className: "overflow-hidden rounded-2xl bg-white ring-1 ring-ink/10",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						src: drivePhoto(entry.item.driveId, 800) ?? "",
						alt: "",
						className: "aspect-[4/5] w-full object-cover"
					})
				}, entry.item.id))
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "mx-auto w-[min(900px,94vw)] py-12 pb-20 text-center",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "font-display text-5xl text-ink",
				children: "Ready to build yours?"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
				to: "/order",
				search: { type: "hat" },
				className: `${buttonVariants({ size: "lg" })} mt-6`,
				children: "Start building"
			})]
		})
	] });
}
//#endregion
export { Home as component };
