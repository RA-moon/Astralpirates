<template>
  <div :class="['comment-item', `comment-item--depth-${depth}`, { 'comment-item--deleted': isDeleted }]">
    <div class="comment-item__rail">
      <UiIconButton
        v-if="viewerCanVote"
        size="sm"
        variant="ghost"
        aria-label="Upvote comment"
        :aria-pressed="comment.viewerVote === 1"
        :class="{ 'comment-item__vote--active': comment.viewerVote === 1 }"
        @click="() => handleVote(1)"
      >
        ▲
      </UiIconButton>
      <div class="comment-item__score" :aria-label="`Score ${comment.score}`">
        {{ comment.score }}
      </div>
      <UiIconButton
        v-if="viewerCanVote"
        size="sm"
        variant="ghost"
        aria-label="Downvote comment"
        :aria-pressed="comment.viewerVote === -1"
        :class="{ 'comment-item__vote--active': comment.viewerVote === -1 }"
        @click="() => handleVote(-1)"
      >
        ▼
      </UiIconButton>
    </div>

    <div class="comment-item__body">
      <div class="comment-item__meta">
        <div class="comment-item__author">
          <span class="comment-item__avatar" aria-hidden="true">
            <img
              :src="avatarImageSrc"
              alt=""
              loading="lazy"
              decoding="async"
              @error="handleAvatarError"
            />
          </span>
          <UiText>{{ authorName }}</UiText>
          <UiTag v-if="isAuthor" size="sm" variant="muted">You</UiTag>
          <UiTag v-else-if="isDeleted" size="sm" variant="muted">Deleted</UiTag>
          <UiTag v-else-if="comment.editedAt" size="sm" variant="muted">Edited</UiTag>
        </div>
        <UiText variant="muted" class="comment-item__timestamp">{{ timestamp }}</UiText>
      </div>

      <div class="comment-item__content">
        <p v-if="isDeleted" class="comment-item__placeholder">
          This comment was removed by a moderator.
        </p>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-else class="comment-item__html" v-html="comment.bodyHtml || comment.bodyRaw" />
      </div>

      <div class="comment-item__actions">
        <UiButton
          v-if="viewerCanReply && !isDeleted"
          size="sm"
          variant="ghost"
          @click="toggleReply"
        >
          {{ showReply ? 'Cancel reply' : 'Reply' }}
        </UiButton>
        <UiButton
          v-if="canDelete && !isDeleted"
          size="sm"
          variant="ghost"
          @click="handleDelete"
        >
          Delete
        </UiButton>
        <UiButton
          v-if="canRestore && isDeleted"
          size="sm"
          variant="ghost"
          @click="handleRestore"
        >
          Restore
        </UiButton>
      </div>

      <div v-if="showReply" class="comment-item__reply">
        <UiTextArea
          v-model="replyBody"
          placeholder="Add your reply…"
          rows="3"
          :disabled="replyPending"
        />
        <UiInline :gap="'var(--space-xs)'" align="center">
          <UiButton
            size="sm"
            :loading="replyPending"
            :disabled="replyPending || !replyBody.trim()"
            @click="submitReply"
          >
            Post reply
          </UiButton>
          <UiButton size="sm" variant="ghost" :disabled="replyPending" @click="toggleReply">
            Cancel
          </UiButton>
        </UiInline>
      </div>

      <div v-if="comment.children?.length" class="comment-item__children">
        <CommentItem
          v-for="child in comment.children"
          :key="child.id"
          :comment="child"
          :depth="depth + 1"
          :viewer-can-reply="viewerCanReply"
          :viewer-can-vote="viewerCanVote"
          :viewer-can-moderate="viewerCanModerate"
          :current-user-id="currentUserId"
          @reply="emit('reply', $event)"
          @vote="emit('vote', $event)"
          @delete="emit('delete', $event)"
          @restore="emit('restore', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { AVATAR_FALLBACK_IMAGE_URL, resolveAvatarDisplayUrl } from '~/modules/media/avatarUrls';

import type { CommentNode } from '~/modules/api/schemas';
import {
  UiButton,
  UiIconButton,
  UiInline,
  UiTag,
  UiText,
  UiTextArea,
} from '~/components/ui';

const props = defineProps<{
  comment: CommentNode;
  depth?: number;
  viewerCanReply: boolean;
  viewerCanVote: boolean;
  viewerCanModerate: boolean;
  currentUserId: number | string | null;
}>();

const emit = defineEmits<{
  (e: 'reply', payload: { commentId: number; body: string }): void;
  (e: 'vote', payload: { commentId: number; vote: -1 | 0 | 1 }): void;
  (e: 'delete', commentId: number): void;
  (e: 'restore', commentId: number): void;
}>();

const depth = computed(() => props.depth ?? 0);
const replyBody = ref('');
const replyPending = ref(false);
const showReply = ref(false);

const isDeleted = computed(() => Boolean(props.comment.deletedAt));
const isAuthor = computed(() => {
  if (props.currentUserId == null) return false;
  return Number(props.currentUserId) === Number(props.comment.createdById ?? -1);
});
const canDelete = computed(() => props.viewerCanModerate || isAuthor.value);
const canRestore = computed(() => props.viewerCanModerate);
const viewerCanReply = computed(() => props.viewerCanReply);
const viewerCanVote = computed(() => props.viewerCanVote && !isDeleted.value);
const viewerCanModerate = computed(() => props.viewerCanModerate);

const authorName = computed(() => {
  if (props.comment.author?.displayName) return props.comment.author.displayName;
  if (props.comment.author?.callSign) return props.comment.author.callSign;
  return 'Crewmate';
});

const avatarImageSrc = computed(() =>
  resolveAvatarDisplayUrl(props.comment.author?.avatarUrl ?? null),
);

const handleAvatarError = (event: Event) => {
  const target = event.target as HTMLImageElement | null;
  if (!target) return;
  if (target.dataset.avatarFallbackApplied === '1') return;
  target.dataset.avatarFallbackApplied = '1';
  target.src = AVATAR_FALLBACK_IMAGE_URL;
};

const timestamp = computed(() => {
  const date = new Date(props.comment.createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
});

const toggleReply = () => {
  showReply.value = !showReply.value;
  if (!showReply.value) {
    replyBody.value = '';
  }
};

const handleVote = (vote: 1 | -1) => {
  if (!viewerCanVote.value) return;
  const nextVote = props.comment.viewerVote === vote ? 0 : vote;
  emit('vote', { commentId: props.comment.id, vote: nextVote as -1 | 0 | 1 });
};

const submitReply = async () => {
  if (!replyBody.value.trim()) return;
  replyPending.value = true;
  emit('reply', { commentId: props.comment.id, body: replyBody.value.trim() });
  replyBody.value = '';
  showReply.value = false;
  replyPending.value = false;
};

const handleDelete = () => emit('delete', props.comment.id);
const handleRestore = () => emit('restore', props.comment.id);
</script>

<style scoped>
.comment-item {
  --comment-item-border-width: var(--size-base-layout-px);
  --comment-item-rail-gap: var(--crew-identity-gap);
  --comment-item-score-min-width: var(--status-toggle-indent-base);
  --comment-item-avatar-size: calc(var(--size-base-space-rem) * 1.8);
  --comment-item-timestamp-size: calc(var(--size-base-space-rem) * 0.85);
  --comment-item-paragraph-margin-bottom: calc(var(--size-base-space-rem) * 0.4);
  --comment-item-code-padding-block: calc(var(--size-base-space-rem) * 0.1);
  --comment-item-code-padding-inline: var(--crew-identity-gap);
  --comment-item-code-font-size: calc(var(--size-base-space-rem) * 0.9);
  --comment-item-children-rail-width: calc(var(--size-base-layout-px) * 2);

  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-xs);
  padding: var(--space-xs);
  border-radius: var(--radius-md);
  border: var(--comment-item-border-width) solid var(--color-border-weak);
  background: var(--color-surface-base);
}

.comment-item--deleted {
  opacity: 0.7;
  background: var(--color-surface-muted);
}

.comment-item__rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--comment-item-rail-gap);
  padding-top: var(--space-2xs);
}

.comment-item__vote--active {
  color: var(--color-accent-secondary);
}

.comment-item__score {
  font-weight: 600;
  min-width: var(--comment-item-score-min-width);
  text-align: center;
}

.comment-item__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

.comment-item__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xs);
}

.comment-item__author {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2xs);
}

.comment-item__avatar {
  width: var(--comment-item-avatar-size);
  height: var(--comment-item-avatar-size);
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-surface-raised), var(--color-surface-panel));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.comment-item__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.comment-item__timestamp {
  font-size: var(--comment-item-timestamp-size);
}

.comment-item__content {
  line-height: 1.6;
}

.comment-item__html :deep(p) {
  margin: 0 0 var(--comment-item-paragraph-margin-bottom);
}

.comment-item__html :deep(a) {
  color: var(--color-accent-secondary);
  text-decoration: underline;
}

.comment-item__html :deep(code) {
  background: var(--color-surface-muted);
  padding: var(--comment-item-code-padding-block) var(--comment-item-code-padding-inline);
  border-radius: var(--radius-sm);
  font-size: var(--comment-item-code-font-size);
}

.comment-item__placeholder {
  font-style: italic;
  color: var(--color-text-muted);
  margin: 0;
}

.comment-item__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2xs);
}

.comment-item__reply {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  padding: var(--space-xs);
  border-radius: var(--radius-sm);
  background: var(--color-surface-panel);
}

.comment-item__children {
  margin-top: var(--space-xs);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  border-left: var(--comment-item-children-rail-width) solid var(--color-border-weak);
  padding-left: var(--space-sm);
}

.comment-item--depth-1 {
  background: var(--color-surface-panel);
}

.comment-item--depth-2 {
  background: var(--color-surface-muted);
}
</style>
