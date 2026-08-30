"use client";

import { useRef } from "react";

import type { ClientConfig } from "@/lib/client/types";

import { FolderIcon, SendIcon, StopIcon } from "./icons";

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  onContinue,
  disabled,
  running,
  canContinue,
  error,
  notice,
  workspacePath,
  workspaceState,
  onOpenWorkspace,
  models,
  modelProfileId,
  onModelChange,
  planningEnabled,
  onPlanningChange,
  submitLabel = "发送任务",
  spacious = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onContinue: () => void;
  disabled: boolean;
  running: boolean;
  canContinue: boolean;
  error?: string;
  notice?: string;
  workspacePath?: string;
  workspaceState?: "idle" | "validating" | "valid" | "error";
  onOpenWorkspace?: () => void;
  models?: ClientConfig["models"];
  modelProfileId?: string;
  onModelChange?: (value: string) => void;
  planningEnabled: boolean;
  onPlanningChange: (value: boolean) => void;
  submitLabel?: string;
  spacious?: boolean;
}) {
  const composing = useRef(false);
  return (
    <form className="composer" data-spacious={spacious} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <label className="sr-only" htmlFor="agent-prompt">编程任务</label>
      <textarea id="agent-prompt" value={value} disabled={disabled && !running} onChange={(event) => onChange(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !composing.current && !event.nativeEvent.isComposing) { event.preventDefault(); onSubmit(); } }} placeholder="描述你想构建、修复或理解的内容…" rows={spacious ? 5 : 3} />
      {onOpenWorkspace === undefined && models === undefined ? null : (
        <div className="composer-context">
          {onOpenWorkspace === undefined ? null : (
            <button className="composer-workspace" type="button" data-state={workspaceState ?? "idle"} onClick={onOpenWorkspace}>
              <FolderIcon />
              <span>{workspacePath === undefined ? "选择工作区" : workspacePath.split(/[\\/]+/u).filter(Boolean).at(-1) ?? workspacePath}</span>
              {workspacePath === undefined ? null : <small>已验证</small>}
            </button>
          )}
          {models === undefined || modelProfileId === undefined || onModelChange === undefined ? null : (
            <label className="composer-model">
              <span className="sr-only">模型</span>
              <select value={modelProfileId} onChange={(event) => onModelChange(event.target.value)}>
                <option value="">选择模型</option>
                {models.map((model) => <option key={model.id} value={model.id} disabled={!model.configured}>{model.label} · {model.model}{model.configured ? "" : "（未配置）"}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      <div className="composer-mode">
        <label>
          <input
            type="checkbox"
            checked={planningEnabled}
            disabled={running}
            onChange={(event) => onPlanningChange(event.target.checked)}
          />
          <span>先规划后执行</span>
        </label>
        <small>{planningEnabled ? "先只读分析，计划经你同意后在同一任务中执行" : "直接执行任务"}</small>
      </div>
      <div className="composer-footer">
        <div>{error !== undefined ? <span className="form-error" role="alert">{error}</span> : notice !== undefined ? <span className="form-note" role="status">{notice}</span> : <span>Enter 发送 · Shift + Enter 换行</span>}</div>
        <div className="composer-actions">
          {canContinue && !running ? <button type="button" onClick={onContinue}>继续上次任务</button> : null}
          {running ? <button className="stop-button" type="button" onClick={onStop}><StopIcon /> 停止</button> : <button className="composer-submit" type="submit" disabled={disabled || value.trim().length === 0} aria-label={submitLabel}><SendIcon /><span>{submitLabel}</span></button>}
        </div>
      </div>
    </form>
  );
}
