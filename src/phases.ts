export interface StageDef {
  id: string;
  title: string;
  artifact: string | null;
  description: string;
  humanGate?: boolean;
  optional?: boolean;
}

export const STAGE_DEFS: StageDef[] = [
  {
    id: "requirements",
    title: "需求理解",
    artifact: "01-requirements.md",
    description: "从文件/图片/口述提取目标、非目标、约束、验收标准。",
  },
  {
    id: "design",
    title: "方案设计（含技术选型）",
    artifact: "02-design.md",
    description: "结合仓库现状与必要外网调研，给出可落地的方案。",
  },
  {
    id: "design_review",
    title: "方案讨论与敲定",
    artifact: "02-design-review.md",
    humanGate: true,
    description: "默认轻量双视角讨论；人确认后才能继续。完整功能方案必须敲定，不只看风险点。",
  },
  {
    id: "testcases",
    title: "用例与失败边界",
    artifact: "03-testcases.md",
    description: "从验收标准反推正常/边界/失败/回归用例。",
  },
  {
    id: "adversarial_design",
    title: "对抗式方案与用例深评",
    artifact: "03b-adversarial-design.md",
    optional: true,
    description: "高风险或显式开启时，隔离上下文深对抗。",
  },
  {
    id: "implement",
    title: "功能实现",
    artifact: "04-impl-notes.md",
    description: "按方案切片实现；命名/目录/注释等规范内嵌约束。",
  },
  {
    id: "adversarial_code",
    title: "对抗式代码检视",
    artifact: "04b-adversarial-code.md",
    optional: true,
    description: "隔离双检视并收敛，默认最多 2 轮。",
  },
  {
    id: "verify",
    title: "编译、测试与打包",
    artifact: "05-verify.md",
    description: "执行构建与测试门禁，记录命令与结果。",
  },
  {
    id: "human_diff",
    title: "合入前人工 diff",
    artifact: "06-summary.md",
    humanGate: true,
    description: "输出完整 diff 与摘要，等人检视通过。",
  },
  {
    id: "done",
    title: "完成",
    artifact: null,
    description: "流程结束，可合入。",
  },
];

const DEEP_REVIEW_RISKS = [
  "new_subsystem",
  "cross_module",
  "security_or_data",
  "irreversible_migration",
];

export function shouldRunDeepDesign(risks: string[], adversarialDesign: boolean): boolean {
  if (adversarialDesign) return true;
  return risks.some((r) => DEEP_REVIEW_RISKS.includes(r));
}

export function shouldRunDeepCode(risks: string[], adversarialCode: boolean): boolean {
  if (adversarialCode) return true;
  return risks.some((r) => DEEP_REVIEW_RISKS.includes(r));
}

export function buildStageOrder(opts: {
  risks: string[];
  adversarialDesign: boolean;
  adversarialCode: boolean;
}): string[] {
  const deepDesign = shouldRunDeepDesign(opts.risks, opts.adversarialDesign);
  const deepCode = shouldRunDeepCode(opts.risks, opts.adversarialCode);
  return STAGE_DEFS.map((s) => s.id).filter((id) => {
    if (id === "adversarial_design") return deepDesign;
    if (id === "adversarial_code") return deepCode;
    return true;
  });
}
