# Component audit repairs

Prepared locally on `codex/podio-component-audit-fixes`. No component publication or customer API calls performed.

Changes: Clone Item uses POST; Create Item excludes item identity from its field map; fourteen action handlers now await helper output delivery, including revision comparison; hook lookup has its own input schema; revision comparison rejects missing/invalid IDs before requests and accepts revision zero; field-value lookup accepts and encodes external field IDs; comment revision description matches the returned list. Lookup-before-create rejects malformed item responses and no longer promises concurrency-safe idempotency. Its action key remains compatible with existing flows.

Validation: 76 unit tests pass, including ten new action tests with stubbed network methods. Tests cover delayed/rejected output, POST cloning, revision zero and invalid inputs, no POST after existing/malformed/forbidden lookups, uncertain create responses, item identity payload separation, external field ID encoding and input schemas. These are isolated checks, not live Podio certification.

Remaining: duplicate prevention across workers needs durable coordination and uncertain-write reconciliation. GitLab destination is not configured: the checkout has GitHub origin and a direct iPaaS remote. Neither is used for publication under the required GitLab deployment rule.

API evidence:
- [Clone item](https://developers.podio.com/doc/items/clone-item-37722742)
- [Unsaved clone values](https://developers.podio.com/doc/items/get-item-clone-96822231)
- [Required revision comparison parameters](https://developers.podio.com/doc/items/get-item-revision-difference-22374)
- [Caller-owned external-ID uniqueness](https://developers.podio.com/doc/items/get-item-by-external-id-19556702)
