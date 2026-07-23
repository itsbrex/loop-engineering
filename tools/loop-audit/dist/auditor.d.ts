import { Finding, BaseAuditResult } from '@cobusgreyling/readiness-core';
export interface LoopSignals {
    stateFile: {
        present: boolean;
        paths: string[];
    };
    loopConfig: {
        present: boolean;
        path?: string;
    };
    skills: {
        count: number;
        loopSkills: string[];
    };
    verifier: {
        present: boolean;
    };
    triage: {
        present: boolean;
    };
    agentsMd: {
        present: boolean;
    };
    patterns: {
        documented: boolean;
    };
    safety: {
        loopMdMentionsSafety: boolean;
        safetyDocPresent: boolean;
    };
    starters: {
        used: boolean;
    };
    github: {
        present: boolean;
        workflows: boolean;
    };
    mcp: {
        present: boolean;
    };
    worktreeEvidence: {
        present: boolean;
    };
    registry: {
        present: boolean;
    };
    cost: {
        budgetDoc: boolean;
        runLog: boolean;
        loopMdBudget: boolean;
        budgetSkill: boolean;
    };
    governance: {
        toolScope: boolean;
        stallDetection: boolean;
        escalation: boolean;
    };
    constraints: {
        present: boolean;
        hasConstraintsSkill: boolean;
    };
    loopActivity: {
        present: boolean;
        evidence: string[];
    };
    /** harness-foundry runtime signals (LE → Foundry funnel). */
    harness: {
        stack: boolean;
        lock: boolean;
        sessions: boolean;
        emit: boolean;
        host: boolean;
    };
    /** memory-engineering setup (memory-tiers.md, memory-budget.md) */
    memory: {
        tiers: boolean;
        budget: boolean;
    };
}
export type { Finding };
export interface AuditResult extends BaseAuditResult<'L0' | 'L1' | 'L2' | 'L3', LoopSignals> {
}
export declare function computeScore(signals: LoopSignals): {
    score: number;
    level: 'L0' | 'L1' | 'L2' | 'L3';
    assessment: string;
};
export declare function auditProject(target: string): Promise<AuditResult>;
