// Phase 16 — Share button + modal for the result page.
//
// Renders a "分享" button next to the existing 复制 / 导出 actions. Clicking
// opens a modal that:
//   - On mount, GET /share to fetch existing token (404 = none yet)
//   - "生成链接" button → POST without rotate to mint or return existing
//   - "重新生成" button → POST { rotate: true } to invalidate old token
//   - "撤销" button → DELETE
//   - Copy URL to clipboard
//   - Show view count + last access timestamp
//   - "预览" link opens /share/[token] in a new tab

"use client";

import { useEffect, useState } from "react";
import {
  Share2,
  Copy,
  CheckCircle2,
  RefreshCw,
  Trash2,
  ExternalLink,
  Loader2,
  X,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShareToken {
  token: string;
  url: string;
  viewCount: number;
  lastAccessedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function ShareStudyButton({ studyId }: { studyId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Share2 className="h-3.5 w-3.5" />
        分享
      </Button>
      {open && <ShareModal studyId={studyId} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareModal({
  studyId,
  onClose,
}: {
  studyId: string;
  onClose: () => void;
}) {
  const [share, setShare] = useState<ShareToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch existing token on mount.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/studies/${studyId}/share`);
        if (cancelled) return;
        if (res.status === 404) {
          setShare(null);
        } else if (res.ok) {
          setShare(((await res.json()) as ShareToken));
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studyId]);

  async function generateOrRotate(rotate: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/studies/${studyId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotate }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setShare(((await res.json()) as ShareToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!window.confirm("确认撤销分享链接？老链接将立即失效。")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/studies/${studyId}/share`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setShare(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "撤销失败");
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl() {
    if (!share) return;
    // Build a full URL — share.url may be relative if APP_URL isn't set
    // on the server side.
    const full = share.url.startsWith("http")
      ? share.url
      : `${window.location.origin}${share.url}`;
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API (rare in 2026 but safe).
      window.prompt("复制此链接：", full);
    }
  }

  const fullUrl = share
    ? share.url.startsWith("http")
      ? share.url
      : `${typeof window !== "undefined" ? window.location.origin : ""}${share.url}`
    : "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
            <Share2 className="h-4 w-4 text-blue-600" />
            分享此研究
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-400"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中…
            </div>
          ) : share ? (
            <>
              {/* URL field */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">分享链接</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={fullUrl}
                    className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-gray-50 border border-gray-200 rounded text-gray-700 select-all"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyUrl}
                    className="gap-1 shrink-0"
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        已复制
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        复制
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-gray-50 rounded p-2.5">
                  <p className="text-gray-500">浏览次数</p>
                  <p className="text-base font-semibold text-gray-900 mt-0.5">
                    {share.viewCount}
                  </p>
                </div>
                <div className="bg-gray-50 rounded p-2.5">
                  <p className="text-gray-500">最近访问</p>
                  <p className="text-xs font-medium text-gray-900 mt-0.5">
                    {share.lastAccessedAt
                      ? new Date(share.lastAccessedAt).toLocaleString("zh-CN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "尚未被访问"}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href={fullUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded hover:bg-gray-50 text-gray-700"
                >
                  <ExternalLink className="h-3 w-3" />
                  新窗口预览
                </a>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => generateOrRotate(true)}
                  className="gap-1 text-xs"
                >
                  <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
                  重新生成
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={revoke}
                  className="gap-1 text-xs text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-3 w-3" />
                  撤销
                </Button>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed pt-1">
                公开链接：任何人拿到 URL 即可查看，无需登录。链接里展示假设、指标、AI 结论与投研讨论、最新持仓。可随时撤销或重新生成（老链接立即失效）。
              </p>
            </>
          ) : (
            <div className="text-center py-2 space-y-3">
              <p className="text-sm text-gray-700">
                还没有为这份研究生成分享链接
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                链接生成后，任何人通过 URL 都能看到研究完整报告（无需登录）。
                你随时可以撤销或重新生成。
              </p>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => generateOrRotate(false)}
                className="gap-1.5"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Share2 className="h-3.5 w-3.5" />
                )}
                生成分享链接
              </Button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
