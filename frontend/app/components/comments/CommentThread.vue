<template>
  <UiSurface variant="subtle" class="comment-thread">
    <header class="comment-thread__header">
      <div class="comment-thread__title">
        <UiText variant="eyebrow">Discussion</UiText>
        <UiHeading :level="3" size="h6" :uppercase="false">
          {{ title || 'Crew chatter' }}
        </UiHeading>
      </div>
      <div class="comment-thread__controls">
        <UiTag v-if="thread?.locked" variant="muted" size="sm">Locked</UiTag>
        <UiTag v-if="thread?.pinned" size="sm">Pinned</UiTag>
        <UiSelect
          v-model="sort"
          size="sm"
          :options="sortOptions"
          :disabled="loading"
          aria-label="Sort comments"
          @update:model-value="changeSort"
        />
      </div>
    </header>

    <div class="comment-thread__composer" v-if="canComment">
      <UiTextArea
        v-model="newComment"
        placeholder="Share context, ask questions, or drop links for the crew…"
        rows="4"
        :disabled="posting"
      />
      <UiInline :gap="'var(--space-xs)'" align="center">
        <UiButton
          :disabled="posting || !newComment.trim()"
          :loading="posting"
          @click="submitComment"
        >
          Post comment
        </UiButton>
        <UiText v-if="thread" variant="muted">{{ thread.totalComments }} comments</UiText>
      </UiInline>
    </div>
    <UiSurface v-else variant="panel" class="comment-thread__locked">
      <UiText v-if="thread?.locked">This thread is locked by the mission crew.</UiText>
      <UiText v-else-if="!session.isAuthenticated">
        Sign in with your crew account to join this discussion.
      </UiText>
      <UiText v-else>
        You can read this thread, but only mission crew and passengers can reply.
      </UiText>
    </UiSurface>

    <UiAlert v-if="error" variant="danger" layout="inline" class="comment-thread__alert">
      {{ error }}
    </UiAlert>

    <div v-if="loading" class="comment-thread__loading">
      <UiText variant="muted">Loading comments…</UiText>
    </div>
    <div v-else class="comment-thread__list">
      <CommentItem
        v-for="comment in comments"
        :key="comment.id"
        :comment="comment"
        :viewer-can-reply="canComment"
        :viewer-can-vote="canVote"
        :viewer-can-moderate="canModerate"
        :current-user-id="currentUserId"
        @reply="handleReply"
        @vote="handleVote"
        @delete="handleDelete"
        @restore="handleRestore"
      />
      <UiText v-if="!comments.length && !loading" variant="muted" class="comment-thread__empty">
        No chatter yet. Start the thread to set the tone.
      </UiText>
    </div>
  </UiSurface>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

import CommentItem from './CommentItem.vue';
import { useSessionStore } from '~/stores/session';
import {
  createComment,
  ensureCommentThread,
  fetchCommentThread,
  updateComment,
  voteOnComment,
} from '~/domains/comments/api';
import type { CommentNode, CommentSort, CommentThread } from '~/modules/api/schemas';
import {
  UiAlert,
  UiButton,
  UiHeading,
  UiInline,
  UiSelect,
  UiSurface,
  UiTag,
  UiText,
  UiTextArea,
} from '~/components/ui';

const props = defineProps<{
  resourceType: string;
  resourceId: number;
  open?: boolean;
  title?: string;
}>();

const session = useSessionStore();

const thread = ref<CommentThread | null>(null);
const comments = ref<CommentNode[]>([]);
const loading = ref(false);
const posting = ref(false);
const error = ref('');
const sort = ref<CommentSort>('best');
const newComment = ref('');

const sortOptions = [
  { label: 'Best', value: 'best' },
  { label: 'Top', value: 'top' },
  { label: 'New', value: 'new' },
  { label: 'Old', value: 'old' },
  { label: 'Controversial', value: 'controversial' },
];
const isCommentSort = (value: string): value is CommentSort =>
  sortOptions.some((option) => option.value === value);

const currentUserId = computed(() => session.currentUser?.id ?? null);
const viewer = computed(() => thread.value?.viewer ?? { canComment: false, canVote: false, canModerate: false });
const canComment = computed(() => viewer.value.canComment && !thread.value?.locked);
const canVote = computed(() => viewer.value.canVote && !thread.value?.locked);
const canModerate = computed(() => viewer.value.canModerate);

const setThread = (next: CommentThread | null) => {
  thread.value = next;
  comments.value = next?.comments ?? [];
};

const mergeComment = (incoming: CommentNode) => {
  const nextTree = (nodes: CommentNode[]): [CommentNode[], boolean] => {
    let handled = false;
    const updated = nodes.map((node) => {
      if (node.id === incoming.id) {
        handled = true;
        return { ...incoming, children: node.children ?? incoming.children ?? [] };
      }
      const [childTree, childHandled] = nextTree(node.children ?? []);
      if (childHandled) {
        handled = true;
        return { ...node, children: childTree };
      }
      if (incoming.parentCommentId != null && incoming.parentCommentId === node.id) {
        handled = true;
        return { ...node, children: [...(node.children ?? []), incoming] };
      }
      return node;
    });
    return [updated, handled];
  };

  const [updatedTree, handled] = nextTree(comments.value);
  if (handled) {
    comments.value = updatedTree;
    return;
  }
  comments.value = incoming.parentCommentId ? [...comments.value, incoming] : [incoming, ...comments.value];
};

const refreshThread = async (forceSort?: CommentSort) => {
  if (!session.isAuthenticated) {
    error.value = 'Sign in to load comments.';
    return;
  }
  if (!thread.value) {
    return loadThread();
  }
  loading.value = true;
  error.value = '';
  try {
    const result = await fetchCommentThread({
      auth: session.bearerToken,
      threadId: thread.value.id,
      sort: forceSort ?? sort.value,
    });
    setThread(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to refresh comments.';
    error.value = message;
  } finally {
    loading.value = false;
  }
};

const loadThread = async () => {
  if (!props.resourceType || !props.resourceId) return;
  loading.value = true;
  error.value = '';
  try {
    const result = await ensureCommentThread({
      auth: session.bearerToken,
      resourceType: props.resourceType,
      resourceId: props.resourceId,
      sort: sort.value,
    });
    setThread(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to load comments.';
    error.value = message;
  } finally {
    loading.value = false;
  }
};

const changeSort = (next: string | number) => {
  if (typeof next !== 'string' || !isCommentSort(next)) return;
  sort.value = next;
  refreshThread(next);
};

const submitComment = async () => {
  if (!thread.value || !newComment.value.trim() || posting.value) return;
  posting.value = true;
  error.value = '';
  try {
    const response = await createComment({
      auth: session.bearerToken,
      threadId: thread.value.id,
      body: newComment.value.trim(),
    });
    mergeComment({ ...response.comment, children: response.comment.children ?? [] });
    if (thread.value) {
      thread.value = { ...thread.value, totalComments: response.totalComments };
    }
    newComment.value = '';
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to post comment.';
    error.value = message;
  } finally {
    posting.value = false;
  }
};

const handleReply = async ({ commentId, body }: { commentId: number; body: string }) => {
  if (!thread.value || !body.trim()) return;
  posting.value = true;
  try {
    const response = await createComment({
      auth: session.bearerToken,
      threadId: thread.value.id,
      parentCommentId: commentId,
      body: body.trim(),
    });
    mergeComment({ ...response.comment, children: response.comment.children ?? [] });
    if (thread.value) {
      thread.value = { ...thread.value, totalComments: response.totalComments };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to reply to comment.';
    error.value = message;
  } finally {
    posting.value = false;
  }
};

const handleVote = async ({ commentId, vote }: { commentId: number; vote: -1 | 0 | 1 }) => {
  if (!thread.value) return;
  try {
    const response = await voteOnComment({
      auth: session.bearerToken,
      commentId,
      vote,
    });
    mergeComment({ ...response.comment, children: response.comment.children ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to update vote.';
    error.value = message;
  }
};

const handleDelete = async (commentId: number) => {
  if (!thread.value) return;
  try {
    const response = await updateComment({
      auth: session.bearerToken,
      commentId,
      action: 'delete',
    });
    mergeComment({ ...response.comment, children: response.comment.children ?? [] });
    if (thread.value) {
      thread.value = { ...thread.value, totalComments: response.totalComments };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to delete comment.';
    error.value = message;
  }
};

const handleRestore = async (commentId: number) => {
  if (!thread.value) return;
  try {
    const response = await updateComment({
      auth: session.bearerToken,
      commentId,
      action: 'restore',
    });
    mergeComment({ ...response.comment, children: response.comment.children ?? [] });
    if (thread.value) {
      thread.value = { ...thread.value, totalComments: response.totalComments };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to restore comment.';
    error.value = message;
  }
};

watch(
  () => props.open,
  (shouldLoad) => {
    if (shouldLoad && !thread.value && !loading.value) {
      loadThread();
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (props.open) {
    loadThread();
  }
});

defineExpose({
  refresh: refreshThread,
  load: loadThread,
});
</script>

<style scoped>
.comment-thread {
  border: var(--size-base-layout-px) solid var(--color-border-weak);
  border-radius: var(--radius-lg);
  padding: var(--space-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  background: linear-gradient(135deg, var(--color-surface-base), var(--color-surface-panel));
}

.comment-thread__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.comment-thread__title {
  display: flex;
  flex-direction: column;
  gap: var(--space-3xs);
}

.comment-thread__controls {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
}

.comment-thread__composer {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

.comment-thread__locked {
  background: var(--color-surface-panel);
}

.comment-thread__alert {
  margin: 0;
}

.comment-thread__loading {
  padding: var(--space-xs) 0;
}

.comment-thread__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.comment-thread__empty {
  padding: var(--space-xs) 0;
}
</style>
