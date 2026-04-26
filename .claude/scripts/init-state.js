#!/usr/bin/env node
// LaiM State Initialization Script
// Generates a complete, valid state.json with all fields.
// Usage: node init-state.js <feature-slug> <flow> [initial-phase]
//   flow: greenfield | quick
//   initial-phase: research (default for greenfield) | analyze (default for quick)

const args = process.argv.slice(2);
const feature = args[0];
const flow = args[1] || "greenfield";
const initialPhase = args[2] || (flow === "quick" ? "analyze" : "research");

if (!feature) {
  console.error(
    "Usage: node init-state.js <feature-slug> [flow] [initial-phase]",
  );
  process.exit(1);
}

const now = new Date().toISOString();

const state = {
  feature,
  flow,
  version: "next-2.0",
  created: now,
  lastUpdated: now,
  currentPhase: initialPhase,
  currentStep: null,
  currentCheckpoint: null,
  phases: {
    research: {
      status: "pending",
      startedAt: null,
      completedAt: null,
      gateResult: null,
    },
    specify: {
      status: "pending",
      startedAt: null,
      completedAt: null,
      gateResult: null,
    },
    architecture: {
      status: "pending",
      startedAt: null,
      completedAt: null,
      gateResult: null,
    },
    plan: {
      status: "pending",
      startedAt: null,
      completedAt: null,
      gateResult: null,
    },
  },
  storiesDone: 0,
  storiesTotal: 0,
  changeStories: [],
  currentStory: null,
  sessions: [],
  tooling: {
    format: null,
    lint: null,
    lint_fix: null,
    build: null,
    test: null,
    test_changed: null,
    test_report: null,
    security: null,
    css_framework: null,
    dev_server: null,
    dev_port: null,
    env_template: null,
    accessibility_lint: null,
  },
  metrics: {
    gates: {
      passes: 0,
      fails: 0,
      overrides: 0,
      backNavigations: 0,
      blockingFails: 0,
    },
    phases: {
      research: { durationMinutes: null, revisions: 0, gateAttempts: 0 },
      specify: {
        durationMinutes: null,
        revisions: 0,
        gateAttempts: 0,
        personaCount: 0,
        personaConcerns: 0,
      },
      architecture: {
        durationMinutes: null,
        revisions: 0,
        gateAttempts: 0,
        deferredDecisions: 0,
        resolvedDecisions: 0,
      },
      plan: {
        durationMinutes: null,
        revisions: 0,
        gateAttempts: 0,
        wavesPlanned: 0,
      },
    },
    stories: {
      completed: 0,
      skipped: 0,
      changeStoriesCreated: 0,
      gate5Passes: 0,
      gate5Fails: 0,
      gate5Overrides: 0,
      avgTasksPerStory: 0,
      sizeDistribution: { S: 0, M: 0, L: 0 },
    },
    tasks: {
      totalCompleted: 0,
      totalCompletedNoCommit: 0,
      totalSkipped: 0,
      totalRevisions: 0,
      totalVerificationCycles: 0,
      firstPassSuccess: 0,
      tddCount: 0,
      tddTotal: 0,
      avgVerificationCycles: 0,
    },
    codeReview: {
      reviewsRun: 0,
      totalFindings: 0,
      criticalFindings: 0,
      highFindings: 0,
      mediumFindings: 0,
      lowFindings: 0,
      findingsDeferred: 0,
    },
    quality: {
      interfaceAudits: 0,
      interfaceMismatches: 0,
      amendments: 0,
      concerns: 0,
      concernsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    },
    drift: { taskDeviations: 0, storiesResizedDuringImpl: 0 },
    estimation: {
      sizeAccuracy: {
        S: { planned: 0, avgActualTasks: 0 },
        M: { planned: 0, avgActualTasks: 0 },
        L: { planned: 0, avgActualTasks: 0 },
      },
    },
    execution: {
      totalSessions: 0,
      pauseResumeCount: 0,
      agentTeamsUsed: false,
      parallelWaves: 0,
      parallelStories: 0,
      subagentSpawns: 0,
    },
    optionalSkills: {
      designer: { used: false, mode: null, completedAt: null },
      devopsPass1: { used: false, completedAt: null },
      devopsPass2: { used: false, completedAt: null },
      qa: { used: false, completedAt: null },
      notion: { used: false, syncCount: 0, completedAt: null },
    },
    git: {
      totalCommits: 0,
      totalFilesChanged: 0,
      totalInsertions: 0,
      totalDeletions: 0,
      testsAdded: 0,
    },
  },
  baselineTests: null,
  waveStrategy: {},
  devops: {
    pass1: "pending",
    pass2: "pending",
    pass2Partial: false,
  },
};

console.log(JSON.stringify(state, null, 2));
