// SPDX-FileCopyrightText: 2026 Sam Willis
// SPDX-License-Identifier: MIT

export function durationStatistics(durations: number[]) {
 const sorted=[...durations].sort((a,b)=>a-b);
 // Median averages the middle pair; p95 uses the nearest-rank convention.
 const n=sorted.length;
 return {median:n?((sorted[Math.floor((n-1)/2)]!+sorted[Math.floor(n/2)]!)/2):0,p95:sorted[Math.max(0,Math.ceil(n*.95)-1)]??0};
}
