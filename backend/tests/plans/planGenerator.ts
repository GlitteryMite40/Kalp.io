/**
 * End-to-End Plan Generation Pipeline Helper (Task 07.2: Plan quality tests)
 *
 * Chains Kalp.io's core generation pipeline:
 * 1. extractRequirements (Stage 1: Extract)
 * 2. proposeArchitecture (Stage 2: Architecture)
 * 3. decomposeToNodes (Stage 3: Decompose)
 * 4. generateCriteriaAndTests (Stage 4: Criteria)
 *
 * Returns a fully assembled, typed plan graph ready for validation and saving.
 */

import {
  extractRequirements,
  type ExtractedRequirements,
  type ExtractJsonGenerator,
} from "@/server/extract";
import {
  proposeArchitecture,
  type ProposedArchitecture,
  type ArchitectureJsonGenerator,
} from "@/server/architecture";
import {
  decomposeToNodes,
  type DecomposedGraph,
  type DecomposeJsonGenerator,
} from "@/server/decompose";
import type { DecomposeOutput } from "@/server/prompts/decompose";
import {
  generateCriteriaAndTests,
  type EnrichedGraphWithCriteria,
  type CriteriaBatchJsonGenerator,
} from "@/server/criteria";
import type { Node, Edge, Requirement, GraphShapeAnalysis } from "@/lib/schema";
import type { SampleIdeaFixture } from "./fixtures";

export interface GeneratedPlan {
  projectId: string;
  name: string;
  idea: string;
  requirements: Requirement[];
  architecture: ProposedArchitecture;
  nodes: Node[];
  edges: Edge[];
  criteria: EnrichedGraphWithCriteria["criteria"];
  shape: GraphShapeAnalysis;
  model: string;
  stagesCompleted: string[];
}

export async function generatePlanFromIdea(
  fixture: SampleIdeaFixture,
): Promise<GeneratedPlan> {
  const projectId = fixture.id;
  const stagesCompleted: string[] = [];

  // ---------------------------------------------------------------------------
  // Stage 1: Requirements Extraction
  // ---------------------------------------------------------------------------
  const extractGenerator: ExtractJsonGenerator = async () => ({
    data: fixture.extractMock,
    model: "gemini-2.5-flash-test",
  });

  const extractOutput: ExtractedRequirements = await extractRequirements(
    { idea: fixture.idea, project_id: projectId },
    { project_id: projectId, generator: extractGenerator },
  );
  stagesCompleted.push("requirements");

  // ---------------------------------------------------------------------------
  // Stage 2: Architecture Proposal
  // ---------------------------------------------------------------------------
  const archGenerator: ArchitectureJsonGenerator = async () => ({
    data: fixture.architectureMock,
    model: "gemini-2.5-flash-test",
  });

  const archOutput: ProposedArchitecture = await proposeArchitecture(
    {
      requirements: extractOutput.requirements,
      assumptions: extractOutput.assumptions,
    },
    { generator: archGenerator },
  );
  stagesCompleted.push("architecture");

  // ---------------------------------------------------------------------------
  // Stage 3: Graph Decomposition
  // ---------------------------------------------------------------------------
  const decomposeGenerator: DecomposeJsonGenerator = async () => ({
    data: fixture.decomposeMock as unknown as DecomposeOutput,
    model: "gemini-2.5-flash-test",
  });

  const decompOutput: DecomposedGraph = await decomposeToNodes(
    extractOutput.requirements,
    archOutput,
    { project_id: projectId, generator: decomposeGenerator },
  );
  stagesCompleted.push("decomposition");

  // ---------------------------------------------------------------------------
  // Stage 4: Criteria & Test Specs Generation
  // ---------------------------------------------------------------------------
  const criteriaGenerator: CriteriaBatchJsonGenerator = async () => ({
    data: fixture.criteriaMock,
    model: "gemini-2.5-flash-test",
  });

  const criteriaOutput: EnrichedGraphWithCriteria =
    await generateCriteriaAndTests(
      {
        nodes: decompOutput.nodes,
        edges: decompOutput.edges,
        requirements: extractOutput.requirements,
      },
      { generator: criteriaGenerator },
    );
  stagesCompleted.push("criteria");

  return {
    projectId,
    name: fixture.name,
    idea: fixture.idea,
    requirements: criteriaOutput.requirements ?? extractOutput.requirements,
    architecture: archOutput,
    nodes: criteriaOutput.nodes,
    edges: criteriaOutput.edges,
    criteria: criteriaOutput.criteria,
    shape: decompOutput.shape,
    model: "gemini-2.5-flash-test",
    stagesCompleted,
  };
}
