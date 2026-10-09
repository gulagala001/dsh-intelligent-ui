// Official @deepseek-ai/dsh-client-ui-chat 0.2.0-rc.2 renderer excerpts; MIT.
// https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.0-rc.2/packages/client/ui-chat
import * as react from "react";
import * as react_jsx_runtime from "react/jsx-runtime";
import { primitives as _deepseek_ai_dsh_client_ui_primitives } from "./native-support.jsx";
const AssistantMarkdown_module_css_default={root:"native-assistant",body:"native-body",stopped:"native-stopped"};
const ReasoningRow_module_css_default={root:"native-reasoning",thinkBody:"native-reasoning-body",row:"native-reasoning-toggle"};
const accessibility_module_css_default={visuallyHidden:"native-visually-hidden"};
const fileMediaUrl=(base,path)=>new URL(path,base).href;

		/** Localized copy adapters for Cordis-free Markdown primitives. */
		/**
		* Build the complete Markdown chrome copy for one locale revision.
		* @param t - Chat locale seat.
		* @returns Labels for code fences and footnotes.
		*/
		function markdownLabels(t) {
			return {
				code: {
					copyLabel: t("copy"),
					copiedLabel: t("copied"),
					toolbarLabels: {
						codeLabel: t("codeBlock.title"),
						wrapLabel: t("codeBlock.wrap"),
						unwrapLabel: t("codeBlock.unwrap")
					}
				},
				footnotes: t("markdown.footnotes")
			};
		}
		
		/**
		* Apply searchable hidden state without unmounting a stable subtree.
		* @param hidden - whether the subtree is currently hidden.
		* @param reveal - callback for browser find's `beforematch` reveal.
		* @returns ref for the stable subtree root.
		*/
		function useSearchableHidden(hidden, reveal) {
			const ref = (0, react.useRef)(null);
			(0, react.useLayoutEffect)(() => {
				const element = ref.current;
				if (element === null) return;
				if (hidden && element.contains(element.ownerDocument.activeElement)) {
					reveal();
					return;
				}
				if (hidden) element.setAttribute("hidden", "until-found");
				else element.removeAttribute("hidden");
			}, [hidden, reveal]);
			(0, react.useEffect)(() => {
				const element = ref.current;
				if (element === null) return;
				element.addEventListener("beforematch", reveal);
				return () => {
					element.removeEventListener("beforematch", reveal);
				};
			}, [reveal]);
			return ref;
		}
		
		/** Assistant reasoning disclosure, independent of Tool-call presentation. */
		const THINK_ICON = (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconThinkOutlineRegular, { size: 14 });
		function firstLine(text) {
			const newline = text.indexOf("\n");
			return newline === -1 ? text : text.slice(0, newline);
		}
		function latestCompletedParagraphFirstLine(text) {
			let summary = "";
			let paragraphStart = 0;
			const separator = /\r?\n(?:[\t ]*\r?\n)+/g;
			while (true) {
				const nextParagraph = separator.exec(text);
				const paragraphEnd = nextParagraph === null ? text.length : nextParagraph.index + nextParagraph[0].indexOf("\n");
				const newline = text.indexOf("\n", paragraphStart);
				if (newline !== -1 && newline <= paragraphEnd) {
					const candidate = text.slice(paragraphStart, newline).trim();
					if (candidate !== "") summary = candidate;
				}
				if (nextParagraph === null) return summary;
				paragraphStart = nextParagraph.index + nextParagraph[0].length;
			}
		}
		/**
		* Render one assistant reasoning block collapsed until the reader opens it. The
		* collapsed summary omits double-asterisk markers; expanded content renders
		* the complete Markdown with secondary typography. A streaming preview advances
		* when a paragraph's first line completes. Mode changes toggle CSS display without unmounting
		* collapsed summaries.
		* @param props.text - complete or streaming reasoning text.
		* @param props.running - whether this block is the streaming tail.
		* @param props.usePresentation - live display-policy selector for this reasoning row.
		* @param props.useDisclosure - independent open state with enclosing-Turn resets.
		* @param props.t - conversation locale seat for status and Markdown actions.
		* @returns the reasoning disclosure.
		*/
		const ReasoningRow = (0, react.memo)(function ReasoningRow({ text, running, usePresentation, useDisclosure, t }) {
			const { expanded, toggle } = useDisclosure();
			const labels = (0, react.useMemo)(() => markdownLabels(t), [t]);
			const summaryText = running ? latestCompletedParagraphFirstLine(text) : firstLine(text);
			const summary = (0, react.useMemo)(() => summaryText.replaceAll("**", ""), [summaryText]);
			const preview = usePresentation((policy) => !expanded && summary !== "" && (running || policy.settledReasoningPreview));
			const collapsedContent = (0, react.useMemo)(() => (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("span", {
				className: ReasoningRow_module_css_default.separator,
				"data-shimmer-decoration": true,
				"aria-hidden": true
			}), (0, react_jsx_runtime.jsx)("span", {
				className: ReasoningRow_module_css_default.summary,
				"data-streaming": running || void 0,
				children: (0, react_jsx_runtime.jsx)("span", {
					className: ReasoningRow_module_css_default.summaryText,
					children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.TextShimmer, { children: summary })
				})
			})] }), [running, summary]);
			const content = (0, react.useMemo)(() => expanded ? (0, react_jsx_runtime.jsx)("div", {
				className: ReasoningRow_module_css_default.thinkBody,
				children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
					text,
					streaming: running,
					labels,
					variant: "compact"
				})
			}) : void 0, [
				expanded,
				labels,
				running,
				text
			]);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: ReasoningRow_module_css_default.root,
				"data-variant": "think",
				"data-state": running ? "running" : "ok",
				"data-expanded": expanded || void 0,
				"data-preview": preview || void 0,
				children: [running && (0, react_jsx_runtime.jsx)("span", {
					className: accessibility_module_css_default.visuallyHidden,
					children: t("row.running")
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
					rowClassName: ReasoningRow_module_css_default.row,
					leadingClassName: ReasoningRow_module_css_default.leading,
					titleClassName: ReasoningRow_module_css_default.title,
					icon: THINK_ICON,
					title: t("message.think"),
					running,
					open: expanded,
					expandable: true,
					expandOnRowClick: true,
					onToggle: toggle,
					collapsedContent,
					children: content
				})]
			});
		});
		
		/**
		* Standalone fallback for image destinations (query/fragment suffixes are ignored).
		* Chat fileImages resolves decoded file references against cwd; pathImages also
		* serves this component outside that provider and accepts legacy image URL suffixes.
		* Resolve an authored absolute image path against the document's file API.
		* @param base - canonical `document.baseURI` at render time.
		* @param value - authored Markdown destination; URL escapes are decoded once.
		* @returns an absolute Web or Desktop file-API URL, or undefined for unsupported
		* protocols and non-local paths.
		*/
		function localPathMediaUrl(base, value) {
			let path;
			try {
				path = decodeURIComponent(value.split(/[?#]/u)[0] ?? "");
			} catch {
				return;
			}
			return fileMediaUrl(base, path);
		}
		/** Reasoning block as the Think variant summary row (figma 39:28304). */
		const AssistantMarkdown = (0, react.memo)(function AssistantMarkdown({ blocks, streaming, interrupted, renderMessageImages, groupPart, useDisclosure, reasoningHidden = false, usePresentation, revealProcess, mentions, t }) {
			const labels = (0, react.useMemo)(() => markdownLabels(t), [t]);
			const pathImages = (0, react.useMemo)(() => {
				return { resolve: (value) => localPathMediaUrl(document.baseURI, value) };
			}, []);
			const last = blocks.length - 1;
			if (!(streaming || interrupted === true || blocks.some((block) => block.kind !== "tool-call"))) return null;
			const rendered = [];
			for (let i = 0; i < blocks.length; i++) {
				const block = blocks[i];
				if (block === void 0) continue;
				if (groupPart === "reasoning" && block.kind !== "reasoning") continue;
				if (groupPart === "response" && block.kind === "reasoning") continue;
				switch (block.kind) {
					case "text":
						rendered.push((0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
							text: block.text,
							streaming,
							labels,
							fileMentions: mentions,
							pathImages
						}, i));
						break;
					case "reasoning":
						rendered.push((0, react_jsx_runtime.jsx)(ProcessReasoning, {
							hidden: reasoningHidden,
							reveal: revealProcess,
							children: (0, react_jsx_runtime.jsx)(ReasoningRow, {
								text: block.text,
								running: streaming && i === last,
								usePresentation,
								useDisclosure,
								t
							})
						}, i));
						break;
					case "image": {
						const start = i;
						const group = [block];
						while (i + 1 < blocks.length) {
							const next = blocks[i + 1];
							if (next === void 0 || next.kind !== "image") break;
							group.push(next);
							i += 1;
						}
						rendered.push((0, react_jsx_runtime.jsx)(react.Fragment, { children: renderMessageImages({
							images: group.map(({ attachment }) => ({ attachment })),
							align: "start"
						}) }, start));
						break;
					}
					case "tool-call": break;
					default: rendered.push((0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.JsonBlock, {
						label: t("message.unknownBlock"),
						payload: block.block,
						truncatedLabel: (total) => t("json.truncated", { total })
					}, i));
				}
			}
			return (0, react_jsx_runtime.jsx)("div", {
				className: AssistantMarkdown_module_css_default.root,
				"data-streaming": streaming || void 0,
				children: (0, react_jsx_runtime.jsxs)("div", {
					className: AssistantMarkdown_module_css_default.body,
					children: [rendered, interrupted && (groupPart === void 0 || groupPart === "response" || !blocks.some((block) => block.kind !== "reasoning" && block.kind !== "tool-call")) && (0, react_jsx_runtime.jsx)("span", {
						className: AssistantMarkdown_module_css_default.stopped,
						children: t("message.stopped")
					})]
				})
			});
		});
		function ProcessReasoning({ hidden, reveal, children }) {
			return (0, react_jsx_runtime.jsx)("div", {
				ref: useSearchableHidden(hidden, reveal ?? NOOP),
				"data-turn-process-inline": hidden || void 0,
				children
			});
		}
		const NOOP = () => {};
		
		/** Streaming, settled, and interrupted Assistant states share one keyed renderer instance. */
		const AssistantNodeView = (0, react.memo)(function AssistantNodeView({ node, groupPart, useDisclosure, useTurnData, turnProcess, openFile, renderMessageImages, fileMentions, usePresentation, t }) {
			const data = node.data;
			const turn = node.location.kind === "turn" || node.location.kind === "step" ? node.location.turn : void 0;
			const tail = useTurnData("turn-tail");
			const owner = (0, react.useMemo)(() => {
				if (turn?.status !== "closed" || data.finalNode === void 0) return void 0;
				if (tail?.closing?.finalNode.seq !== data.finalNode.seq) return void 0;
				return {
					turn,
					seq: data.finalNode.seq,
					openFile
				};
			}, [
				data.finalNode,
				openFile,
				tail,
				turn
			]);
			const mentions = (0, react.useMemo)(() => owner === void 0 ? void 0 : fileMentions(owner), [fileMentions, owner]);
			const reasoningHidden = turnProcess !== void 0 && turnProcess.foldable && turnProcess.spec.answerStep === data.step && turnProcess.spec.inlineReasoning && !turnProcess.open;
			const revealProcess = (0, react.useCallback)(() => {
				turnProcess?.setOpen(true);
			}, [turnProcess]);
			return (0, react_jsx_runtime.jsx)(AssistantMarkdown, {
				blocks: data.blocks,
				groupPart,
				useDisclosure,
				streaming: data.status === "running",
				interrupted: data.status === "interrupted",
				renderMessageImages,
				reasoningHidden,
				usePresentation,
				revealProcess,
				mentions,
				t
			});
		});
		
export {AssistantNodeView, AssistantMarkdown};
