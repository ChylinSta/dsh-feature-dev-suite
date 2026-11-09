export interface StageScriptArgs {
  featureSummary: string;
  brief: string;
  requirements: string;
  design: string;
  testcases: string;
  implNotes: string;
  deep: boolean;
}

export interface StageScript {
  meta: {
    name: string;
    description: string;
    phases: { title: string; detail?: string }[];
  };
  script: string;
}

function j(s: string): string {
  return JSON.stringify(s);
}
export function buildStageScript(stage: string, args: StageScriptArgs): StageScript | null {
  const commonArgs = `const featureSummary = ${j(args.featureSummary)}
const brief = ${j(args.brief)}
const requirements = ${j(args.requirements)}
const design = ${j(args.design)}
const testcases = ${j(args.testcases)}
const implNotes = ${j(args.implNotes)}
`;
  switch (stage) {
    case "requirements":
      return {
        meta: {
          name: "feature-dev-requirements",
          description: "Extract structured requirements for a feature.",
          phases: [{ title: "requirements", detail: "Structured requirements from brief/inputs" }]
        },
        script: `${commonArgs}
phase('requirements')
log('Extracting structured requirements')
const text = await agent(
  [
    'You are the requirements analyst for a feature-dev pipeline.',
    'Read the brief and produce a Markdown document with exactly these sections:',
    '## Goal',
    '## Non-goals',
    '## Constraints',
    '## Acceptance criteria',
    '## Open questions',
    'Be concrete. If information is missing, list it under Open questions \u2014 do not invent product facts.',
    '',
    'Feature summary:',
    featureSummary,
    '',
    'Brief / inputs:',
    brief || '(none)',
  ].join('\\n'),
  { label: 'requirements' },
)
if (!text) throw new Error('requirements agent failed')
return { artifact: text }
`
      };
    case "design":
      return {
        meta: {
          name: "feature-dev-design",
          description: "Produce an implementable design including tech choices.",
          phases: [{ title: "design", detail: "Design + tech selection" }]
        },
        script: `${commonArgs}
phase('design')
log('Drafting design from requirements')
const text = await agent(
  [
    'You are the design lead for a feature-dev pipeline.',
    'Prefer reusing the current repository stack over greenfield choices.',
    'Produce Markdown with:',
    '## Summary',
    '## Current-repo fit',
    '## Tech choices (with rationale)',
    '## Module boundaries & data flow',
    '## Risks & rollback',
    '## Implementation slices',
    'Do not write code yet.',
    '',
    'Feature summary:',
    featureSummary,
    '',
    'Requirements:',
    requirements || '(missing)',
  ].join('\\n'),
  { label: 'design' },
)
if (!text) throw new Error('design agent failed')
return { artifact: text }
`
      };
    case "design_review":
      return {
        meta: {
          name: "feature-dev-design-review",
          description: "Mandatory dual-perspective design discussion before human approval.",
          phases: [
            { title: "design_review", detail: "Isolated proposer + challenger, then merge" }
          ]
        },
        script: `${commonArgs}
phase('design_review')
log('Starting isolated proposer and challenger')
const deep = ${args.deep ? "true" : "false"}
const [proposer, challenger] = await parallel([
  () => agent([
    'You are the DESIGN PROPOSER. You do NOT see the challenger.',
    'Improve the design for implementability and acceptance-criteria coverage.',
    deep ? 'Go deep: alternatives, failure modes, migration, operability.' : 'Keep it to a focused light review.',
    'Output Markdown: ## Strengths ## Required changes ## Residual risks',
    '',
    'Feature summary:', featureSummary,
    '',
    'Requirements:', requirements || '(missing)',
    '',
    'Design:', design || '(missing)',
  ].join('\\n'), { label: 'proposer', phase: 'design_review' }),
  () => agent([
    'You are the DESIGN CHALLENGER. You do NOT see the proposer.',
    'Attack gaps, unmet acceptance criteria, over-engineering, missing failure modes.',
    'Do not rewrite the whole design; list issues with severity (blocker/major/minor).',
    deep ? 'Be adversarial and thorough.' : 'Focus on blockers and majors.',
    'Output Markdown: ## Blockers ## Majors ## Minors ## Questions for human',
    '',
    'Feature summary:', featureSummary,
    '',
    'Requirements:', requirements || '(missing)',
    '',
    'Design:', design || '(missing)',
  ].join('\\n'), { label: 'challenger', phase: 'design_review' }),
])
log('Merging review perspectives')
const merged = await agent([
  'You are the DESIGN REVIEW MERGER for a feature-dev pipeline.',
  'Merge proposer and challenger into one decision brief for a human approver.',
  'Sections: ## Agreed ## Disputed ## Required changes before approval ## Recommendation (approve with conditions | request revision)',
  'Do not invent new product requirements.',
  '',
  'Requirements:', requirements || '(missing)',
  '',
  'Design:', design || '(missing)',
  '',
  'Proposer:', proposer || '(failed)',
  '',
  'Challenger:', challenger || '(failed)',
].join('\\n'), { label: 'merger', phase: 'design_review' })
if (!merged) throw new Error('design_review merger failed')
return {
  artifact: [
    '# \u65B9\u6848\u8BA8\u8BBA\u4E0E\u6572\u5B9A',
    '',
    merged,
    '',
    '## Appendix: proposer',
    '',
    proposer || '(failed)',
    '',
    '## Appendix: challenger',
    '',
    challenger || '(failed)',
    '',
  ].join('\\n'),
  proposer,
  challenger,
}
`
      };
    case "testcases":
      return {
        meta: {
          name: "feature-dev-testcases",
          description: "Derive test boundaries and cases from design + acceptance criteria.",
          phases: [{ title: "testcases" }]
        },
        script: `${commonArgs}
phase('testcases')
const text = await agent([
  'You write test cases for a feature-dev pipeline.',
  'Produce Markdown: ## Mapping to acceptance criteria ## Happy paths ## Boundaries ## Failures/permissions ## Regression checks',
  'Each case: id, steps, expected.',
  '',
  'Requirements:', requirements || '(missing)',
  '',
  'Design:', design || '(missing)',
].join('\\n'), { label: 'testcases' })
if (!text) throw new Error('testcases agent failed')
return { artifact: text }
`
      };
    case "adversarial_design":
      return {
        meta: {
          name: "feature-dev-adversarial-design",
          description: "Deep adversarial review of design and test cases.",
          phases: [{ title: "adversarial_design" }]
        },
        script: `${commonArgs}
phase('adversarial_design')
const [a, b] = await parallel([
  () => agent(['Deep design auditor. Find architectural holes.', 'Design:', design, 'Tests:', testcases].join('\\n'), { label: 'design-auditor' }),
  () => agent(['Deep test auditor. Find missing cases and weak oracles.', 'Design:', design, 'Tests:', testcases].join('\\n'), { label: 'test-auditor' }),
])
const merged = await agent(['Merge adversarial design/test findings into ## Blockers ## Actions', a || '', b || ''].join('\\n'), { label: 'adv-merge' })
return { artifact: merged || [a, b].filter(Boolean).join('\\n\\n') }
`
      };
    case "implement":
      return {
        meta: {
          name: "feature-dev-implement",
          description: "Implement the approved design in small slices.",
          phases: [{ title: "implement" }]
        },
        script: `${commonArgs}
phase('implement')
const text = await agent([
  'You implement the approved feature design in the current workspace.',
  'Follow repository conventions. Prefer small slices. Update/add tests when appropriate.',
  'When finished, return Markdown notes: ## Changes ## Commands run ## Remaining work',
  '',
  'Requirements:', requirements || '(missing)',
  '',
  'Design:', design || '(missing)',
  '',
  'Test cases:', testcases || '(missing)',
].join('\\n'), { label: 'implementer' })
if (!text) throw new Error('implement agent failed')
return { artifact: text }
`
      };
    case "adversarial_code":
      return {
        meta: {
          name: "feature-dev-adversarial-code",
          description: "Isolated dual code review with convergence notes.",
          phases: [{ title: "adversarial_code" }]
        },
        script: `${commonArgs}
phase('adversarial_code')
const [correctness, norms] = await parallel([
  () => agent(['Code reviewer focusing on correctness, regressions, security.', 'Impl notes:', implNotes, 'Design:', design, 'Tests:', testcases].join('\\n'), { label: 'correctness-reviewer' }),
  () => agent(['Code reviewer focusing on repo conventions, naming, structure, docs.', 'Impl notes:', implNotes].join('\\n'), { label: 'norms-reviewer' }),
])
const merged = await agent(['Merge code reviews into ## Must fix ## Should fix ## Nice to have ## Convergence plan (max 2 rounds)', correctness || '', norms || ''].join('\\n'), { label: 'code-merge' })
return { artifact: merged || [correctness, norms].filter(Boolean).join('\\n\\n') }
`
      };
    case "verify":
      return {
        meta: {
          name: "feature-dev-verify",
          description: "Build, test, and pack; report command evidence.",
          phases: [{ title: "verify" }]
        },
        script: `${commonArgs}
phase('verify')
const text = await agent([
  'Run the repository build/test/pack commands appropriate for this workspace.',
  'Return Markdown: ## Commands ## Results ## Failures ## Artifacts',
  'Do not claim success without command evidence.',
  'Impl notes:', implNotes || '(none)',
].join('\\n'), { label: 'verifier' })
if (!text) throw new Error('verify agent failed')
return { artifact: text }
`
      };
    case "human_diff":
      return {
        meta: {
          name: "feature-dev-human-diff",
          description: "Prepare full diff and summary for human gate.",
          phases: [{ title: "human_diff" }]
        },
        script: `${commonArgs}
phase('human_diff')
const text = await agent([
  'Prepare a merge gate packet.',
  'Produce Markdown summary: ## Intent ## Key changes ## Risks ## Test evidence ## Review checklist',
  'Also include a fenced diff block if you can obtain git diff; otherwise explain how to obtain it.',
  'Impl notes:', implNotes || '(none)',
  'Verify:', '(see 05-verify.md on disk if present)',
].join('\\n'), { label: 'diff-summarizer' })
return { artifact: text || '# human diff\\n\\n(missing summary)', diff: null }
`
      };
    default:
      return null;
  }
}
