"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  createApiClient,
  deriveSessionTitle,
  parseAgentEventStream,
  selectConfiguredModelId,
  UiClientError,
  type ApiClient,
} from "@/lib/client";
import {
  HistoryLoadOwnership,
  canCommitCompleteHistory,
  loadCompleteHistory,
} from "@/lib/client/history-reconciliation";
import {
  CLOSED_SESSION_DELETION,
  beginSessionDeletion,
  failSessionDeletion,
  markSessionDeletionPending,
  reconcileSessionDeletion,
  type SessionDeletionState,
} from "@/lib/client/session-deletion";
import {
  createEventLedger,
  mergeAgentEvent,
  type EventLedger,
} from "@/lib/client/event-state";
import type {
  ClientConfig,
  EventPageResponse,
  PublicSessionMetadata,
  RecentWorkspaces,
} from "@/lib/client/types";
import type { WorkspacePermissionMode } from "@/lib/approval";

export type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: UiClientError };

export type HistoryState =
  | { status: "idle" }
  | { status: "loading"; sessionId: string }
  | {
      status: "ready";
      sessionId: string;
      ledger: EventLedger;
      recovery: EventPageResponse["recovery"];
    }
  | { status: "error"; sessionId: string; error: UiClientError };

export type RunTransport = "idle" | "starting" | "streaming" | "stopping" | "error";
export type WorkspaceValidation = "idle" | "validating" | "valid" | "error";

const EMPTY_RECOVERY: EventPageResponse["recovery"] = {
  tailRepaired: false,
  discardedTailBytes: 0,
  lastStableSeq: 0,
  openRunIds: [],
};

function finiteError(error: unknown, fallback = "工作台操作失败"): UiClientError {
  return error instanceof UiClientError
    ? error
    : new UiClientError("UI_RESPONSE_INVALID", fallback, true);
}

interface AppShellContextValue {
  api: ApiClient;
  config: LoadState<ClientConfig>;
  recent: LoadState<RecentWorkspaces>;
  sessions: LoadState<PublicSessionMetadata[]>;
  history: HistoryState;
  draft: string;
  setDraft(value: string): void;
  planningEnabled: boolean;
  setPlanningEnabled(value: boolean): void;
  modelProfileId: string;
  setModelProfileId(value: string): void;
  workspacePath?: string;
  workspaceValidation: WorkspaceValidation;
  workspaceError?: UiClientError;
  pickerOpen: boolean;
  setPickerOpen(value: boolean): void;
  creating: boolean;
  createError?: UiClientError;
  runTransport: RunTransport;
  activeSessionId?: string;
  activeRunId?: string;
  runError?: UiClientError;
  cancelNotice?: string;
  navigationNotice?: string;
  workspacePermissionMode: WorkspacePermissionMode;
  sessionDeletion: SessionDeletionState;
  runActive: boolean;
  loadConfig(signal?: AbortSignal): Promise<void>;
  loadRecent(signal?: AbortSignal): Promise<void>;
  loadSessions(signal?: AbortSignal): Promise<void>;
  loadHistory(sessionId: string, signal?: AbortSignal): Promise<void>;
  selectWorkspacePath(workspacePath: string): Promise<boolean>;
  createAndStart(): Promise<void>;
  submitRun(sessionId: string): Promise<void>;
  stopRun(): Promise<void>;
  fillContinueDraft(): void;
  resolveApproval(runId: string, approvalId: string, approved: boolean, reason?: string): Promise<void>;
  resolvePlanApproval(runId: string, planId: string, approvalId: string, approved: boolean, reason?: string): Promise<void>;
  loadWorkspacePermission(workspacePath: string): Promise<void>;
  setWorkspacePermission(workspacePath: string, mode: WorkspacePermissionMode): Promise<void>;
  requestNavigation(sessionId?: string): boolean;
  startNewTask(): boolean;
  startNewTaskInWorkspace(workspacePath: string): Promise<void>;
  openSessionDeletion(session: PublicSessionMetadata): void;
  closeSessionDeletion(): void;
  confirmSessionDeletion(currentSessionId?: string): Promise<void>;
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function useAppShell(): AppShellContextValue {
  const value = useContext(AppShellContext);
  if (value === null) throw new Error("useAppShell must be used inside AppShellProvider");
  return value;
}

export function AppShellProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const api = useMemo(() => createApiClient(), []);
  const [config, setConfig] = useState<LoadState<ClientConfig>>({ status: "loading" });
  const [recent, setRecent] = useState<LoadState<RecentWorkspaces>>({ status: "loading" });
  const [sessions, setSessions] = useState<LoadState<PublicSessionMetadata[]>>({ status: "loading" });
  const [history, setHistory] = useState<HistoryState>({ status: "idle" });
  const [draft, setDraft] = useState("");
  const [planningEnabled, setPlanningEnabled] = useState(false);
  const [modelProfileId, setModelProfileId] = useState("");
  const [workspacePath, setWorkspacePath] = useState<string>();
  const [workspaceValidation, setWorkspaceValidation] = useState<WorkspaceValidation>("idle");
  const [workspaceError, setWorkspaceError] = useState<UiClientError>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<UiClientError>();
  const [runTransport, setRunTransport] = useState<RunTransport>("idle");
  const [activeSessionId, setActiveSessionId] = useState<string>();
  const [activeRunId, setActiveRunId] = useState<string>();
  const [runError, setRunError] = useState<UiClientError>();
  const [cancelNotice, setCancelNotice] = useState<string>();
  const [navigationNotice, setNavigationNotice] = useState<string>();
  const [workspacePermissionMode, setWorkspacePermissionMode] = useState<WorkspacePermissionMode>("ask");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sessionDeletion, setSessionDeletion] = useState<SessionDeletionState>(
    CLOSED_SESSION_DELETION,
  );
  const validationToken = useRef(0);
  const streamController = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | undefined>(undefined);
  const submissionLock = useRef(false);
  const deletionLock = useRef(false);
  const historyRef = useRef<HistoryState>({ status: "idle" });
  const historyLoadOwnership = useRef(new HistoryLoadOwnership());
  const sessionDeletionRef = useRef<SessionDeletionState>(CLOSED_SESSION_DELETION);

  const replaceHistory = useCallback((next: HistoryState | ((current: HistoryState) => HistoryState)) => {
    setHistory((current) => {
      const value = typeof next === "function" ? next(current) : next;
      historyRef.current = value;
      return value;
    });
  }, []);

  const replaceSessionDeletion = useCallback((next: SessionDeletionState) => {
    sessionDeletionRef.current = next;
    setSessionDeletion(next);
  }, []);

  const showNavigationNotice = useCallback((message: string) => {
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
    setNavigationNotice(message);
    noticeTimer.current = setTimeout(() => {
      noticeTimer.current = null;
      setNavigationNotice(undefined);
    }, 4_000);
  }, []);

  useEffect(() => () => {
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
  }, []);

  const loadConfig = useCallback(async (signal?: AbortSignal) => {
    setConfig({ status: "loading" });
    try {
      const value = await api.getConfig(signal);
      setConfig({ status: "ready", data: value });
      setModelProfileId((current) => selectConfiguredModelId(value.models, current) ?? "");
    } catch (error) {
      if (signal?.aborted) return;
      setConfig({ status: "error", error: finiteError(error, "模型配置加载失败") });
    }
  }, [api]);

  const loadRecent = useCallback(async (signal?: AbortSignal) => {
    setRecent({ status: "loading" });
    try {
      setRecent({ status: "ready", data: await api.getRecentWorkspaces(signal) });
    } catch (error) {
      if (signal?.aborted) return;
      setRecent({ status: "error", error: finiteError(error, "最近工作区加载失败") });
    }
  }, [api]);

  const loadSessions = useCallback(async (signal?: AbortSignal) => {
    setSessions({ status: "loading" });
    try {
      setSessions({ status: "ready", data: (await api.getSessions(signal)).sessions });
    } catch (error) {
      if (signal?.aborted) return;
      setSessions({ status: "error", error: finiteError(error, "会话列表加载失败") });
    }
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    void api.getConfig(controller.signal).then((value) => {
      setConfig({ status: "ready", data: value });
      setModelProfileId((current) => selectConfiguredModelId(value.models, current) ?? "");
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setConfig({ status: "error", error: finiteError(error, "模型配置加载失败") });
    });
    void api.getRecentWorkspaces(controller.signal).then((value) => {
      setRecent({ status: "ready", data: value });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setRecent({ status: "error", error: finiteError(error, "最近工作区加载失败") });
    });
    void api.getSessions(controller.signal).then(({ sessions: value }) => {
      setSessions({ status: "ready", data: value });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setSessions({ status: "error", error: finiteError(error, "会话列表加载失败") });
    });
    return () => controller.abort();
  }, [api]);

  useEffect(() => () => {
    streamController.current?.abort();
    historyLoadOwnership.current.invalidate();
  }, []);

  const recoverHistory = useCallback(async (
    sessionId: string,
    signal?: AbortSignal,
    force = false,
  ) => {
    const current = historyRef.current;
    if (!force && current.status === "ready" && current.sessionId === sessionId) return;
    const ticket = historyLoadOwnership.current.begin(sessionId);
    const preservesReady = current.status === "ready" && current.sessionId === sessionId;
    if (!preservesReady) replaceHistory({ status: "loading", sessionId });
    try {
      const candidate = await loadCompleteHistory(
        sessionId,
        (targetSessionId, after, pageSignal) =>
          api.getEvents(targetSessionId, after, pageSignal),
        signal,
      );
      if (!historyLoadOwnership.current.owns(ticket) || signal?.aborted) return;
      const latest = historyRef.current;
      const visible = latest.status === "ready" && latest.sessionId === sessionId
        ? latest.ledger
        : undefined;
      if (!canCommitCompleteHistory(visible, candidate)) return;
      replaceHistory({
        status: "ready",
        sessionId,
        ledger: candidate.ledger,
        recovery: candidate.recovery,
      });
    } catch (error) {
      if (
        signal?.aborted
        || !historyLoadOwnership.current.owns(ticket)
      ) return;
      const finite = finiteError(error, "历史恢复失败");
      const latest = historyRef.current;
      if (latest.status === "ready" && latest.sessionId === sessionId) {
        setRunError(finite);
        return;
      }
      replaceHistory({ status: "error", sessionId, error: finite });
    }
  }, [api, replaceHistory]);

  const loadHistory = useCallback(
    (sessionId: string, signal?: AbortSignal) => recoverHistory(sessionId, signal),
    [recoverHistory],
  );

  const selectWorkspacePath = useCallback(async (candidate: string) => {
    const token = validationToken.current + 1;
    validationToken.current = token;
    setWorkspacePath(candidate);
    setWorkspaceValidation("validating");
    setWorkspaceError(undefined);
    setCreateError(undefined);
    try {
      const validated = await api.validateWorkspace(candidate);
      if (validationToken.current !== token) return false;
      setWorkspacePath(validated.workspacePath);
      setWorkspaceValidation("valid");
      setPickerOpen(false);
      return true;
    } catch (error) {
      if (validationToken.current !== token) return false;
      setWorkspaceValidation("error");
      setWorkspaceError(finiteError(error, "工作区验证失败"));
      return false;
    }
  }, [api]);

  const loadWorkspacePermission = useCallback(async (candidate: string) => {
    try {
      const value = await api.getWorkspacePermission(candidate);
      setWorkspacePermissionMode(value.mode);
    } catch (error) {
      setWorkspacePermissionMode("ask");
      showNavigationNotice(finiteError(error, "工作区权限加载失败").message);
    }
  }, [api, showNavigationNotice]);

  const updateWorkspacePermission = useCallback(async (candidate: string, mode: WorkspacePermissionMode) => {
    const value = await api.setWorkspacePermission(candidate, mode);
    setWorkspacePermissionMode(value.mode);
  }, [api]);

  const runActive = runTransport === "starting" || runTransport === "streaming" || runTransport === "stopping";

  const requestNavigation = useCallback((sessionId?: string) => {
    if (runActive && sessionId !== activeSessionId) {
      showNavigationNotice("当前任务仍在运行。请先停止任务，再切换会话。");
      return false;
    }
    setNavigationNotice(undefined);
    return true;
  }, [activeSessionId, runActive, showNavigationNotice]);

  const startNewTask = useCallback(() => {
    if (!requestNavigation(undefined)) return false;
    validationToken.current += 1;
    historyLoadOwnership.current.invalidate();
    setDraft("");
    setWorkspacePath(undefined);
    setWorkspaceValidation("idle");
    setWorkspaceError(undefined);
    setCreateError(undefined);
    replaceHistory({ status: "idle" });
    return true;
  }, [replaceHistory, requestNavigation]);

  const startNewTaskInWorkspace = useCallback(async (candidate: string) => {
    if (!startNewTask()) return;
    const selected = await selectWorkspacePath(candidate);
    if (selected) router.push("/");
  }, [router, selectWorkspacePath, startNewTask]);

  const openSessionDeletion = useCallback((session: PublicSessionMetadata) => {
    if (runActive && activeSessionId === session.id) {
      showNavigationNotice("当前任务仍在运行。请先停止任务并等待结束，再删除对话。");
      return;
    }
    setNavigationNotice(undefined);
    replaceSessionDeletion(beginSessionDeletion(session));
  }, [activeSessionId, replaceSessionDeletion, runActive, showNavigationNotice]);

  const closeSessionDeletion = useCallback(() => {
    if (deletionLock.current) return;
    replaceSessionDeletion(CLOSED_SESSION_DELETION);
  }, [replaceSessionDeletion]);

  const confirmSessionDeletion = useCallback(async (currentSessionId?: string) => {
    if (deletionLock.current) return;
    const current = sessionDeletionRef.current;
    if (current.status !== "confirming" && current.status !== "error") return;
    const target = current.session;
    deletionLock.current = true;
    replaceSessionDeletion(markSessionDeletionPending(current));

    const reconcile = (sessionId: string) => {
      setSessions((value) => {
        if (value.status !== "ready") return value;
        return {
          status: "ready",
          data: reconcileSessionDeletion(
            value.data,
            sessionId,
            currentSessionId,
          ).sessions,
        };
      });
      if (currentSessionId === sessionId) {
        historyLoadOwnership.current.invalidate();
        replaceHistory({ status: "idle" });
        setDraft("");
        router.replace("/");
      }
    };

    try {
      await api.deleteSession(target.id);
      reconcile(target.id);
      replaceSessionDeletion(CLOSED_SESSION_DELETION);
      showNavigationNotice(`已删除对话“${target.title}”；工作区项目文件未受影响。`);
      void loadRecent();
    } catch (error) {
      const finite = finiteError(error, "删除对话失败");
      if (finite.code === "SESSION_NOT_FOUND") {
        reconcile(target.id);
        replaceSessionDeletion(CLOSED_SESSION_DELETION);
        showNavigationNotice("该对话已不存在，列表已重新协调。工作区项目文件未受影响。");
        void loadRecent();
      } else {
        replaceSessionDeletion(
          failSessionDeletion(sessionDeletionRef.current, finite),
        );
      }
    } finally {
      deletionLock.current = false;
      void loadSessions();
    }
  }, [api, loadRecent, loadSessions, replaceHistory, replaceSessionDeletion, router, showNavigationNotice]);

  const startRunForSession = useCallback(async (
    sessionId: string,
    prompt: string,
    usePlanning: boolean,
  ) => {
    if (submissionLock.current || prompt.trim().length === 0) return;
    submissionLock.current = true;
    const controller = new AbortController();
    streamController.current = controller;
    setActiveSessionId(sessionId);
    setRunTransport("starting");
    setRunError(undefined);
    setCancelNotice(undefined);
    setNavigationNotice(undefined);
    let terminalSeen = false;
    try {
      const response = await api.startRun(
        sessionId,
        prompt.trim(),
        { planningEnabled: usePlanning },
        controller.signal,
      );
      setRunTransport("streaming");
      for await (const event of parseAgentEventStream(response.body!)) {
        if (event.sessionId !== sessionId) {
          throw new UiClientError("UI_STREAM_INVALID", "运行流返回了错误会话的事件", true);
        }
        if (event.type === "run.started") {
          if (event.runId === undefined) throw new UiClientError("UI_STREAM_INVALID", "运行开始事件缺少运行标识", true);
          activeRunIdRef.current = event.runId;
          setActiveRunId(event.runId);
        }
        if (event.type === "user.message") setDraft("");
        if (
          event.type === "run.completed"
          || event.type === "run.failed"
          || event.type === "run.cancelled"
          || event.type === "run.interrupted"
        ) terminalSeen = true;
        replaceHistory((current) => {
          if (current.status !== "ready" || current.sessionId !== sessionId) return current;
          return { ...current, ledger: mergeAgentEvent(current.ledger, event) };
        });
      }
      if (!terminalSeen) {
        throw new UiClientError(
          "UI_STREAM_ENDED_EARLY",
          "运行事件流在终态到达前结束，正在从历史协调",
          true,
        );
      }
      setRunTransport("idle");
    } catch (error) {
      if (controller.signal.aborted && activeRunIdRef.current === undefined) {
        setRunTransport("idle");
      } else {
        setRunTransport("error");
        setRunError(finiteError(error, "运行失败"));
      }
    } finally {
      if (streamController.current === controller) streamController.current = null;
      activeRunIdRef.current = undefined;
      setActiveRunId(undefined);
      setActiveSessionId(undefined);
      submissionLock.current = false;
      const beforeReload = historyRef.current;
      if (beforeReload.status === "ready" && beforeReload.sessionId === sessionId) {
        await recoverHistory(sessionId, undefined, true);
      }
      if (terminalSeen) setRunTransport("idle");
    }
  }, [api, recoverHistory, replaceHistory]);

  const submitRun = useCallback(async (sessionId: string) => {
    if (runActive || historyRef.current.status !== "ready" || historyRef.current.sessionId !== sessionId) return;
    await startRunForSession(sessionId, draft, planningEnabled);
  }, [draft, planningEnabled, runActive, startRunForSession]);

  const createAndStart = useCallback(async () => {
    const prompt = draft.trim();
    if (
      creating
      || submissionLock.current
      || workspaceValidation !== "valid"
      || workspacePath === undefined
      || modelProfileId.length === 0
      || prompt.length === 0
    ) return;
    submissionLock.current = true;
    setCreating(true);
    setCreateError(undefined);
    try {
      const title = deriveSessionTitle(prompt);
      const created = await api.createSession({
        workspacePath,
        modelProfileId,
        ...(title === undefined ? {} : { title }),
      });
      const metadata: PublicSessionMetadata = {
        id: created.session.id,
        title: created.session.title,
        workspacePath: created.session.workspacePath,
        modelProfileId: created.session.modelProfileId,
        createdAt: created.session.createdAt,
      };
      setSessions((current) => ({
        status: "ready",
        data: [
          metadata,
          ...(current.status === "ready"
            ? current.data.filter((session) => session.id !== metadata.id)
            : []),
        ],
      }));
      const ledger = mergeAgentEvent(createEventLedger(metadata.id), created.event);
      replaceHistory({ status: "ready", sessionId: metadata.id, ledger, recovery: EMPTY_RECOVERY });
      router.push(`/sessions/${encodeURIComponent(metadata.id)}`);
      void loadRecent();
      submissionLock.current = false;
      setCreating(false);
      await startRunForSession(metadata.id, prompt, planningEnabled);
    } catch (error) {
      submissionLock.current = false;
      setCreateError(finiteError(error, "会话创建失败"));
    } finally {
      setCreating(false);
    }
  }, [api, creating, draft, loadRecent, modelProfileId, planningEnabled, replaceHistory, router, startRunForSession, workspacePath, workspaceValidation]);

  const stopRun = useCallback(async () => {
    if (runTransport === "starting" && activeRunIdRef.current === undefined) {
      streamController.current?.abort();
      setCancelNotice("已取消尚未建立的运行请求。");
      return;
    }
    const runId = activeRunIdRef.current;
    if (runId === undefined || runTransport === "stopping") return;
    setRunTransport("stopping");
    setRunError(undefined);
    try {
      const result = await api.cancelRun(runId, "用户从 Web 工作台请求停止");
      setCancelNotice(result.status === "already_requested"
        ? "停止请求已提交，正在等待运行收口。"
        : "已请求停止，正在等待终态事件。");
    } catch (error) {
      setRunTransport("error");
      setRunError(finiteError(error, "停止任务失败"));
    }
  }, [api, runTransport]);

  const fillContinueDraft = useCallback(() => {
    setDraft("请继续上一次任务。先根据已有事件和当前工作区状态确认未完成事项，再完成必要修改与验证。不要重复已经成功的步骤。");
  }, []);

  const resolveApproval = useCallback(async (
    runId: string,
    approvalId: string,
    approved: boolean,
    reason?: string,
  ) => {
    await api.resolveApproval(runId, approvalId, {
      approved,
      ...(reason === undefined || reason.trim().length === 0 ? {} : { reason: reason.trim() }),
    });
  }, [api]);

  const resolvePlanApproval = useCallback(async (
    runId: string,
    planId: string,
    approvalId: string,
    approved: boolean,
    reason?: string,
  ) => {
    await api.resolvePlanApproval(runId, approvalId, {
      planId,
      approved,
      ...(reason === undefined || reason.trim().length === 0 ? {} : { reason: reason.trim() }),
    });
  }, [api]);

  const value = useMemo<AppShellContextValue>(() => ({
    api,
    config,
    recent,
    sessions,
    history,
    draft,
    setDraft,
    planningEnabled,
    setPlanningEnabled,
    modelProfileId,
    setModelProfileId,
    ...(workspacePath === undefined ? {} : { workspacePath }),
    workspaceValidation,
    ...(workspaceError === undefined ? {} : { workspaceError }),
    pickerOpen,
    setPickerOpen,
    creating,
    ...(createError === undefined ? {} : { createError }),
    runTransport,
    ...(activeSessionId === undefined ? {} : { activeSessionId }),
    ...(activeRunId === undefined ? {} : { activeRunId }),
    ...(runError === undefined ? {} : { runError }),
    ...(cancelNotice === undefined ? {} : { cancelNotice }),
    ...(navigationNotice === undefined ? {} : { navigationNotice }),
    workspacePermissionMode,
    sessionDeletion,
    runActive,
    loadConfig,
    loadRecent,
    loadSessions,
    loadHistory,
    selectWorkspacePath,
    createAndStart,
    submitRun,
    stopRun,
    fillContinueDraft,
    resolveApproval,
    resolvePlanApproval,
    loadWorkspacePermission,
    setWorkspacePermission: updateWorkspacePermission,
    requestNavigation,
    startNewTask,
    startNewTaskInWorkspace,
    openSessionDeletion,
    closeSessionDeletion,
    confirmSessionDeletion,
  }), [
    activeRunId,
    activeSessionId,
    api,
    cancelNotice,
    config,
    createAndStart,
    createError,
    creating,
    closeSessionDeletion,
    confirmSessionDeletion,
    draft,
    fillContinueDraft,
    history,
    loadConfig,
    loadHistory,
    loadWorkspacePermission,
    loadRecent,
    loadSessions,
    modelProfileId,
    navigationNotice,
    workspacePermissionMode,
    openSessionDeletion,
    pickerOpen,
    planningEnabled,
    recent,
    requestNavigation,
    resolveApproval,
    resolvePlanApproval,
    runActive,
    runError,
    runTransport,
    selectWorkspacePath,
    sessions,
    sessionDeletion,
    startNewTask,
    startNewTaskInWorkspace,
    stopRun,
    submitRun,
    workspaceError,
    workspacePath,
    workspaceValidation,
    updateWorkspacePermission,
  ]);

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}
