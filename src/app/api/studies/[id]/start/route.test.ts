import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all upstream deps before importing the route. Vitest hoists vi.mock
// calls to the top of the module, so this works even though it appears
// before the import statement.

vi.mock("@/lib/prisma", () => ({
  prisma: {
    study: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    studyProgress: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api", () => ({
  requireUser: vi.fn(),
  notFound: (msg: string) =>
    new Response(JSON.stringify({ error: msg }), { status: 404 }),
  serverError: () =>
    new Response(JSON.stringify({ error: "server" }), { status: 500 }),
}));

vi.mock("@/lib/backtest/runner", () => ({
  runBacktest: vi.fn(),
  stepsForFactorMix: () => [
    { name: "step1", description: "d" },
    { name: "step2", description: "d" },
  ],
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api";
import { runBacktest } from "@/lib/backtest/runner";

const mockedPrisma = prisma as unknown as {
  study: {
    findFirst: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  studyProgress: {
    upsert: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};
const mockedRequireUser = requireUser as unknown as ReturnType<typeof vi.fn>;
const mockedRunBacktest = runBacktest as unknown as ReturnType<typeof vi.fn>;

function makeReqCtx(id: string) {
  const req = new Request(`http://localhost/api/studies/${id}/start`, {
    method: "POST",
  });
  const ctx = { params: Promise.resolve({ id }) };
  return { req, ctx };
}

describe("/api/studies/[id]/start — atomic claim (Sprint #1 C2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequireUser.mockResolvedValue({
      session: { user: { id: "user-1" } },
      response: null,
    });
  });

  it("calls updateMany with status NOT RUNNING predicate (atomic claim)", async () => {
    mockedPrisma.study.findFirst.mockResolvedValue({
      id: "s1",
      status: "DRAFT",
      factorMix: "momentum",
    });
    mockedPrisma.study.updateMany.mockResolvedValue({ count: 1 });
    mockedPrisma.studyProgress.upsert.mockResolvedValue({ studyId: "s1" });

    const { req, ctx } = makeReqCtx("s1");
    await POST(req, ctx);

    expect(mockedPrisma.study.updateMany).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.study.updateMany).toHaveBeenCalledWith({
      where: {
        id: "s1",
        userId: "user-1",
        status: { not: "RUNNING" },
      },
      data: { status: "RUNNING" },
    });
  });

  it("kicks off runBacktest only when claim succeeds (count > 0)", async () => {
    mockedPrisma.study.findFirst.mockResolvedValue({
      id: "s1",
      status: "DRAFT",
      factorMix: "momentum",
    });
    mockedPrisma.study.updateMany.mockResolvedValue({ count: 1 });
    mockedPrisma.studyProgress.upsert.mockResolvedValue({ studyId: "s1" });

    const { req, ctx } = makeReqCtx("s1");
    await POST(req, ctx);

    expect(mockedRunBacktest).toHaveBeenCalledTimes(1);
    expect(mockedRunBacktest).toHaveBeenCalledWith("s1");
  });

  it("returns alreadyRunning + skips runner when claim count = 0", async () => {
    mockedPrisma.study.findFirst.mockResolvedValue({
      id: "s1",
      status: "RUNNING",
      factorMix: "momentum",
    });
    mockedPrisma.study.updateMany.mockResolvedValue({ count: 0 });
    mockedPrisma.studyProgress.findUnique.mockResolvedValue({
      studyId: "s1",
      currentStep: 3,
    });

    const { req, ctx } = makeReqCtx("s1");
    const res = await POST(req, ctx);
    const body = await res.json();

    expect(body.alreadyRunning).toBe(true);
    expect(mockedRunBacktest).not.toHaveBeenCalled();
    expect(mockedPrisma.studyProgress.upsert).not.toHaveBeenCalled();
  });

  it("returns 404 when findFirst returns null (study not found / not user's)", async () => {
    mockedPrisma.study.findFirst.mockResolvedValue(null);

    const { req, ctx } = makeReqCtx("does-not-exist");
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
    expect(mockedPrisma.study.updateMany).not.toHaveBeenCalled();
    expect(mockedRunBacktest).not.toHaveBeenCalled();
  });

  it("simulates concurrent /start: only one claim succeeds, the other gets alreadyRunning", async () => {
    // First request: findFirst sees DRAFT, updateMany succeeds.
    // Second request (parallel): findFirst sees DRAFT (not yet flipped), but
    // updateMany finds 0 rows (the claim's status:not RUNNING predicate
    // excludes the now-RUNNING row).
    mockedPrisma.study.findFirst.mockResolvedValue({
      id: "s1",
      status: "DRAFT",
      factorMix: "momentum",
    });
    let claimCount = 0;
    mockedPrisma.study.updateMany.mockImplementation(async () => {
      claimCount++;
      return { count: claimCount === 1 ? 1 : 0 };
    });
    mockedPrisma.studyProgress.upsert.mockResolvedValue({ studyId: "s1" });
    mockedPrisma.studyProgress.findUnique.mockResolvedValue({ studyId: "s1" });

    const { req: r1, ctx: c1 } = makeReqCtx("s1");
    const { req: r2, ctx: c2 } = makeReqCtx("s1");
    const [res1, res2] = await Promise.all([POST(r1, c1), POST(r2, c2)]);
    const body1 = await res1.json();
    const body2 = await res2.json();

    // Exactly one of them kicks off runBacktest.
    expect(mockedRunBacktest).toHaveBeenCalledTimes(1);
    // Exactly one returns alreadyRunning.
    const alreadyRunning = [body1.alreadyRunning, body2.alreadyRunning].filter(
      Boolean,
    );
    expect(alreadyRunning.length).toBe(1);
  });
});
