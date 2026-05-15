import type { OctokitInstance } from '../../src/core/github/client.js';

export interface FakeIssue {
  number: number;
  state: 'open' | 'closed';
  state_reason: 'completed' | 'not_planned' | 'reopened' | null;
  labels: string[];
  title: string;
  body: string;
  html_url: string;
  closed_at: string | null;
  updated_at: string;
  closed_by?: { login: string } | null;
  comments?: { user: { login: string }; created_at: string; body: string }[];
}

export interface FakeOctokitState {
  defaultBranch?: string;
  workflows: { id: number; name: string; path: string; state: string }[];
  runByWorkflow: Map<
    number,
    {
      id: number;
      run_number: number;
      html_url: string;
      head_branch: string;
      head_sha: string;
      conclusion: string;
      created_at: string;
    } | null
  >;
  jobsByRun: Map<number, { id: number; name: string; check_run_url: string }[]>;
  annotationsByCheckRun: Map<
    number,
    {
      annotation_level: string;
      message: string;
      title: string | null;
      raw_details: string | null;
      path: string;
      start_line: number | null;
      end_line: number | null;
    }[]
  >;
  issues: FakeIssue[];
  labels: Map<string, { name: string; color: string; description: string }>;
}

export interface FakeOctokitCalls {
  created: { title: string; body: string; labels: string[] }[];
  updated: {
    issueNumber: number;
    body?: string;
    state?: string;
    stateReason?: string;
    labels?: string[];
  }[];
  comments: { issueNumber: number; body: string }[];
  labelsCreated: { name: string; color: string }[];
}

export function makeFakeOctokit(state: FakeOctokitState): {
  octokit: OctokitInstance;
  calls: FakeOctokitCalls;
} {
  const calls: FakeOctokitCalls = {
    created: [],
    updated: [],
    comments: [],
    labelsCreated: [],
  };

  const octokit = {
    paginate: {
      async *iterator(method: (p: unknown) => Promise<{ data: unknown[] }>, params: unknown) {
        const { data } = await method(params);
        yield { data };
      },
    },
    repos: {
      get: () => Promise.resolve({ data: { default_branch: state.defaultBranch ?? 'main' } }),
    },
    actions: {
      listRepoWorkflows: () => Promise.resolve({ data: state.workflows }),
      listJobsForWorkflowRun: (p: { run_id: number }) =>
        Promise.resolve({ data: state.jobsByRun.get(p.run_id) ?? [] }),
      listWorkflowRuns: (p: { workflow_id: number }) => {
        const run = state.runByWorkflow.get(p.workflow_id);
        return Promise.resolve({ data: { workflow_runs: run ? [run] : [] } });
      },
    },
    checks: {
      listAnnotations: (p: { check_run_id: number }) =>
        Promise.resolve({ data: state.annotationsByCheckRun.get(p.check_run_id) ?? [] }),
    },
    issues: {
      listForRepo: () => Promise.resolve({ data: state.issues }),
      get: (p: { issue_number: number }) => {
        const issue = state.issues.find((i) => i.number === p.issue_number);
        if (!issue) {
          const err = new Error('Not found') as Error & { status: number };
          err.status = 404;
          throw err;
        }
        return Promise.resolve({ data: issue });
      },
      listComments: (p: { issue_number: number }) => {
        const issue = state.issues.find((i) => i.number === p.issue_number);
        return Promise.resolve({ data: issue?.comments ?? [] });
      },
      create: (p: { title: string; body: string; labels: string[] }) => {
        const number = (state.issues.at(-1)?.number ?? 0) + 1;
        const newIssue: FakeIssue = {
          number,
          state: 'open',
          state_reason: null,
          labels: p.labels,
          title: p.title,
          body: p.body,
          html_url: `https://example/issues/${number.toString()}`,
          closed_at: null,
          updated_at: '2026-05-15T10:00:00Z',
        };
        state.issues.push(newIssue);
        calls.created.push({ title: p.title, body: p.body, labels: p.labels });
        return Promise.resolve({ data: newIssue });
      },
      update: (p: {
        issue_number: number;
        body?: string;
        state?: string;
        state_reason?: string;
        labels?: string[];
      }) => {
        const issue = state.issues.find((i) => i.number === p.issue_number);
        if (issue) {
          if (p.body !== undefined) issue.body = p.body;
          if (p.state !== undefined) issue.state = p.state as 'open' | 'closed';
          if (p.state_reason !== undefined)
            issue.state_reason = p.state_reason as FakeIssue['state_reason'];
          if (p.labels !== undefined) issue.labels = p.labels;
        }
        calls.updated.push({
          issueNumber: p.issue_number,
          ...(p.body === undefined ? {} : { body: p.body }),
          ...(p.state === undefined ? {} : { state: p.state }),
          ...(p.state_reason === undefined ? {} : { stateReason: p.state_reason }),
          ...(p.labels === undefined ? {} : { labels: p.labels }),
        });
        return Promise.resolve({ data: {} });
      },
      createComment: (p: { issue_number: number; body: string }) => {
        calls.comments.push({ issueNumber: p.issue_number, body: p.body });
        return Promise.resolve({ data: {} });
      },
      getLabel: (p: { name: string }) => {
        if (!state.labels.has(p.name)) {
          const err = new Error('Not found') as Error & { status: number };
          err.status = 404;
          throw err;
        }
        return Promise.resolve({ data: state.labels.get(p.name) });
      },
      createLabel: (p: { name: string; color: string; description?: string }) => {
        state.labels.set(p.name, {
          name: p.name,
          color: p.color,
          description: p.description ?? '',
        });
        calls.labelsCreated.push({ name: p.name, color: p.color });
        return Promise.resolve({ data: state.labels.get(p.name) });
      },
    },
  } as unknown as OctokitInstance;

  return { octokit, calls };
}
