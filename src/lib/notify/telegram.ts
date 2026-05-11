// Phase 12: Telegram notification client.
//
// Reads TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID from env. When either is
// missing we silently no-op and return { sent: false, reason: "disabled" }
// — this lets the scheduler run during local dev (no token configured)
// without erroring. Network / API errors are caught and returned with
// reason="error" plus a message; we never throw out of this module so
// notification failures can't bring down the scheduler.

const TELEGRAM_API = "https://api.telegram.org";

export interface TelegramResult {
  sent: boolean;
  reason?: "disabled" | "error";
  error?: string;
}

interface TelegramConfig {
  token: string;
  chatId: string;
}

function readConfig(): TelegramConfig | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return null;
  return { token, chatId };
}

export function isTelegramEnabled(): boolean {
  return readConfig() != null;
}

/**
 * Send a plain-text or Markdown-formatted message. Telegram accepts up to
 * 4096 characters per message; we truncate at 4000 with an ellipsis to be
 * safe against multi-byte boundaries.
 */
export async function sendTelegram(
  text: string,
  opts: { parseMode?: "Markdown" | "MarkdownV2" | "HTML" } = {},
): Promise<TelegramResult> {
  const cfg = readConfig();
  if (!cfg) return { sent: false, reason: "disabled" };

  const body = {
    chat_id: cfg.chatId,
    text: text.length > 4000 ? text.slice(0, 3997) + "..." : text,
    parse_mode: opts.parseMode ?? "Markdown",
    disable_web_page_preview: true,
  };

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${cfg.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        sent: false,
        reason: "error",
        error: `HTTP ${res.status}: ${errText.slice(0, 200)}`,
      };
    }
    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      reason: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================
// Message formatting helpers (pure — testable without network)
// ============================================================

export interface AdviceSummaryForTelegram {
  portfolioTitle: string;
  suggestedMonth: string;
  added: string[];
  removed: string[];
  unchangedCount: number;
  appUrl?: string; // optional deep link, e.g. https://aiquant.org/paper
}

/**
 * Build a Telegram-ready Markdown message for a single portfolio's advice.
 * Designed to be short — Telegram chat width is narrow. Markdown is the
 * default parse_mode we send with.
 *
 * Escaping note: we deliberately use the plain "Markdown" parse mode (not
 * MarkdownV2) so we don't have to escape `_*[]()~\`>#+-=|{}.!`. Tickers
 * and portfolio titles in this app are alphanumeric + dot + space so a
 * conservative consumer of plain Markdown is safe.
 */
export function formatAdviceMessage(a: AdviceSummaryForTelegram): string {
  const lines: string[] = [];
  lines.push(`*Paper 月度调仓建议* · ${a.suggestedMonth}`);
  lines.push(`组合：${a.portfolioTitle}`);
  if (a.added.length === 0 && a.removed.length === 0) {
    lines.push("");
    lines.push("✅ 持仓与策略推荐一致，无需调仓。");
  } else {
    if (a.added.length > 0) {
      lines.push("");
      lines.push(`🟢 加入 ${a.added.length} 只：${a.added.join(", ")}`);
    }
    if (a.removed.length > 0) {
      lines.push(`🔴 卖出 ${a.removed.length} 只：${a.removed.join(", ")}`);
    }
    lines.push(`⚪ 保留 ${a.unchangedCount} 只`);
  }
  if (a.appUrl) {
    lines.push("");
    lines.push(`查看详情：${a.appUrl}`);
  }
  return lines.join("\n");
}

/**
 * Combine multiple per-portfolio messages into a single digest. Used when
 * the scheduler covers several portfolios in one run and we want one
 * Telegram push instead of N.
 */
export function formatDigest(messages: string[]): string {
  if (messages.length === 0) return "本次调度无 Paper 组合需要更新。";
  if (messages.length === 1) return messages[0];
  return messages.join("\n\n———\n\n");
}
