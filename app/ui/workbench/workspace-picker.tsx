"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { UiClientError, type ApiClient } from "@/lib/client";
import type { BrowseWorkspaceResponse } from "@/lib/client/types";

import { BottomSheet } from "./bottom-sheet";

function finiteError(error: unknown) {
  return error instanceof UiClientError ? error : new UiClientError("UI_RESPONSE_INVALID", "目录响应无效", true);
}

export function WorkspacePicker({
  open,
  api,
  recentWorkspaces = [],
  validation = "idle",
  validationError,
  onClose,
  onSelectPath,
  onSelect,
}: {
  open: boolean;
  api: ApiClient;
  recentWorkspaces?: readonly string[];
  validation?: "idle" | "validating" | "valid" | "error";
  validationError?: string;
  onClose: () => void;
  onSelectPath?: (workspacePath: string) => Promise<boolean>;
  onSelect?: (location: BrowseWorkspaceResponse["current"]) => void;
}) {
  const [state, setState] = useState<{ status: "loading" } | { status: "ready"; data: BrowseWorkspaceResponse } | { status: "error"; error: UiClientError }>({ status: "loading" });
  const [selectedName, setSelectedName] = useState<string>();
  const requestId = useRef(0);
  const activeController = useRef<AbortController | null>(null);

  const browse = useCallback(async (segments: string[]) => {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setSelectedName(undefined);
    setState({ status: "loading" });
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    try {
      const data = await api.browseWorkspaces(segments, controller.signal);
      if (requestId.current === currentRequest) setState({ status: "ready", data });
    } catch (error) {
      if (requestId.current === currentRequest) setState({ status: "error", error: finiteError(error) });
    }
  }, [api]);

  useEffect(() => {
    if (!open) return;
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    const controller = new AbortController();
    activeController.current = controller;
    void api.browseWorkspaces([], controller.signal).then((data) => {
      if (requestId.current === currentRequest) setState({ status: "ready", data });
    }).catch((error: unknown) => {
      if (requestId.current === currentRequest && !controller.signal.aborted) setState({ status: "error", error: finiteError(error) });
    });
    return () => {
      requestId.current += 1;
      controller.abort();
    };
  }, [api, open]);

  const selected = state.status === "ready" ? state.data.directories.find((directory) => directory.name === selectedName) : undefined;
  const enterSelected = () => { if (selected !== undefined) void browse(selected.segments); };

  return (
    <BottomSheet open={open} title="选择工作区" onClose={onClose} labelledBy="picker-title">
      <div className="picker-head">
        <div><p className="eyebrow">LOCAL WORKSPACE</p><h2 id="picker-title">选择工作区</h2><p>只显示服务端允许区域中的目录。</p></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="关闭工作区选择">×</button>
      </div>
      {recentWorkspaces.length > 0 ? (
        <section className="picker-recents" aria-labelledby="recent-workspaces-title">
          <h3 id="recent-workspaces-title">最近使用</h3>
          <div>
            {recentWorkspaces.map((workspace) => (
              <button type="button" key={workspace} title={workspace} disabled={validation === "validating" || onSelectPath === undefined} onClick={() => void onSelectPath?.(workspace)}>
                <span>{workspace.split(/[\\/]+/u).filter(Boolean).at(-1) ?? workspace}</span>
                <small>{workspace}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {state.status === "loading" ? <div className="picker-state" role="status">正在读取允许的目录…</div> : null}
      {state.status === "error" ? (
        <div className="picker-state picker-state--error" role="alert">
          <strong>{state.error.message}</strong>
          {state.error.code === "API_WORKSPACE_PICKER_UNAVAILABLE" || state.error.code === "API_WORKSPACE_PICKER_CONFIG_INVALID" ? <p>请在 <code>.env.local</code> 设置 <code>SECODE_WORKSPACE_PICKER_ROOT</code> 后重启开发服务器。</p> : null}
          <button type="button" onClick={() => void browse([])}>重试</button>
        </div>
      ) : null}
      {state.status === "ready" ? (
        <>
          <div className="picker-location">
            <span>当前位置</span>
            <code title={state.data.current.workspacePath}>{state.data.current.workspacePath}</code>
          </div>
          <nav className="breadcrumbs" aria-label="目录层级">
            <button type="button" onClick={() => void browse([])}>{state.data.root.label}</button>
            {state.data.current.segments.map((segment, index) => <button type="button" key={`${segment}-${index}`} onClick={() => void browse(state.data.current.segments.slice(0, index + 1))}>/ {segment}</button>)}
          </nav>
          <div className="picker-toolbar">
            <button type="button" disabled={state.data.parentSegments === null} onClick={() => { if (state.data.parentSegments !== null) void browse(state.data.parentSegments); }}>返回上级</button>
            <button type="button" disabled={selected === undefined} onClick={enterSelected}>进入所选目录</button>
          </div>
          <div className="directory-list" role="listbox" aria-label="子目录">
            {state.data.directories.length === 0 ? <p className="empty-state">当前目录没有可选择的子目录。</p> : state.data.directories.map((directory) => (
              <button className="directory-row" data-selected={directory.name === selectedName} type="button" role="option" aria-selected={directory.name === selectedName} key={directory.name} onClick={() => setSelectedName(directory.name)} onDoubleClick={() => void browse(directory.segments)}>
                <span aria-hidden="true">⌁</span><span>{directory.name}</span>{directory.symbolicLink ? <small>内部链接</small> : null}
              </button>
            ))}
          </div>
          {state.data.truncated || state.data.blockedEntries > 0 ? <p className="picker-note">{state.data.truncated ? "仅显示排序后的前 500 个目录。" : ""}{state.data.blockedEntries > 0 ? ` ${state.data.blockedEntries} 个越界、失效或不可访问条目已阻止。` : ""}</p> : null}
          {validationError === undefined ? null : <p className="form-error" role="alert">{validationError}</p>}
          <div className="picker-actions"><button type="button" onClick={onClose}>取消</button><button className="primary-button" type="button" disabled={validation === "validating"} onClick={() => { if (onSelectPath !== undefined) void onSelectPath(state.data.current.workspacePath); else onSelect?.(state.data.current); }}>{validation === "validating" ? "正在验证…" : "选择当前目录"}</button></div>
        </>
      ) : null}
    </BottomSheet>
  );
}
