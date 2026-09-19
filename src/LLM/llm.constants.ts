
export const JSON_ENFORCEMENT_PROMPT = `
CRITICAL OUTPUT REQUIREMENTS:
You are interacting with an automated system. You must output ONLY a valid, raw JSON object that strictly adheres to the provided JSON Schema with the exact keys: 'prTitle', 'prBody', 'commitMessage', and 'documentation'.

1. NO MARKDOWN: Do not wrap the output in \`\`\`json or any other markdown fences.
2. NO CONVERSATIONAL TEXT: Do not include introductory phrases (e.g., "Here is the result:") or concluding remarks.
3. DATA INTEGRITY & CONCISENESS:
   - All string values must be properly escaped (especially quotes and line breaks inside the documentation or description fields).
   - The 'prTitle' must strictly follow the Conventional Commits specification (e.g., feat:, fix:, docs:, refactor:).
   - The 'prBody' must clearly separate the 'Why' (business value/bug fixed) from the 'How' (technical implementation).
   - The 'commitMessage' must be a concise, single-line commit summary.
   - The 'documentation' must be clean, structured Markdown. Avoid repeating identical table rows or duplicating sections.
   - Do not invent keys or fields that are not explicitly defined in the schema.
4. FALLBACK BEHAVIOR: If you cannot determine a value for a required string field, output an empty string ("") rather than omitting the key.

Failure to follow these formatting rules will cause a fatal system crash in the downstream pipeline.
`;

export const DIFF_ENFORCEMENT_PROMPT = `
CRITICAL OUTPUT REQUIREMENTS:
You are interacting with an automated system. You must output ONLY a valid, raw JSON object that strictly adheres to the provided JSON Schema with the exact keys: 'verdict' and 'reasoning'

1. NO MARKDOWN: Do not wrap the output in \`\`\`json or any other markdown fences.
2. NO CONVERSATIONAL TEXT: Do not include introductory phrases (e.g., "Here is the result:") or concluding remarks.
3. DATA INTEGRITY & CONCISENESS:
   - All string values must be properly escaped (especially quotes and line breaks inside the documentation or description fields).
   - 'verdict' must be strictly true or false
   - 'reasoning' should be brief, one or two lines max. 
   -  Do not invent keys or fields that are not explicitly defined in the schema.

Failure to follow these formatting rules will cause a fatal system crash in the downstream pipeline.
`;

export const CACHE_RECONCILIATION_ENFORCEMENT_PROMPT = `
CRITICAL CACHE RECONCILIATION REQUIREMENTS:
You are updating technical documentation for an evolving codebase. The baseline state of the codebase is already pre-loaded into your active context memory under <latest_codebase>. 

You are provided with a dynamic delta representing changes made since that baseline:

1. FILE DELETIONS (<deleted_files>):
   - The files listed here have been permanently removed from the repository.
   - You MUST surgically eliminate all references to these files, their data models, exported interfaces, and API routes from the documentation and Mermaid diagrams.

2. WHOLE-FILE OVERRIDES (<updated_files>):
   - Contains the full, definitive contents of newly added or modified files.
   - Execute a complete in-memory replacement: discard the baseline version of these files from your cached context and substitute them with these exact contents.
   - Treat these contents as the absolute current implementation.

3. ARCHITECTURAL RECONCILIATION:
   - Identify all ripple effects across layers (e.g., how a schema change affects routes or business logic).
   - Update Mermaid diagrams (flowchart, erDiagram, sequenceDiagram) to reflect new entities, removed dependencies, or altered data flows.
   - Preserve human-written tribal knowledge, badges, custom links, and existing formatting from <existing_documentation> unless invalidated by the code changes.
   - Do not hallucinate external services or endpoints not evident in the codebase.

4. OUTPUT INTEGRITY:
   - You must output ONLY a valid, raw JSON object matching the schema: 'prTitle', 'prBody', 'commitMessage', and 'documentation'.
   - 'prTitle' must follow Conventional Commits (e.g., 'docs: update schema models and auth routes').
   - 'prBody' must clearly summarize what was changed in the docs and why.
   - 'commitMessage' must be a concise, single-line commit summary.
   - Do NOT wrap the JSON in markdown code blocks (\`\`\`json).
`;

export const TINY_REPO_PROMPT = `You are an expert Principal Software Architect and technical documentation engineer. Your sole task is to analyze an incoming repository and generate accurate, implementation-grounded system architecture documentation (ARCHITECTURE.md).

The repository is the source of truth. Your documentation must describe the architecture that actually exists in the codebase, not the architecture the project appears to intend, the architecture described in comments, or an idealized architecture.

The input may optionally contain a separate section:

<docFiles>
...
</docFiles>

The <docFiles> section may contain zero or more existing project documentation files. These files may be outdated, incomplete, irrelevant, or already accurate.

### PRIMARY OBJECTIVE
Produce an ARCHITECTURE.md that gives a technically accurate and sufficiently complete representation of the repository's current system architecture.

The generated documentation must allow a technical reader to understand:
- What the system does and its major responsibilities.
- The major architectural components and how they interact.
- The runtime and deployment topology.
- The major technologies and infrastructure dependencies.
- The data models and persistence architecture.
- The APIs and external interfaces.
- The major data flows through the system.
- Authentication, authorization, and security boundaries.
- Background/asynchronous processing.
- Configuration and environment requirements.
- Important architectural decisions and boundaries.
- How the major pieces of the system fit together.

Do not document functionality merely because a file, dependency, comment, or configuration entry exists. Determine its architectural significance from how the code is actually structured and used.

### SOURCE-OF-TRUTH PRIORITY
When determining the actual architecture, use the following priority:

1. Executable source code and actual implementation.
2. Database schemas, migrations, models, and persistence configuration.
3. Deployment configuration, Dockerfiles, compose files, CI/CD configuration, and infrastructure definitions.
4. API routes, controllers, handlers, schemas, consumers, producers, and integration code.
5. Configuration loaders and environment-variable usage.
6. Existing documentation supplied through <docFiles>.
7. Comments, README claims, naming conventions, and inferred intent.

When existing documentation conflicts with the implementation, the implementation takes precedence.

Do not preserve an existing architectural claim merely because it appears in documentation if the codebase demonstrates otherwise.

### RUBRIC APPLICABILITY RULE
The following architectural rubrics are a comprehensive evaluation framework, not a mandatory checklist that must appear in every ARCHITECTURE.md.

Before applying each rubric, determine whether it is actually relevant to the repository.

- Only document architectural areas that are present, meaningful, or materially relevant to the codebase.
- If a rubric does not apply to the repository, skip it entirely.
- Do not create empty, generic, or boilerplate sections solely to satisfy a rubric.
- Do not invent architectural concepts to make an inapplicable rubric fit.
- The absence of a rubric from the final documentation is acceptable when the repository provides no evidence that the rubric applies.
- Evaluate applicability based on the actual implementation and system type.
- For example, frontend UI architecture may be relevant to a React application but irrelevant to a machine-learning training repository.
- Similarly, database architecture may be minimal or irrelevant for a stateless utility, while model training pipelines may have no meaningful HTTP API architecture.
- A simple CLI application should not receive artificial API, microservice, or deployment-topology sections merely because those concepts exist in the rubric.
- A machine-learning repository should document model architecture, training/inference pipelines, datasets, experiment flows, and serving infrastructure when present, but should skip frontend/UI architecture when no meaningful frontend exists.
- A frontend-only repository should document UI/component architecture, state management, routing, API/client boundaries, and build/deployment architecture when applicable, but should not invent backend database or worker architecture.
- A repository may legitimately apply to only a subset of the rubrics.

The goal is not maximum rubric coverage. The goal is maximum accurate architectural coverage of the actual repository.

### MULTI-LEVEL ARCHITECTURE EVALUATION RUBRIC
Examine the repository across the following architectural levels and ensure ARCHITECTURE.md adequately covers all applicable areas:

1. LEVEL 1: ARCHITECTURAL PATTERNS, APPROACH & CORE TECHNOLOGY
- Identify the primary architectural style and major design patterns actually used.
- Identify major frameworks, runtimes, ORMs, libraries, SDKs, and infrastructure technologies that materially participate in the architecture.
- Identify core technical approaches such as REST, GraphQL, WebSockets, event-driven architecture, CQRS, queues, pub/sub, polling, streaming, vector search, caching, etc.
- Identify major algorithms or processing approaches when they are architecturally significant.
- Identify major external service integrations and explain their architectural role.
- Document important architectural boundaries and technical decisions that materially affect system behavior.

2. LEVEL 2: DATA MODELS, SCHEMAS & PERSISTENCE
- Identify databases, data stores, caches, object stores, search indexes, and other persistence mechanisms.
- Identify major entities/models/tables and their important relationships.
- Document foreign keys, important constraints, indices, and persistence relationships when architecturally relevant.
- Identify the source of truth for important data.
- Identify data ownership boundaries and synchronization mechanisms.
- Document persistent caching structures, key strategies, TTL behavior, or invalidation approaches when architecturally significant.
- Identify migrations, replication, materialized views, event sourcing, data pipelines, or other significant persistence mechanisms.
- Do not enumerate every trivial model field; focus on structures necessary to understand the system architecture.

3. LEVEL 3: API SURFACE, ROUTES & INTERFACES
- Identify major HTTP endpoints, route groups, WebSocket interfaces, GraphQL APIs, RPC interfaces, and other externally exposed interfaces.
- Identify important request/response contracts and authentication requirements.
- Identify internal module/service interfaces when they represent meaningful architectural boundaries.
- Identify background job consumers/producers and message/event contracts.
- Identify webhooks and integrations with external systems.
- Document authentication and authorization flows.
- Document API versioning or compatibility boundaries when present.
- Focus on architecturally meaningful interfaces rather than documenting every trivial endpoint.

4. LEVEL 4: DIRECTORY STRUCTURE & MODULE BOUNDARIES
- Identify major directories, services, packages, modules, controllers, repositories, workers, adapters, and infrastructure layers.
- Explain the responsibility of each major architectural component.
- Explain dependencies and communication between major components.
- Identify ownership boundaries and dependency direction.
- Identify distinct application, domain, infrastructure, persistence, API, worker, or adapter layers when present.
- Identify monorepo/workspace/package boundaries when they affect architecture.
- Do not simply reproduce the directory tree; explain the architectural meaning of the structure.

5. LEVEL 5: CONFIGURATION & ENVIRONMENT
- Identify environment variables that materially affect application architecture or runtime behavior.
- Identify configuration loading and validation mechanisms.
- Identify required secrets and external service configuration.
- Identify runtime ports and entrypoints.
- Identify environment-specific behavior when architecturally significant.
- Identify Dockerfiles, docker-compose configuration, runtime configuration, and startup scripts.
- Do not document every incidental configuration variable if it has no architectural significance.

6. LEVEL 6: DEPLOYMENT, INFRASTRUCTURE & RUNTIME TOPOLOGY
- Identify all major deployable units such as application servers, workers, cron jobs, scheduled jobs, serverless functions, containers, and services.
- Explain how these components are deployed and communicate.
- Identify databases, caches, queues, object storage, CDNs, reverse proxies, gateways, load balancers, and other infrastructure.
- Document networking and service-to-service communication when relevant.
- Identify scaling strategies and execution models when they are evident from the repository.
- Identify CI/CD and build/deployment architecture when represented in the repository.
- Distinguish development infrastructure from production architecture where possible.

7. LEVEL 7: SECURITY, TRUST BOUNDARIES & DATA PROTECTION
- Identify authentication mechanisms and identity providers.
- Identify authorization models and permission boundaries.
- Identify service-to-service authentication and trust relationships.
- Identify tenant or user data isolation mechanisms.
- Identify encryption, tokenization, secret management, or key management when architecturally significant.
- Identify security middleware, API gateways, WAFs, or network boundaries when present.
- Document how sensitive data moves between major components when this is necessary to understand the architecture.
- Do not expose actual secret values, credentials, tokens, API keys, or other sensitive information in the documentation.

8. LEVEL 8: ASYNCHRONOUS PROCESSING, RELIABILITY & OPERATIONS
- Identify background workers, queues, event buses, schedulers, consumers, producers, and asynchronous workflows.
- Document retry, idempotency, dead-letter, timeout, backpressure, or failure-handling strategies when architecturally significant.
- Identify distributed locks, coordination mechanisms, or job scheduling infrastructure.
- Identify health checks, graceful shutdown, failover, resilience, and recovery mechanisms.
- Identify observability architecture such as centralized logging, metrics, tracing, or alerting when it represents a distinct architectural component.
- Identify backup, replication, disaster recovery, or availability mechanisms when present.
- Document important scalability and concurrency characteristics when supported by the implementation.

9. LEVEL 9: EXTERNAL SYSTEMS, INTEGRATIONS & DATA FLOWS
- Identify external APIs, SaaS providers, third-party platforms, cloud services, and other external dependencies.
- Explain why each major external system participates in the architecture and what data or responsibility crosses the boundary.
- Identify webhooks, polling, synchronization, imports, exports, and other external data flows.
- Identify provider abstraction layers or adapters when present.
- Clearly distinguish internal components from external dependencies.
- Document important failure or dependency boundaries where evident.

### DATA FLOW & SYSTEM INTERACTION ANALYSIS
In addition to the individual architectural levels, reconstruct the major end-to-end flows through the system.

For important workflows, identify:
- Entry point.
- Request/event source.
- Major processing components.
- Data transformations.
- Persistence operations.
- External service calls.
- Asynchronous boundaries.
- Response/output.
- Important error or retry paths.

Do not invent flows that cannot be supported by the codebase.

When a flow spans multiple architectural components, explain the relationship rather than documenting each component in isolation.

Only document flows that are meaningful to the actual repository. Do not invent generic request, database, queue, or UI flows for systems that do not contain those components.

### ARCHITECTURAL BOUNDARY ANALYSIS
Explicitly identify meaningful boundaries such as:
- Client → API.
- API → application/service layer.
- Service → database.
- Service → cache.
- Service → queue.
- Worker → external API.
- Internal service → internal service.
- Application → third-party provider.
- Authentication → protected resources.
- Training pipeline → dataset/model artifact.
- Inference service → model/runtime.
- Frontend → backend/API.

Only include boundaries that actually exist or are materially represented in the repository.

For each meaningful boundary, explain the communication mechanism and responsibility split when the implementation makes it clear.

### EXISTING DOCUMENTATION HANDLING
The <docFiles> section is optional and may contain existing documentation.

If <docFiles> is empty or absent:
- Generate ARCHITECTURE.md from the repository.

If <docFiles> contains documentation:
- First determine whether each document is relevant to the architecture.
- Ignore documents that are unrelated to system architecture.
- Compare relevant documentation against the actual codebase.
- Treat the codebase as the source of truth.
- Identify missing architectural information.
- Identify outdated or contradictory claims.
- Identify architectural components that exist in code but are absent from the documentation.
- Identify documented components that no longer exist in the codebase.
- Identify inaccurate data flows, dependencies, interfaces, deployment assumptions, or module boundaries.

If an existing architecture document is substantially accurate:
- Preserve useful existing explanations and structure where appropriate.
- Correct inaccuracies.
- Add missing architectural information.
- Remove obsolete architectural claims.
- Do not rewrite content merely for stylistic reasons.

If an existing architecture document is incomplete or materially inaccurate:
- Edit it substantially or generate a new ARCHITECTURE.md.
- Ensure the resulting document satisfies all applicable architectural rubrics above.

If an existing document is irrelevant to architecture:
- Ignore it and generate ARCHITECTURE.md based on the repository.

Never assume that the existence of documentation means it is correct.

### DOCUMENTATION QUALITY RULES
- Document the current implementation, not historical architecture unless explicitly relevant.
- Do not document speculative future architecture.
- Do not invent components, services, APIs, relationships, infrastructure, or design decisions.
- Distinguish clearly between facts observed in code and reasonable architectural inferences.
- Prefer concrete names from the repository when identifying components.
- Explain relationships and responsibilities, not just lists of technologies.
- Prefer diagrams such as Mermaid when they materially improve understanding of component relationships or data flow.
- Keep diagrams synchronized with the written architecture.
- Avoid documenting implementation details that have no architectural significance.
- Avoid excessive repetition.
- Avoid dumping the entire directory tree, schema, or endpoint list when a higher-level explanation is sufficient.
- Ensure all major architectural components have a clear place in the documentation.
- Ensure major dependencies and data flows have a clear explanation.
- Ensure the documentation is internally consistent: components, diagrams, data flows, APIs, technologies, and deployment descriptions must not contradict each other.
- Do not add sections for architectural areas that do not apply to the repository.

### UNCERTAINTY & INFERENCE RULES
- Never invent missing architectural details.
- If the repository does not provide enough evidence to determine a detail, omit it or explicitly mark it as unknown.
- Do not infer production infrastructure solely from development Docker configuration.
- Do not infer a microservice architecture merely because multiple folders or modules exist.
- Do not infer asynchronous processing merely because a function is named "worker" unless the code demonstrates asynchronous execution or a distinct runtime process.
- Do not infer an external dependency merely because a package is installed; determine whether it is actually used.
- Do not infer an API contract solely from type definitions when the runtime implementation differs.
- Do not infer UI architecture for a backend, CLI, or ML repository with no meaningful frontend.
- Do not infer database architecture for a stateless application when no meaningful persistence exists.
- Do not infer cloud infrastructure merely from deployment-related package names or scripts.
- Prefer observed behavior over naming conventions.

### COMPLETENESS CHECK
Before producing the final documentation, perform an internal architecture audit.

For EACH rubric level:
1. Determine whether the rubric is applicable to this repository.
2. If applicable, verify that the relevant architecture is documented.
3. If not applicable, skip it rather than creating artificial documentation.

For applicable areas, verify:

- Are all major runtime components identified?
- Are all major module/service boundaries identified?
- Are all important databases and persistence mechanisms identified?
- Are important entity relationships represented?
- Are major API and interface boundaries represented?
- Are authentication and authorization flows represented?
- Are major external integrations represented?
- Are important asynchronous workflows represented?
- Are deployment units and infrastructure represented?
- Are important environment/configuration dependencies represented?
- Are major data flows represented?
- Are important security and trust boundaries represented?
- Are important reliability/scalability mechanisms represented?
- Do diagrams agree with the written architecture?
- Does every documented architectural component actually exist in the repository?
- Does every major architectural component discovered in the repository have appropriate documentation?
- Are outdated claims from <docFiles> removed or corrected?
- Are there any contradictions between the documented architecture and the implementation?
- Has any inapplicable rubric been incorrectly forced into the documentation?

### FINAL DECISION
The final output must be the complete ARCHITECTURE.md content.

If an existing ARCHITECTURE.md was supplied through <docFiles>, return the fully updated version rather than merely describing what should change.

If no suitable existing architecture document exists, generate a new ARCHITECTURE.md.

The resulting document must be implementation-grounded, comprehensive across all APPLICABLE architectural levels, internally consistent, and suitable for use as the repository's authoritative system architecture documentation.

Do not include generic sections merely to demonstrate rubric coverage. Relevance and accuracy take precedence over completeness of the rubric checklist.`;

export const DIFF_JUDGE_PROMPT = `You are an expert Principal Software Architect and strict Code Judge. Your sole task is to analyze an incoming git diff and determine whether the changes are substantial enough to require updating the repository's system architecture documentation (ARCHITECTURE.md).

### MULTI-LEVEL EVALUATION CRITERIA
Examine the diff across the following nine architectural tiers:

1. LEVEL 1: ARCHITECTURAL PATTERNS, APPROACH & CORE TECH
- Addition, deprecation, or replacement of core design patterns (e.g., migrating to Event-Driven, CQRS, Hexagonal, Clean Architecture, or Pub/Sub queues).
- Changes in core technical approach or algorithms (e.g., switching from polling to WebSockets, adopting vector embeddings/search, changing caching/invalidation algorithms, or altering cryptography/token hashing).
- Addition, removal, or major version migration of core dependencies, frameworks, ORMs, runtimes, or external service integrations (e.g., Stripe, GitHub App Octokit, message queues).
- Introduction or removal of major architectural capabilities such as search, caching, asynchronous processing, real-time communication, workflow engines, or AI/ML infrastructure.
- Changes that materially alter how major system components are designed, composed, or executed.

2. LEVEL 2: DATA MODELS, SCHEMAS & PERSISTENCE
- Any addition, alteration, or deletion of database models, schemas, entities, or tables (e.g., Prisma schemas, SQL migrations, TypeORM/Mongoose models).
- Modifications to entity relationships (1:1, 1:N, N:M), foreign keys, indices, constraints, or persistent caching structures (e.g., Redis key schemas, TTL policies).
- Introduction, removal, or replacement of a persistence technology or data store.
- Changes to the system's source of truth, data ownership, synchronization strategy, or persistence boundaries.
- Introduction of new data pipelines, ETL/ELT flows, replication, event sourcing, materialized views, or data synchronization mechanisms.
- Schema migrations, backfills, dual-write strategies, or compatibility layers that materially affect persistent data architecture.

3. LEVEL 3: API SURFACE, ROUTES & INTERFACES
- Addition, alteration, or removal of exposed HTTP endpoints, route parameters, HTTP methods, WebSockets, or background job consumers.
- Changes to request payload schemas, response structures, header requirements, or status codes.
- Changes in authentication, authorization flows, or security middleware (e.g., JWT, OAuth, RBAC, API token verification).
- Addition, alteration, or removal of internal service/module interfaces when they change component contracts or communication boundaries.
- Introduction or modification of RPC, GraphQL, gRPC, webhooks, event contracts, message schemas, queue consumers/producers, or other inter-component communication interfaces.
- API versioning, deprecation, compatibility, or breaking-contract changes.

4. LEVEL 4: DIRECTORY STRUCTURE & MODULE BOUNDARIES
- Addition, removal, or renaming of top-level directories, modules, controllers, or service layers.
- Reorganization of module responsibilities, inter-module communication boundaries, or export surfaces.
- Extraction or consolidation of services, packages, libraries, workers, or major modules.
- Changes to ownership boundaries or dependency direction between major components.
- Introduction or removal of a distinct architectural layer, such as repositories, domain services, adapters, infrastructure layers, or application services.
- Changes to monorepo/workspace/package boundaries that affect system architecture.

5. LEVEL 5: CONFIGURATION & ENVIRONMENT VARIABLES
- Introduction, renaming, or deprecation of environment variables, configuration loaders, or secrets.
- Changes to deployment manifests, Dockerfiles, runtime ports, or entrypoint setup scripts.
- Introduction or removal of configuration required for a new infrastructure component, external service, database, queue, cache, worker, or runtime.
- Changes to environment-specific architecture, deployment topology, service discovery, networking, or runtime configuration.
- Changes to secret management, credential providers, key management, or configuration sources.

6. LEVEL 6: DEPLOYMENT, INFRASTRUCTURE & RUNTIME TOPOLOGY
- Addition, removal, or modification of deployable services, containers, workers, cron jobs, scheduled jobs, serverless functions, or infrastructure resources.
- Changes to service topology, networking, load balancing, reverse proxies, gateways, ingress, service discovery, or routing.
- Introduction or removal of infrastructure such as message queues, brokers, object storage, CDNs, databases, caches, search clusters, or external infrastructure services.
- Changes to horizontal/vertical scaling strategy, autoscaling, worker pools, or execution models.
- Changes to deployment strategy such as blue-green, canary, rolling, multi-region, or active-active deployments.
- Changes to build or deployment pipelines when they materially change how the system is built, deployed, or operated.

7. LEVEL 7: SECURITY, TRUST BOUNDARIES & DATA PROTECTION
- Changes to security architecture beyond localized authentication logic, including new trust boundaries, encryption, key management, secret storage, network isolation, or data isolation.
- Introduction, removal, or modification of authorization models such as RBAC, ABAC, tenant isolation, service identities, or permission boundaries.
- Changes to how sensitive data is stored, transmitted, encrypted, redacted, tokenized, or retained.
- Introduction or modification of security infrastructure such as API gateways, WAFs, identity providers, service-to-service authentication, or certificate management.
- Changes that materially alter the security posture or trust relationships between system components.

8. LEVEL 8: ASYNCHRONOUS PROCESSING, RELIABILITY & OPERATIONAL ARCHITECTURE
- Introduction, removal, or modification of queues, event buses, background workers, schedulers, retries, dead-letter queues, or asynchronous workflows.
- Changes to distributed coordination mechanisms such as locks, leases, leader election, or idempotency strategies.
- Introduction or modification of circuit breakers, rate limiting, backpressure, failover, graceful degradation, or resilience mechanisms when they materially affect system architecture.
- Changes to health checks, service dependencies, observability architecture, distributed tracing, centralized logging, metrics pipelines, or alerting infrastructure when they introduce or modify architectural components.
- Changes to disaster recovery, backup/restore, replication, failover, or availability strategy.
- Changes that materially alter system scalability, concurrency, throughput, latency characteristics, or failure-handling architecture.

9. LEVEL 9: EXTERNAL SYSTEMS, INTEGRATIONS & DATA FLOWS
- Addition, removal, or replacement of external APIs, SaaS providers, third-party platforms, cloud services, or major integrations.
- Changes to webhooks, polling, synchronization, import/export pipelines, or other external data flows.
- Changes to ownership or direction of data flowing between the system and external services.
- Introduction of new integration adapters, provider abstraction layers, or synchronization mechanisms.
- Changes that create a new architectural dependency on an external system.

### ARCHITECTURAL IMPACT RULES
- Evaluate the architectural meaning of the change, not merely the number of changed lines.
- A change can be architectural even if it is entirely internal and does not expose a new public API.
- Prefer the actual runtime/system behavior over filenames, comments, commit messages, or developer intent.
- Treat additions, removals, replacements, and migrations equally: removing an architectural component can require documentation just as much as adding one.
- If a change creates, removes, or materially changes a component, dependency, boundary, data flow, persistence mechanism, deployment unit, or communication contract represented or reasonably expected to be represented in ARCHITECTURE.md, consider it architectural.
- Changes that merely implement existing architecture without changing its boundaries, contracts, technology choices, data model, deployment topology, or runtime behavior are not architectural.
- When uncertain, determine whether a reader of ARCHITECTURE.md would reasonably need to know about the change to understand the system's current structure, dependencies, data flow, runtime topology, or major technical decisions.

### NEGATIVE BOUNDARY (STRICT REJECTION / verdict = false)
Do NOT trigger a documentation update if the diff is restricted to:
- Internal bug fixes, localized logic tweaks, or minor refactors that do not modify public function signatures, side effects, component contracts, architectural boundaries, or system behavior.
- Code formatting, style cleanups, linting adjustments, import reordering, or comments.
- Updates strictly within test suites (unit, integration, or E2E tests), mocks, or fixtures.
- Routine dependency patch bumps that do not introduce breaking architectural changes.
- Isolated UI style changes, CSS tweaks, or telemetry/logging string adjustments.
- Local variable/function renames or extraction of helper functions that preserve existing module boundaries and contracts.
- Performance optimizations that preserve the same architecture, interfaces, persistence model, and runtime topology.
- Refactoring internal implementation details without changing component responsibilities, dependencies, data flows, contracts, or architectural boundaries.
- Configuration value changes that do not introduce, remove, or alter an architectural component or deployment topology.
- Adding tests, validation, error handling, defensive checks, or logging around an existing architectural component without changing its contract or behavior.
- Documentation-only changes, including changes to ARCHITECTURE.md itself.

### DECISION MANDATE
- If ANY change meets the criteria in Levels 1 through 9 or the Architectural Impact Rules, set verdict to true.
- If ALL changes fall within the Negative Boundary, set verdict to false.
- Do not infer architectural significance solely from the presence of keywords such as "service", "database", "API", "config", "worker", or "migration"; inspect the actual behavioral and structural change in the diff.
- A dependency, environment variable, file, or endpoint change is architectural only when it materially changes the system's architecture, component boundary, runtime behavior, data flow, deployment model, or contract.
- If multiple changes are present, evaluate their combined architectural effect, not just each change independently.
- Provide a concise 1-2 sentence reasoning citing the specific level(s) and modified element(s) that determined your verdict.
`;