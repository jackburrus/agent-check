import type { Trace, Baseline, BaselineDiff } from "./types.ts";

export function extractBaseline(trace: Trace): Baseline {
  const toolNames = trace.toolCalls.map((tc) => tc.name);
  const toolSet = [...new Set(toolNames)].sort();
  const turnCount = trace.turns.length;

  const outputShape: string[] =
    trace.output && typeof trace.output === "object" && !Array.isArray(trace.output)
      ? Object.keys(trace.output as Record<string, unknown>).sort()
      : [];

  const baseline: Baseline = {
    version: 1,
    toolSet,
    toolOrder: toolNames,
    turnCount: { min: turnCount, max: turnCount },
    outputShape,
    stopReason: trace.stopReason,
  };

  if (trace.cost !== undefined) {
    baseline.costRange = { min: trace.cost, max: trace.cost };
  }

  if (trace.tokens?.total !== undefined) {
    baseline.tokenRange = { min: trace.tokens.total, max: trace.tokens.total };
  } else if (trace.tokens) {
    const total = trace.tokens.input + trace.tokens.output;
    baseline.tokenRange = { min: total, max: total };
  }

  return baseline;
}

export function compareBaseline(trace: Trace, baseline: Baseline): BaselineDiff {
  const differences: string[] = [];

  // Check tool set
  const traceToolSet = [...new Set(trace.toolCalls.map((tc) => tc.name))].sort();
  const baselineToolSet = [...baseline.toolSet].sort();

  const addedTools = traceToolSet.filter((t) => !baselineToolSet.includes(t));
  const removedTools = baselineToolSet.filter((t) => !traceToolSet.includes(t));

  if (addedTools.length > 0) {
    differences.push(`New tools used: [${addedTools.join(", ")}]`);
  }
  if (removedTools.length > 0) {
    differences.push(`Tools no longer used: [${removedTools.join(", ")}]`);
  }

  // Check tool order
  const traceToolOrder = trace.toolCalls.map((tc) => tc.name);
  if (JSON.stringify(traceToolOrder) !== JSON.stringify(baseline.toolOrder)) {
    differences.push(
      `Tool order changed: expected [${baseline.toolOrder.join(", ")}], got [${traceToolOrder.join(", ")}]`
    );
  }

  // Check turn count
  const turnCount = trace.turns.length;
  if (turnCount < baseline.turnCount.min || turnCount > baseline.turnCount.max) {
    differences.push(
      `Turn count ${turnCount} outside expected range [${baseline.turnCount.min}, ${baseline.turnCount.max}]`
    );
  }

  // Check cost range
  if (baseline.costRange && trace.cost !== undefined) {
    if (trace.cost < baseline.costRange.min || trace.cost > baseline.costRange.max) {
      differences.push(
        `Cost $${trace.cost} outside expected range [$${baseline.costRange.min}, $${baseline.costRange.max}]`
      );
    }
  }

  // Check token range
  if (baseline.tokenRange && trace.tokens) {
    const total = trace.tokens.total ?? trace.tokens.input + trace.tokens.output;
    if (total < baseline.tokenRange.min || total > baseline.tokenRange.max) {
      differences.push(
        `Token count ${total} outside expected range [${baseline.tokenRange.min}, ${baseline.tokenRange.max}]`
      );
    }
  }

  // Check stop reason
  if (trace.stopReason !== baseline.stopReason) {
    differences.push(
      `Stop reason changed: expected "${baseline.stopReason}", got "${trace.stopReason}"`
    );
  }

  return {
    pass: differences.length === 0,
    differences,
  };
}

export async function saveBaseline(baseline: Baseline, path: string): Promise<void> {
  await Bun.write(path, JSON.stringify(baseline, null, 2) + "\n");
}

export async function loadBaseline(path: string): Promise<Baseline> {
  const file = Bun.file(path);
  const text = await file.text();
  return JSON.parse(text) as Baseline;
}

export function updateBaseline(existing: Baseline, trace: Trace): Baseline {
  const traceBaseline = extractBaseline(trace);

  const toolSet = [...new Set([...existing.toolSet, ...traceBaseline.toolSet])].sort();
  const turnCount = {
    min: Math.min(existing.turnCount.min, traceBaseline.turnCount.min),
    max: Math.max(existing.turnCount.max, traceBaseline.turnCount.max),
  };

  let costRange = existing.costRange;
  if (traceBaseline.costRange) {
    if (costRange) {
      costRange = {
        min: Math.min(costRange.min, traceBaseline.costRange.min),
        max: Math.max(costRange.max, traceBaseline.costRange.max),
      };
    } else {
      costRange = traceBaseline.costRange;
    }
  }

  let tokenRange = existing.tokenRange;
  if (traceBaseline.tokenRange) {
    if (tokenRange) {
      tokenRange = {
        min: Math.min(tokenRange.min, traceBaseline.tokenRange.min),
        max: Math.max(tokenRange.max, traceBaseline.tokenRange.max),
      };
    } else {
      tokenRange = traceBaseline.tokenRange;
    }
  }

  // Merge output shapes
  const outputShape = [...new Set([...existing.outputShape, ...traceBaseline.outputShape])].sort();

  return {
    version: 1,
    toolSet,
    toolOrder: existing.toolOrder, // keep original order as canonical
    turnCount,
    costRange,
    tokenRange,
    outputShape,
    stopReason: existing.stopReason, // keep original stop reason as canonical
    metadata: existing.metadata,
  };
}
