import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import CommentItem from '~/components/comments/CommentItem.vue';
import { AVATAR_FALLBACK_IMAGE_URL } from '~/modules/media/avatarUrls';
import type { CommentNode } from '~/modules/api/schemas';

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

const UiIconButtonStub = {
  name: 'UiIconButtonStub',
  props: {
    disabled: {
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

const UiTextStub = { name: 'UiTextStub', template: '<span><slot /></span>' };
const UiTagStub = { name: 'UiTagStub', template: '<span><slot /></span>' };
const UiInlineStub = { name: 'UiInlineStub', template: '<div><slot /></div>' };

const buildComment = (overrides: Partial<CommentNode>): CommentNode => ({
  id: 1,
  threadId: 1,
  parentCommentId: null,
  bodyRaw: 'Hello',
  bodyHtml: '<p>Hello</p>',
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

const mountItem = (comment: CommentNode) =>
  mount(CommentItem, {
    props: {
      comment,
      viewerCanReply: true,
      viewerCanVote: true,
      viewerCanModerate: false,
      currentUserId: 7,
    },
    global: {
      stubs: {
        UiButton: UiButtonStub,
        UiIconButton: UiIconButtonStub,
        UiText: UiTextStub,
        UiTextArea: UiTextAreaStub,
        UiTag: UiTagStub,
        UiInline: UiInlineStub,
      },
    },
  });

describe('CommentItem', () => {
  it('uses bundled fallback image when author avatar is missing', () => {
    const wrapper = mountItem(buildComment({ id: 4 }));
    const image = wrapper.find('.comment-item__avatar img');
    expect(image.exists()).toBe(true);
    expect(image.attributes('src')).toBe(AVATAR_FALLBACK_IMAGE_URL);
  });

  it('emits replies from the composer', async () => {
    const wrapper = mountItem(buildComment({ id: 5 }));

    const replyButton = wrapper.findAll('button').find((btn) => btn.text() === 'Reply');
    expect(replyButton).toBeTruthy();
    await replyButton!.trigger('click');

    const textarea = wrapper.get('textarea');
    await textarea.setValue('Reply text');

    const postReplyButton = wrapper.findAll('button').find((btn) => btn.text() === 'Post reply');
    expect(postReplyButton).toBeTruthy();
    await postReplyButton!.trigger('click');

    const events = wrapper.emitted('reply') ?? [];
    expect(events).toHaveLength(1);
    expect(events[0][0]).toEqual({ commentId: 5, body: 'Reply text' });
  });

  it('toggles votes', async () => {
    const wrapper = mountItem(buildComment({ id: 9, viewerVote: 0 }));

    const upvoteButton = wrapper.findAll('button').find((btn) => btn.text() === '▲');
    expect(upvoteButton).toBeTruthy();
    await upvoteButton!.trigger('click');

    const events = wrapper.emitted('vote') ?? [];
    expect(events[0][0]).toEqual({ commentId: 9, vote: 1 });
  });
});
