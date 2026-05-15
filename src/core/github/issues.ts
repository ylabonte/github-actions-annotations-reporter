import type { OctokitInstance } from './client.js';
import type { IssueRecord, RepoRef } from '../types.js';
import { parseIssueState, parseFingerprintMarker } from '../../io/issue-body.js';

export async function ensureLabel(
  octokit: OctokitInstance,
  ref: RepoRef,
  name: string,
  color: string,
  description: string,
): Promise<void> {
  try {
    await octokit.issues.getLabel({ owner: ref.owner, repo: ref.repo, name });
  } catch (error: unknown) {
    if (isNotFound(error)) {
      await octokit.issues.createLabel({
        owner: ref.owner,
        repo: ref.repo,
        name,
        color,
        description,
      });
      return;
    }
    throw error;
  }
}

export async function listManagedIssues(
  octokit: OctokitInstance,
  ref: RepoRef,
  managementLabel: string,
): Promise<IssueRecord[]> {
  const records: IssueRecord[] = [];
  for await (const { data } of octokit.paginate.iterator(octokit.issues.listForRepo, {
    owner: ref.owner,
    repo: ref.repo,
    labels: managementLabel,
    state: 'all',
    per_page: 100,
  })) {
    for (const issue of data) {
      // listForRepo includes PRs by default; filter them out.
      const maybePr = (issue as { pull_request?: unknown }).pull_request;
      if (maybePr != null) continue;
      const body = issue.body ?? '';
      records.push({
        number: issue.number,
        state: issue.state === 'closed' ? 'closed' : 'open',
        stateReason: normalizeStateReason(issue.state_reason),
        labels: issue.labels.map((l) => (typeof l === 'string' ? l : (l.name ?? ''))),
        title: issue.title,
        body,
        fingerprint: parseFingerprintMarker(body),
        parsedState: parseIssueState(body),
        htmlUrl: issue.html_url,
        closedAt: issue.closed_at ?? null,
        updatedAt: issue.updated_at,
      });
    }
  }
  return records;
}

export interface CreateIssueArgs {
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
}

export async function createIssue(
  octokit: OctokitInstance,
  ref: RepoRef,
  args: CreateIssueArgs,
): Promise<{ number: number; htmlUrl: string }> {
  const { data } = await octokit.issues.create({
    owner: ref.owner,
    repo: ref.repo,
    title: args.title,
    body: args.body,
    labels: [...args.labels],
  });
  return { number: data.number, htmlUrl: data.html_url };
}

export interface UpdateIssueArgs {
  readonly issueNumber: number;
  readonly body?: string;
  readonly title?: string;
  readonly state?: 'open' | 'closed';
  readonly stateReason?: 'completed' | 'not_planned' | 'reopened';
  readonly labels?: readonly string[];
}

export async function updateIssue(
  octokit: OctokitInstance,
  ref: RepoRef,
  args: UpdateIssueArgs,
): Promise<void> {
  await octokit.issues.update({
    owner: ref.owner,
    repo: ref.repo,
    issue_number: args.issueNumber,
    ...(args.body === undefined ? {} : { body: args.body }),
    ...(args.title === undefined ? {} : { title: args.title }),
    ...(args.state === undefined ? {} : { state: args.state }),
    ...(args.stateReason === undefined ? {} : { state_reason: args.stateReason }),
    ...(args.labels === undefined ? {} : { labels: [...args.labels] }),
  });
}

export async function addIssueComment(
  octokit: OctokitInstance,
  ref: RepoRef,
  issueNumber: number,
  body: string,
): Promise<void> {
  await octokit.issues.createComment({
    owner: ref.owner,
    repo: ref.repo,
    issue_number: issueNumber,
    body,
  });
}

/**
 * The "closing comment" is the last comment by the issue closer that happened on or before
 * `closed_at`. Returns null if there's no such comment.
 */
export async function getClosingComment(
  octokit: OctokitInstance,
  ref: RepoRef,
  issueNumber: number,
): Promise<string | null> {
  const { data: issue } = await octokit.issues.get({
    owner: ref.owner,
    repo: ref.repo,
    issue_number: issueNumber,
  });
  if (!issue.closed_at) return null;
  const closer = issue.closed_by?.login ?? null;
  const closedAtMs = Date.parse(issue.closed_at);
  let latest: { createdAt: number; body: string } | null = null;
  for await (const { data } of octokit.paginate.iterator(octokit.issues.listComments, {
    owner: ref.owner,
    repo: ref.repo,
    issue_number: issueNumber,
    per_page: 100,
  })) {
    for (const c of data) {
      const created = Date.parse(c.created_at);
      // Comment must precede the close (with a 30s grace) and, if we know the closer,
      // must be authored by them. Either matched comment is acceptable as the closing
      // statement — the "last one wins" rule keeps the choice stable when there are
      // multiple candidate comments.
      if (Number.isNaN(created)) continue;
      if (created > closedAtMs + 30_000) continue;
      if (closer && c.user?.login && c.user.login !== closer) continue;
      if (!latest || created > latest.createdAt) {
        latest = { createdAt: created, body: c.body ?? '' };
      }
    }
  }
  return latest?.body ?? null;
}

function normalizeStateReason(value: unknown): IssueRecord['stateReason'] {
  if (value === 'completed' || value === 'not_planned' || value === 'reopened') return value;
  return null;
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'status' in err && err.status === 404;
}

// Type alias used in re-imports below.

export { type IssueState } from '../types.js';
