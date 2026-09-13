import { describe, expect, it } from "vitest";

import {
  clampGenome,
  createRandomGenome,
  genomeToCommandSource,
  DEFAULT_GENOME_BOUNDS,
  type Genome
} from "../../src/domain/evolution/genome.ts";
import { createSeededRandom } from "../../src/domain/evolution/seeded-random.ts";

describe("createRandomGenome", () => {
  it("creates one gene per joint", () => {
    const genome = createRandomGenome(createSeededRandom(1), 5);

    expect(genome.joints).toHaveLength(5);
  });

  it("is deterministic for the same seed", () => {
    expect(createRandomGenome(createSeededRandom(3), 4)).toEqual(
      createRandomGenome(createSeededRandom(3), 4)
    );
  });

  it("differs for a different seed", () => {
    expect(createRandomGenome(createSeededRandom(3), 4)).not.toEqual(
      createRandomGenome(createSeededRandom(4), 4)
    );
  });

  it("stays inside the declared bounds", () => {
    const random = createSeededRandom(12);

    for (let attempt = 0; attempt < 200; attempt += 1) {
      const genome = createRandomGenome(random, 3);
      expect(genome.globalFrequency).toBeGreaterThanOrEqual(
        DEFAULT_GENOME_BOUNDS.frequency.min
      );
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

  it("rejects a joint count that cannot produce a controller", () => {
    expect(() => createRandomGenome(createSeededRandom(1), 0)).toThrow(/jointCount/);
    expect(() => createRandomGenome(createSeededRandom(1), 1.5)).toThrow(/jointCount/);
  });
});

describe("clampGenome", () => {
  it("pulls out of range values back inside the bounds", () => {
    const wild: Genome = {
      globalFrequency: 99,
      joints: [{ amplitude: 50, phase: 9 * Math.PI, bias: -80 }]
    };

    const clamped = clampGenome(wild);

    expect(clamped.globalFrequency).toBe(DEFAULT_GENOME_BOUNDS.frequency.max);
    expect(clamped.joints[0]!.amplitude).toBe(DEFAULT_GENOME_BOUNDS.amplitude.max);
    expect(clamped.joints[0]!.bias).toBe(DEFAULT_GENOME_BOUNDS.bias.min);
    expect(clamped.joints[0]!.phase).toBeGreaterThanOrEqual(0);
    expect(clamped.joints[0]!.phase).toBeLessThan(2 * Math.PI);
    expect(clamped.joints[0]!.phase).toBeCloseTo(Math.PI, 9);
  });

  it("leaves an in range genome untouched", () => {
    const genome = createRandomGenome(createSeededRandom(6), 3);

    expect(clampGenome(genome)).toEqual(genome);
  });
});

describe("genomeToCommandSource", () => {
  it("turns a genome into the same motor commands every time", () => {
    const genome = createRandomGenome(createSeededRandom(2), 3);
    const first = genomeToCommandSource(genome);
    const second = genomeToCommandSource(genome);
    const observation = { index: 1, angle: 0.2, angularVelocity: 0.1 };

    expect(first.motorSpeed(observation, 1.25)).toBe(second.motorSpeed(observation, 1.25));
  });

  it("drives the joints the genome describes and no others", () => {
    const genome: Genome = {
      globalFrequency: 1,
      joints: [{ amplitude: 0.8, phase: 0, bias: 0 }]
    };
    const source = genomeToCommandSource(genome);

    expect(source.motorSpeed({ index: 0, angle: 0, angularVelocity: 0 }, 0.25)).not.toBe(0);
    expect(source.motorSpeed({ index: 1, angle: 0, angularVelocity: 0 }, 0.25)).toBe(0);
  });

  it("makes a different genome produce a different command", () => {
    const slow = genomeToCommandSource({
      globalFrequency: 0.5,
      joints: [{ amplitude: 0.8, phase: 0, bias: 0 }]
    });
    const fast = genomeToCommandSource({
      globalFrequency: 2.5,
      joints: [{ amplitude: 0.8, phase: 0, bias: 0 }]
    });
    const observation = { index: 0, angle: 0, angularVelocity: 0 };

    expect(slow.motorSpeed(observation, 0.4)).not.toBeCloseTo(
      fast.motorSpeed(observation, 0.4),
      3
    );
  });
});
