import {
  FEATURE_NAMES,
  type FeatureContribution,
  type FeatureName,
  type RankingResult,
  type ResponseFeatureSet,
} from "./types.js";

function buildFrequencyTables(
  featureSets: ResponseFeatureSet[],
): Map<FeatureName, Map<number, number>> {
  const tables = new Map<FeatureName, Map<number, number>>();
  for (const name of FEATURE_NAMES) {
    tables.set(name, new Map());
  }

  for (const set of featureSets) {
    if (!set.hasResponse) {
      continue;
    }
    for (const name of FEATURE_NAMES) {
      const value = set.values[name];
      const table = tables.get(name)!;
      table.set(value, (table.get(value) ?? 0) + 1);
    }
  }

  return tables;
}

function countDistinct(freq: Map<number, number>): number {
  return freq.size;
}

function scoreOne(
  set: ResponseFeatureSet,
  tables: Map<FeatureName, Map<number, number>>,
): RankingResult {
  if (!set.hasResponse) {
    return { requestId: set.requestId, rawRank: -1, contributions: [] };
  }

  const contributions: FeatureContribution[] = [];
  let sum = 0;

  for (const name of FEATURE_NAMES) {
    const freqTable = tables.get(name)!;
    const k = countDistinct(freqTable);
    if (k <= 1) {
      continue;
    }

    const value = set.values[name];
    const frequency = freqTable.get(value) ?? 0;
    if (frequency === 0) {
      continue;
    }

    const weight = Math.pow(0.9, k);
    const contribution = weight / frequency;
    sum += contribution;

    contributions.push({
      feature: name,
      value,
      frequency,
      distinctValues: k,
      weight,
      contribution,
    });
  }

  return {
    requestId: set.requestId,
    rawRank: Math.round(sum * 10000),
    contributions,
  };
}

export function scoreFeatureSets(
  featureSets: ResponseFeatureSet[],
): RankingResult[] {
  const tables = buildFrequencyTables(featureSets);
  return featureSets.map((set) => scoreOne(set, tables));
}
