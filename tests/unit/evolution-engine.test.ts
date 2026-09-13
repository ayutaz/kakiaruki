import { describe, expect, it } from "vitest";

import {
  createInitialPopulation,
  nextGeneration,
  summarizeGeneration,
  DEFAULT_EVOLUTION_CONFIG
} from "../../src/domain/evolution/evolution-engine.ts";
import type { FitnessTerms } from "../../src/domain/evolution/fitness.ts";
import type { Genome } from "../../src/domain/evolution/genome.ts";
import { createSeededRandom } from "../../src/domain/evolution/seeded-random.ts";
import type { ScoredGenome } from "../../src/domain/evolution/selection.ts";

function terms(overrides: Partial<FitnessTerms> = {}): FitnessTerms {
  return {
    forwardProgress: 1,
    bestProgress: 1,
    normalizedForwardProgress: 0.25,
    energyPenalty: 0.1,
    invalidPenalty: 0,
    invalidReason: null,
    ...overrides
  };
}

function scoredPopulation(fitnesses: readonly number[]): ScoredGenome[] {
  const random = createSeededRandom(100);
  return fitnesses.map((fitness) => ({
    genome: createInitialPopulation(random, 3, {
      ...DEFAULT_EVOLUTION_CONFIG,
      populationSize: 1,
      eliteCount: 0
    })[0]!,
    fitness
  }));
}

describe("createInitialPopulation", () => {
  it("creates the configured number of genomes with one gene per joint", () => {
    const population = createInitialPopulation(createSeededRandom(1), 5);

    expect(population).toHaveLength(DEFAULT_EVOLUTION_CONFIG.populationSize);
    for (const genome of population) {
      expect(genome.joints).toHaveLength(5);
    }
  });

  it("is deterministic for the same seed", () => {
    expect(createInitialPopulation(createSeededRandom(2), 4)).toEqual(
      createInitialPopulation(createSeededRandom(2), 4)
    );
  });

  it("does not produce a population of identical genomes", () => {
    const population = createInitialPopulation(createSeededRandom(3), 4);
    const distinct = new Set(population.map((genome) => JSON.stringify(genome)));

    expect(distinct.size).toBe(population.length);
  });

  it("rejects a configuration that cannot produce a population", () => {
    expect(() =>
      createInitialPopulation(createSeededRandom(1), 3, {
        ...DEFAULT_EVOLUTION_CONFIG,
        populationSize: 0
      })
    ).toThrow(/populationSize/);
    expect(() =>
      createInitialPopulation(createSeededRandom(1), 3, {
        ...DEFAULT_EVOLUTION_CONFIG,
        populationSize: 4,
        eliteCount: 4
      })
    ).toThrow(/eliteCount/);
  });
});

describe("nextGeneration", () => {
  const scored = scoredPopulation([1, 9, 5, -3, 7, 2, 8, 4]);
  const config = { ...DEFAULT_EVOLUTION_CONFIG, populationSize: 8, eliteCount: 2 };

  it("keeps the population size stable", () => {
    expect(nextGeneration(createSeededRandom(4), scored, config)).toHaveLength(8);
  });

  it("carries the elite genomes into the next generation unchanged", () => {
    const elite = [...scored]
      .sort((left, right) => right.fitness - left.fitness)
      .slice(0, 2)
      .map((entry) => JSON.stringify(entry.genome));

    const produced = nextGeneration(createSeededRandom(5), scored, config).map((genome) =>
      JSON.stringify(genome)
    );

    for (const genome of elite) {
      expect(produced).toContain(genome);
    }
  });

  it("is deterministic for the same seed and the same scored population", () => {
    expect(nextGeneration(createSeededRandom(6), scored, config)).toEqual(
      nextGeneration(createSeededRandom(6), scored, config)
    );
  });

  it("produces a different generation from a different seed", () => {
    expect(nextGeneration(createSeededRandom(7), scored, config)).not.toEqual(
      nextGeneration(createSeededRandom(8), scored, config)
    );
  });

  it("creates offspring that are not just copies of the elite", () => {
    const produced = nextGeneration(createSeededRandom(9), scored, config);
    const distinct = new Set(produced.map((genome) => JSON.stringify(genome)));

    expect(distinct.size).toBeGreaterThan(config.eliteCount);
  });

  it("refuses an empty scored population", () => {
    expect(() => nextGeneration(createSeededRandom(10), [], config)).toThrow(/empty/);
  });
});

describe("summarizeGeneration", () => {
  it("reports best, median and mean fitness", () => {
    const scored = scoredPopulation([1, 5, 3, 7]);

    const stats = summarizeGeneration(2, scored, [terms(), terms(), terms(), terms()]);

    expect(stats.generation).toBe(2);
    expect(stats.bestFitness).toBe(7);
    expect(stats.medianFitness).toBe(4);
    expect(stats.meanFitness).toBe(4);
  });

  it("reports the best normalised forward progress of the generation", () => {
    const scored = scoredPopulation([1, 5]);

    const stats = summarizeGeneration(0, scored, [
      terms({ normalizedForwardProgress: 0.2 }),
      terms({ normalizedForwardProgress: 1.4 })
    ]);

    expect(stats.bestNormalizedForwardProgress).toBeCloseTo(1.4);
  });

  it("counts the individuals that were disqualified", () => {
    const scored = scoredPopulation([1, -1000, 3]);

    const stats = summarizeGeneration(0, scored, [
      terms(),
      terms({ invalidPenalty: 1000, invalidReason: "out-of-bounds" }),
      terms()
    ]);

    expect(stats.invalidCount).toBe(1);
  });

  it("refuses mismatched scores and terms", () => {
    expect(() => summarizeGeneration(0, scoredPopulation([1, 2]), [terms()])).toThrow(
      /terms/
    );
  });
});
