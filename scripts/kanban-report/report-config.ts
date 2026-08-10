// SPDX-License-Identifier: Apache-2.0

export interface ReportConfig {
  repo: string;
  staleThresholdDays: number;
  closedDays: number;
  showClosed: boolean;
}
