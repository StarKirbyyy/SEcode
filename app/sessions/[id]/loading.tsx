export default function SessionLoading() {
  return (
    <main className="session-page session-page--loading" aria-busy="true">
      <div className="session-loading-line" />
      <div className="session-loading-line session-loading-line--short" />
      <p role="status">正在恢复会话事件…</p>
    </main>
  );
}
