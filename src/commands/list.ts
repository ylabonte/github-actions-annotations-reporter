import pc from 'picocolors';
import { createOctokit } from '../core/github/client.js';
import { resolveAuth } from '../core/auth.js';
import { resolveRepo, type ResolveRepoFromGitRemoteOptions } from '../core/github/repo.js';
import { listManagedIssues } from '../core/github/issues.js';
import { createProgress } from '../io/progress.js';
import { prepareRun, shouldShowProgress, type CommonCliOptions } from './shared.js';

export interface RunListCommandOverrides {
  // Injection point matching RunPipelineOptions.runGit so tests can stub
  // git-remote resolution and the developer's local .git/origin doesn't
  // leak into list-command unit tests.
  readonly runGit?: ResolveRepoFromGitRemoteOptions['runGit'];
}

export async function runListCommand(
  opts: CommonCliOptions,
  overrides: RunListCommandOverrides = {},
): Promise<number> {
  const prepared = await prepareRun(opts);
  // `?? ''` would technically work (resolveAuth trims and falls through to
  // env on empty), but the explicit-undefined pattern matches the call site
  // in shared.ts::executePipeline and avoids relying on the trim+truthy
  // behaviour of resolveAuth's `explicit` branch.
  const auth = await resolveAuth(prepared.token ? { explicitToken: prepared.token } : {});
  const progress = createProgress({ enabled: shouldShowProgress(opts) });
  const repo = await resolveRepo(prepared.repo, {
    // Always-on audit signal — see the matching comment in src/core/pipeline.ts.
    notify: (msg) => {
      process.stderr.write(`${msg}\n`);
    },
    ...(overrides.runGit ? { runGit: overrides.runGit } : {}),
  });
  if (!repo) {
    process.stderr.write(
      'Could not determine the target repository. Pass --repo owner/name, set GITHUB_REPOSITORY, or run from inside a checked-out GitHub repository (origin remote).\n',
    );
    return 1;
  }
  const octokit = createOctokit({ token: auth.token });
  progress.start('Loading managed issues…');
  try {
    const issues = await listManagedIssues(octokit, repo, prepared.config.managementLabel);
    progress.succeed(`Loaded ${issues.length.toString()} managed issue(s)`);
    if (issues.length === 0) {
      process.stdout.write('No managed annotation issues found.\n');
      return 0;
    }
    for (const issue of issues) {
      const stateText = issue.state === 'open' ? pc.green('open  ') : pc.gray('closed');
      process.stdout.write(`${stateText}  #${issue.number.toString()}  ${issue.title}\n`);
    }
    return 0;
  } catch (error) {
    progress.fail('Failed to load managed issues');
    throw error;
  }
}
