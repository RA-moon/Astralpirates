import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';

import CommentThread from '~/components/comments/CommentThread.vue';
import { createComment, ensureCommentThread, voteOnComment } from '~/domains/comments/api';
import type { CommentNode, CommentThread as CommentThreadType } from '~/modules/api/schemas';

const sessionStore = reactive({
  isAuthenticated: true,
  bearerToken: 'token',
  currentUser: { id: 7 },
});

vi.mock('~/stores/session', () => ({
  useSessionStore: () => sessionStore,
}));

vi.mock('~/domains/comments/api', () => ({
  ensureCommentThread: vi.fn(),
  fetchCommentThread: vi.fn(),
  createComment: vi.fn(),
  updateComment: vi.fn(),
  voteOnComment: vi.fn(),
}));

const mockedEnsureCommentThread = vi.mocked(ensureCommentThread);
const mockedCreateComment = vi.mocked(createComment);
const mockedVoteOnComment = vi.mocked(voteOnComment);

const UiButtonStub = {
  name: 'UiButtonStub',
  props: {
    disabled: {
      type: Boolean,
      default: false,
    },
    loading: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
};

const UiTextAreaStub = {
  name: 'UiTextAreaStub',
  props: {
    modelValue: {
      type: String,
      default: '',
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue'],
  template:
    '<textarea :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
};

const UiSelectStub = {
  name: 'UiSelectStub',
  props: {
    modelValue: {
      type: String,
      default: '',
    },
    options: {
      type: Array,
      default: () => [],
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue'],
  template: `
    <select :disabled="disabled" :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  `,
};

const UiStub = { name: 'UiStub', template: '<div><slot /></div>' };
const UiTagStub = { name: 'UiTagStub', template: '<span><slot /></span>' };

const CommentItemStub = {
  name: 'CommentItemStub',
  props: {
    comment: {
      type: Object,
      required: true,
    },
  },
  emits: ['reply', 'vote', 'delete', 'restore'],
  template: `
    <div class="comment-item-stub">
      <span class="comment-body">{{ comment.bodyRaw }}</span>
      <button class="reply" @click="$emit('reply', { commentId: comment.id, body: 'Reply' })">Reply</button>
      <button class="vote" @click="$emit('vote', { commentId: comment.id, vote: 1 })">Vote</button>
    </div>
  `,
};

const buildComment = (overrides: Partial<CommentNode>): CommentNode => ({
  id: 1,
  threadId: 1,
  parentCommentId: null,
  bodyRaw: 'Hello',
  bodyHtml: '<p>Hello</p>',
  mentionMembershipIds: [],
  mentions: [],
  createdById: 7,
  editedAt: null,
  deletedAt: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  score: 0,
  upvotes: 0,
  downvotes: 0,
  replyCount: 0,
  lastActivityAt: null,
  viewerVote: 0,
  author: {
    id: 7,
    profileSlug: 'crew',
    displayName: 'Crewmate',
    callSign: null,
    role: null,
    avatarUrl: null,
  },
  children: [],
  ...overrides,
});

const buildThread = (overrides: Partial<CommentThreadType>): CommentThreadType => ({
  id: 1,
  resourceType: 'flight-plan-task',
  resourceId: 10,
  createdById: 7,
  locked: false,
  pinned: false,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  totalComments: 0,
  comments: [],
  viewer: {
    canComment: true,
    canVote: true,
    canModerate: true,
  },
  ...overrides,
});

const mountThread = (props: Record<string, unknown>) =>
  mount(CommentThread, {
    props,
    global: {
      stubs: {
        UiSurface: UiStub,
        UiInline: UiStub,
        UiHeading: UiStub,
        UiText: UiStub,
        UiSelect: UiSelectStub,
        UiTextArea: UiTextAreaStub,
        UiButton: UiButtonStub,
        UiTag: UiTagStub,
        UiAlert: UiStub,
        CommentItem: CommentItemStub,
      },
    },
  });

describe('CommentThread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStore.isAuthenticated = true;
    sessionStore.bearerToken = 'token';
    sessionStore.currentUser = { id: 7 };
  });

  it('posts a new comment', async () => {
    mockedEnsureCommentThread.mockResolvedValue(buildThread({ comments: [], totalComments: 0 }));
    mockedCreateComment.mockResolvedValue({
      comment: buildComment({ id: 2, bodyRaw: 'New comment', bodyHtml: '<p>New comment</p>' }),
      totalComments: 1,
    });

    const wrapper = mountThread({
      resourceType: 'flight-plan-task',
      resourceId: 10,
      open: false,
    });

    await wrapper.setProps({ open: true });
    await flushPromises();

    const textarea = wrapper.get('textarea');
    await textarea.setValue('New comment');
    const buttons = wrapper.findAll('button');
    const postButton = buttons.find((button) => button.text() === 'Post comment');
    expect(postButton).toBeTruthy();
    await postButton!.trigger('click');
    await flushPromises();

    expect(mockedCreateComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'New comment', threadId: 1 }),
    );
    expect(wrapper.findAll('.comment-item-stub')).toHaveLength(1);
  });

  it('submits replies from comment items', async () => {
    mockedEnsureCommentThread.mockResolvedValue(buildThread({
      comments: [buildComment({ id: 3, bodyRaw: 'Parent' })],
      totalComments: 1,
    }));
    mockedCreateComment.mockResolvedValue({
      comment: buildComment({ id: 4, parentCommentId: 3, bodyRaw: 'Reply' }),
      totalComments: 2,
    });

    const wrapper = mountThread({
      resourceType: 'flight-plan-task',
      resourceId: 10,
      open: false,
    });

    await wrapper.setProps({ open: true });
    await flushPromises();

    await wrapper.get('.reply').trigger('click');
    await flushPromises();

    expect(mockedCreateComment).toHaveBeenCalledWith(
      expect.objectContaining({ parentCommentId: 3, body: 'Reply' }),
    );
  });

  it('submits votes from comment items', async () => {
    mockedEnsureCommentThread.mockResolvedValue(buildThread({
      comments: [buildComment({ id: 8 })],
      totalComments: 1,
    }));
    mockedVoteOnComment.mockResolvedValue({
      comment: buildComment({ id: 8, score: 1, viewerVote: 1 }),
      totalComments: 1,
    });

    const wrapper = mountThread({
      resourceType: 'flight-plan-task',
      resourceId: 10,
      open: false,
    });

    await wrapper.setProps({ open: true });
    await flushPromises();

    await wrapper.get('.vote').trigger('click');
    await flushPromises();

    expect(mockedVoteOnComment).toHaveBeenCalledWith(
      expect.objectContaining({ commentId: 8, vote: 1 }),
    );
  });

  it('shows locked state messaging', async () => {
    mockedEnsureCommentThread.mockResolvedValue(buildThread({
      locked: true,
      viewer: { canComment: true, canVote: true, canModerate: false },
    }));

    const wrapper = mountThread({
      resourceType: 'flight-plan-task',
      resourceId: 10,
      open: false,
    });

    await wrapper.setProps({ open: true });
    await flushPromises();

    expect(wrapper.find('.comment-thread__composer').exists()).toBe(false);
    expect(wrapper.find('.comment-thread__locked').text()).toContain('locked');
  });
});
