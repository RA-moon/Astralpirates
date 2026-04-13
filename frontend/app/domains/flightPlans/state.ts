import { computed, isRef, onScopeDispose, ref, watch, type Ref } from 'vue';
import { useSessionStore } from '~/stores/session';
import {
  createFlightPlanTask,
  deleteFlightPlanTaskAttachment,
  deleteFlightPlanTask,
  fetchFlightPlanMembers,
  fetchFlightPlanTasks,
  inviteFlightPlanMember,
  normaliseFlightPlanSlug,
  addFlightPlanTaskLink,
  deleteFlightPlanTaskLink,
  promoteFlightPlanMember,
  searchFlightPlanInvitees,
  uploadFlightPlanTaskAttachment,
  updateFlightPlanTask,
  type FlightPlanInvitee,
  type FlightPlanMember,
} from './api';
import { normalizeIdentifier } from '~/utils/identifiers';
import { resolveAstralApiBase } from '~/modules/api/requestFetch';
import {
  FLIGHT_PLAN_TASK_STATES,
  getFlightPlanTaskStateMeta,
  type FlightPlanTask,
} from '@astralpirates/shared/api-contracts';
import { reportClientEvent } from '~/utils/errorReporter';

type MaybeRefOrGetter<T> = T | Ref<T> | (() => T);

const resolveValue = <T>(source: MaybeRefOrGetter<T>): T => {
  if (typeof source === 'function') {
    return (source as () => T)();
  }
  if (isRef(source)) {
    return (source as Ref<T>).value;
  }
  return source;
};

type CrewOptions = {
  allowPublicRoster?: MaybeRefOrGetter<boolean | null | undefined>;
};

const TASK_STATE_ORDER = new Map<string, number>(
  FLIGHT_PLAN_TASK_STATES.map((state, index) => [state, index]),
);

const sortTasks = (entries: FlightPlanTask[]): FlightPlanTask[] => {
  return [...entries].sort((a, b) => {
    const stateOrder =
      (TASK_STATE_ORDER.get(a.state) ?? FLIGHT_PLAN_TASK_STATES.length) -
      (TASK_STATE_ORDER.get(b.state) ?? FLIGHT_PLAN_TASK_STATES.length);
    if (stateOrder !== 0) return stateOrder;
    const listOrderA = typeof a.listOrder === 'number' ? a.listOrder : Number.MAX_SAFE_INTEGER;
    const listOrderB = typeof b.listOrder === 'number' ? b.listOrder : Number.MAX_SAFE_INTEGER;
    if (listOrderA !== listOrderB) return listOrderA - listOrderB;
    return a.id - b.id;
  });
};

export const useFlightPlanCrew = (
  flightPlanSlug: MaybeRefOrGetter<string | null | undefined>,
  options: CrewOptions = {},
) => {
  const session = useSessionStore();
  const members = ref<FlightPlanMember[]>([]);
  const loadingMembers = ref(false);
  const membersError = ref<string | null>(null);
  const pendingInvite = ref(false);
  const inviteFeedback = ref('');
  const inviteFeedbackIsError = ref(false);
  const invitees = ref<FlightPlanInvitee[]>([]);
  const searchingInvitees = ref(false);
  const inviteeError = ref<string | null>(null);

  const rawSlug = computed(() => resolveValue(flightPlanSlug));
  const slug = computed(() => normaliseFlightPlanSlug(rawSlug.value ?? null));

  const publicRosterSource = options.allowPublicRoster;
  const publicRosterEnabled = computed(() => {
    if (typeof publicRosterSource === 'undefined') return false;
    return Boolean(resolveValue(publicRosterSource));
  });

  const loadMembers = async () => {
    if (!session.isAuthenticated && !publicRosterEnabled.value) {
      members.value = [];
      return { ok: false as const, message: 'Authentication required.' };
    }
    const currentSlug = slug.value;
    if (!currentSlug) {
      members.value = [];
      return { ok: false as const, message: 'Flight plan unavailable.' };
    }
    loadingMembers.value = true;
    membersError.value = null;
    try {
      const response = await fetchFlightPlanMembers({
        auth: session.bearerToken,
        slug: currentSlug,
      });
      members.value = response;
      return { ok: true as const, memberships: members.value };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load crew manifests.';
      membersError.value = message;
      return { ok: false as const, message };
    } finally {
      loadingMembers.value = false;
    }
  };

  const inviteCrewmate = async (crewSlug: string) => {
    if (!session.isAuthenticated) {
      return { ok: false as const, message: 'Authentication required.' };
    }
    const currentSlug = slug.value;
    if (!currentSlug) {
      return { ok: false as const, message: 'Flight plan unavailable.' };
    }
    pendingInvite.value = true;
    inviteFeedback.value = '';
    inviteFeedbackIsError.value = false;
    try {
      const membership = await inviteFlightPlanMember({
        auth: session.bearerToken,
        slug: currentSlug,
        crewSlug,
      });
      members.value = [membership, ...members.value.filter((m) => m.id !== membership.id)];
      return { ok: true as const, membership };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send invitation.';
      inviteFeedback.value = message;
      inviteFeedbackIsError.value = true;
      return { ok: false as const, message };
    } finally {
      pendingInvite.value = false;
    }
  };

  const searchInvitees = async (query: string) => {
    if (!session.isAuthenticated) {
      invitees.value = [];
      return { ok: false as const, message: 'Authentication required.' };
    }
    const currentSlug = slug.value;
    if (!currentSlug) {
      invitees.value = [];
      return { ok: false as const, message: 'Flight plan unavailable.' };
    }
    if (!query.trim()) {
      invitees.value = [];
      inviteeError.value = null;
      return { ok: true as const, invitees: [] };
    }
    searchingInvitees.value = true;
    inviteeError.value = null;
    try {
      const results = await searchFlightPlanInvitees({
        auth: session.bearerToken,
        slug: currentSlug,
        query,
      });
      invitees.value = results;
      return { ok: true as const, invitees: results };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to search crew.';
      inviteeError.value = message;
      return { ok: false as const, message };
    } finally {
      searchingInvitees.value = false;
    }
  };

  const promoteGuest = async (membershipId: number) => {
    if (!session.isAuthenticated) {
      return { ok: false as const, message: 'Authentication required.' };
    }
    const currentSlug = slug.value;
    if (!currentSlug) {
      return { ok: false as const, message: 'Flight plan unavailable.' };
    }
    try {
      const membership = await promoteFlightPlanMember({
        auth: session.bearerToken,
        slug: currentSlug,
        membershipId,
      });
      members.value = members.value.map((member) =>
        member.id === membership.id ? membership : member,
      );
      return { ok: true as const, membership };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to promote crew member.';
      return { ok: false as const, message };
    }
  };

  const viewerMembership = computed(() => {
    const userId = normalizeIdentifier(session.currentUser?.id);
    if (!userId) return null;
    return (
      members.value.find((member) => normalizeIdentifier(member.userId) === userId) ?? null
    );
  });

  const viewerIsOwner = computed(
    () =>
      viewerMembership.value?.role === 'owner' && viewerMembership.value?.status === 'accepted',
  );

  const viewerIsCrewOrganiser = computed(
    () =>
      viewerMembership.value?.role === 'crew' && viewerMembership.value?.status === 'accepted',
  );

  const canInvite = computed(() => viewerIsOwner.value);

  watch(
    [slug, () => session.isAuthenticated, publicRosterEnabled],
    async ([resolvedSlug, authed, rosterEnabled]) => {
      if (!resolvedSlug) {
        members.value = [];
        return;
      }
      if (!authed && !rosterEnabled) {
        members.value = [];
        return;
      }
      await loadMembers();
    },
    { immediate: true },
  );

  return {
    members,
    loadingMembers,
    membersError,
    inviteFeedback,
    inviteFeedbackIsError,
    pendingInvite,
    invitees,
    searchingInvitees,
    inviteeError,
    loadMembers,
    inviteCrewmate,
    searchInvitees,
    promoteGuest,
    viewerMembership,
    viewerIsOwner,
    viewerIsCrewOrganiser,
    canInvite,
    publicRosterEnabled,
  };
};

type TaskMutationOptions = {
  description?: unknown;
  state?: FlightPlanTask['state'];
  assigneeMembershipIds?: number[];
  ownerMembershipId?: number;
  listOrder?: number;
  action?: 'claim' | 'unclaim';
};

export const useFlightPlanTasks = (
  flightPlanSlug: MaybeRefOrGetter<string | null | undefined>,
) => {
  const session = useSessionStore();
  const tasks = ref<FlightPlanTask[]>([]);
  const loadingTasks = ref(false);
  const tasksError = ref<string | null>(null);
  const creatingTask = ref(false);
  const updatingTaskIds = ref<number[]>([]);
  const deletingTaskIds = ref<number[]>([]);
  const etag = ref<string | null>(null);
  const stream = ref<EventSource | null>(null);
  const pollTimer = ref<ReturnType<typeof setInterval> | null>(null);

  const rawSlug = computed(() => resolveValue(flightPlanSlug));
  const slug = computed(() => normaliseFlightPlanSlug(rawSlug.value ?? null));

  const logTaskEvent = (action: string, meta: Record<string, unknown>, error?: unknown) => {
    const currentSlug = slug.value;
    if (!currentSlug) return;
    reportClientEvent({
      component: 'FlightPlanTasks',
      message: `flight-plan-task:${action}`,
      level: error ? 'error' : 'warn',
      meta: {
        flightPlanSlug: currentSlug,
        ...meta,
      },
      error,
    });
  };

  const markUpdating = (taskId: number) => {
    if (updatingTaskIds.value.includes(taskId)) return;
    updatingTaskIds.value = [...updatingTaskIds.value, taskId];
  };
  const unmarkUpdating = (taskId: number) => {
    updatingTaskIds.value = updatingTaskIds.value.filter((id) => id !== taskId);
  };
  const markDeleting = (taskId: number) => {
    if (deletingTaskIds.value.includes(taskId)) return;
    deletingTaskIds.value = [...deletingTaskIds.value, taskId];
  };
  const unmarkDeleting = (taskId: number) => {
    deletingTaskIds.value = deletingTaskIds.value.filter((id) => id !== taskId);
  };

  const replaceTask = (entry: FlightPlanTask) => {
    const existing = tasks.value.find((task) => task.id === entry.id);
    if (
      existing &&
      typeof existing.version === 'number' &&
      typeof entry.version === 'number' &&
      entry.version < existing.version
    ) {
      return;
    }
    tasks.value = sortTasks([entry, ...tasks.value.filter((task) => task.id !== entry.id)]);
  };

  const removeTask = (taskId: number) => {
    tasks.value = tasks.value.filter((task) => task.id !== taskId);
  };

  const canOptimisticallyApply = (changes: TaskMutationOptions) => {
    const keys = Object.keys(changes);
    if (!keys.length) return false;
    return keys.every((key) => key === 'state' || key === 'listOrder');
  };

  const loadTasks = async (options: { respectEtag?: boolean } = {}) => {
    const currentSlug = slug.value;
    if (!currentSlug || !session.isAuthenticated) {
      tasks.value = [];
      etag.value = null;
      tasksError.value = session.isAuthenticated ? 'Flight plan unavailable.' : 'Authentication required.';
      return { ok: false as const, message: tasksError.value ?? 'Unable to load tasks.' };
    }
    const manageLoadingState = !options.respectEtag;
    if (manageLoadingState) loadingTasks.value = true;
    tasksError.value = null;
    try {
      const response = await fetchFlightPlanTasks({
        auth: session.bearerToken,
        slug: currentSlug,
      });
      if (options.respectEtag && etag.value && response.etag && response.etag === etag.value) {
        return { ok: true as const, tasks: tasks.value, unchanged: true as const };
      }
      etag.value = response.etag ?? null;
      tasks.value = sortTasks(response.tasks);
      return { ok: true as const, tasks: tasks.value };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load mission tasks.';
      tasksError.value = message;
      tasks.value = [];
      etag.value = null;
      return { ok: false as const, message };
    } finally {
      if (manageLoadingState) loadingTasks.value = false;
    }
  };

  const stopPolling = () => {
    if (pollTimer.value) {
      clearInterval(pollTimer.value);
      pollTimer.value = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    pollTimer.value = setInterval(() => {
      loadTasks({ respectEtag: true }).catch(() => {});
    }, 25_000);
    pollTimer.value?.unref?.();
  };

  const stopStream = () => {
    if (stream.value) {
      stream.value.close();
      stream.value = null;
    }
  };

  let lastStreamErrorAt: number | null = null;

  const reportStreamError = (context: { slug: string }) => {
    const now = Date.now();
    if (lastStreamErrorAt && now - lastStreamErrorAt < 60_000) {
      return; // throttle noisy reconnects
    }
    lastStreamErrorAt = now;
    reportClientEvent({
      message: 'Flight plan task stream disconnected',
      component: 'flightPlanState',
      level: 'warn',
      meta: { slug: context.slug },
    });
  };

  const applyRemoteTask = (entry: FlightPlanTask | null | undefined) => {
    if (!entry) return;
    replaceTask(entry);
  };

  const handleStreamEvent = (type: string, payload: any) => {
    if (type === 'consistency-hint') {
      loadTasks().catch(() => {});
      return;
    }
    if (type === 'task-deleted' && payload?.taskId) {
      removeTask(Number(payload.taskId));
      return;
    }
    if (payload?.task) {
      applyRemoteTask(payload.task as FlightPlanTask);
    }
  };

  const buildStreamUrl = (value: string) => {
    const base = resolveAstralApiBase();
    const path = `/api/flight-plans/${encodeURIComponent(value)}/tasks/stream`;
    if (!base) return path;
    return `${base}${path}`;
  };

  const startStream = () => {
    if (typeof window === 'undefined') return;
    const currentSlug = slug.value;
    if (!currentSlug || !session.isAuthenticated) return;
    stopStream();
    const source = new EventSource(buildStreamUrl(currentSlug), {
      withCredentials: true,
    });
    const handledEvents = [
      'task-created',
      'task-updated',
      'task-moved',
      'task-deleted',
      'comment-created',
      'comment-updated',
      'comment-deleted',
      'attachment-added',
      'attachment-removed',
      'link-added',
      'link-removed',
      'consistency-hint',
    ];
    handledEvents.forEach((eventType) => {
      source.addEventListener(eventType, (event) => {
        const data = (event as MessageEvent)?.data ?? null;
        if (!data) return;
        try {
          const parsed = JSON.parse(data);
          handleStreamEvent(eventType, parsed);
        } catch {
          // ignore malformed events
        }
      });
    });
    source.onerror = () => {
      reportStreamError({ slug: currentSlug });
      stopStream();
      startPolling();
      setTimeout(() => {
        stopPolling();
        startStream();
      }, 8_000);
    };
    stream.value = source;
  };

  const createTask = async (payload: { title: string } & TaskMutationOptions) => {
    if (!session.isAuthenticated) {
      return { ok: false as const, message: 'Authentication required.' };
    }
    const currentSlug = slug.value;
    if (!currentSlug) {
      return { ok: false as const, message: 'Flight plan unavailable.' };
    }
    creatingTask.value = true;
    try {
      const task = await createFlightPlanTask({
        auth: session.bearerToken,
        slug: currentSlug,
        payload,
      });
      replaceTask(task);
      logTaskEvent('create', {
        taskId: task.id,
        state: task.state,
        assigneeCount: task.assigneeMembershipIds.length,
        hasDescription: Boolean(payload.description),
      });
      return { ok: true as const, task };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create mission task.';
      logTaskEvent(
        'create',
        {
          attemptedState: payload.state ?? null,
          assigneeCount: payload.assigneeMembershipIds?.length ?? 0,
        },
        error,
      );
      return { ok: false as const, message };
    } finally {
      creatingTask.value = false;
    }
  };

  const updateTask = async (taskId: number, payload: TaskMutationOptions) => {
    if (!session.isAuthenticated) {
      return { ok: false as const, message: 'Authentication required.' };
    }
    const currentSlug = slug.value;
    if (!currentSlug) {
      return { ok: false as const, message: 'Flight plan unavailable.' };
    }
    markUpdating(taskId);
    const previousTask = tasks.value.find((entry) => entry.id === taskId) ?? null;
    let rollback: FlightPlanTask | null = null;
    if (previousTask && canOptimisticallyApply(payload)) {
      rollback = { ...previousTask };
      const optimisticState =
        typeof payload.state === 'string' ? (payload.state as FlightPlanTask['state']) : previousTask.state;
      const optimisticOrder =
        typeof payload.listOrder === 'number' ? payload.listOrder : previousTask.listOrder;
      replaceTask({
        ...previousTask,
        state: optimisticState,
        listOrder: optimisticOrder,
      });
    }
    try {
      const task = await updateFlightPlanTask({
        auth: session.bearerToken,
        slug: currentSlug,
        taskId,
        payload,
      });
      replaceTask(task);
      logTaskEvent('update', {
        taskId,
        state: task.state,
        payloadKeys: Object.keys(payload),
      });
      return { ok: true as const, task };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update mission task.';
      if (rollback) {
        replaceTask(rollback);
      }
      logTaskEvent(
        'update',
        {
          taskId,
          payloadKeys: Object.keys(payload),
        },
        error,
      );
      return { ok: false as const, message };
    } finally {
      unmarkUpdating(taskId);
    }
  };

  const deleteTask = async (taskId: number) => {
    if (!session.isAuthenticated) {
      return { ok: false as const, message: 'Authentication required.' };
    }
    const currentSlug = slug.value;
    if (!currentSlug) {
      return { ok: false as const, message: 'Flight plan unavailable.' };
    }
    markDeleting(taskId);
    try {
      await deleteFlightPlanTask({
        auth: session.bearerToken,
        slug: currentSlug,
        taskId,
      });
      removeTask(taskId);
      logTaskEvent('delete', { taskId });
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete mission task.';
      logTaskEvent('delete', { taskId }, error);
      return { ok: false as const, message };
    } finally {
      unmarkDeleting(taskId);
    }
  };

  const claimTask = async (taskId: number) => {
    if (!session.isAuthenticated) {
      return { ok: false as const, message: 'Authentication required.' };
    }
    const currentSlug = slug.value;
    if (!currentSlug) {
      return { ok: false as const, message: 'Flight plan unavailable.' };
    }
    markUpdating(taskId);
    try {
      const task = await updateFlightPlanTask({
        auth: session.bearerToken,
        slug: currentSlug,
        taskId,
        payload: { action: 'claim' },
      });
      replaceTask(task);
      logTaskEvent('claim', { taskId });
      return { ok: true as const, task };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to claim mission task.';
      logTaskEvent('claim', { taskId }, error);
      return { ok: false as const, message };
    } finally {
      unmarkUpdating(taskId);
    }
  };

  const unclaimTask = async (taskId: number) => {
    if (!session.isAuthenticated) {
      return { ok: false as const, message: 'Authentication required.' };
    }
    const currentSlug = slug.value;
    if (!currentSlug) {
      return { ok: false as const, message: 'Flight plan unavailable.' };
    }
    markUpdating(taskId);
    try {
      const task = await updateFlightPlanTask({
        auth: session.bearerToken,
        slug: currentSlug,
        taskId,
        payload: { action: 'unclaim' },
      });
      replaceTask(task);
      logTaskEvent('unclaim', { taskId });
      return { ok: true as const, task };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to unclaim mission task.';
      logTaskEvent('unclaim', { taskId }, error);
      return { ok: false as const, message };
    } finally {
      unmarkUpdating(taskId);
    }
  };

  watch(
    [slug, () => session.isAuthenticated],
    async ([resolvedSlug, authed]) => {
      stopStream();
      stopPolling();
      if (!resolvedSlug || !authed) {
        tasks.value = [];
        return;
      }
      await loadTasks();
      startStream();
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    stopStream();
    stopPolling();
  });

  const tasksByState = computed(() => {
    const grouped: Record<string, FlightPlanTask[]> = {};
    tasks.value.forEach((task) => {
      const bucket = grouped[task.state] ?? (grouped[task.state] = []);
      bucket.push(task);
    });
    Object.keys(grouped).forEach((state) => {
      grouped[state] = sortTasks(grouped[state] ?? []);
    });
    return grouped;
  });

  const orderedStates = computed(() =>
    FLIGHT_PLAN_TASK_STATES.map((state) => ({
      id: state,
      meta: getFlightPlanTaskStateMeta(state),
      tasks: tasksByState.value[state] ?? [],
    })),
  );

  const isTaskUpdating = (taskId: number) => updatingTaskIds.value.includes(taskId);
  const isTaskDeleting = (taskId: number) => deletingTaskIds.value.includes(taskId);

  const uploadAttachment = async (taskId: number, file: File) => {
    if (!session.isAuthenticated) {
      return { ok: false as const, message: 'Authentication required.' };
    }
    const currentSlug = slug.value;
    if (!currentSlug) {
      return { ok: false as const, message: 'Flight plan unavailable.' };
    }
    markUpdating(taskId);
    try {
      const response = await uploadFlightPlanTaskAttachment({
        auth: session.bearerToken,
        slug: currentSlug,
        taskId,
        file,
      });
      if (response.task) {
        replaceTask(response.task);
      } else {
        await loadTasks({ respectEtag: false });
      }
      logTaskEvent('attachment-upload', { taskId, filename: file.name });
      return { ok: true as const, attachment: response.attachment, task: response.task };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to upload attachment.';
      logTaskEvent('attachment-upload', { taskId }, error);
      return { ok: false as const, message };
    } finally {
      unmarkUpdating(taskId);
    }
  };

  const removeAttachment = async (taskId: number, attachmentId: string) => {
    if (!session.isAuthenticated) {
      return { ok: false as const, message: 'Authentication required.' };
    }
    const currentSlug = slug.value;
    if (!currentSlug) {
      return { ok: false as const, message: 'Flight plan unavailable.' };
    }
    markUpdating(taskId);
    try {
      const task = await deleteFlightPlanTaskAttachment({
        auth: session.bearerToken,
        slug: currentSlug,
        taskId,
        attachmentId,
      });
      if (task) {
        replaceTask(task);
      } else {
        await loadTasks({ respectEtag: false });
      }
      logTaskEvent('attachment-remove', { taskId, attachmentId });
      return { ok: true as const, task };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove attachment.';
      logTaskEvent('attachment-remove', { taskId, attachmentId }, error);
      return { ok: false as const, message };
    } finally {
      unmarkUpdating(taskId);
    }
  };

  const addLink = async (taskId: number, payload: { url: string; title?: string }) => {
    if (!session.isAuthenticated) {
      return { ok: false as const, message: 'Authentication required.' };
    }
    const currentSlug = slug.value;
    if (!currentSlug) {
      return { ok: false as const, message: 'Flight plan unavailable.' };
    }
    markUpdating(taskId);
    try {
      const response = await addFlightPlanTaskLink({
        auth: session.bearerToken,
        slug: currentSlug,
        taskId,
        payload,
      });
      if (response.task) {
        replaceTask(response.task);
      } else {
        await loadTasks({ respectEtag: false });
      }
      logTaskEvent('link-add', { taskId, url: payload.url });
      return { ok: true as const, link: response.link, task: response.task };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to add link.';
      logTaskEvent('link-add', { taskId, url: payload.url }, error);
      return { ok: false as const, message };
    } finally {
      unmarkUpdating(taskId);
    }
  };

  const removeLink = async (taskId: number, linkId: string) => {
    if (!session.isAuthenticated) {
      return { ok: false as const, message: 'Authentication required.' };
    }
    const currentSlug = slug.value;
    if (!currentSlug) {
      return { ok: false as const, message: 'Flight plan unavailable.' };
    }
    markUpdating(taskId);
    try {
      const task = await deleteFlightPlanTaskLink({
        auth: session.bearerToken,
        slug: currentSlug,
        taskId,
        linkId,
      });
      if (task) {
        replaceTask(task);
      } else {
        await loadTasks({ respectEtag: false });
      }
      logTaskEvent('link-remove', { taskId, linkId });
      return { ok: true as const, task };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove link.';
      logTaskEvent('link-remove', { taskId, linkId }, error);
      return { ok: false as const, message };
    } finally {
      unmarkUpdating(taskId);
    }
  };

  return {
    tasks,
    orderedStates,
    loadingTasks,
    tasksError,
    creatingTask,
    isTaskUpdating,
    isTaskDeleting,
    refreshTasks: loadTasks,
    createTask,
    updateTask,
    deleteTask,
    claimTask,
    unclaimTask,
    uploadAttachment,
    removeAttachment,
    addLink,
    removeLink,
  };
};
