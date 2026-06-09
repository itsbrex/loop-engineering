import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export interface LoopSignals {
  stateFile: { present: boolean; paths: string[] };
  loopConfig: { present: boolean; path?: string };
  skills: { count: number; loopSkills: string[] };
  verifier: { present: boolean };
  triage: { present: boolean };
  agentsMd: { present: boolean };
  patterns: { documented: boolean };
  safety: { loopMdMentionsSafety: boolean; safetyDocPresent: boolean };
  starters: { used: boolean };
  github: { present: boolean; workflows: boolean };
  mcp: { present: boolean };
  worktreeEvidence: { present: boolean };
  registry: { present: boolean };
}

export interface Finding {
  level: 'ok' | 'warn' | 'fail';
  message: string;
}

export interface AuditResult {
  target: string;
  score: number;
  level: 'L0' | 'L1' | 'L2' | 'L3';
  assessment: string;
  signals: LoopSignals;
  findings: Finding[];
  recommendations: string[];
}

const STATE_FILES = [
  'STATE.md',
  'pr-babysitter-state.md',
  'ci-sweeper-state.md',
  'post-merge-state.md',
];

const LOOP_SKILL_NAMES = [
  'loop-triage',
  'minimal-fix',
  'loop-verifier',
  'pr-review-triage',
  'ci-triage',
  'post-merge-scan',
  'dependency-triage',
];

const SAFETY_FILES = ['safety.md', 'docs/safety.md', 'SECURITY.md'];
const MCP_FILES = ['.mcp.json', 'mcp.json', '.mcp/config.json'];
const WORKTREE_HINTS = ['worktree', 'worktrees', 'git worktree'];

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function findSkills(root: string): Promise<string[]> {
  const dirs = [
    path.join(root, '.grok', 'skills'),
    path.join(root, '.claude', 'skills'),
    path.join(root, '.codex', 'skills'),
    path.join(root, 'skills'),
  ];
  const found: string[] = [];
  for (const dir of dirs) {
    if (!(await fileExists(dir))) continue;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) found.push(e.name);
      if (e.isFile() && e.name === 'SKILL.md') found.push('root-skill');
    }
  }
  return found;
}

export function computeScore(signals: LoopSignals): { score: number; level: 'L0' | 'L1' | 'L2' | 'L3'; assessment: string } {
  let score = 10;

  if (signals.stateFile.present) score += 18;
  if (signals.triage.present) score += 14;
  if (signals.loopConfig.present) score += 9;
  if (signals.agentsMd.present) score += 9;
  if (signals.skills.count >= 2) score += 14;
  else if (signals.skills.count === 1) score += 7;
  if (signals.verifier.present) score += 14;
  if (signals.safety.loopMdMentionsSafety) score += 4;
  if (signals.safety.safetyDocPresent) score += 4;
  if (signals.github.present) score += 6;
  if (signals.github.workflows) score += 4;
  if (signals.mcp.present) score += 3;
  if (signals.worktreeEvidence.present) score += 3;
  if (signals.registry.present) score += 2;

  score = Math.min(100, Math.max(0, score));

  let level: 'L0' | 'L1' | 'L2' | 'L3' = 'L0';
  if (score >= 78 && signals.verifier.present && signals.stateFile.present) level = 'L3';
  else if (score >= 58 && signals.triage.present) level = 'L2';
  else if (score >= 38 && signals.stateFile.present) level = 'L1';
  else level = 'L0';

  const assessment =
    score >= 82 ? 'Strong loop readiness — good candidate for L3 with explicit gates.' :
    score >= 62 ? 'Good foundation — add missing verifier + safety docs for L3.' :
    score >= 42 ? 'Early loop setup — focus on L1 state + triage before enabling actions.' :
    'Not loop-ready — start with a starter from this repo (minimal-loop or pr-babysitter).';

  return { score, level, assessment };
}

export async function auditProject(target: string): Promise<AuditResult> {
  const root = path.resolve(target);
  const findings: Finding[] = [];
  const recommendations: string[] = [];

  const statePaths: string[] = [];
  for (const f of STATE_FILES) {
    if (await fileExists(path.join(root, f))) statePaths.push(f);
  }

  const loopMd = await fileExists(path.join(root, 'LOOP.md'));
  const agentsMd = await fileExists(path.join(root, 'AGENTS.md')) ||
    await fileExists(path.join(root, 'CLAUDE.md'));

  const skillNames = await findSkills(root);
  const loopSkills = skillNames.filter((s) => LOOP_SKILL_NAMES.includes(s));

  const verifier = skillNames.includes('loop-verifier');
  const triage = skillNames.includes('loop-triage') || skillNames.includes('pr-review-triage') || skillNames.includes('ci-triage');

  let loopMdContent = '';
  if (loopMd) {
    loopMdContent = await readFile(path.join(root, 'LOOP.md'), 'utf8');
  }

  // New expanded signals
  const githubDir = await fileExists(path.join(root, '.github'));
  const hasWorkflows = await fileExists(path.join(root, '.github', 'workflows'));

  // Proper safety doc detection
  let safetyDocPresent = false;
  for (const f of SAFETY_FILES) {
    if (await fileExists(path.join(root, f))) { safetyDocPresent = true; break; }
  }
  if (!safetyDocPresent) {
    safetyDocPresent = await fileExists(path.join(root, 'docs', 'safety.md'));
  }

  const mcpPresent = (await Promise.all(MCP_FILES.map(f => fileExists(path.join(root, f))))).some(Boolean) ||
    /MCP|mcp server|plugins & connectors/i.test(loopMdContent);

  // Light evidence of worktree usage (common in patterns/starters/LOOP)
  let worktreeEvidence = false;
  const candidateMd = ['LOOP.md', 'patterns/pr-babysitter.md', 'starters/minimal-loop/LOOP.md', 'docs/operating-loops.md'];
  for (const c of candidateMd) {
    try {
      const p = path.join(root, c);
      if (await fileExists(p)) {
        const txt = await readFile(p, 'utf8');
        if (WORKTREE_HINTS.some(h => txt.toLowerCase().includes(h))) { worktreeEvidence = true; break; }
      }
    } catch {}
  }

  const registryPresent = await fileExists(path.join(root, 'patterns', 'registry.yaml'));

  const signals: LoopSignals = {
    stateFile: { present: statePaths.length > 0, paths: statePaths },
    loopConfig: { present: loopMd, path: loopMd ? 'LOOP.md' : undefined },
    skills: { count: loopSkills.length, loopSkills },
    verifier: { present: verifier },
    triage: { present: triage },
    agentsMd: { present: agentsMd },
    patterns: { documented: loopMd },
    safety: { loopMdMentionsSafety: /gate|denylist|auto-merge|safety/i.test(loopMdContent), safetyDocPresent },
    starters: { used: loopSkills.includes('loop-triage') },
    github: { present: githubDir, workflows: hasWorkflows },
    mcp: { present: mcpPresent },
    worktreeEvidence: { present: worktreeEvidence },
    registry: { present: registryPresent },
  };

  if (!signals.stateFile.present) {
    findings.push({ level: 'fail', message: 'No state file (STATE.md or pattern-specific state).' });
    recommendations.push('Copy starters/minimal-loop/STATE.md.example to STATE.md');
  } else {
    findings.push({ level: 'ok', message: `State file(s): ${statePaths.join(', ')}` });
  }

  if (!signals.triage.present) {
    findings.push({ level: 'warn', message: 'No triage skill detected.' });
    recommendations.push('Install loop-triage from templates/ or starters/minimal-loop/');
  } else {
    findings.push({ level: 'ok', message: 'Triage skill present.' });
  }

  if (!signals.verifier.present) {
    findings.push({ level: 'warn', message: 'No loop-verifier skill — maker/checker split incomplete.' });
    recommendations.push('Add templates/SKILL.md.verifier as .grok/skills/loop-verifier/SKILL.md');
  } else {
    findings.push({ level: 'ok', message: 'Verifier skill present.' });
  }

  if (!signals.loopConfig.present) {
    findings.push({ level: 'warn', message: 'No LOOP.md documenting cadence, limits, and gates.' });
    recommendations.push('Copy starters/minimal-loop/LOOP.md and customize');
  }

  if (!signals.agentsMd.present) {
    findings.push({ level: 'warn', message: 'No AGENTS.md / CLAUDE.md for project conventions.' });
    recommendations.push('Add AGENTS.md with build/test commands and review norms');
  }

  if (!signals.safety.loopMdMentionsSafety) {
    findings.push({ level: 'warn', message: 'LOOP.md does not mention safety gates or auto-merge policy.' });
    recommendations.push('Document human gates per docs/safety.md in LOOP.md');
  }

  if (!signals.safety.safetyDocPresent) {
    findings.push({ level: 'warn', message: 'No safety.md or docs/safety.md found.' });
    recommendations.push('Copy or create docs/safety.md (denylists, auto-merge policy, MCP scopes)');
  } else {
    findings.push({ level: 'ok', message: 'Safety documentation present.' });
  }

  if (!signals.github.present) {
    findings.push({ level: 'warn', message: 'No .github/ directory (templates, workflows for dogfooding).' });
    recommendations.push('Add .github/ISSUE_TEMPLATE, PULL_REQUEST_TEMPLATE, and workflows (see this repo for examples)');
  } else if (!signals.github.workflows) {
    findings.push({ level: 'warn', message: '.github/ exists but no workflows/ (CI dogfood opportunity).' });
    recommendations.push('Add GitHub Actions that run loop-audit and validate patterns (dogfood the reference)');
  } else {
    findings.push({ level: 'ok', message: '.github/ with workflows present (strong dogfooding signal).' });
  }

  if (!signals.mcp.present) {
    findings.push({ level: 'warn', message: 'No MCP / connector config or mentions detected.' });
    recommendations.push('Document MCP usage (or note "MCP not required for this pattern") in LOOP.md or skills');
  }

  if (!signals.worktreeEvidence.present) {
    findings.push({ level: 'warn', message: 'Little evidence of worktree usage in docs or state.' });
    recommendations.push('Add worktree isolation notes to LOOP.md or pattern docs (see primitives and starters)');
  }

  if (!signals.registry.present) {
    findings.push({ level: 'warn', message: 'No patterns/registry.yaml (machine-readable index for future tools).' });
    recommendations.push('Add patterns/registry.yaml following the existing format');
  }

  const { score, level, assessment } = computeScore(signals);

  return {
    target: root,
    score,
    level,
    assessment,
    signals,
    findings,
    recommendations,
  };
}