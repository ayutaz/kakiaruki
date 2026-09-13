import { describe, expect, it } from "vitest";

import {
  createRandomGenome,
  DEFAULT_GENOME_BOUNDS,
  type Genome
} from "../../src/domain/evolution/genome.ts";
import { createSeededRandom } from "../../src/domain/evolution/seeded-random.ts";
import {
  mutate,
  selectElite,
  tournamentSelect,
  uniformCrossover,
  DEFAULT_MUTATION_CONFIG,
  type ScoredGenome
} from "../../src/domain/evolution/selection.ts";

function genomeWith(frequency: number, amplitude: number): Genome {
  return {
    globalFrequency: frequency,
    joints: [
      { amplitude, phase: 0, bias: 0 },
      { amplitude, phase: 1, bias: 0.1 }
    ]
  };
}

const scored: ScoredGenome[] = [
  { genome: genomeWith(1, 0.1), fitness: 1 },
  { genome: genomeWith(2, 0.2), fitness: 5 },
  { genome: genomeWith(3, 0.3), fitness: 3 },
  { genome: genomeWith(4, 0.4), fitness: -2 }
];

describe("selectElite", () => {
  it("keeps the highest scoring genomes in descending order", () => {
    const elite = selectElite(scored, 2);

    expect(elite).toHaveLength(2);
    expect(elite[0]!.globalFrequency).toBe(2);
    expect(elite[1]!.globalFrequency).toBe(3);
  });

  it("does not reorder the caller's array", () => {
    const input = [...scored];

    selectElite(input, 3);

    expect(input.map((entry) => entry.fitness)).toEqual([1, 5, 3, -2]);
  });

  it("returns everything when asked for more than the population", () => {
    expect(selectElite(scored, 99)).toHaveLength(scored.length);
  });

  it("rejects a negative elite count", () => {
    expect(() => selectElite(scored, -1)).toThrow(/eliteCount/);
  });
});

describe("tournamentSelect", () => {
  it("picks better genomes far more often than worse ones", () => {
    const random = createSeededRandom(17);
    const counts = new Map<number, number>();

    for (let attempt = 0; attempt < 2_000; attempt += 1) {
      const winner = tournamentSelect(random, scored, 3);
      counts.set(winner.globalFrequency, (counts.get(winner.globalFrequency) ?? 0) + 1);
    }

    // frequency 2 が最高fitness、4 が最低fitness。
    expect(counts.get(2) ?? 0).toBeGreaterThan(counts.get(3) ?? 0);
    expect(counts.get(3) ?? 0).toBeGreaterThan(counts.get(1) ?? 0);
    expect(counts.get(1) ?? 0).toBeGreaterThan(counts.get(4) ?? 0);
  });

  it("degrades to uniform selection when the tournament holds one contender", () => {
    const random = createSeededRandom(18);
    const counts = new Map<number, number>();

    for (let attempt = 0; attempt < 4_000; attempt += 1) {
      const winner = tournamentSelect(random, scored, 1);
      counts.set(winner.globalFrequency, (counts.get(winner.globalFrequency) ?? 0) + 1);
    }

    for (const frequency of [1, 2, 3, 4]) {
      expect(counts.get(frequency) ?? 0).toBeGreaterThan(800);
      expect(counts.get(frequency) ?? 0).toBeLessThan(1_200);
    }
  });

  it("rejects an empty population or an impossible tournament size", () => {
    const random = createSeededRandom(19);

    expect(() => tournamentSelect(random, [], 3)).toThrow(/empty/);
    expect(() => tournamentSelect(random, scored, 0)).toThrow(/tournamentSize/);
  });
});

describe("uniformCrossover", () => {
  it("takes every gene from one parent or the other, never inventing a third value", () => {
    const random = createSeededRandom(21);
    const parentA = genomeWith(1, 0.1);
    const parentB = genomeWith(2, 0.9);

    for (let attempt = 0; attempt < 200; attempt += 1) {
      const child = uniformCrossover(random, parentA, parentB);

      expect([parentA.globalFrequency, parentB.globalFrequency]).toContain(
        child.globalFrequency
      );
      for (const [index, gene] of child.joints.entries()) {
        expect([parentA.joints[index]!.amplitude, parentB.joints[index]!.amplitude]).toContain(
          gene.amplitude
        );
        expect([parentA.joints[index]!.phase, parentB.joints[index]!.phase]).toContain(
          gene.phase
        );
        expect([parentA.joints[index]!.bias, parentB.joints[index]!.bias]).toContain(gene.bias);
      }
    }
  });

  it("mixes both parents rather than copying one of them", () => {
    const random = createSeededRandom(22);
    const parentA = genomeWith(1, 0.1);
    const parentB = genomeWith(2, 0.9);
    const children = Array.from({ length: 50 }, () =>
      uniformCrossover(random, parentA, parentB)
    );

    expect(children.some((child) => child.globalFrequency === 1)).toBe(true);
    expect(children.some((child) => child.globalFrequency === 2)).toBe(true);
  });

  it("refuses parents whose skeletons do not match", () => {
    const random = createSeededRandom(23);
    const short: Genome = { globalFrequency: 1, joints: [{ amplitude: 0, phase: 0, bias: 0 }] };

    expect(() => uniformCrossover(random, short, genomeWith(2, 0.5))).toThrow(/joint count/);
  });
});

describe("mutate", () => {
  it("leaves the genome untouched when the mutation probability is zero", () => {
    const random = createSeededRandom(24);
    const genome = createRandomGenome(createSeededRandom(25), 4);

    expect(mutate(random, genome, { ...DEFAULT_MUTATION_CONFIG, geneMutationProbability: 0 })).toEqual(
      genome
    );
  });

  it("changes every gene when the mutation probability is one", () => {
    const random = createSeededRandom(26);
    const genome: Genome = {
      globalFrequency: 1.5,
      joints: [
        { amplitude: 0.4, phase: 1, bias: 0 },
        { amplitude: 0.4, phase: 2, bias: 0 }
      ]
    };

    const mutated = mutate(random, genome, {
      ...DEFAULT_MUTATION_CONFIG,
      geneMutationProbability: 1
    });

    expect(mutated.globalFrequency).not.toBe(genome.globalFrequency);
    for (const [index, gene] of mutated.joints.entries()) {
      expect(gene.amplitude).not.toBe(genome.joints[index]!.amplitude);
      expect(gene.phase).not.toBe(genome.joints[index]!.phase);
      expect(gene.bias).not.toBe(genome.joints[index]!.bias);
    }
  });

  it("keeps every mutated value inside the bounds", () => {
    const random = createSeededRandom(27);
    let genome = createRandomGenome(createSeededRandom(28), 3);

    for (let generation = 0; generation < 500; generation += 1) {
      genome = mutate(random, genome, {
        ...DEFAULT_MUTATION_CONFIG,
        geneMutationProbability: 1,
        amplitudeSigma: 5,
        biasSigma: 5,
        frequencySigma: 5
      });

      expect(genome.globalFrequency).toBeGreaterThanOrEqual(DEFAULT_GENOME_BOUNDS.frequency.min);
      expect(genome.globalFrequency).toBeLessThanOrEqual(DEFAULT_GENOME_BOUNDS.frequency.max);
      for (const gene of genome.joints) {
        expect(gene.amplitude).toBeGreaterThanOrEqual(DEFAULT_GENOME_BOUNDS.amplitude.min);
        expect(gene.amplitude).toBeLessThanOrEqual(DEFAULT_GENOME_BOUNDS.amplitude.max);
        expect(gene.bias).toBeGreaterThanOrEqual(DEFAULT_GENOME_BOUNDS.bias.min);
        expect(gene.bias).toBeLessThanOrEqual(DEFAULT_GENOME_BOUNDS.bias.max);
        expect(gene.phase).toBeGreaterThanOrEqual(0);
        expect(gene.phase).toBeLessThan(2 * Math.PI);
      }
    }
  });

  it("is deterministic for the same seed", () => {
    const genome = createRandomGenome(createSeededRandom(29), 3);

    expect(mutate(createSeededRandom(30), genome)).toEqual(
      mutate(createSeededRandom(30), genome)
    );
  });
});
