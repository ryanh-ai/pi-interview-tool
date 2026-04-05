import { describe, expect, it } from "vitest";
import { join } from "node:path";
import interviewExtension, {
	createGenerateContext,
	extractGenerateResponseText,
	extractJSONArray,
	loadSavedInterview,
	parseGeneratedOptions,
	parseReviewedQuestion,
	selectGenerateModels,
} from "./index.js";

describe("selectGenerateModels", () => {
	const configured = { provider: "anthropic", id: "claude-haiku-4-5" };
	const current = { provider: "openai", id: "gpt-5.4" };
	const available = [
		{ provider: "google", id: "gemini-2.5-flash" },
		{ provider: "openai", id: "gpt-4.1-mini" },
	];

	it("uses the configured model first and current model as fallback", () => {
		const result = selectGenerateModels(configured, current, available);
		expect(result).toEqual({ primary: configured, fallback: current });
	});

	it("uses the current model when no configured model is set", () => {
		const result = selectGenerateModels(null, current, available);
		expect(result).toEqual({ primary: current, fallback: null });
	});

	it("uses the preferred available model when neither configured nor current is set", () => {
		const result = selectGenerateModels(null, null, available);
		expect(result).toEqual({ primary: available[0], fallback: null });
	});

	it("does not set a fallback when configured and current are the same model", () => {
		const result = selectGenerateModels(configured, configured, available);
		expect(result).toEqual({ primary: configured, fallback: null });
	});
});

describe("extractGenerateResponseText", () => {
	it("surfaces provider errors instead of reporting an empty response", () => {
		expect(() =>
			extractGenerateResponseText("anthropic/claude-haiku-4-5", {
				stopReason: "error",
				errorMessage: "You have exceeded your Anthropic usage limit",
				content: [],
			}),
		).toThrow("anthropic/claude-haiku-4-5: You have exceeded your Anthropic usage limit");
	});

	it("throws when the model returns no text blocks", () => {
		expect(() =>
			extractGenerateResponseText("openai/gpt-5.4", {
				stopReason: "stop",
				errorMessage: undefined,
				content: [],
			}),
		).toThrow("openai/gpt-5.4 returned no text response");
	});
});

describe("extractJSONArray", () => {
	it("keeps brackets inside quoted strings while extracting the array", () => {
		const text = 'Here you go: ["React [recommended]", "Vue"] trailing note';
		expect(extractJSONArray(text)).toBe('["React [recommended]", "Vue"]');
	});
});

describe("createGenerateContext", () => {
	it("always includes a non-empty system prompt for providers that require instructions", () => {
		const context = createGenerateContext("Review these options");
		expect(context.systemPrompt).toContain("Return only a JSON array of strings");
		expect(context.messages[0].content[0].text).toBe("Review these options");
	});

	it("allows review mode to supply a different system prompt", () => {
		const context = createGenerateContext("Review this question", "Custom review prompt");
		expect(context.systemPrompt).toBe("Custom review prompt");
	});
});

describe("parseGeneratedOptions", () => {
	it("trims valid strings and drops empty items", () => {
		expect(parseGeneratedOptions('[" React ", "", "Vue"]')).toEqual(["React", "Vue"]);
	});

	it("preserves the parse error context", () => {
		expect(() => parseGeneratedOptions('not json')).toThrow("Failed to parse generated options:");
	});
});

describe("parseReviewedQuestion", () => {
	it("parses a rewritten question and reviewed options from a JSON object", () => {
		expect(
			parseReviewedQuestion('{"question":"Clearer prompt","options":["A","B"]}'),
		).toEqual({ question: "Clearer prompt", options: ["A", "B"] });
	});

	it("preserves the parse error context", () => {
		expect(() => parseReviewedQuestion('not json')).toThrow("Failed to parse reviewed question:");
	});
});

describe("loadSavedInterview", () => {
	it("resolves only image and attachment paths while keeping literal answers unchanged", () => {
		const html = `<!doctype html><html><body>
		<script type="application/json" id="pi-interview-data">${JSON.stringify({
			title: "Saved",
			questions: [
				{ id: "framework", type: "single", question: "Framework?", options: ["React", "Vue"] },
				{ id: "notes", type: "text", question: "Notes?" },
				{ id: "mockup", type: "image", question: "Mockup" },
			],
			savedAnswers: [
				{ id: "framework", value: "React", attachments: ["images/decision.png"] },
				{ id: "notes", value: "Use edge runtime" },
				{ id: "mockup", value: "images/mock.png" },
			],
		})}</script>
		</body></html>`;

		const snapshotPath = "/tmp/pi-interview-snapshot/index.html";
		const loaded = loadSavedInterview(html, snapshotPath);
		const answers = loaded.savedAnswers ?? [];

		expect(answers[0]?.value).toBe("React");
		expect(answers[0]?.attachments).toEqual([join("/tmp/pi-interview-snapshot", "images/decision.png")]);
		expect(answers[1]?.value).toBe("Use edge runtime");
		expect(answers[2]?.value).toBe(join("/tmp/pi-interview-snapshot", "images/mock.png"));
	});
});

describe("tool registration", () => {
	it("registers a promptSnippet so the tool appears in default tool prompts", () => {
		let registeredTool: Record<string, unknown> | undefined;
		interviewExtension({ registerTool: (tool: Record<string, unknown>) => { registeredTool = tool; } } as unknown as Parameters<typeof interviewExtension>[0]);

		expect(registeredTool).toBeDefined();
		expect(typeof registeredTool?.promptSnippet).toBe("string");
		expect((registeredTool?.promptSnippet as string).length).toBeGreaterThan(0);
	});
});
