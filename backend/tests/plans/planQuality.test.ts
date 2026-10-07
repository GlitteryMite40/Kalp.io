/**
 * Task 07.2: Plan Quality Tests
 *
 * Requirements:
 * - Generate plans for 5 sample ideas and assert each graph is valid.
 * - ACCEPTANCE CRITERIA: 5 of 5 valid graphs
 * - TEST CASES: 5 sample ideas
 * - DEPENDENCIES: 03.9 Save plan (must already be complete)
 */

import { describe, it, expect } from "vitest";
import {
  validateGraph,
  assertValidGraph,
  InvalidGraphError,
} from "@/server/validate";
import { savePlan } from "@/server/savePlan";
import { GraphSchema, findDependsOnCycle, type Edge } from "@/lib/schema";
import { SAMPLE_IDEAS, type SampleIdeaFixture } from "./fixtures";
import { generatePlanFromIdea, type GeneratedPlan } from "./planGenerator";

describe("Task 07.2: Plan Quality Tests", () => {
  // Array to collect generated plans across tests for aggregate assertions
  const generatedPlans: GeneratedPlan[] = [];

  // ===========================================================================
  // Test Cases: 5 Sample Ideas Generation & Individual Graph Validity
  // ===========================================================================
  describe("Individual Sample Ideas (5 Test Cases)", () => {
    SAMPLE_IDEAS.forEach((fixture: SampleIdeaFixture, index: number) => {
      describe(`Idea ${index + 1}: ${fixture.name}`, () => {
        let plan: GeneratedPlan;

        it("generates a complete plan through the full 4-stage pipeline", async () => {
          plan = await generatePlanFromIdea(fixture);
          generatedPlans.push(plan);

          expect(plan).toBeDefined();
          expect(plan.projectId).toBe(fixture.id);
          expect(plan.name).toBe(fixture.name);
          expect(plan.idea).toBe(fixture.idea);
          expect(plan.stagesCompleted).toEqual([
            "requirements",
            "architecture",
            "decomposition",
            "criteria",
          ]);
          expect(plan.requirements.length).toBeGreaterThanOrEqual(3);
          expect(plan.nodes.length).toBeGreaterThanOrEqual(6);
          expect(plan.edges.length).toBeGreaterThanOrEqual(5);
        });

        it("asserts graph is valid via validateGraph", () => {
          const validation = validateGraph({
            nodes: plan.nodes,
            edges: plan.edges,
            requirements: plan.requirements,
          });

          expect(validation.valid).toBe(true);
          expect(validation.errors).toHaveLength(0);
          expect(validation.cycle).toBeNull();
          expect(validation.orphans).toHaveLength(0);
          expect(validation.duplicates.nodeKeys).toHaveLength(0);
          expect(validation.duplicates.nodeIds).toHaveLength(0);
          expect(validation.duplicates.edges).toHaveLength(0);
          expect(validation.missingDependencies.unknownEdgeNodes).toHaveLength(
            0,
          );
          expect(
            validation.missingDependencies.unknownRequirementKeys,
          ).toHaveLength(0);
        });

        it("asserts assertValidGraph succeeds without throwing", () => {
          expect(() =>
            assertValidGraph({
              nodes: plan.nodes,
              edges: plan.edges,
              requirements: plan.requirements,
            }),
          ).not.toThrow();
        });

        it("passes GraphSchema validation with zero schema issues", () => {
          const result = GraphSchema.safeParse({
            requirements: plan.requirements,
            nodes: plan.nodes,
            edges: plan.edges,
          });

          expect(result.success).toBe(true);
        });

        it("enforces DAG topological structure with no cycles and a single setup root", () => {
          // Zero cycles among DEPENDS_ON edges
          const cycle = findDependsOnCycle(
            plan.nodes.map((n) => ({ node_key: n.node_key, id: n.id })),
            plan.edges.map((e) => ({
              from_node: e.from_node,
              to_node: e.to_node,
              type: e.type,
            })),
          );
          expect(cycle).toBeNull();

          // Starts with phase 01 setup node
          const firstNode = plan.nodes[0];
          expect(firstNode.phase).toBe("01");
          expect(firstNode.type).toBe("setup");
          expect(plan.shape.roots).toContain(firstNode.node_key);

          // Path length and non-trivial depth
          expect(plan.shape.longestPathLength).toBeGreaterThanOrEqual(2);
        });

        it("enforces no orphan nodes (every non-root node has prerequisite dependencies)", () => {
          const outgoingDependsOn = new Set(
            plan.edges
              .filter((e) => e.type === "DEPENDS_ON")
              .map((e) => e.from_node),
          );

          // Every node after the root setup node must have outgoing DEPENDS_ON edge
          for (let i = 1; i < plan.nodes.length; i++) {
            const node = plan.nodes[i];
            expect(outgoingDependsOn.has(node.node_key)).toBe(true);
          }
        });

        it("covers 100% of declared requirements across graph nodes", () => {
          const coveredReqKeys = new Set(
            plan.nodes.map((n) => n.requirement_key).filter(Boolean),
          );

          for (const req of plan.requirements) {
            expect(coveredReqKeys.has(req.key)).toBe(true);
          }
        });

        it("enforces quality criteria: >= 2 acceptance criteria and >= 3 tests per node", () => {
          for (const node of plan.nodes) {
            expect(Array.isArray(node.acceptance)).toBe(true);
            expect(node.acceptance.length).toBeGreaterThanOrEqual(2);

            expect(Array.isArray(node.tests)).toBe(true);
            expect(node.tests.length).toBeGreaterThanOrEqual(3);

            // Each node references files
            expect(Array.isArray(node.files)).toBe(true);
            expect(node.files.length).toBeGreaterThanOrEqual(1);

            // Valid status
            expect(["not_started", "ready"]).toContain(node.status);
          }
        });
      });
    });
  });

  // ===========================================================================
  // Acceptance Criteria: 5 of 5 Valid Graphs
  // ===========================================================================
  describe("ACCEPTANCE CRITERIA: 5 of 5 valid graphs", () => {
    it("verifies that all 5 sample ideas generate valid graphs (5 of 5 pass)", async () => {
      // If not already populated, generate all 5
      const plansToVerify: GeneratedPlan[] =
        generatedPlans.length === 5
          ? generatedPlans
          : await Promise.all(SAMPLE_IDEAS.map(generatePlanFromIdea));

      expect(plansToVerify).toHaveLength(5);

      const validityResults = plansToVerify.map((plan) => {
        const validation = validateGraph({
          nodes: plan.nodes,
          edges: plan.edges,
          requirements: plan.requirements,
        });

        return {
          name: plan.name,
          valid: validation.valid,
          errors: validation.errors,
          nodeCount: plan.nodes.length,
          edgeCount: plan.edges.length,
          requirementCount: plan.requirements.length,
        };
      });

      const validCount = validityResults.filter((r) => r.valid).length;

      // Assert exactly 5 of 5 valid graphs
      expect(validCount).toBe(5);
      expect(validityResults.every((r) => r.valid)).toBe(true);
      expect(validityResults.every((r) => r.errors.length === 0)).toBe(true);
    });
  });

  // ===========================================================================
  // Dependency Integration: Task 03.9 Save Plan
  // ===========================================================================
  describe("Integration with Task 03.9: Save Plan", () => {
    it("confirms savePlan pre-validates and accepts each of the 5 generated plans", async () => {
      const plansToVerify =
        generatedPlans.length === 5
          ? generatedPlans
          : await Promise.all(SAMPLE_IDEAS.map(generatePlanFromIdea));

      for (const plan of plansToVerify) {
        // Mock db transaction for savePlan
        const mockTx = {
          projects: [{ id: plan.projectId, status: "generating" }],
          requirements: [] as unknown[],
          nodes: [] as unknown[],
          edges: [] as unknown[],
        };

        const mockDb = {
          begin: async <T>(
            callback: (tx: unknown) => Promise<T>,
          ): Promise<T> => {
            const txFn = Object.assign(
              async (strings: TemplateStringsArray, ...values: unknown[]) => {
                const query = strings.join("?");
                if (query.includes("SELECT id FROM projects")) {
                  return mockTx.projects;
                }
                if (query.includes("SELECT id, key FROM requirements")) {
                  return [];
                }
                if (query.includes("INSERT INTO requirements")) {
                  const reqId = values[0] as string;
                  const reqKey = values[2] as string;
                  return [{ id: reqId, key: reqKey }];
                }
                if (query.includes("INSERT INTO nodes")) {
                  const nodeId = values[0] as string;
                  const nodeKey = values[2] as string;
                  return [{ id: nodeId, node_key: nodeKey }];
                }
                if (query.includes("INSERT INTO edges")) {
                  return [{ id: values[0] || "edge-id" }];
                }
                if (query.includes("UPDATE projects")) {
                  return [];
                }
                return [];
              },
              {
                json: (val: unknown) => val,
              },
            );
            return callback(txFn);
          },
        };

        const saveResult = await savePlan(
          {
            projectId: plan.projectId,
            nodes: plan.nodes,
            edges: plan.edges,
            requirements: plan.requirements,
            projectStatus: "ready",
          },
          {
            validate: true,
            db: mockDb as unknown as NonNullable<
              Parameters<typeof savePlan>[1]
            >["db"],
          },
        );

        expect(saveResult).toBeDefined();
        expect(saveResult.projectId).toBe(plan.projectId);
        expect(saveResult.status).toBe("ready");
        expect(saveResult.nodesSaved).toBe(plan.nodes.length);
        expect(saveResult.edgesSaved).toBe(plan.edges.length);
        expect(saveResult.requirementsSaved).toBe(plan.requirements.length);
      }
    });

    it("verifies savePlan rejects an invalid graph (e.g. cycle introduced) with InvalidGraphError", async () => {
      const basePlan =
        generatedPlans[0] ?? (await generatePlanFromIdea(SAMPLE_IDEAS[0]));

      // Corrupt graph by adding a cycle
      const corruptedEdges: Edge[] = [
        ...basePlan.edges,
        {
          from_node: basePlan.nodes[0].node_key,
          to_node: basePlan.nodes[basePlan.nodes.length - 1].node_key,
          type: "DEPENDS_ON",
        },
      ];

      await expect(
        savePlan({
          projectId: basePlan.projectId,
          nodes: basePlan.nodes,
          edges: corruptedEdges,
          requirements: basePlan.requirements,
        }),
      ).rejects.toThrow(InvalidGraphError);
    });

    it("verifies savePlan rejects an invalid graph with orphan disconnected nodes", async () => {
      const basePlan =
        generatedPlans[0] ?? (await generatePlanFromIdea(SAMPLE_IDEAS[0]));

      // Corrupt graph by adding an orphan node with no edges
      const orphanNode = {
        node_key: "99.9",
        phase: "99",
        title: "Disconnected Orphan Task",
        type: "backend",
        status: "not_started" as const,
        requirement_key: basePlan.requirements[0].key,
        files: ["src/orphan.ts"],
        acceptance: ["Orphan test 1", "Orphan test 2"],
        tests: ["t1", "t2", "t3"],
      };

      await expect(
        savePlan({
          projectId: basePlan.projectId,
          nodes: [...basePlan.nodes, orphanNode],
          edges: basePlan.edges,
          requirements: basePlan.requirements,
        }),
      ).rejects.toThrow(InvalidGraphError);
    });
  });
});
