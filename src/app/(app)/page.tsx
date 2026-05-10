"use client";

import Link from "next/link";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Loader2,
  Trash2,
  Star,
  Archive,
  ArchiveRestore,
  Search,
  Tag as TagIcon,
  X,
} from "lucide-react";

type StudyStatus =
  | "DRAFT"
  | "PLANNED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

interface DashboardMetricsBlock {
  cagr: number;
  sharpe: number;
  maxDrawdown: number;
}

interface DashboardStudy {
  id: string;
  title: string;
  hypothesis: string;
  universe: string;
  rebalance: string;
  benchmark: string;
  startDate: string;
  endDate: string;
  status: StudyStatus;
  tags: string[];
  favorited: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  result: {
    metrics: {
      strategy: DashboardMetricsBlock & Record<string, unknown>;
      spy: DashboardMetricsBlock & Record<string, unknown>;
    } | null;
    conclusion: string;
  } | null;
  progress: {
    currentStep: number;
    updatedAt: string;
  } | null;
}

const STATUS_LABEL: Record<StudyStatus, string> = {
  DRAFT: "草稿",
  PLANNED: "待启动",
  RUNNING: "进行中",
  COMPLETED: "已完成",
  FAILED: "失败",
  CANCELLED: "已取消",
};

const STATUS_BADGE: Record<StudyStatus, "success" | "running" | "muted" | "warning"> = {
  DRAFT: "muted",
  PLANNED: "muted",
  RUNNING: "running",
  COMPLETED: "success",
  FAILED: "warning",
  CANCELLED: "muted",
};

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json();
  });

// Phase 3.2: derive a coarse "factor type" from hypothesis text. Without a
// dedicated DB column we can still let users filter by what they actually
// care about: momentum vs sensitivity-sweep child vs everything else.
type FactorType = "momentum" | "sensitivity" | "baseline";

function classifyFactorType(study: {
  title: string;
  hypothesis: string;
}): FactorType {
  const haystack = `${study.title} ${study.hypothesis}`.toLowerCase();
  if (
    haystack.includes("敏感") ||
    haystack.includes("sensitivity") ||
    haystack.includes("sweep")
  ) {
    return "sensitivity";
  }
  if (
    haystack.includes("动量") ||
    haystack.includes("momentum") ||
    haystack.includes("12-1") ||
    haystack.includes("9-1") ||
    haystack.includes("6-1")
  ) {
    return "momentum";
  }
  return "baseline";
}

const FACTOR_LABEL: Record<FactorType, string> = {
  momentum: "动量",
  sensitivity: "敏感性",
  baseline: "基准",
};

type SortKey = "created" | "cagr" | "sharpe" | "maxdd";

function MetricCell({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-500">{label}</span>
      <span
        className={`text-sm font-semibold ${
          positive === true
            ? "text-green-600"
            : positive === false
              ? "text-red-600"
              : "text-gray-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function IconButton({
  onClick,
  title,
  busy,
  children,
  className = "",
}: {
  onClick: () => void;
  title: string;
  busy?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={busy}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 disabled:opacity-50 ${className}`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}
    </button>
  );
}

function TagChips({
  tags,
  onRemove,
}: {
  tags: string[];
  onRemove?: (tag: string) => void;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700"
        >
          <TagIcon className="h-2.5 w-2.5" />
          {t}
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove(t);
              }}
              className="text-gray-400 hover:text-red-600"
              aria-label={`移除标签 ${t}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

function TagInput({
  onAdd,
}: {
  onAdd: (tag: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="text-xs text-gray-400 hover:text-blue-600"
      >
        + 标签
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value.trim()) onAdd(value.trim());
        setValue("");
        setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (value.trim()) onAdd(value.trim());
          setValue("");
          setOpen(false);
        } else if (e.key === "Escape") {
          setValue("");
          setOpen(false);
        }
      }}
      placeholder="添加标签…"
      className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5 w-24 focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
}

function StudyCard({
  study,
  busy,
  onDelete,
  onToggleFavorite,
  onToggleArchive,
  onAddTag,
  onRemoveTag,
}: {
  study: DashboardStudy;
  busy: { delete?: boolean; patch?: boolean };
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string, next: boolean) => void;
  onToggleArchive: (id: string, next: boolean) => void;
  onAddTag: (id: string, tag: string) => void;
  onRemoveTag: (id: string, tag: string) => void;
}) {
  const completed = study.status === "COMPLETED";
  const m = study.result?.metrics;
  const strat = m?.strategy;
  const spy = m?.spy;
  const beatsMarket =
    completed &&
    typeof strat?.cagr === "number" &&
    typeof spy?.cagr === "number" &&
    strat.cagr > spy.cagr;

  const linkHref = completed
    ? `/studies/${study.id}/result`
    : study.status === "RUNNING"
      ? `/studies/${study.id}/running`
      : `/studies/${study.id}/plan`;

  return (
    <Card
      className={`bg-white border-gray-200 text-gray-900 ${study.archived ? "opacity-70" : ""}`}
    >
      <CardHeader className="pb-2 pt-4 px-4 border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-semibold text-gray-900 truncate">
              {study.title}
            </CardTitle>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
              {study.hypothesis}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            {beatsMarket && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                <TrendingUp className="h-3 w-3" />
                跑赢大盘
              </span>
            )}
            <Badge variant={STATUS_BADGE[study.status]}>
              {STATUS_LABEL[study.status]}
            </Badge>
            <IconButton
              title={study.favorited ? "取消收藏" : "收藏"}
              busy={busy.patch}
              onClick={() => onToggleFavorite(study.id, !study.favorited)}
              className={
                study.favorited
                  ? "text-amber-500 hover:text-amber-600"
                  : "hover:text-amber-500"
              }
            >
              <Star
                className="h-3.5 w-3.5"
                fill={study.favorited ? "currentColor" : "none"}
              />
            </IconButton>
            <IconButton
              title={study.archived ? "取消归档" : "归档"}
              busy={busy.patch}
              onClick={() => onToggleArchive(study.id, !study.archived)}
              className="hover:text-gray-700"
            >
              {study.archived ? (
                <ArchiveRestore className="h-3.5 w-3.5" />
              ) : (
                <Archive className="h-3.5 w-3.5" />
              )}
            </IconButton>
            <IconButton
              title="删除研究"
              busy={busy.delete}
              onClick={() => onDelete(study.id)}
              className="hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {completed && strat && spy && (
          <div className="grid grid-cols-3 gap-3 mb-3">
            <MetricCell
              label="CAGR"
              value={`${strat.cagr}%`}
              positive={strat.cagr > spy.cagr}
            />
            <MetricCell
              label="Sharpe"
              value={Number(strat.sharpe).toFixed(2)}
              positive={strat.sharpe > spy.sharpe}
            />
            <MetricCell
              label="Max Drawdown"
              value={`${strat.maxDrawdown}%`}
              positive={strat.maxDrawdown > spy.maxDrawdown}
            />
          </div>
        )}
        {!completed && (
          <p className="text-xs text-gray-500 mb-3">
            {study.universe} · {study.benchmark}
          </p>
        )}
        {completed && study.result?.conclusion && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-3">
            {study.result.conclusion}
          </p>
        )}

        <TagChips
          tags={study.tags}
          onRemove={(t) => onRemoveTag(study.id, t)}
        />

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <Link href={linkHref}>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              {completed
                ? "查看报告"
                : study.status === "RUNNING"
                  ? "查看进度"
                  : "继续"}
            </Button>
          </Link>
          {completed && (
            <Link href={`/studies/new?cloneFrom=${study.id}`}>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7 text-gray-500 hover:bg-gray-50"
              >
                复制并修改
              </Button>
            </Link>
          )}
          <div className="ml-auto">
            <TagInput onAdd={(t) => onAddTag(study.id, t)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveStudyBanner({ study }: { study: DashboardStudy }) {
  const totalSteps = 9;
  const currentStep = study.progress?.currentStep ?? 0;
  const progressPct = Math.min(
    100,
    Math.round(((currentStep + 1) / totalSteps) * 100)
  );
  return (
    <Card className="border-blue-200 bg-blue-50 text-gray-900">
      <CardHeader className="pb-2 pt-4 px-4 border-blue-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold text-gray-900">
              当前研究
            </CardTitle>
            <Badge variant="running">进行中</Badge>
          </div>
          <Link href={`/studies/${study.id}/running`}>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-7 text-blue-600 hover:bg-blue-100"
            >
              查看进度 →
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className="text-sm font-medium text-gray-900">{study.title}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Step {currentStep + 1} of {totalSteps}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-2 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 shrink-0">{progressPct}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

interface FilterState {
  query: string;
  status: "" | StudyStatus;
  factorType: "" | FactorType;
  tag: string;
  sort: SortKey;
  view: "active" | "favorites" | "archived" | "all";
}

const DEFAULT_FILTERS: FilterState = {
  query: "",
  status: "",
  factorType: "",
  tag: "",
  sort: "created",
  view: "active",
};

function FilterBar({
  filters,
  setFilters,
  allTags,
}: {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  allTags: string[];
}) {
  const selectCls =
    "text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500";
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {(["active", "favorites", "archived", "all"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setFilters({ ...filters, view: v })}
            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
              filters.view === v
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {v === "active"
              ? "活跃"
              : v === "favorites"
                ? "收藏"
                : v === "archived"
                  ? "仅归档"
                  : "全部"}
          </button>
        ))}
        <div className="ml-auto inline-flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 flex-1 max-w-xs">
          <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="搜索标题或假设…"
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            className="text-xs bg-transparent w-full focus:outline-none placeholder:text-gray-400"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          className={selectCls}
          value={filters.status}
          onChange={(e) =>
            setFilters({ ...filters, status: e.target.value as FilterState["status"] })
          }
        >
          <option value="">全部状态</option>
          <option value="DRAFT">草稿</option>
          <option value="PLANNED">待启动</option>
          <option value="RUNNING">进行中</option>
          <option value="COMPLETED">已完成</option>
          <option value="FAILED">失败</option>
          <option value="CANCELLED">已取消</option>
        </select>
        <select
          className={selectCls}
          value={filters.factorType}
          onChange={(e) =>
            setFilters({
              ...filters,
              factorType: e.target.value as FilterState["factorType"],
            })
          }
        >
          <option value="">全部因子</option>
          <option value="momentum">动量</option>
          <option value="sensitivity">敏感性</option>
          <option value="baseline">基准</option>
        </select>
        <select
          className={selectCls}
          value={filters.tag}
          onChange={(e) => setFilters({ ...filters, tag: e.target.value })}
        >
          <option value="">全部标签</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          className={selectCls}
          value={filters.sort}
          onChange={(e) =>
            setFilters({ ...filters, sort: e.target.value as SortKey })
          }
        >
          <option value="created">按创建时间</option>
          <option value="cagr">按 CAGR</option>
          <option value="sharpe">按 Sharpe</option>
          <option value="maxdd">按 Max DD（小→大）</option>
        </select>
        {(filters.query ||
          filters.status ||
          filters.factorType ||
          filters.tag ||
          filters.sort !== "created" ||
          filters.view !== "active") && (
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="text-xs text-gray-500 hover:text-gray-900 underline"
          >
            清除
          </button>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data, error, isLoading, mutate } = useSWR<{
    studies: DashboardStudy[];
  }>("/api/studies", fetcher, {
    refreshInterval: 5000,
  });

  const studies = data?.studies ?? [];
  const running = studies.find((s) => s.status === "RUNNING");

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [patchingId, setPatchingId] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of studies) for (const t of s.tags ?? []) set.add(t);
    return Array.from(set).sort();
  }, [studies]);

  // Apply filters + sort entirely client-side. With per-user study counts in
  // the dozens, this is way snappier than a server round-trip per keystroke.
  const visible = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    let list = studies.filter((s) => {
      if (filters.view === "archived" && !s.archived) return false;
      if (filters.view === "active" && s.archived) return false;
      if (filters.view === "favorites" && (!s.favorited || s.archived)) return false;
      // view === "all" passes everything
      if (filters.status && s.status !== filters.status) return false;
      if (filters.factorType && classifyFactorType(s) !== filters.factorType)
        return false;
      if (filters.tag && !s.tags?.includes(filters.tag)) return false;
      if (q) {
        const hay = `${s.title} ${s.hypothesis}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const metricOf = (s: DashboardStudy, k: "cagr" | "sharpe" | "maxDrawdown") =>
      typeof s.result?.metrics?.strategy?.[k] === "number"
        ? (s.result!.metrics!.strategy[k] as number)
        : null;
    if (filters.sort === "cagr") {
      list = [...list].sort((a, b) => (metricOf(b, "cagr") ?? -Infinity) - (metricOf(a, "cagr") ?? -Infinity));
    } else if (filters.sort === "sharpe") {
      list = [...list].sort((a, b) => (metricOf(b, "sharpe") ?? -Infinity) - (metricOf(a, "sharpe") ?? -Infinity));
    } else if (filters.sort === "maxdd") {
      // Max DD is negative; smaller absolute value is better → larger (less negative) first.
      list = [...list].sort((a, b) => (metricOf(b, "maxDrawdown") ?? -Infinity) - (metricOf(a, "maxDrawdown") ?? -Infinity));
    }
    return list;
  }, [studies, filters]);

  async function handleDelete(id: string) {
    if (
      !window.confirm(
        "确认删除这条研究？相关计划、进度和结果都会被一并删除，无法恢复。",
      )
    ) {
      return;
    }
    setErrMsg(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/studies/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `删除失败 (HTTP ${res.status})`);
      }
      await mutate();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  async function patchStudy(id: string, patch: Partial<DashboardStudy>) {
    setErrMsg(null);
    setPatchingId(id);
    // Optimistic update.
    if (data) {
      mutate(
        {
          studies: data.studies.map((s) =>
            s.id === id ? { ...s, ...patch } : s,
          ),
        },
        false,
      );
    }
    try {
      const res = await fetch(`/api/studies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `更新失败 (HTTP ${res.status})`);
      }
      await mutate();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "更新失败");
      await mutate();
    } finally {
      setPatchingId(null);
    }
  }

  const summary = useMemo(() => {
    const completed = studies.filter((s) => s.status === "COMPLETED").length;
    const favorites = studies.filter((s) => s.favorited && !s.archived).length;
    const archived = studies.filter((s) => s.archived).length;
    return { completed, favorites, archived };
  }, [studies]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">欢迎回来</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isLoading
              ? "加载中…"
              : `${summary.completed} 已完成 · ${summary.favorites} 收藏 · ${summary.archived} 归档`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/studies/compare">
            <Button variant="outline" className="border-gray-200 text-gray-700">
              对比研究
            </Button>
          </Link>
          <Link href="/studies/new">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              + 新研究
            </Button>
          </Link>
        </div>
      </div>

      {/* Loading / error */}
      {isLoading && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 flex items-center justify-center text-gray-500 text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载研究…
        </div>
      )}
      {error && !isLoading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          加载失败：{(error as Error).message}
        </div>
      )}
      {errMsg && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {errMsg}
        </div>
      )}

      {/* Active running banner */}
      {running && <ActiveStudyBanner study={running} />}

      {/* Filter bar */}
      {!isLoading && !error && studies.length > 0 && (
        <FilterBar filters={filters} setFilters={setFilters} allTags={allTags} />
      )}

      {/* Empty (no studies at all) */}
      {!isLoading && !error && studies.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-base font-medium text-gray-900 mb-1">还没有研究</p>
          <p className="text-sm text-gray-500 mb-4">
            从描述一个投资假设开始你的第一个量化研究。
          </p>
          <Link href="/studies/new">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              开始第一个研究 →
            </Button>
          </Link>
        </div>
      )}

      {/* Empty (filtered) */}
      {!isLoading && studies.length > 0 && visible.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-500">没有符合当前筛选条件的研究</p>
        </div>
      )}

      {/* Studies grid */}
      {visible.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((s) => (
            <StudyCard
              key={s.id}
              study={s}
              busy={{
                delete: deletingId === s.id,
                patch: patchingId === s.id,
              }}
              onDelete={handleDelete}
              onToggleFavorite={(id, next) =>
                patchStudy(id, { favorited: next })
              }
              onToggleArchive={(id, next) =>
                patchStudy(id, { archived: next })
              }
              onAddTag={(id, tag) => {
                const study = studies.find((x) => x.id === id);
                if (!study) return;
                if (study.tags.includes(tag)) return;
                patchStudy(id, { tags: [...study.tags, tag] });
              }}
              onRemoveTag={(id, tag) => {
                const study = studies.find((x) => x.id === id);
                if (!study) return;
                patchStudy(id, { tags: study.tags.filter((t) => t !== tag) });
              }}
            />
          ))}
        </div>
      )}

      {/* Data Source Status */}
      <Card className="bg-white border-gray-200 text-gray-900">
        <CardHeader className="pb-2 pt-4 px-4 border-gray-100">
          <CardTitle className="text-sm font-semibold text-gray-900">
            数据源状态
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex items-center gap-x-6 gap-y-2 text-xs flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-gray-600">Yahoo Finance</span>
              <span className="text-green-600 font-medium">已接入</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-gray-600">SEC EDGAR</span>
              <span className="text-green-600 font-medium">已接入</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-green-400" />
              <span className="text-gray-600">DeepSeek</span>
              <span className="text-green-600 font-medium">已接入</span>
            </div>
            <Link
              href="/data-sources"
              className="text-blue-600 hover:underline ml-auto text-xs"
            >
              查看详情 →
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
