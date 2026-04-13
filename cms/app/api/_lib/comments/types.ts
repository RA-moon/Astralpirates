import type { CrewSummary } from '../crew';

export type CommentSort = 'best' | 'top' | 'new' | 'old' | 'controversial';

export type CommentThreadRecord = {
  id: number;
  resourceType: string;
  resourceId: number;
  createdById: number | null;
  locked: boolean;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CommentRecord = {
  id: number;
  threadId: number;
  parentCommentId: number | null;
  bodyRaw: string;
  bodyHtml: string;
  mentionMembershipIds: number[];
  createdById: number | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  score: number;
  upvotes: number;
  downvotes: number;
  replyCount: number;
  lastActivityAt: string | null;
  viewerVote: -1 | 0 | 1;
};

export type CommentNode = CommentRecord & {
  author: CrewSummary | null;
  mentions: CrewSummary[];
  children: CommentNode[];
};

export type ThreadPermissions = {
  canView: boolean;
  canComment: boolean;
  canVote: boolean;
  canModerate: boolean;
  defaultSort: CommentSort;
  resourceLabel?: string | null;
};

export type CommentThreadView = CommentThreadRecord & {
  totalComments: number;
  comments: CommentNode[];
  viewer: {
    canComment: boolean;
    canVote: boolean;
    canModerate: boolean;
  };
};

export type CommentThreadResponse = {
  thread: CommentThreadView;
};
