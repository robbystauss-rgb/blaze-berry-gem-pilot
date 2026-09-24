import { i as __toESM } from "../_runtime.mjs";
import { B as require_react, x as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { w as cn } from "./router-ETEjALf_.mjs";
import { d as familyHero, h as stageViews, n as FAMILIES, p as getLeatherette } from "./stage-photos-BcL74VQI.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/hat-preview-7102pxhS.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var HEX = {
	white: "#F3EFE6",
	black: "#1A1816",
	navy: "#1A2744",
	"midnight navy": "#121A30",
	khaki: "#C6B48A",
	"pale khaki": "#D7C7A2",
	coffee: "#4C3428",
	charcoal: "#4A4C4F",
	"heather grey": "#A7ADB3",
	"light grey": "#C8CBCF",
	grey: "#8E9398",
	gray: "#8E9398",
	silver: "#C5C8CC",
	royal: "#2C4FA0",
	red: "#B31F24",
	cardinal: "#7A1E2C",
	maroon: "#6A2432",
	burgundy: "#6A2432",
	"dark green": "#2F4A32",
	loden: "#5C6848",
	"loden green": "#5C6848",
	"army olive": "#556246",
	kelly: "#1F7A45",
	"columbia blue": "#6BA3C8",
	"light blue": "#9EC4D8",
	"smoke blue": "#7E93A3",
	"dusty blue": "#7F98A8",
	"true blue": "#2A5F9E",
	"legion blue": "#3A5A7A",
	cyan: "#3AA0B8",
	"neon blue": "#3D8CFF",
	orange: "#D35A1F",
	"dark orange": "#B84412",
	"burnt orange": "#C45A22",
	"dk. orange": "#B84412",
	"amber gold": "#C8963A",
	gold: "#C4A04A",
	"vegas gold": "#C6B25A",
	"old gold": "#B39A4A",
	yellow: "#E2C84A",
	"neon yellow": "#D6E034",
	"neon green": "#7BE04A",
	"neon orange": "#FF6A1A",
	"neon pink": "#FF5AA5",
	"hot pink": "#E24B86",
	purple: "#5A3A8A",
	cream: "#E9DCC6",
	birch: "#DDD3C0",
	caramel: "#B07A45",
	brown: "#6A4632",
	"chocolate chip": "#5A3E30",
	"dark mocha": "#4A3228",
	"mink beige": "#C4B09A",
	biscuit: "#D2B48C",
	quarry: "#8A8680",
	"pale peach": "#E8C4B0",
	sage: "#8FA084",
	"sand dune": "#C8B898",
	"dusty red": "#A85A5A",
	aluminum: "#B8BCC0",
	blaze: "#FF5A1A",
	buck: "#A67C52",
	"light tan": "#D4C4A8",
	sandstone: "#C4B090",
	"ice grey": "#C5C9CC",
	"light brown": "#A07850",
	"light green": "#8FB56A",
	camo: "#5C6848",
	"green camo": "#4A5C3A",
	"desert camo": "#C4A878",
	"grey camo": "#6A7068",
	"digital camo": "#6A7A5A",
	"stars & stripes": "#2A3A6A",
	"black-white fade": "#6A6A6C",
	"navy-white fade": "#6A7A9A",
	"mossy oak": "#4A5638",
	"mossy oak bottomland": "#4A4028",
	"mossy oak country dna": "#5A4A32",
	"mossy oak dna": "#5A4A32",
	realtree: "#5A4A32",
	"realtree edge": "#5C4A32",
	"realtree original": "#4A5630",
	"realtree max-7": "#6A5A38",
	"realtree max-1 xt": "#6A5A38",
	"realtree timber": "#3A3A28",
	"realtree excape": "#4A4A32",
	"realtree advantage classic": "#5A6840",
	"realtree fishing light blue": "#7AA8C0",
	kryptek: "#4A4A3A",
	"kryptek highlander": "#6A5A38",
	"kryptek pontus": "#3A5A6A",
	"kryptek typhon": "#2A2A28",
	"kryptek inferno": "#8A3A1A",
	"kryptek neptune": "#2A4A5A",
	"bark duck camo": "#5A4028",
	"harvest duck camo": "#A07840",
	"marsh duck camo": "#5A6848",
	"saltwater duck camo": "#4A5A58",
	"blizzard duck camo": "#C8D0D4",
	"sable duck camo": "#2A2420",
	"blaze duck camo": "#E85A18",
	"admiral duck camo": "#2A3A48",
	"sienna duck camo": "#8A5A32",
	"mossy oak elements bonefish": "#C8C0B0",
	"mossy oak habitat": "#5A4A32",
	"mossy oak elements blacktip": "#3A3A38"
};
var KEYS = Object.keys(HEX).sort((a, b) => b.length - a.length);
function lookup(raw) {
	const n = raw.toLowerCase().trim();
	if (!n) return null;
	if (HEX[n]) return HEX[n];
	for (const key of KEYS) if (n.includes(key)) return HEX[key];
	return null;
}
function splitParts(name) {
	return name.split("/").map((p) => p.replace(/\[[^\]]*\]/g, "").trim()).filter(Boolean);
}
function parseColorway(name) {
	const parts = splitParts(name || "Black");
	const hexes = parts.map((p) => lookup(p) ?? "#6A5A4A");
	const front = hexes[0] ?? "#1A1816";
	const visor = hexes[1] ?? front;
	const mesh = hexes[2] ?? hexes[1] ?? darken(front, .18);
	const joined = name.toLowerCase();
	const isCamo = /camo|realtree|kryptek|mossy|duck|fade|stars/.test(joined);
	return {
		front,
		visor: hexes.length === 1 ? darken(front, .08) : visor,
		mesh: hexes.length === 1 ? darken(front, .22) : mesh,
		rope: lighten(front, .35),
		isCamo,
		parts
	};
}
function darken(hex, amt) {
	return mix(hex, "#000000", amt);
}
function lighten(hex, amt) {
	return mix(hex, "#ffffff", amt);
}
function mix(a, b, t) {
	const pa = toRgb(a);
	const pb = toRgb(b);
	const m = (i) => Math.round(pa[i] + (pb[i] - pa[i]) * t);
	return `rgb(${m(0)} ${m(1)} ${m(2)})`;
}
function toRgb(hex) {
	const h = hex.replace("#", "");
	if (h.length === 3) return [
		parseInt(h[0] + h[0], 16),
		parseInt(h[1] + h[1], 16),
		parseInt(h[2] + h[2], 16)
	];
	if (h.length >= 6 && hex.startsWith("#")) return [
		parseInt(h.slice(0, 2), 16),
		parseInt(h.slice(2, 4), 16),
		parseInt(h.slice(4, 6), 16)
	];
	const m = hex.match(/rgb\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
	if (m) return [
		Number(m[1]),
		Number(m[2]),
		Number(m[3])
	];
	return [
		80,
		60,
		50
	];
}
var SIZE_PCT = {
	small: 22,
	medium: 30,
	large: 38
};
var PLACE = {
	"front-center": {
		left: "50%",
		top: "44%"
	},
	"left-front": {
		left: "37%",
		top: "46%"
	},
	"right-front": {
		left: "63%",
		top: "46%"
	},
	side: {
		left: "62%",
		top: "44%"
	},
	rear: {
		left: "50%",
		top: "40%"
	}
};
var HOT = {
	"front-center": {
		left: "50%",
		top: "10%",
		label: "Center"
	},
	"left-front": {
		left: "10%",
		top: "42%",
		label: "Left"
	},
	"right-front": {
		left: "90%",
		top: "42%",
		label: "Right"
	},
	side: {
		left: "90%",
		top: "68%",
		label: "Side"
	},
	rear: {
		left: "10%",
		top: "68%",
		label: "Rear"
	}
};
function clipFor(shape) {
	switch (shape) {
		case "Circle": return "circle(50% at 50% 50%)";
		case "Oval": return "ellipse(46% 38% at 50% 50%)";
		case "Hexagon": return "polygon(25% 8%, 75% 8%, 96% 50%, 75% 92%, 25% 92%, 4% 50%)";
		case "Shield": return "polygon(12% 6%, 88% 6%, 88% 58%, 50% 96%, 12% 58%)";
		case "Custom Die-Cut": return "polygon(8% 28%, 28% 8%, 72% 6%, 94% 30%, 88% 68%, 70% 94%, 30% 96%, 8% 70%)";
		case "Rounded Rectangle": return "inset(6% round 22%)";
		default: return "inset(8%)";
	}
}
function patchOnView(placement, view) {
	if (view === "side") return placement === "side";
	if (view === "back") return placement === "rear";
	return placement === "front-center" || placement === "left-front" || placement === "right-front";
}
function HatPreview({ family, colorway, leatherette, shape, size, placement, patchText, artworkUrl, className, showCaption, patchOnly, placementMode, onPlacement }) {
	const colors = parseColorway(colorway || "Black");
	const leather = getLeatherette(leatherette);
	const named = colorway.trim();
	const matched = stageViews(family, named || "none");
	const hero = !named && !patchOnly ? familyHero(family) : null;
	const shots = hero ? {
		front: hero,
		side: null,
		back: null
	} : matched;
	const available = [
		"front",
		"side",
		"back"
	].filter((view) => shots[view]);
	const [view, setView] = (0, import_react.useState)("front");
	const [zoom, setZoom] = (0, import_react.useState)(false);
	const drag = (0, import_react.useRef)(null);
	const uid = (0, import_react.useId)().replace(/:/g, "");
	const active = available.includes(view) ? view : available[0] ?? "front";
	const src = shots[active];
	const showPatch = patchOnly || !src || patchOnView(placement, active);
	const viewKey = `${placement}|${shots.front ?? ""}|${shots.side ?? ""}|${shots.back ?? ""}`;
	(0, import_react.useEffect)(() => {
		if (placement === "side" && shots.side) setView("side");
		else if (placement === "rear" && shots.back) setView("back");
		else if (shots.front) setView("front");
	}, [
		viewKey,
		placement,
		shots.front,
		shots.side,
		shots.back
	]);
	function onPointerDown(event) {
		drag.current = { x: event.clientX };
	}
	function onPointerUp(event) {
		if (!drag.current || available.length < 2) return;
		const delta = event.clientX - drag.current.x;
		drag.current = null;
		if (Math.abs(delta) < 36) return;
		const index = available.indexOf(active);
		const next = available[index + (delta < 0 ? 1 : -1)];
		if (next) setView(next);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("relative h-full min-h-[46vh] lg:min-h-0", className),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative h-full min-h-[46vh] touch-pan-y lg:min-h-0",
				onPointerDown,
				onPointerUp,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "absolute inset-0 transition-transform duration-300 ease-out",
						style: { transform: zoom ? "scale(1.35)" : "scale(1)" },
						children: [patchOnly || !src ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "grid h-full place-items-center",
							children: patchOnly ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PatchCard, {
								leatherette,
								shape: shape === "Louisiana" ? "Rounded Rectangle" : shape,
								size,
								patchText,
								artworkUrl
							}, `${leatherette}-${shape}-${size}`) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HatSvg, {
								uid,
								silhouette: FAMILIES[family].silhouette,
								colors
							})
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src,
							alt: `${FAMILIES[family].label} ${named || "model"} ${active}`,
							className: "stage-in h-full w-full object-contain"
						}, src), !patchOnly && showPatch && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PatchOverlay, {
							leather,
							shape: shape === "Louisiana" ? "Rounded Rectangle" : shape,
							size,
							placement,
							patchText,
							artworkUrl
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "pointer-events-none absolute bottom-[14%] left-1/2 h-8 w-[46%] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse,rgba(44,33,30,0.16),transparent_70%)]" }),
					placementMode && onPlacement && !patchOnly && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "absolute inset-0 z-20",
						children: Object.keys(HOT).map((id) => {
							const blocked = size === "large" && (id === "side" || id === "rear");
							return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => onPlacement(id),
								className: cn("absolute min-h-11 -translate-x-1/2 -translate-y-1/2 rounded-full px-3 text-xs font-semibold", placement === id && !blocked ? "bg-primary text-primary-fg" : "bg-stage-photo/95 text-stage-ink ring-1 ring-stage-line", blocked && "opacity-50"),
								style: {
									left: HOT[id].left,
									top: HOT[id].top
								},
								children: HOT[id].label
							}, id);
						})
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "absolute bottom-2 left-2 z-30 flex gap-1",
				children: available.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => setView(item),
					className: cn("min-h-11 rounded-full px-3 text-xs font-semibold capitalize", active === item ? "bg-primary text-primary-fg" : "bg-stage-photo/90 text-stage-ink"),
					children: item
				}, item))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => setZoom((value) => !value),
				className: "absolute right-2 bottom-2 z-30 min-h-11 rounded-full bg-stage-photo/90 px-3 text-xs font-semibold text-stage-ink",
				children: zoom ? "Fit" : "Zoom"
			}),
			showCaption && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "pointer-events-none absolute top-3 right-4 left-4 z-10 text-center text-sm text-stage-muted",
				children: "Customization preview. Final engraving and placement are confirmed in your digital proof."
			})
		]
	});
}
function PatchOverlay({ leather, shape, size, placement, patchText, artworkUrl }) {
	const pct = SIZE_PCT[size];
	const pos = PLACE[placement];
	const frame = {
		width: `${pct}%`,
		aspectRatio: shape === "Oval" ? "1.45 / 1" : shape === "Circle" ? "1 / 1" : "1.35 / 1",
		left: pos.left,
		top: pos.top,
		transition: "left 220ms ease, top 220ms ease, width 220ms ease"
	};
	const face = {
		clipPath: clipFor(shape),
		backgroundColor: leather.hex,
		backgroundImage: leather.texture ? `linear-gradient(160deg, ${leather.hi} 0%, transparent 46%), url(${leather.texture})` : `linear-gradient(160deg, ${leather.hi} 0%, ${leather.hex} 55%, ${leather.lo} 100%)`,
		backgroundSize: "cover",
		color: leather.ink,
		boxShadow: "0 12px 22px rgba(44,33,30,0.32), inset 0 1px 0 rgba(255,255,255,0.4)",
		transition: "clip-path 220ms ease"
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2",
		style: frame,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "patch-pop flex h-full w-full items-center justify-center overflow-hidden px-1.5 text-center",
			style: face,
			children: artworkUrl && !artworkUrl.startsWith("data:application/pdf") ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: artworkUrl,
				alt: "",
				className: "relative z-10 max-h-[82%] max-w-[82%] object-contain",
				style: {
					filter: "grayscale(1) contrast(1.4)",
					mixBlendMode: "multiply"
				}
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "relative z-10 line-clamp-3 px-1 font-display text-[clamp(0.7rem,1.5vw,1.15rem)] leading-tight font-semibold tracking-wide",
				children: artworkUrl ? "PDF" : patchText.trim() || "Your patch"
			})
		}, `${leather.id}-${shape}-${size}`)
	});
}
function MiniHat({ family, colorway, className }) {
	const colors = parseColorway(colorway);
	const uid = (0, import_react.useId)().replace(/:/g, "");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("overflow-hidden bg-stage-photo", className),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HatSvg, {
			uid,
			silhouette: FAMILIES[family].silhouette,
			colors
		})
	});
}
function HatSvg({ uid, silhouette, colors }) {
	const mesh = silhouette === "trucker";
	const rope = silhouette === "gramps";
	const seams = silhouette === "seven" ? 6 : silhouette === "gramps" ? 4 : 3;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
		viewBox: "0 0 320 240",
		className: "h-full w-full",
		"aria-hidden": true,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("defs", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", {
					id: `crown-${uid}`,
					x1: "0",
					y1: "0",
					x2: "0",
					y2: "1",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
						offset: "0%",
						stopColor: colors.front
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
						offset: "100%",
						stopColor: colors.front,
						stopOpacity: "0.85"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", {
					id: `visor-${uid}`,
					x1: "0",
					y1: "0",
					x2: "0",
					y2: "1",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
						offset: "0%",
						stopColor: colors.visor
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
						offset: "100%",
						stopColor: colors.visor,
						stopOpacity: "0.75"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("pattern", {
					id: `mesh-${uid}`,
					width: "7",
					height: "7",
					patternUnits: "userSpaceOnUse",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
						cx: "3.5",
						cy: "3.5",
						r: "1.55",
						fill: colors.mesh,
						opacity: "0.55"
					})
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ellipse", {
				cx: "160",
				cy: "214",
				rx: "92",
				ry: "10",
				fill: "rgba(44,33,30,0.12)"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M58 168 C70 118, 100 72, 160 68 C220 72, 250 118, 262 168 C240 176, 80 176, 58 168 Z",
				fill: mesh ? colors.mesh : `url(#crown-${uid})`
			}),
			mesh && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M168 76 C230 82, 252 130, 258 166 C200 174, 176 150, 168 76 Z",
				fill: `url(#mesh-${uid})`
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M62 166 C78 108, 112 78, 160 74 C152 118, 120 150, 78 166 Z",
				fill: `url(#crown-${uid})`
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M160 74 C208 78, 242 108, 258 166 C216 150, 176 118, 160 74 Z",
				fill: colors.front,
				opacity: "0.92"
			}),
			Array.from({ length: seams }).map((_, i) => {
				const t = (i + 1) / (seams + 1);
				return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
					d: `M160 76 Q ${70 + t * 180} 120 ${58 + t * 204} 166`,
					fill: "none",
					stroke: "rgba(44,33,30,0.18)",
					strokeWidth: "1"
				}, i);
			}),
			rope && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M78 158 C120 148, 200 148, 242 158",
				fill: "none",
				stroke: colors.rope,
				strokeWidth: "4",
				strokeLinecap: "round"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ellipse", {
				cx: "160",
				cy: "74",
				rx: "9",
				ry: "5",
				fill: colors.visor
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
				d: "M52 168 C90 186, 230 186, 268 168 C250 198, 70 198, 52 168 Z",
				fill: `url(#visor-${uid})`
			})
		]
	});
}
function PatchCard({ leatherette, shape, size, patchText, artworkUrl, className }) {
	const leather = getLeatherette(leatherette);
	const safe = shape === "Louisiana" ? "Rounded Rectangle" : shape;
	const style = {
		clipPath: clipFor(safe),
		backgroundColor: leather.hex,
		backgroundImage: leather.texture ? `linear-gradient(160deg, ${leather.hi}, transparent 50%), url(${leather.texture})` : `linear-gradient(160deg, ${leather.hi}, ${leather.hex} 55%, ${leather.lo})`,
		backgroundSize: "cover",
		color: leather.ink,
		width: size === "small" ? 168 : size === "large" ? 300 : 230,
		aspectRatio: safe === "Oval" ? "1.45 / 1" : safe === "Circle" ? "1" : "1.35 / 1",
		boxShadow: "0 16px 30px rgba(44,33,30,0.16)"
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("grid place-items-center", className),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex items-center justify-center px-3 text-center",
			style,
			children: artworkUrl && !artworkUrl.startsWith("data:application/pdf") ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: artworkUrl,
				alt: "",
				className: "max-h-[78%] max-w-[78%] object-contain",
				style: {
					filter: "grayscale(1) contrast(1.35)",
					mixBlendMode: "multiply"
				}
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "font-display text-lg leading-tight font-semibold",
				children: artworkUrl ? "PDF artwork" : patchText.trim() || "Your patch"
			})
		})
	});
}
function ShapeMark({ shape, className, texture }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("block", texture ? "bg-stage-photo" : "bg-primary/80", className),
		style: {
			clipPath: clipFor(shape === "Louisiana" ? "Rounded Rectangle" : shape),
			aspectRatio: shape === "Circle" ? "1" : shape === "Oval" ? "1.4 / 1" : "1.3 / 1",
			backgroundImage: texture ? `url(${texture})` : void 0,
			backgroundSize: "cover"
		}
	});
}
//#endregion
export { parseColorway as i, MiniHat as n, ShapeMark as r, HatPreview as t };
