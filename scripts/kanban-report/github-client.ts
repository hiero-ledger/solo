// SPDX-License-Identifier: Apache-2.0

import {execSync} from 'node:child_process';
import {type GithubCache} from './cache.js';
import {type GitHubIssue} from './github-issue.js';
import {type GitHubPullRequest} from './github-pull-request.js';
import {type TimelineEvent} from './timeline-event.js';

const RETRY_MAX_ATTEMPTS: number = 3;
const RETRY_BASE_DELAY_MS: number = 1000;
const RETRY_MAX_DELAY_MS: number = 60_000;

interface FetchResult {
  data: unknown;
  linkHeader: string | null;
}

export class GithubClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly cache: GithubCache;
  public readonly authStatus: string;

  public constructor(repo: string, cache: GithubCache) {
    this.baseUrl = `https://api.github.com/repos/${repo}`;
    this.cache = cache;
    const {token, status} = GithubClient.resolveAuth();
    this.authStatus = status;
    this.headers = {
      'User-Agent': 'solo-kanban-report/1.0',
      Accept: 'application/vnd.github.v3+json',
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
    };
  }

  private static resolveAuth(): {token: string | undefined; status: string} {
    // process.env access is intentional here — this script lives in scripts/, not src/
    const githubToken: string | undefined = process.env['GITHUB_TOKEN'];
    if (githubToken) {
      return {token: githubToken, status: 'GITHUB_TOKEN ✓'};
    }

    const ghToken: string | undefined = process.env['GH_TOKEN'];
    if (ghToken) {
      return {token: ghToken, status: 'GH_TOKEN ✓'};
    }

    try {
      const token: string = execSync('gh auth token', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (token) {
        return {token, status: 'gh auth ✓'};
      }
    } catch {
      // best-effort: gh CLI unavailable or not authenticated
    }

    return {token: undefined, status: 'unauthenticated ⚠  (60 req/hr limit)'};
  }

  public async getIssues(state: 'open' | 'closed', since?: Date): Promise<GitHubIssue[]> {
    let url: string = `${this.baseUrl}/issues?state=${state}&per_page=100`;
    if (since) {
      url += `&since=${since.toISOString()}`;
    }
    return this.getPaginated<GitHubIssue>(url);
  }

  public async getTimeline(issueNumber: number): Promise<TimelineEvent[]> {
    const url: string = `${this.baseUrl}/issues/${issueNumber}/timeline?per_page=100`;
    return this.getPaginated<TimelineEvent>(url);
  }

  public async getPull(pullRequestNumber: number): Promise<GitHubPullRequest | null> {
    const url: string = `${this.baseUrl}/pulls/${pullRequestNumber}`;
    try {
      const {data}: FetchResult = await this.fetchWithRetry(url);
      return data as GitHubPullRequest;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('HTTP 404')) {
        // PR was deleted or belongs to a different repo — skip it
        return null;
      }
      throw error;
    }
  }

  private async getPaginated<T>(url: string): Promise<T[]> {
    const results: T[] = [];
    let nextUrl: string | null = url;

    while (nextUrl) {
      const {data, linkHeader}: FetchResult = await this.fetchWithRetry(nextUrl);
      const page: T[] = data as T[];
      results.push(...page);
      nextUrl = GithubClient.parseNextLink(linkHeader);
    }

    return results;
  }

  private async fetchWithRetry(url: string): Promise<FetchResult> {
    const cached: ReturnType<GithubCache['get']> = this.cache.get(url);
    const requestHeaders: Record<string, string> = {
      ...this.headers,
      ...(cached?.etag ? {'If-None-Match': cached.etag} : {}),
    };

    let lastStatus: number = 0;

    for (let attempt: number = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {method: 'GET', headers: requestHeaders});
      } catch (error: unknown) {
        throw new Error(`GitHub API request failed for ${url}: ${String(error)}`);
      }

      if (response.status === 304 && cached) {
        this.cache.recordHit();
        return {data: cached.data, linkHeader: cached.linkHeader};
      }

      if (response.ok) {
        const data: unknown = await response.json();
        const etag: string | null = response.headers.get('ETag');
        const linkHeader: string | null = response.headers.get('Link');
        this.cache.set(url, etag, linkHeader, data);
        return {data, linkHeader};
      }

      lastStatus = response.status;
      const isRateLimited: boolean = response.status === 403 || response.status === 429;
      if (isRateLimited && attempt < RETRY_MAX_ATTEMPTS) {
        const delayMs: number = GithubClient.computeRetryDelay(response, attempt);
        await new Promise<void>((resolve: () => void): void => {
          setTimeout(resolve, delayMs);
        });
      } else {
        break;
      }
    }

    throw new Error(`GitHub API returned HTTP ${lastStatus} for ${url}`);
  }

  private static computeRetryDelay(response: Response, attempt: number): number {
    const retryAfter: string | null = response.headers.get('Retry-After');
    if (retryAfter) {
      return Math.min(Number.parseInt(retryAfter, 10) * 1000, RETRY_MAX_DELAY_MS);
    }

    const rateLimitReset: string | null = response.headers.get('X-RateLimit-Reset');
    const rateLimitRemaining: string | null = response.headers.get('X-RateLimit-Remaining');
    if (rateLimitReset && rateLimitRemaining === '0') {
      const resetMs: number = Number.parseInt(rateLimitReset, 10) * 1000 - Date.now();
      return Math.min(Math.max(resetMs, 0), RETRY_MAX_DELAY_MS);
    }

    return Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
  }

  private static parseNextLink(linkHeader: string | null): string | null {
    if (!linkHeader) {
      return null;
    }
    const match: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    return match ? match[1] : null;
  }
}
