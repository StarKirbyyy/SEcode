"use client";

import { Composer } from "../workbench/composer";
import { useAppShell } from "../shell/app-shell-provider";

export function NewTaskPage() {
  const shell = useAppShell();
  const models = shell.config.status === "ready" ? shell.config.data.models : [];
  const noConfiguredModel = shell.config.status === "ready" && !shell.config.data.models.some((model) => model.configured);
  const unavailable = shell.modelProfileId.length === 0
    || shell.creating
    || shell.runActive;
  const submit = () => {
    if (shell.workspaceValidation !== "valid") {
      shell.setPickerOpen(true);
      return;
    }
    void shell.createAndStart();
  };

  return (
    <main className="new-task-page">
      <div className="new-task-content">
        <div className="new-task-intro">
          <span className="new-task-symbol" aria-hidden="true">S</span>
          <p className="eyebrow">LOCAL CODING AGENT</p>
          <h1>今天想一起完成什么？</h1>
          <p>选择一个本地工作区，描述目标。SEcode 会读取代码、修改文件并运行验证，每一步都可审计。</p>
        </div>
        <Composer
          value={shell.draft}
          onChange={shell.setDraft}
          onSubmit={submit}
          onStop={() => void shell.stopRun()}
          onContinue={shell.fillContinueDraft}
          disabled={unavailable}
          running={shell.runActive}
          canContinue={false}
          error={shell.createError?.message ?? shell.workspaceError?.message ?? (shell.config.status === "error" ? shell.config.error.message : noConfiguredModel ? "当前没有可用的模型配置。请先在服务端配置模型凭据。" : undefined)}
          notice={shell.workspaceValidation === "validating" ? "正在验证工作区…" : undefined}
          workspacePath={shell.workspacePath}
          workspaceState={shell.workspaceValidation}
          onOpenWorkspace={() => { if (shell.requestNavigation(undefined)) shell.setPickerOpen(true); }}
          models={models}
          modelProfileId={shell.modelProfileId}
          onModelChange={shell.setModelProfileId}
          planningEnabled={shell.planningEnabled}
          onPlanningChange={shell.setPlanningEnabled}
          submitLabel={shell.creating ? "正在创建" : "开始任务"}
          spacious
        />
        <div className="new-task-hints" aria-label="使用提示">
          <span>工作区内文件读写</span>
          <span>危险操作需审批</span>
          <span>本地 JSONL 历史</span>
        </div>
      </div>
    </main>
  );
}
