import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  formatAdviceMessage,
  formatDigest,
  isTelegramEnabled,
  sendTelegram,
} from "./telegram";

describe("formatAdviceMessage", () => {
  it("renders an all-clear message when no changes", () => {
    const out = formatAdviceMessage({
      portfolioTitle: "Paper · Test",
      suggestedMonth: "2026-05",
      added: [],
      removed: [],
      unchangedCount: 12,
    });
    expect(out).toContain("Paper 月度调仓建议");
    expect(out).toContain("2026-05");
    expect(out).toContain("无需调仓");
    expect(out).not.toContain("加入");
    expect(out).not.toContain("卖出");
  });

  it("renders an add+remove diff with counts", () => {
    const out = formatAdviceMessage({
      portfolioTitle: "Paper · Tech Momo",
      suggestedMonth: "2026-05",
      added: ["NVDA", "AMD"],
      removed: ["INTC"],
      unchangedCount: 10,
      appUrl: "https://aiquant.org/paper",
    });
    expect(out).toContain("Paper · Tech Momo");
    expect(out).toContain("加入 2 只：NVDA, AMD");
    expect(out).toContain("卖出 1 只：INTC");
    expect(out).toContain("保留 10 只");
    expect(out).toContain("https://aiquant.org/paper");
  });

  it("handles add-only (no removed)", () => {
    const out = formatAdviceMessage({
      portfolioTitle: "P",
      suggestedMonth: "2026-05",
      added: ["AAPL"],
      removed: [],
      unchangedCount: 5,
    });
    expect(out).toContain("加入");
    expect(out).not.toContain("卖出");
  });
});

describe("formatDigest", () => {
  it("returns empty placeholder when no messages", () => {
    expect(formatDigest([])).toContain("无 Paper 组合需要更新");
  });
  it("returns single message verbatim", () => {
    expect(formatDigest(["hello"])).toBe("hello");
  });
  it("joins multiple messages with a separator", () => {
    const out = formatDigest(["A", "B", "C"]);
    expect(out).toContain("A");
    expect(out).toContain("B");
    expect(out).toContain("C");
    expect(out.split("———").length).toBe(3);
  });
});

describe("isTelegramEnabled / sendTelegram (no env)", () => {
  const origToken = process.env.TELEGRAM_BOT_TOKEN;
  const origChat = process.env.TELEGRAM_CHAT_ID;
  beforeEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });
  afterEach(() => {
    if (origToken !== undefined) process.env.TELEGRAM_BOT_TOKEN = origToken;
    if (origChat !== undefined) process.env.TELEGRAM_CHAT_ID = origChat;
  });

  it("isTelegramEnabled is false without env", () => {
    expect(isTelegramEnabled()).toBe(false);
  });

  it("sendTelegram silently no-ops without env", async () => {
    const res = await sendTelegram("hello");
    expect(res.sent).toBe(false);
    expect(res.reason).toBe("disabled");
  });
});
