---
name: gsd-workflow
description: "Run the full GSD project delivery workflow: map-codebase, new-project, discuss-phase, plan-phase, execute-phase, verify-work, complete-milestone, and quick mode. Use for phased implementation with research, atomic plans, wave execution, UAT, and clean milestone handoff."
argument-hint: "What are you building, and do you want full workflow or quick mode?"
user-invocable: true
---

# GSD Workflow

## What This Skill Produces
This skill drives a complete build cycle for a new project or milestone using phased planning and execution.

Expected artifacts:
- PROJECT.md
- REQUIREMENTS.md
- ROADMAP.md
- STATE.md
- .planning/research/
- phase context, research, plans, summaries, verification, and UAT files

## When To Use
Use this skill when you need one of these outcomes:
- End-to-end project delivery with explicit scope and phase gates
- Repeatable execution with atomic commits per task
- Parallel execution where dependencies allow
- Human-in-the-loop verification before moving to next phase

Trigger phrases:
- gsd workflow
- phased delivery
- discuss plan execute verify
- milestone planning
- wave execution
- quick mode with commits

## Inputs To Collect First
Collect these inputs before starting:
- Goal and business outcome
- Constraints (timeline, risk, performance, compliance)
- Tech and architecture preferences
- Known edge cases and non-goals
- Build style: full workflow or quick mode

If the user already has code, start with /gsd:map-codebase.

## Standard Flow
1. Initialize project with /gsd:new-project.
2. Ask clarifying questions until goals, constraints, and scope are precise.
3. Optionally run domain research with parallel agents.
4. Split scope into v1, v2, and out-of-scope.
5. Build a phased roadmap mapped to requirements.
6. Pause for roadmap approval.
7. For each phase, run /gsd:discuss-phase <n> to capture implementation preferences and lock key decisions.
8. Run /gsd:plan-phase <n> to generate 2-3 atomic plans, then verify each plan against requirements.
9. Run /gsd:execute-phase <n> to execute plans in dependency waves.
10. Prefer one atomic commit per task; allow batching only for tiny, tightly related tasks where reviewability stays clear.
11. Run /gsd:verify-work <n> for user acceptance testing and issue diagnosis.
12. If UAT fails, create fix plans and re-run execute/verify for the same phase.
13. After all phases pass, run /gsd:complete-milestone.
14. Start the next cycle with /gsd:new-milestone.

## Decision Points And Branching
- Existing codebase present:
  - Yes: run /gsd:map-codebase first.
  - No: begin at /gsd:new-project.
- During /gsd:new-project:
  - If requirements are ambiguous, continue questioning.
  - If requirements are stable, generate scope split and roadmap.
- During /gsd:discuss-phase:
  - If gray areas exist, gather preferences by area (UI, API, content, org rules).
  - If low risk and user wants speed, allow lighter discussion.
- During /gsd:plan-phase:
  - If plan check fails traceability or completeness, revise and re-check.
  - If plan passes, proceed to execution.
- During /gsd:execute-phase:
  - If plans are independent, run in same wave.
  - If plans depend on previous outputs, schedule in later waves.
  - If file conflicts are likely, serialize those plans.
  - If tasks are tiny and tightly related, batching in one commit is allowed.
- During /gsd:verify-work:
  - If deliverables pass UAT, mark phase complete.
  - If failures appear, spawn diagnosis, create fix plans, and loop execute/verify.
- Mode selection:
  - Full workflow for milestones and high confidence delivery.
  - /gsd:quick for ad-hoc work with optional --discuss, --research, --full.

## Quality Gates And Completion Checks
A phase is complete only when all checks pass:
- Requirements traceability: each deliverable maps to scoped requirement(s)
- Plan quality: atomic tasks, explicit verification steps, clear dependencies
- Execution quality: tasks completed with clear, reviewable commits and no skipped dependencies
- Behavioral quality: user can perform each testable deliverable in UAT
- Regression awareness: failures produce concrete fix plans, not vague TODOs

A milestone is complete only when:
- All phases are verified by UAT
- Verification and summaries exist for every phase
- Roadmap state is updated and release tagging is ready

## Wave Execution Rules
Use these rules when sequencing plan execution:
- Same wave: no dependency and minimal file overlap
- Later wave: depends on artifact/code from prior plans
- Serialized execution: likely merge/file conflicts

Favor vertical slices (feature end-to-end) over horizontal layers when parallelism is desired.

## Quick Mode Protocol
Use /gsd:quick when full lifecycle overhead is unnecessary.

Defaults:
- Keep atomic commits and state tracking
- Skip optional research, plan checking, and verification unless requested

Flags:
- --discuss: lightweight preference capture before planning
- --research: focused implementation research
- --full: enable plan checking (max 2 iterations) and post-execution verification

Artifacts:
- .planning/quick/<task-slug>/PLAN.md
- .planning/quick/<task-slug>/SUMMARY.md

## Output Contract
At the end of each command step, report:
- What was produced
- What was validated
- What remains blocked or pending user approval
- The exact next command to run

## Failure Handling
If progress stalls:
1. Identify the first failing quality gate.
2. Isolate root cause (scope, plan, dependency, or implementation).
3. Regenerate only the affected artifact(s).
4. Re-run the current stage, not the entire workflow.

## Example Prompts
- Use GSD workflow to build a v1 attendance feature with milestone phases.
- Run gsd quick mode to add CSV export with discuss and research flags.
- Plan phase 2 for API hardening and produce wave-based execution.
- Verify phase 1 deliverables and generate fix plans for failed UAT checks.
