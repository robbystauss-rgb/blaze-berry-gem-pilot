import { i as __toESM } from "../_runtime.mjs";
import { B as require_react, f as useBlocker, x as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as ChevronRight, i as ImageOff, o as ChevronLeft, s as Check } from "../_libs/lucide-react.mjs";
import { S as Button, _ as richardsonLabel, a as catalogIssues, b as useStudio, c as displayName, d as matchesFilter, f as matchesQuery, g as priceLabel, h as previewSummary, i as MASTER, l as drivePhoto, m as offeredLabel, o as colorDecision, p as modelCounts, r as FAMILIES, s as customerColorways, u as isDirty, v as stockLabel, x as workDecision, y as unitPrice } from "./router-ETEjALf_.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/studio-BY15xOSs.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var FILTERS = [
	{
		id: "all",
		label: "All"
	},
	{
		id: "offered",
		label: "Offered"
	},
	{
		id: "not-offered",
		label: "Not offered"
	},
	{
		id: "in-stock",
		label: "In stock"
	},
	{
		id: "out-of-stock",
		label: "Out of stock"
	},
	{
		id: "low-stock",
		label: "Low stock"
	},
	{
		id: "featured",
		label: "Featured"
	},
	{
		id: "legacy",
		label: "Legacy"
	},
	{
		id: "current",
		label: "Current"
	},
	{
		id: "needs-review",
		label: "Needs review"
	}
];
var MODEL_STATUSES = [
	{
		id: "not-offered",
		label: "Not offered"
	},
	{
		id: "active",
		label: "Active"
	},
	{
		id: "hidden",
		label: "Hidden"
	},
	{
		id: "assets-incomplete",
		label: "Assets incomplete"
	},
	{
		id: "discontinued",
		label: "Discontinued"
	}
];
var STOCKS = [
	{
		id: "unknown",
		label: "Stock unknown"
	},
	{
		id: "in-stock",
		label: "In stock"
	},
	{
		id: "low-stock",
		label: "Low stock"
	},
	{
		id: "out-of-stock",
		label: "Out of stock"
	}
];
function HatApproval() {
	const [open, setOpen] = (0, import_react.useState)({ "112": true });
	const [query, setQuery] = (0, import_react.useState)("");
	const [filter, setFilter] = (0, import_react.useState)("all");
	const [viewer, setViewer] = (0, import_react.useState)(null);
	const [stockDraft, setStockDraft] = (0, import_react.useState)("in-stock");
	const [priceDraft, setPriceDraft] = (0, import_react.useState)("0");
	const [statusNote, setStatusNote] = (0, import_react.useState)("");
	const modelStatus = useStudio((s) => s.modelStatus);
	const colors = useStudio((s) => s.colors);
	const selected = useStudio((s) => s.selected);
	const history = useStudio((s) => s.history);
	const undoStack = useStudio((s) => s.undoStack);
	const setModelStatus = useStudio((s) => s.setModelStatus);
	const setActivationOverride = useStudio((s) => s.setActivationOverride);
	const activationOverride = useStudio((s) => s.activationOverride);
	const patchColor = useStudio((s) => s.patchColor);
	const toggleSelected = useStudio((s) => s.toggleSelected);
	const setSelected = useStudio((s) => s.setSelected);
	const replaceSelection = useStudio((s) => s.replaceSelection);
	const applySelected = useStudio((s) => s.applySelected);
	const undo = useStudio((s) => s.undo);
	const needle = query.trim().toLowerCase();
	const filtering = needle.length > 0 || filter !== "all";
	const ready = MASTER.models.filter((model) => model.bucket === "ready");
	const incomplete = MASTER.models.filter((model) => model.bucket === "incomplete");
	const visibleByModel = (0, import_react.useMemo)(() => {
		const map = /* @__PURE__ */ new Map();
		for (const model of MASTER.models) {
			const status = modelStatus[model.id] ?? "not-offered";
			map.set(model.id, model.colorways.filter((color) => {
				const decision = colorDecision({ colors }, color.id);
				return matchesFilter(color, decision, filter) && matchesQuery(model, color, decision, status, needle);
			}));
		}
		return map;
	}, [
		colors,
		filter,
		modelStatus,
		needle
	]);
	const shownIds = (0, import_react.useMemo)(() => {
		return MASTER.models.flatMap((model) => {
			const list = visibleByModel.get(model.id) ?? [];
			return (filtering ? list.length > 0 : open[model.id] ?? false) ? list.map((color) => color.id) : [];
		});
	}, [
		filtering,
		open,
		visibleByModel
	]);
	const totalColors = MASTER.models.reduce((sum, model) => sum + model.colorways.length, 0);
	const selectedIds = Object.entries(selected).filter(([, on]) => on).map(([id]) => id);
	const selectedHidden = selectedIds.filter((id) => !shownIds.includes(id)).length;
	function selectModelVisible(modelId) {
		const model = MASTER.models.find((item) => item.id === modelId);
		if (!model) return;
		const visible = new Set((visibleByModel.get(modelId) ?? []).map((color) => color.id));
		const off = model.colorways.map((color) => color.id).filter((id) => !visible.has(id));
		setSelected(off, false);
		setSelected([...visible], true);
	}
	const viewerModel = MASTER.models.find((model) => model.id === viewer?.modelId) ?? null;
	const viewerList = viewerModel ? visibleByModel.get(viewerModel.id) ?? [] : [];
	const viewerColor = viewerList.find((color) => color.id === viewer?.colorId) ?? viewerModel?.colorways.find((color) => color.id === viewer?.colorId) ?? null;
	function selectVisible() {
		replaceSelection(shownIds);
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: selectedIds.length ? "space-y-6 pb-28" : "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "sticky top-16 z-20 -mx-1 space-y-3 bg-stage/95 px-1 py-3 backdrop-blur-md",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "sr-only",
							children: "Search colors"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							value: query,
							onChange: (event) => setQuery(event.target.value),
							placeholder: "Search color, display name, model, or status",
							className: "w-full rounded-2xl bg-stage-photo px-4 py-3 text-sm text-stage-ink shadow-stage ring-1 ring-stage-line"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "flex gap-2 overflow-x-auto pb-1",
						role: "tablist",
						"aria-label": "Color filters",
						children: FILTERS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							role: "tab",
							"aria-selected": filter === item.id,
							onClick: () => setFilter(item.id),
							className: `min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold ${filter === item.id ? "bg-primary text-primary-fg" : "bg-stage-photo text-stage-ink ring-1 ring-stage-line"}`,
							children: item.label
						}, item.id))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								type: "button",
								variant: "outline",
								size: "sm",
								className: "text-stage-ink",
								onClick: selectVisible,
								children: [
									"Select visible (",
									shownIds.length,
									")"
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "outline",
								size: "sm",
								className: "text-stage-ink",
								disabled: !undoStack.length,
								onClick: undo,
								children: "Undo"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-sm text-stage-muted",
								children: filtering ? `${shownIds.length} match. ${totalColors - shownIds.length} supplied colors are outside this filter and are not selected.` : `Select visible uses open models only. Closed models are not selected.`
							})
						]
					}),
					statusNote ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-stage-ink",
						children: statusNote
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
						className: "text-sm text-stage-muted",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", {
							className: "cursor-pointer font-semibold text-stage-ink",
							children: [
								"Session changes (",
								history.length,
								")"
							]
						}), history.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2",
							children: "No catalog changes yet."
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
							className: "mt-2 space-y-1",
							children: [history.slice(0, 12).map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: entry.text }, entry.id)), history.length > 12 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
								"And ",
								history.length - 12,
								" earlier changes."
							] }) : null]
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "space-y-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-3xl text-stage-ink",
						children: "Ready for visual approval"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "max-w-3xl text-sm leading-6 text-stage-muted",
						children: "Real front photos only. Nothing is offered until you say so. Richardson listing a color is not the same as REC Mama Made offering it."
					}),
					ready.map((model) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelBlock, {
						model,
						open: open[model.id] ?? false,
						filtering,
						visible: visibleByModel.get(model.id) ?? [],
						status: modelStatus[model.id] ?? "not-offered",
						override: Boolean(activationOverride[model.id]),
						colors,
						selected,
						onToggle: () => setOpen((current) => ({
							...current,
							[model.id]: !current[model.id]
						})),
						onStatus: (status) => {
							const result = setModelStatus(model.id, status);
							setStatusNote(result.ok ? "" : result.reason);
						},
						onOverride: (on) => setActivationOverride(model.id, on),
						onToggleSelected: toggleSelected,
						onSelectVisible: () => selectModelVisible(model.id),
						onSelectRest: (ids) => setSelected(ids, true),
						onClearModel: (ids) => setSelected(ids, false),
						onPatchColor: patchColor,
						onOpen: (colorId) => setViewer({
							modelId: model.id,
							colorId,
							view: "front"
						})
					}, model.id))
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "space-y-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-3xl text-stage-ink",
						children: "Assets incomplete"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "max-w-3xl text-sm leading-6 text-stage-muted",
						children: "Kept separate from the approval grid. Not customer-selectable unless you explicitly override that block. Nothing here is deleted."
					}),
					incomplete.map((model) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ModelBlock, {
						model,
						open: open[model.id] ?? false,
						filtering,
						visible: visibleByModel.get(model.id) ?? [],
						status: modelStatus[model.id] ?? "assets-incomplete",
						override: Boolean(activationOverride[model.id]),
						colors,
						selected,
						onToggle: () => setOpen((current) => ({
							...current,
							[model.id]: !current[model.id]
						})),
						onStatus: (status) => {
							const result = setModelStatus(model.id, status);
							setStatusNote(result.ok ? "" : result.reason);
						},
						onOverride: (on) => setActivationOverride(model.id, on),
						onToggleSelected: toggleSelected,
						onSelectVisible: () => selectModelVisible(model.id),
						onSelectRest: (ids) => setSelected(ids, true),
						onClearModel: (ids) => setSelected(ids, false),
						onPatchColor: patchColor,
						onOpen: (colorId) => setViewer({
							modelId: model.id,
							colorId,
							view: "front"
						})
					}, model.id))
				]
			}),
			selectedIds.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActionBar, {
				count: selectedIds.length,
				hiddenCount: selectedHidden,
				stockDraft,
				priceDraft,
				onStockDraft: setStockDraft,
				onPriceDraft: setPriceDraft,
				onOffer: () => applySelected(selectedIds, {
					offered: true,
					hidden: false
				}),
				onHide: () => applySelected(selectedIds, {
					offered: false,
					hidden: true
				}),
				onStock: () => applySelected(selectedIds, { stock: stockDraft }),
				onPrice: () => {
					const amount = Number(priceDraft);
					if (!Number.isFinite(amount)) return;
					applySelected(selectedIds, { priceAdjust: amount });
				},
				onFeature: () => applySelected(selectedIds, { featured: true }),
				onClear: () => replaceSelection([])
			}),
			viewer && viewerModel && viewerColor && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Viewer, {
				model: viewerModel,
				color: viewerColor,
				list: viewerList.length ? viewerList : [viewerColor],
				view: viewer.view,
				onView: (view) => setViewer({
					...viewer,
					view
				}),
				onColor: (colorId) => setViewer({
					...viewer,
					colorId,
					view: "front"
				}),
				onClose: () => setViewer(null)
			})
		]
	});
}
function ModelBlock({ model, open, filtering, visible, status, override, colors, selected, onToggle, onStatus, onOverride, onToggleSelected, onSelectVisible, onSelectRest, onClearModel, onPatchColor, onOpen }) {
	const shown = filtering ? visible.length > 0 : open;
	const counts = modelCounts(model, colors);
	const hiddenCount = model.colorways.length - visible.length;
	const blocked = model.bucket === "incomplete" && !override;
	const richardson = model.richardsonListed != null ? `${model.richardsonListed} Richardson current` : "Richardson count not checked";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "rounded-3xl bg-stage ring-1 ring-stage-line",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-start justify-between gap-4 p-4 md:p-5",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "min-w-0 text-left",
				onClick: onToggle,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
					className: "font-display text-3xl text-stage-ink",
					children: [
						"Richardson ",
						model.code,
						" — ",
						model.officialName
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-1 text-sm text-stage-muted",
					children: [
						model.suppliedCount,
						" supplied · ",
						richardson,
						" · ",
						counts.offered,
						" offered · ",
						counts.inStock,
						" in stock",
						filtering && visible.length === 0 ? " · No match" : ""
					]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "text-xs font-semibold tracking-wide text-stage-muted uppercase",
				children: [
					"Model status",
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
						value: status,
						onChange: (event) => onStatus(event.target.value),
						className: "mt-2 block min-h-11 rounded-full bg-stage-photo px-3 text-sm font-medium tracking-normal text-stage-ink normal-case ring-1 ring-stage-line",
						children: MODEL_STATUSES.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: item.id,
							disabled: item.id === "active" && blocked,
							children: item.label
						}, item.id))
					}),
					blocked ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "mt-2 block max-w-xs text-sm font-medium tracking-normal text-stage-ink normal-case",
						children: "Active is locked until the missing photos are added, or you open this model and override it."
					}) : null
				]
			})]
		}), shown && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "border-t border-stage-line px-4 py-4 md:px-5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "max-w-3xl text-sm leading-6 text-stage-muted",
					children: model.note
				}),
				blocked && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-stage-ink",
					children: "Customer activation is blocked. Fronts can be reviewed here. Active stays unavailable until the missing photos exist, or you override that rule."
				}),
				model.bucket === "incomplete" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "mt-3 flex min-h-11 items-center gap-2 text-sm text-stage-ink",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked: override,
						onChange: (event) => onOverride(event.target.checked)
					}), "Override and allow Active anyway"]
				}),
				visible.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 flex flex-wrap gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							type: "button",
							variant: "outline",
							size: "sm",
							className: "text-stage-ink",
							onClick: onSelectVisible,
							children: [
								"Select visible (",
								visible.length,
								")"
							]
						}),
						filtering && hiddenCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							type: "button",
							variant: "outline",
							size: "sm",
							className: "text-stage-ink",
							onClick: () => onSelectRest(model.colorways.map((color) => color.id)),
							children: [
								"Select entire model (",
								model.colorways.length,
								"), including ",
								hiddenCount,
								" hidden by this filter"
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "outline",
							size: "sm",
							className: "text-stage-ink",
							onClick: () => onClearModel(model.colorways.map((color) => color.id)),
							children: "Clear this model"
						})
					]
				}),
				visible.length === 0 ? model.heroDriveId && model.colorways.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 max-w-sm",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						src: drivePhoto(model.heroDriveId, 640) ?? "",
						alt: `${model.code} product photo`,
						className: "h-64 w-full rounded-2xl bg-stage-photo object-contain shadow-stage"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-sm text-stage-muted",
						children: "One product photo. No color library, so nothing here can be offered."
					})]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-4 text-sm text-stage-muted",
					children: filtering ? "No supplied color matches this filter." : "No supplied color photos for this model."
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3",
					children: visible.map((color) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ColorCard, {
						model,
						color,
						decision: colorDecision({ colors }, color.id),
						picked: Boolean(selected[color.id]),
						onToggleSelected: () => onToggleSelected(color.id),
						onPatch: (patch) => onPatchColor(color.id, patch),
						onOpen: () => onOpen(color.id)
					}, color.id))
				})
			]
		})]
	});
}
function ColorCard({ model, color, decision, picked, onToggleSelected, onPatch, onOpen }) {
	const src = drivePhoto(color.views.front, 640);
	const partial = !color.views.side || !color.views.back;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: `flex flex-col rounded-2xl bg-stage-photo p-3 shadow-stage ring-1 ${picked ? "ring-primary" : "ring-stage-line"}`,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "flex min-h-11 items-center gap-2 text-sm font-medium text-stage-ink",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						type: "checkbox",
						className: "size-5",
						checked: picked,
						onChange: onToggleSelected
					}), "Select"]
				}), decision.featured ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-xs font-semibold text-primary",
					children: "Featured"
				}) : null]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: "mt-1 overflow-hidden rounded-xl bg-stage-photo",
				onClick: onOpen,
				children: src ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src,
					alt: `${color.officialName} front`,
					loading: "lazy",
					className: "h-72 w-full object-contain"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "grid h-72 place-items-center text-sm text-stage-muted",
					children: "No front photo"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
				className: "mt-3 text-lg font-semibold text-stage-ink",
				children: color.officialName
			}),
			color.notes ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-sm leading-5 text-stage-muted",
				children: color.notes
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
				className: "mt-2 space-y-1 text-sm text-stage-ink",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
							className: "text-stage-muted",
							children: "Richardson"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: richardsonLabel(color.richardsonStatus) })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
							className: "text-stage-muted",
							children: "REC Mama Made"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: offeredLabel(decision) })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
							className: "text-stage-muted",
							children: "Stock"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: stockLabel(decision.stock) })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
							className: "text-stage-muted",
							children: "Price"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: priceLabel(model, decision) })]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-2 flex flex-wrap gap-2 text-xs text-stage-muted",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ViewMark, {
						ok: Boolean(color.views.front),
						label: "Front"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ViewMark, {
						ok: Boolean(color.views.side),
						label: "Side"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ViewMark, {
						ok: Boolean(color.views.back),
						label: "Back"
					}),
					partial ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Front only" }) : null
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				type: "button",
				size: "sm",
				variant: decision.offered && !decision.hidden ? "outline" : "primary",
				className: `mt-3 ${decision.offered && !decision.hidden ? "text-stage-ink" : ""}`,
				onClick: () => onPatch(decision.offered && !decision.hidden ? { offered: false } : {
					offered: true,
					hidden: false
				}),
				children: decision.offered && !decision.hidden ? "Offered" : "Offer in store"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
				className: "mt-3 text-sm text-stage-muted",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", {
					className: "cursor-pointer font-semibold text-stage-ink",
					children: "Details"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3 grid gap-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["Store display name", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							defaultValue: decision.displayName,
							placeholder: color.officialName,
							onBlur: (event) => {
								if (event.target.value !== decision.displayName) onPatch({ displayName: event.target.value });
							},
							className: "mt-1 w-full rounded-xl bg-stage-photo px-3 py-2 text-sm text-stage-ink ring-1 ring-stage-line"
						}, decision.displayName)] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
							"Customers see ",
							displayName(color, decision),
							" unless you type a shorter name."
						] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["Stock", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
							value: decision.stock,
							onChange: (event) => onPatch({ stock: event.target.value }),
							className: "mt-1 block min-h-11 w-full rounded-xl bg-stage-photo px-3 text-sm text-stage-ink ring-1 ring-stage-line",
							children: STOCKS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: item.id,
								children: item.label
							}, item.id))
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["Upcharge $", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							defaultValue: String(decision.priceAdjust),
							inputMode: "decimal",
							onBlur: (event) => {
								const amount = Number(event.target.value);
								if (Number.isFinite(amount) && amount !== decision.priceAdjust) onPatch({ priceAdjust: amount });
							},
							className: "mt-1 w-full rounded-xl bg-stage-photo px-3 py-2 text-sm text-stage-ink ring-1 ring-stage-line"
						}, decision.priceAdjust)] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "flex min-h-11 items-center gap-2 text-stage-ink",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: decision.featured,
								onChange: (event) => onPatch({ featured: event.target.checked })
							}), "Featured"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["Sort", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							defaultValue: decision.sortOrder ?? "",
							inputMode: "numeric",
							onBlur: (event) => {
								const raw = event.target.value.trim();
								const next = raw === "" ? null : Number(raw);
								if (next !== null && !Number.isFinite(next)) return;
								if (next !== decision.sortOrder) onPatch({ sortOrder: next });
							},
							className: "mt-1 w-24 rounded-xl bg-stage-photo px-3 py-2 text-sm text-stage-ink ring-1 ring-stage-line"
						}, decision.sortOrder ?? "none")] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
							color.assetStatus === "complete" ? "Complete photo set." : color.assetStatus === "partial" ? "Partial photo set." : "No photos.",
							" Base $",
							model.defaultPrice,
							". Unit $",
							unitPrice(model, decision),
							"."
						] })
					]
				})]
			})
		]
	});
}
function ViewMark({ ok, label }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "inline-flex items-center gap-1",
		children: [ok ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-3.5 text-primary" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ImageOff, { className: "size-3.5" }), label]
	});
}
function ActionBar({ count, hiddenCount, stockDraft, priceDraft, onStockDraft, onPriceDraft, onOffer, onHide, onStock, onPrice, onFeature, onClear }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-x-0 bottom-0 z-30 border-t border-stage-line bg-stage/95 px-4 py-3 backdrop-blur-md",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto flex w-[min(1180px,100%)] flex-wrap items-center gap-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "text-sm font-semibold text-stage-ink",
					children: [
						count,
						" selected",
						hiddenCount > 0 ? ` · ${hiddenCount} not in the current filter` : ""
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					size: "sm",
					onClick: onOffer,
					children: "Offer selected"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					size: "sm",
					variant: "outline",
					className: "text-stage-ink",
					onClick: onHide,
					children: "Hide selected"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
					value: stockDraft,
					onChange: (event) => onStockDraft(event.target.value),
					"aria-label": "Stock for selected hats",
					className: "min-h-11 rounded-full bg-stage-photo px-3 text-sm text-stage-ink ring-1 ring-stage-line",
					children: STOCKS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
						value: item.id,
						children: item.label
					}, item.id))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					size: "sm",
					variant: "outline",
					className: "text-stage-ink",
					onClick: onStock,
					children: "Set stock"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					value: priceDraft,
					onChange: (event) => onPriceDraft(event.target.value),
					inputMode: "decimal",
					"aria-label": "Upcharge for selected hats",
					className: "min-h-11 w-20 rounded-full bg-stage-photo px-3 text-sm text-stage-ink ring-1 ring-stage-line"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					size: "sm",
					variant: "outline",
					className: "text-stage-ink",
					onClick: onPrice,
					children: "Set price"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					size: "sm",
					variant: "outline",
					className: "text-stage-ink",
					onClick: onFeature,
					children: "Set featured"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					size: "sm",
					variant: "outline",
					className: "text-stage-ink",
					onClick: onClear,
					children: "Clear selection"
				})
			]
		})
	});
}
function Viewer({ model, color, list, view, onView, onColor, onClose }) {
	const index = Math.max(0, list.findIndex((item) => item.id === color.id));
	const src = drivePhoto(color.views[view], 1200);
	(0, import_react.useEffect)(() => {
		function onKey(event) {
			if (event.key === "Escape") onClose();
			if (event.key === "ArrowRight" && index < list.length - 1) onColor(list[index + 1].id);
			if (event.key === "ArrowLeft" && index > 0) onColor(list[index - 1].id);
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [
		index,
		list,
		onClose,
		onColor
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-50 grid place-items-center bg-bg/80 p-3",
		role: "dialog",
		"aria-modal": "true",
		"aria-label": `${color.officialName} photos`,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "max-h-[94dvh] w-[min(980px,100%)] overflow-auto rounded-3xl bg-stage p-4 text-stage-ink",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-start justify-between gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-xs font-semibold tracking-[0.14em] text-primary uppercase",
							children: [
								"Richardson ",
								model.code,
								" — ",
								model.officialName
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "font-display text-4xl",
							children: color.officialName
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-sm text-stage-muted",
							children: [
								index + 1,
								" of ",
								list.length
							]
						})
					] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "outline",
						size: "sm",
						className: "text-stage-ink",
						onClick: onClose,
						children: "Close"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 grid gap-3 md:grid-cols-[1fr_9rem]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "rounded-2xl bg-stage-photo shadow-stage",
						children: src ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src,
							alt: `${color.officialName} ${view}`,
							className: "max-h-[62dvh] w-full object-contain"
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "grid h-64 place-items-center text-sm text-stage-muted",
							children: [
								"No ",
								view,
								" photo supplied."
							]
						})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid grid-cols-3 gap-2 md:grid-cols-1",
						children: [
							"front",
							"side",
							"back"
						].map((item) => {
							const thumb = drivePhoto(color.views[item], 320);
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								disabled: !color.views[item],
								onClick: () => onView(item),
								className: `overflow-hidden rounded-xl bg-stage-photo ring-2 ${view === item ? "ring-primary" : "ring-stage-line"}`,
								children: [thumb ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
									src: thumb,
									alt: "",
									className: "h-24 w-full object-contain"
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "grid h-24 place-items-center text-xs text-stage-muted",
									children: ["No ", item]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "block pb-1 text-xs font-semibold capitalize",
									children: item
								})]
							}, item);
						})
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 flex flex-wrap justify-between gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						type: "button",
						variant: "outline",
						className: "text-stage-ink",
						disabled: index <= 0,
						onClick: () => onColor(list[index - 1].id),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronLeft, { className: "size-4" }), " Previous color"]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						type: "button",
						variant: "outline",
						className: "text-stage-ink",
						disabled: index >= list.length - 1,
						onClick: () => onColor(list[index + 1].id),
						children: ["Next color ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, { className: "size-4" })]
					})]
				})
			]
		})
	});
}
function StorePreview() {
	const modelStatus = useStudio((s) => s.modelStatus);
	const colors = useStudio((s) => s.colors);
	const activationOverride = useStudio((s) => s.activationOverride);
	const snapshot = useStudio((s) => s.snapshot);
	const saveSnapshot = useStudio((s) => s.saveSnapshot);
	const [result, setResult] = (0, import_react.useState)(null);
	const [openId, setOpenId] = (0, import_react.useState)(null);
	const [view, setView] = (0, import_react.useState)("front");
	const issues = catalogIssues({
		modelStatus,
		colors,
		activationOverride
	});
	const summary = previewSummary({
		modelStatus,
		colors
	});
	const state = {
		modelStatus,
		colors
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-8",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "rounded-3xl bg-stage-photo p-5 shadow-stage ring-1 ring-stage-line",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-semibold tracking-[0.18em] text-primary uppercase",
					children: "Preview only — not live"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mt-2 font-display text-4xl text-stage-ink",
					children: "Private store preview"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-3 text-sm font-semibold text-stage-ink",
					children: [
						summary.active,
						" ",
						summary.active === 1 ? "model" : "models",
						" active · ",
						summary.offered,
						" colorways offered · ",
						summary.inStock,
						" in stock · ",
						summary.outStock,
						" out of stock"
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 max-w-3xl text-sm leading-6 text-stage-muted",
					children: "This is the customer catalog from your current Studio selections: family, model, color, front / side / back, and price. It is private. The public builder is still the old catalog."
				}),
				issues.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-4 space-y-2 text-sm text-stage-ink",
					children: issues.map((issue) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
						className: "rounded-xl bg-primary/10 px-3 py-2",
						children: issue
					}, issue))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5 flex flex-wrap items-center gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						onClick: () => {
							const outcome = saveSnapshot();
							setResult(outcome.ok ? [] : outcome.issues);
						},
						children: "Save catalog snapshot"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "outline",
						className: "text-stage-ink",
						disabled: true,
						children: "Publish to live shop"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 max-w-3xl text-sm leading-6 text-stage-muted",
					children: "Those are different actions. Save catalog snapshot keeps a private copy here. Publish to live shop is not connected, and it will not replace the current builder."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-stage-muted",
					children: snapshot ? `Last snapshot ${new Date(snapshot.at).toLocaleString()}.` : "No snapshot saved yet."
				}),
				result && result.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 text-sm text-stage-ink",
					children: "Snapshot saved in Studio only. The live shop was not changed."
				}),
				result && result.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 text-sm text-stage-ink",
					children: "Snapshot blocked until the issues above are fixed."
				})
			]
		}), FAMILIES.map((family) => {
			const models = family.modelIds.map((id) => MASTER.models.find((model) => model.id === id)).filter((model) => Boolean(model));
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "space-y-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "font-display text-3xl text-stage-ink",
					children: family.name
				}), models.map((model) => {
					const offered = customerColorways(model, state);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-3xl bg-stage p-4 ring-1 ring-stage-line md:p-5",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-xs font-semibold tracking-[0.16em] text-primary uppercase",
								children: ["Richardson ", model.code]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h4", {
								className: "font-display text-4xl text-stage-ink",
								children: model.officialName
							}),
							offered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-3 text-sm text-stage-muted",
								children: "Nothing in this model would appear. It has to be Active, with at least one offered color and a front photo."
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3",
								children: offered.map(({ color, decision }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CustomerCard, {
									model,
									color,
									decision,
									open: openId === color.id,
									view: openId === color.id ? view : "front",
									onOpen: () => {
										setOpenId(color.id);
										setView("front");
									},
									onView: setView
								}, color.id))
							})
						]
					}, model.id);
				})]
			}, family.id);
		})]
	});
}
function CustomerCard({ model, color, decision, open, view, onOpen, onView }) {
	const current = open ? view : "front";
	const src = drivePhoto(color.views[current], 800);
	const name = displayName(color, decision);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "rounded-2xl bg-stage-photo p-3 shadow-stage ring-1 ring-stage-line",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: "w-full overflow-hidden rounded-xl bg-stage-photo",
				onClick: onOpen,
				children: src && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src,
					alt: `${name} ${current}`,
					className: "h-64 w-full object-contain"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h5", {
				className: "mt-3 text-lg font-semibold text-stage-ink",
				children: name
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-stage-ink",
				children: priceLabel(model, decision)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-sm text-stage-muted",
				children: stockLabel(decision.stock)
			}),
			open && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3 flex gap-2",
				children: [
					"front",
					"side",
					"back"
				].map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					size: "sm",
					variant: current === item ? "primary" : "outline",
					className: current === item ? void 0 : "text-stage-ink",
					disabled: !color.views[item],
					onClick: () => onView(item),
					children: item
				}, item))
			})
		]
	});
}
var material_review_default = /*#__PURE__*/ JSON.parse("[{\"id\":\"r0c0\",\"row\":0,\"col\":0,\"swatch\":\"/materials/review/r0c0.webp\",\"detail\":\"/materials/review/r0c0-detail.webp\",\"box\":[34,40,148,200],\"mean\":[237.2,239.3,240.8],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r0c1\",\"row\":0,\"col\":1,\"swatch\":\"/materials/review/r0c1.webp\",\"detail\":\"/materials/review/r0c1-detail.webp\",\"box\":[186,40,297,200],\"mean\":[251.9,52.6,175.5],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r0c2\",\"row\":0,\"col\":2,\"swatch\":\"/materials/review/r0c2.webp\",\"detail\":\"/materials/review/r0c2-detail.webp\",\"box\":[334,40,446,200],\"mean\":[135.0,114.4,229.5],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r0c3\",\"row\":0,\"col\":3,\"swatch\":\"/materials/review/r0c3.webp\",\"detail\":\"/materials/review/r0c3-detail.webp\",\"box\":[483,40,594,200],\"mean\":[121.3,229.7,242.8],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r0c4\",\"row\":0,\"col\":4,\"swatch\":\"/materials/review/r0c4.webp\",\"detail\":\"/materials/review/r0c4-detail.webp\",\"box\":[633,40,743,200],\"mean\":[96.0,105.9,82.4],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r0c5\",\"row\":0,\"col\":5,\"swatch\":\"/materials/review/r0c5.webp\",\"detail\":\"/materials/review/r0c5-detail.webp\",\"box\":[781,40,891,200],\"mean\":[209.3,157.7,109.1],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r0c6\",\"row\":0,\"col\":6,\"swatch\":\"/materials/review/r0c6.webp\",\"detail\":\"/materials/review/r0c6-detail.webp\",\"box\":[929,40,1040,200],\"mean\":[212.8,141.8,96.0],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r0c7\",\"row\":0,\"col\":7,\"swatch\":\"/materials/review/r0c7.webp\",\"detail\":\"/materials/review/r0c7-detail.webp\",\"box\":[1079,40,1190,200],\"mean\":[137.4,95.6,82.6],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r0c8\",\"row\":0,\"col\":8,\"swatch\":\"/materials/review/r0c8.webp\",\"detail\":\"/materials/review/r0c8-detail.webp\",\"box\":[1228,40,1338,200],\"mean\":[110.9,84.5,76.4],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r0c9\",\"row\":0,\"col\":9,\"swatch\":\"/materials/review/r0c9.webp\",\"detail\":\"/materials/review/r0c9-detail.webp\",\"box\":[1375,40,1485,200],\"mean\":[58.6,51.9,52.2],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r0c10\",\"row\":0,\"col\":10,\"swatch\":\"/materials/review/r0c10.webp\",\"detail\":\"/materials/review/r0c10-detail.webp\",\"box\":[1524,40,1637,200],\"mean\":[45.4,46.9,50.9],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r1c0\",\"row\":1,\"col\":0,\"swatch\":\"/materials/review/r1c0.webp\",\"detail\":\"/materials/review/r1c0-detail.webp\",\"box\":[34,350,148,500],\"mean\":[204.0,181.0,183.6],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r1c1\",\"row\":1,\"col\":1,\"swatch\":\"/materials/review/r1c1.webp\",\"detail\":\"/materials/review/r1c1-detail.webp\",\"box\":[186,350,297,500],\"mean\":[200.6,180.9,184.0],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r1c2\",\"row\":1,\"col\":2,\"swatch\":\"/materials/review/r1c2.webp\",\"detail\":\"/materials/review/r1c2-detail.webp\",\"box\":[334,350,446,500],\"mean\":[191.6,191.7,189.2],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r1c3\",\"row\":1,\"col\":3,\"swatch\":\"/materials/review/r1c3.webp\",\"detail\":\"/materials/review/r1c3-detail.webp\",\"box\":[483,350,594,500],\"mean\":[131.8,154.8,165.5],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r1c4\",\"row\":1,\"col\":4,\"swatch\":\"/materials/review/r1c4.webp\",\"detail\":\"/materials/review/r1c4-detail.webp\",\"box\":[633,350,743,500],\"mean\":[173.5,147.4,121.9],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r1c5\",\"row\":1,\"col\":5,\"swatch\":\"/materials/review/r1c5.webp\",\"detail\":\"/materials/review/r1c5-detail.webp\",\"box\":[781,350,891,500],\"mean\":[152.5,128.7,122.6],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r1c6\",\"row\":1,\"col\":6,\"swatch\":\"/materials/review/r1c6.webp\",\"detail\":\"/materials/review/r1c6-detail.webp\",\"box\":[929,350,1040,500],\"mean\":[140.7,143.2,149.2],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r1c7\",\"row\":1,\"col\":7,\"swatch\":\"/materials/review/r1c7.webp\",\"detail\":\"/materials/review/r1c7-detail.webp\",\"box\":[1079,350,1190,500],\"mean\":[153.2,124.5,118.7],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r1c8\",\"row\":1,\"col\":8,\"swatch\":\"/materials/review/r1c8.webp\",\"detail\":\"/materials/review/r1c8-detail.webp\",\"box\":[1228,350,1338,500],\"mean\":[158.5,136.1,139.1],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r1c9\",\"row\":1,\"col\":9,\"swatch\":\"/materials/review/r1c9.webp\",\"detail\":\"/materials/review/r1c9-detail.webp\",\"box\":[1375,350,1485,500],\"mean\":[144.5,137.5,155.3],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r1c10\",\"row\":1,\"col\":10,\"swatch\":\"/materials/review/r1c10.webp\",\"detail\":\"/materials/review/r1c10-detail.webp\",\"box\":[1524,350,1637,500],\"mean\":[49.3,51.4,56.7],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r2c0\",\"row\":2,\"col\":0,\"swatch\":\"/materials/review/r2c0.webp\",\"detail\":\"/materials/review/r2c0-detail.webp\",\"box\":[34,655,148,810],\"mean\":[233.3,234.4,236.7],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r2c1\",\"row\":2,\"col\":1,\"swatch\":\"/materials/review/r2c1.webp\",\"detail\":\"/materials/review/r2c1-detail.webp\",\"box\":[186,655,297,810],\"mean\":[214.1,157.9,109.7],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r2c2\",\"row\":2,\"col\":2,\"swatch\":\"/materials/review/r2c2.webp\",\"detail\":\"/materials/review/r2c2-detail.webp\",\"box\":[334,655,446,810],\"mean\":[174.7,173.8,178.8],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r2c3\",\"row\":2,\"col\":3,\"swatch\":\"/materials/review/r2c3.webp\",\"detail\":\"/materials/review/r2c3-detail.webp\",\"box\":[483,655,594,810],\"mean\":[119.9,105.8,98.8],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r2c4\",\"row\":2,\"col\":4,\"swatch\":\"/materials/review/r2c4.webp\",\"detail\":\"/materials/review/r2c4-detail.webp\",\"box\":[633,655,743,810],\"mean\":[40.2,42.3,46.6],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r2c5\",\"row\":2,\"col\":5,\"swatch\":\"/materials/review/r2c5.webp\",\"detail\":\"/materials/review/r2c5-detail.webp\",\"box\":[781,655,891,810],\"mean\":[32.0,32.1,32.6],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r2c6\",\"row\":2,\"col\":6,\"swatch\":\"/materials/review/r2c6.webp\",\"detail\":\"/materials/review/r2c6-detail.webp\",\"box\":[929,655,1040,810],\"mean\":[131.3,208.6,228.7],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r2c7\",\"row\":2,\"col\":7,\"swatch\":\"/materials/review/r2c7.webp\",\"detail\":\"/materials/review/r2c7-detail.webp\",\"box\":[1079,655,1190,810],\"mean\":[186.9,189.4,192.6],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r2c8\",\"row\":2,\"col\":8,\"swatch\":\"/materials/review/r2c8.webp\",\"detail\":\"/materials/review/r2c8-detail.webp\",\"box\":[1228,655,1338,810],\"mean\":[198.5,200.1,202.0],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r2c9\",\"row\":2,\"col\":9,\"swatch\":\"/materials/review/r2c9.webp\",\"detail\":\"/materials/review/r2c9-detail.webp\",\"box\":[1375,655,1485,810],\"mean\":[217.7,184.0,107.5],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"},{\"id\":\"r2c10\",\"row\":2,\"col\":10,\"swatch\":\"/materials/review/r2c10.webp\",\"detail\":\"/materials/review/r2c10-detail.webp\",\"box\":[1524,655,1637,810],\"mean\":[95.7,163.7,201.1],\"status\":\"needs-review\",\"name\":\"\",\"engrave\":\"\",\"category\":\"\",\"source\":\"My leatherette options.PNG\",\"sourceFileId\":\"15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74\"}]");
var SOURCE = "/materials/review/source.png";
var SOURCE_W = 1672;
var SOURCE_H = 941;
var STORAGE = "recmama-material-approval-v1";
function MaterialApproval() {
	const [decision, setDecision] = (0, import_react.useState)({});
	(0, import_react.useEffect)(() => {
		try {
			const raw = localStorage.getItem(STORAGE);
			if (raw) setDecision(JSON.parse(raw));
		} catch {}
	}, []);
	function setStatus(id, status) {
		setDecision((current) => {
			const next = {
				...current,
				[id]: status
			};
			localStorage.setItem(STORAGE, JSON.stringify(next));
			return next;
		});
	}
	const counts = (0, import_react.useMemo)(() => {
		const approved = material_review_default.filter((item) => decision[item.id] === "approve").length;
		const fix = material_review_default.filter((item) => decision[item.id] === "needs-fix").length;
		return {
			approved,
			fix,
			waiting: material_review_default.length - approved - fix
		};
	}, [decision]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-xs font-semibold tracking-[0.16em] text-stage-muted uppercase",
			children: "Studio · Materials · Visual approval"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
			className: "mt-2 font-display text-4xl text-stage-ink",
			children: "Approved source, not the builder"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-3 max-w-3xl text-sm leading-6 text-stage-muted",
			children: "Every swatch below was cropped from My leatherette options.PNG only. Names and engraving lines were not guessed. Nothing here is on the customer picker until you approve it."
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: "mt-3 text-sm text-stage-ink",
			children: [
				material_review_default.length,
				" crops · ",
				counts.waiting,
				" waiting · ",
				counts.approved,
				" approved · ",
				counts.fix,
				" need a fix"
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", {
			className: "mt-6 overflow-hidden rounded-3xl bg-white ring-1 ring-stage-line",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: SOURCE,
				alt: "My leatherette options, the approved source sheet",
				className: "w-full"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("figcaption", {
				className: "px-4 py-3 text-sm text-stage-muted",
				children: "Source file My leatherette options.PNG. The sheet on the left of each card is this same file, cropped to that cell. The square on the right is the customer swatch."
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-6 grid gap-4 lg:grid-cols-2",
			children: material_review_default.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MaterialCard, {
				item,
				status: decision[item.id] ?? "needs-review",
				onStatus: setStatus
			}, item.id))
		})
	] });
}
function MaterialCard({ item, status, onStatus }) {
	const [x0, y0, x1, y1] = item.box;
	const cw = x1 - x0;
	const ch = y1 - y0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: "rounded-3xl bg-white p-3 ring-1 ring-stage-line",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "relative aspect-square overflow-hidden rounded-2xl bg-[#f4f1ec]",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
						src: SOURCE,
						alt: "",
						className: "absolute max-w-none",
						style: {
							width: `${SOURCE_W / cw * 100}%`,
							height: `${SOURCE_H / ch * 100}%`,
							left: `${-x0 / cw * 100}%`,
							top: `${-y0 / ch * 100}%`
						}
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("figcaption", {
					className: "mt-2 text-xs font-semibold tracking-wide text-stage-muted uppercase",
					children: "Source crop"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: item.swatch,
					alt: "",
					className: "aspect-square w-full rounded-2xl object-cover"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("figcaption", {
					className: "mt-2 text-xs font-semibold tracking-wide text-stage-muted uppercase",
					children: "Customer swatch"
				})] })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 flex items-start justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "font-semibold text-stage-ink",
					children: [
						"Row ",
						item.row + 1,
						", column ",
						item.col + 1
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-stage-muted",
					children: "Name not assigned. Engraving not assigned."
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "shrink-0 text-xs font-semibold tracking-wide text-stage-muted uppercase",
					children: status === "approve" ? "Approved" : status === "needs-fix" ? "Needs fix" : "Needs review"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 flex gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => onStatus(item.id, "approve"),
					className: `min-h-11 flex-1 rounded-full text-sm font-semibold ${status === "approve" ? "bg-primary text-primary-fg" : "bg-stage text-stage-ink ring-1 ring-stage-line"}`,
					children: "Approve"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => onStatus(item.id, "needs-fix"),
					className: `min-h-11 flex-1 rounded-full text-sm font-semibold ${status === "needs-fix" ? "bg-primary text-primary-fg" : "bg-stage text-stage-ink ring-1 ring-stage-line"}`,
					children: "Needs fix"
				})]
			})
		]
	});
}
var MATERIALS = [
	{
		id: "",
		label: "Not set"
	},
	{
		id: "tan",
		label: "Tan"
	},
	{
		id: "cognac",
		label: "Cognac"
	},
	{
		id: "dark-brown",
		label: "Dark brown"
	},
	{
		id: "black",
		label: "Black"
	},
	{
		id: "cream",
		label: "Cream"
	},
	{
		id: "rose-gold",
		label: "Rose gold"
	}
];
var SHAPES = [
	"",
	"Rectangle",
	"Rounded Rectangle",
	"Circle",
	"Oval",
	"Hexagon",
	"Shield",
	"Custom Die-Cut"
];
function WorkLibrary() {
	const work = useStudio((s) => s.work);
	const patchWork = useStudio((s) => s.patchWork);
	const [active, setActive] = (0, import_react.useState)(MASTER.work[0]?.id ?? "");
	const photo = MASTER.work.find((item) => item.id === active) ?? MASTER.work[0];
	const decision = photo ? workDecision({ work }, photo.id) : null;
	const colors = MASTER.models.find((model) => model.id === decision?.modelId)?.colorways ?? [];
	if (!photo || !decision) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "font-display text-3xl text-stage-ink",
				children: "Work library"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-2 max-w-3xl text-sm leading-6 text-stage-muted",
				children: [MASTER.work.length, " real finished hats. No titles were invented. Featured, recent, public, and hidden can be marked before any other field is filled in. The public gallery is unchanged."]
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "overflow-hidden rounded-3xl bg-stage-photo shadow-stage ring-1 ring-stage-line",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: drivePhoto(photo.driveId, 1400) ?? "",
					alt: decision.title || "Untitled finished work",
					className: "max-h-[68dvh] w-full object-contain"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
						on: decision.featured,
						label: "Featured",
						onClick: () => patchWork(photo.id, { featured: !decision.featured })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
						on: decision.recent,
						label: "Recent",
						onClick: () => patchWork(photo.id, { recent: !decision.recent })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
						on: decision.public,
						label: "Public",
						onClick: () => patchWork(photo.id, { public: !decision.public })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
						on: decision.hidden,
						label: "Hidden",
						onClick: () => patchWork(photo.id, { hidden: !decision.hidden })
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-sm text-stage-muted",
				children: [decision.title ? decision.title : "Needs metadata", ". Public and hidden stay in Studio. They do not change the live gallery."]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
				className: "rounded-2xl bg-stage p-4 ring-1 ring-stage-line",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", {
						className: "cursor-pointer text-sm font-semibold text-stage-ink",
						children: "Assign metadata later"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 grid gap-3 sm:grid-cols-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Title",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									defaultValue: decision.title,
									placeholder: "Leave blank until you name it",
									onBlur: (event) => {
										if (event.target.value !== decision.title) patchWork(photo.id, { title: event.target.value });
									},
									className: fieldClass
								}, `${photo.id}-${decision.title}`)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Hat model",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
									value: decision.modelId,
									onChange: (event) => patchWork(photo.id, {
										modelId: event.target.value,
										colorId: ""
									}),
									className: fieldClass,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: "",
										children: "Not set"
									}), MASTER.models.map((model) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", {
										value: model.id,
										children: [
											model.code,
											" — ",
											model.officialName
										]
									}, model.id))]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Hat color",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
									value: decision.colorId,
									onChange: (event) => patchWork(photo.id, { colorId: event.target.value }),
									className: fieldClass,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: "",
										children: "Not set"
									}), colors.map((color) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: color.id,
										children: color.officialName
									}, color.id))]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Patch material",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
									value: decision.material,
									onChange: (event) => patchWork(photo.id, { material: event.target.value }),
									className: fieldClass,
									children: MATERIALS.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: item.id,
										children: item.label
									}, item.id || "blank"))
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
								label: "Shape",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
									value: decision.shape,
									onChange: (event) => patchWork(photo.id, { shape: event.target.value }),
									className: fieldClass,
									children: SHAPES.map((shape) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
										value: shape,
										children: shape || "Not set"
									}, shape || "blank"))
								})
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-3 text-xs text-stage-muted",
						children: ["File name, not a caption: ", photo.fileName]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4",
				children: MASTER.work.map((item, index) => {
					const meta = workDecision({ work }, item.id);
					const src = drivePhoto(item.driveId, 480);
					const on = active === item.id;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => setActive(item.id),
						className: `overflow-hidden rounded-2xl bg-stage-photo text-left shadow-stage ring-2 ${on ? "ring-primary" : "ring-transparent"}`,
						children: [
							src && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
								src,
								alt: "",
								loading: "lazy",
								className: "h-52 w-full object-contain"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "block px-3 py-2 text-sm text-stage-ink",
								children: meta.title || `Needs metadata · ${index + 1}`
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "block px-3 pb-3 text-xs text-stage-muted",
								children: [
									meta.featured && "Featured",
									meta.recent && "Recent",
									meta.public && "Public",
									meta.hidden && "Hidden"
								].filter(Boolean).join(" · ") || "Unmarked"
							})
						]
					}, item.id);
				})
			})
		]
	});
}
var fieldClass = "mt-1 w-full rounded-xl bg-stage-photo px-3 py-2 text-sm text-stage-ink ring-1 ring-stage-line";
function Field({ label, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "text-xs font-semibold tracking-wide text-stage-muted uppercase",
		children: [label, children]
	});
}
function Toggle({ on, label, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
		type: "button",
		size: "sm",
		variant: on ? "primary" : "outline",
		className: on ? void 0 : "text-stage-ink",
		onClick,
		children: label
	});
}
function StudioPage() {
	const [tab, setTab] = (0, import_react.useState)("materials");
	const dirty = useStudio((state) => isDirty(state));
	(0, import_react.useEffect)(() => {
		useStudio.persist.rehydrate();
	}, []);
	const blocker = useBlocker({
		shouldBlockFn: () => isDirty(useStudio.getState()),
		enableBeforeUnload: () => isDirty(useStudio.getState()),
		withResolver: true
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		id: "studio",
		className: "bg-stage text-stage-ink",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto w-[min(1240px,94vw)] py-8 md:py-12",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs font-semibold tracking-[0.16em] text-primary uppercase",
					children: "Studio · not the live shop"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "mt-2 font-display text-5xl text-stage-ink",
					children: "Studio"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 max-w-3xl text-sm leading-6 text-stage-muted",
					children: "Every supplied color starts as not offered. A photo, a Richardson listing, an offer, and stock are four separate facts."
				}),
				dirty && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-4 rounded-2xl bg-primary/15 px-4 py-3 text-sm text-stage-ink",
					role: "status",
					children: "Unsaved changes. They are not part of the saved snapshot. Leaving Studio will ask you to stay or discard the trip — the changes stay in this browser until you save a snapshot."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-6 flex flex-wrap gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabButton, {
							current: tab,
							id: "materials",
							onSelect: setTab,
							label: "Materials"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabButton, {
							current: tab,
							id: "catalog",
							onSelect: setTab,
							label: "Hat catalog"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabButton, {
							current: tab,
							id: "work",
							onSelect: setTab,
							label: "Work library"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabButton, {
							current: tab,
							id: "preview",
							onSelect: setTab,
							label: "Preview store"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-6",
					children: [
						tab === "materials" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MaterialApproval, {}),
						tab === "catalog" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HatApproval, {}),
						tab === "work" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WorkLibrary, {}),
						tab === "preview" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StorePreview, {})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
					className: "mt-12 border-t border-stage-line pt-6",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "text-sm font-semibold tracking-wide text-stage-muted uppercase",
						children: "Not connected to the shop"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 max-w-3xl text-sm leading-6 text-stage-muted",
						children: "The public builder is a live showroom, still using the current color lists. Nothing here is offered until you set a model to Active and a color to Offered, then approve that preview. Publish to the live shop stays off."
					})]
				})
			]
		}), blocker.status === "blocked" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "fixed inset-0 z-50 grid place-items-center bg-bg/80 p-4",
			role: "dialog",
			"aria-modal": "true",
			"aria-label": "Unsaved catalog changes",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "w-[min(440px,100%)] rounded-3xl bg-stage p-5 text-stage-ink shadow-stage",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-3xl",
						children: "Leave Studio?"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-sm leading-6 text-stage-muted",
						children: "These catalog changes are not in the saved snapshot. They remain in this browser, but they are not saved as the catalog snapshot."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 flex flex-wrap gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "outline",
							className: "text-stage-ink",
							onClick: () => blocker.reset(),
							children: "Stay"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							onClick: () => blocker.proceed(),
							children: "Leave anyway"
						})]
					})
				]
			})
		})]
	});
}
function TabButton({ current, id, label, onSelect }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		onClick: () => onSelect(id),
		className: `min-h-11 rounded-full px-4 text-sm font-semibold ${current === id ? "bg-primary text-primary-fg" : "bg-stage-photo text-stage-ink ring-1 ring-stage-line"}`,
		children: label
	});
}
//#endregion
export { StudioPage as component };
