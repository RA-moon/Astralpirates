import type { Payload } from 'payload';

import { loadCrewSummariesByIds } from '../crew';
import type { CrewSummary } from '../crew';
import { buildMembershipSummaryMap } from '../flightPlanTasks';
import type {
  CommentNode,
  CommentRecord,
  CommentThreadRecord,
  CommentThreadView,
  ThreadPermissions,
} from './types';

const buildTree = (comments: CommentNode[]): CommentNode[] => {
  const map = new Map<number, CommentNode>();
  const roots: CommentNode[] = [];

  comments.forEach((comment) => map.set(comment.id, { ...comment, children: [] }));

  comments.forEach((comment) => {
    const current = map.get(comment.id);
    if (!current) return;
    if (comment.parentCommentId && map.has(comment.parentCommentId)) {
      const parent = map.get(comment.parentCommentId);
      parent?.children.push(current);
    } else {
      roots.push(current);
    }
  });

  return roots;
};

export const attachAuthors = async (
  payload: Payload,
  comments: CommentRecord[],
): Promise<CommentNode[]> => {
  const authorIds = comments
    .map((comment) => comment.createdById)
    .filter((value): value is number => typeof value === 'number');
  const authorMap = await loadCrewSummariesByIds(payload, authorIds);
  const mentionMembershipIds = comments.flatMap((comment) => comment.mentionMembershipIds ?? []);
  const mentionMap = mentionMembershipIds.length
    ? (await buildMembershipSummaryMap(payload, mentionMembershipIds)).summaryByMembership
    : new Map();

  return comments.map((comment) => ({
    ...comment,
    author: comment.createdById != null ? authorMap.get(comment.createdById) ?? null : null,
    mentions: (comment.mentionMembershipIds ?? [])
      .map((membershipId) => mentionMap.get(membershipId))
      .filter((summary): summary is CrewSummary => Boolean(summary)),
    children: [],
  }));
};

export const buildThreadView = ({
  thread,
  comments,
  totalComments,
  policy,
}: {
  thread: CommentThreadRecord;
  comments: CommentNode[];
  totalComments: number;
  policy: ThreadPermissions;
}): CommentThreadView => ({
  ...thread,
  totalComments,
  comments: buildTree(comments),
  viewer: {
    canComment: policy.canComment && !thread.locked,
    canVote: policy.canVote && !thread.locked,
    canModerate: policy.canModerate,
  },
});
