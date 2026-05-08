import { Suspense } from "react";
import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";

async function loginAction() {
  "use server";
  await signIn("github", { redirectTo: "/" });
}

function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 .297a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.05c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.21.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.31-5.47-1.33-5.47-5.94 0-1.31.47-2.39 1.24-3.23-.13-.31-.54-1.55.11-3.22 0 0 1.01-.32 3.3 1.23.96-.27 1.98-.4 3-.4 1.02 0 2.04.13 3 .4 2.29-1.55 3.3-1.23 3.3-1.23.66 1.67.25 2.91.12 3.22.77.84 1.24 1.92 1.24 3.23 0 4.62-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .297" />
    </svg>
  );
}

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="text-center mb-8">
          <h1 className="text-lg font-bold text-blue-600">AI Quant Copilot</h1>
          <p className="text-xs text-gray-500 mt-1">量化研究副驾驶</p>
        </div>

        <Suspense>
          <form action={loginAction}>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              <GithubMark className="h-4 w-4" />
              使用 GitHub 登录
            </button>
          </form>
        </Suspense>

        <p className="text-[11px] text-gray-400 text-center mt-6 leading-relaxed">
          首次登录将自动创建账户，并初始化几条 demo 研究。
        </p>
      </div>
    </div>
  );
}
