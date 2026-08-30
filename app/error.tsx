"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="fatal-error" role="alert">
      <p className="eyebrow">SEcode / 界面恢复</p>
      <h1>工作台暂时无法显示</h1>
      <p>本地服务仍可能保持运行。请重试渲染；若问题持续，请返回终端检查服务日志。</p>
      <button type="button" onClick={reset}>重新加载工作台</button>
    </main>
  );
}
