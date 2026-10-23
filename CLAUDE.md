## 1. How to work with me

- **I write the implementation myself.** Your role is a mentor and reviewer:
  - Explain the concept or the Rust feature I need before I write it.
  - Break each milestone (section 9) into small tasks with a clear
    "done when" criterion, and give me one task at a time.
  - Review what I wrote: correctness first, then idiomatic Rust, then
    performance. Point to the exact lines.
  - Answer questions with short examples, not with the full solution.
- **What you may write without asking:** test cases, test fixtures, CI
  configuration, `Cargo.toml` boilerplate, build scripts, and explanations.
- **What you must ask before writing:** any implementation code in the library
  crates. If I say "show me", give the smallest snippet that unblocks me.
- When I am stuck for a while, offer a hint first, then a partial solution, then
  the full one, in that order.
- Always run `cargo fmt`, `cargo clippy --all-targets -- -D warnings` and
  `cargo test` before saying a task is done, and show me the output.
- Never change the behaviour described in sections 3 and 4 without telling me.
  On valid models the algorithm results must equal those of the TypeScript
  version (section 8). The file formats and the API are this library's own
  design (sections 3 and 6): the web app is not deployed yet and will be
  adapted to this library, not the other way round.

---

## 2. Repository layout

A Cargo workspace with one pure library and thin wrappers around it:

```
mdp-explainer/
├── Cargo.toml                (workspace)
├── crates/
│   ├── core/                 package `mdp-explainer`: builder, index graph, policies,
│   │                         algorithms, file formats
│   ├── cli/                  package `mdp-explainer-cli`, binary `mdp-cli` (clap)
│   ├── wasm/                 package `mdp-explainer-wasm` (wasm-bindgen), npm package
│   └── python/               package `mdp-explainer-python` (PyO3 + maturin), pip package
├── fixtures/                 test data (section 8)
└── .github/workflows/        CI
```

Modules of the core:

```
crates/core/src/
├── lib.rs              mod declarations and pub use re-exports only
├── error.rs            ModelError, FileError, PolicyError, Warning
├── builder.rs          MdpBuilder and its input types State, Action, Transition
├── mdp.rs              StateIdx, ActionIdx, Outcome, Mdp
├── policy.rs           StochasticPolicy, DeterministicPolicy, Policy
├── json.rs             MdpFile, PolicyFile (section 3.3), private serde structs
├── algorithms.rs       pub mod declarations
└── algorithms/         value_iteration.rs, reachability.rs, ...
```

Rules:

- The core has **no I/O, no threads, no global state (this includes the clock),
  no printing**. It takes data and returns data. Parsing and producing JSON
  *strings* is allowed; reading and writing *files* belongs to the CLI, the
  Python package or the web app.
- The wrappers only convert types and errors; no algorithm or validation code
  there.
- Solver backends that use native C/C++ libraries (HiGHS, Z3) are **optional
  Cargo features**. The default build must be pure Rust so it compiles to
  `wasm32-unknown-unknown` (see section 5).

---

## 3. Data model

The MDP and the policies are **separate objects**, in memory and on disk. A
policy refers to an MDP through action and state ids.

### 3.1 Building an MDP (`builder.rs`)

Input types (plain Rust, no serde; the file structs live privately in
`json.rs`):

```text
State      { id: String, label: String, is_target_effect: bool, is_candidate_cause: bool }
Action     { id: String, label: String, source_state_id: String }
Transition { id: String, action_id: String, target_state_id: String,
             probability: f64, reward: f64 }              // reward defaults to 0
```

Constructors and chainable setters, e.g. `State::new("s0", "s").effect()`,
`Transition::new("t0", "a0", "s1", 0.5).reward(2.0)`.

`MdpBuilder`: `new()`, `add_state`, `add_action`, `add_transition` (each only
stores its argument and returns `&mut Self`; elements may be added in any
order), `set_initial(state_id)`, and `build() -> Result<Mdp, ModelError>`.

- Ids are arbitrary strings (random like `s-k3f9x2a` when created in the web
  app, hand-written like `s0` in example files). Labels are display names
  (LaTeX, may repeat: three states can all be labelled `s`). Algorithms only
  use ids and indices.
- Effect states (`is_target_effect`) may have actions; reachability ignores
  them (their value is fixed to 1), value iteration does not (see 4.2).
- Initial state: the one given with `set_initial` / `initialStateId`;
  otherwise the first state. `Mdp` remembers whether it was given explicitly
  (the MiniZinc export needs it, 4.6).

### 3.2 The index graph (`mdp.rs`)

`Mdp` is immutable and valid by construction: private fields, no `&mut`
methods, created only by `MdpBuilder::build` (and therefore by
`MdpFile::from_json`).

- **CSR layout**: `action_start` (len = states + 1) and `outcome_start`
  (len = actions + 1) index into one `Vec` of actions grouped by source state
  and one `Vec<Outcome { target, probability, reward }>` grouped by action. The
  hot loops read only these arrays.
- Labels, flags, ids and the explicit initial state are stored in separate
  `Vec`s next to the CSR arrays (needed to write files and map results back to
  ids), never inside `Outcome`.
- `StateIdx` / `ActionIdx` are newtypes with private fields, so indices can
  only come from an `Mdp`. Accessors: `num_states`, `num_actions`, `states()`,
  `actions(s)`, `outcomes(a)`, `source(a)`, `is_effect(s)`, `initial_state()`,
  `state_id`, `action_id`, `state_by_id`, `action_by_id`, labels, `warnings()`.

**Order.** States keep the order in which they were added; the actions of a
state and the transitions of an action keep their relative order (a stable
grouping). Several results depend on it: "the first optimal action", the order
in which explanations are found, and bit-exact floating-point sums. The nested
file format (3.3) stores exactly this order.

**Checks in `build()`.** The first problem found is returned, checking states,
then actions, then transitions (each in order), then the initial state. Exact
messages:

| Problem | Message |
|---|---|
| duplicate state id | `Invalid model: duplicate state id "{id}".` |
| duplicate action id | `Invalid model: duplicate action id "{id}".` |
| unknown source state | `Invalid model: action "{action}" has unknown source state "{state}".` |
| duplicate transition id | `Invalid model: duplicate transition id "{id}".` |
| unknown action | `Invalid model: transition "{transition}" has unknown action "{action}".` |
| unknown target state | `Invalid model: transition "{transition}" has unknown target state "{state}".` |
| probability not finite or outside `[0, 1]` | `Invalid model: transition "{transition}" has invalid probability {p}.` |
| reward not finite (negative rewards are fine) | `Invalid model: transition "{transition}" has invalid reward {r}.` |
| unknown initial state | `Invalid model: unknown initial state "{state}".` |

**Warnings** (`mdp.warnings() -> Vec<Warning>`, not errors: the algorithms are
well defined and half-edited models must be savable):

- an action whose transition probabilities do not sum to 1 within `1e-9`
  (including an action without transitions):
  `Action "{action}": transition probabilities sum to {sum}, not 1.`

### 3.3 Policies (`policy.rs`)

- `StochasticPolicy`: one weight `pi(a | source(a))` per action, indexed by
  `ActionIdx`. Constructors: `zeros(&mdp)`, `uniform(&mdp)` (4.1),
  `set(&mut self, &mdp, action_id, weight) -> Result<(), PolicyError>`.
  Weights are **not** normalised: use the numbers as given. A missing weight is 0.
- `DeterministicPolicy`: one `Option<ActionIdx>` per state (the result of
  4.2 and 4.3). `to_stochastic(&mdp)` gives weight 1 to each chosen action.
- `Policy` = `Stochastic(StochasticPolicy) | Deterministic(DeterministicPolicy)`.
- Checks (`PolicyError`), exact messages:
  - `Invalid policy: unknown action "{action}".`
  - `Invalid policy: unknown state "{state}".`
  - `Invalid policy: action "{action}" does not belong to state "{state}".`
  - `Invalid policy: action "{action}" has invalid weight {w}.` (not finite or
    outside `[0, 1]`)
- Warnings (`policy.warnings(&mdp)`): a state with actions whose weights do not
  sum to 1 within `1e-9`: `State "{state}": policy weights sum to {sum}, not 1.`

### 3.4 File formats (`json.rs`)

Two files, each with its own `format` string and integer `version`. The core
converts between strings and values; it never touches the file system and
never reads the clock (`updatedAt` is set by the caller).

**MDP file `*.mdp.json`, version 1:**

```text
{ format: "mdp-explainer/mdp", version: 1,
  metadata: { title: string, description?: string, updatedAt?: string },
  initialStateId?: string,
  states: [ { id, label, isTargetEffect?: bool, isCandidateCause?: bool,
              actions?: [ { id, label,
                            transitions?: [ { id, targetStateId, probability, reward? } ] } ] } ],
  layout?: object }
```

- Nesting removes two kinds of invalid model (unknown source, unknown action):
  an action's source is its enclosing state.
- `layout` belongs to the web app (viewport, node positions and sizes,
  transition waypoints, keyed by id). The core keeps it as opaque
  `serde_json::Value` and writes it back unchanged.
- Every object except `layout` uses `deny_unknown_fields`, so a typo such as
  `"rewrad"` is an error instead of a silent 0.
- `MdpFile { metadata, mdp: Mdp, layout: Option<Value> }`:
  `MdpFile::from_json(&str) -> Result<MdpFile, FileError>` and
  `to_json(&self) -> String`.

**Policy file `*.policy.json`, version 1:**

```text
{ format: "mdp-explainer/policy", version: 1,
  metadata: { title: string, description?: string, updatedAt?: string },
  policy: { kind: "stochastic",    weights: { [actionId]: number } }
        | { kind: "deterministic", choices: { [stateId]: actionId } } }
```

- `PolicyFile { metadata, policy }` holds the policy by ids;
  `PolicyFile::from_json(&str)`, `resolve(&self, &mdp) -> Result<Policy, PolicyError>`,
  `PolicyFile::new(metadata, &mdp, &policy)`, `to_json(&self)`.
- A missing weight is 0; a state missing from `choices` has no action.

**Reading, in this order, with these messages** (`{File}` is `MDP` or
`policy`, `{fmt}` is the expected format string):

1. not valid JSON: `Invalid {File} file: {serde_json message}` (it contains the
   line and column);
2. not an object: `Invalid {File} file: expected a JSON object.`
3. `format` missing or different: `Invalid {File} file: "format" must be "{fmt}".`
4. `version` not a positive integer: `Invalid {File} file: "version" must be a positive integer.`;
   larger than supported: `Unsupported {File} file version {v}: this library reads version 1.`
5. wrong shape (missing field, wrong type, unknown field, duplicate key in
   `weights` / `choices`): `Invalid {File} file at {path}: {message}`, where
   `{path}` is like `states[2].actions[0].transitions[1]` (use the
   `serde_path_to_error` crate);
6. MDP file: the `build()` checks of 3.2 (`ModelError`). Policy file: the 3.3
   checks happen in `resolve`.

**Writing:** pretty-printed with 2 spaces; keys in the order shown above;
states, actions and transitions in `Mdp` order; `false` flags, `reward` equal
to 0, empty `actions` / `transitions` lists and a non-explicit initial state are
omitted. Stochastic policies list every action in `Mdp` order; deterministic
policies list the states that have a choice, in state order. Round trip:
`from_json(to_json(x))` equals `x`, and `to_json` of that is byte-identical.

### 3.5 Deliberate differences from the TypeScript app (keep this list up to date)

- New file formats (3.4) with the MDP and its policies in separate files. The
  old `"1.0"` format is not read by the library; `fixtures/convert_legacy.py`
  converts old files.
- `initialStateId` replaces the `isInitial` flags (same meaning: the TS code
  used the first flagged state, or the first state).
- Invalid models and policies are errors (3.2, 3.3); the TypeScript code
  produced `NaN`, ignored transitions of unknown actions, or merged duplicate
  ids.
- Non-normalised probabilities and weights produce warnings.
- The two MiniZinc bugs of 4.6 are fixed.
- No `console.log` equivalents.

---

## 4. Algorithms (exact behaviour)

Read the matching TypeScript file for every item. Defaults, tie-breaking and
convergence counting must be the same. All algorithms take an `&Mdp` and work
on indices; policies are separate arguments; results are indexed by
`StateIdx` / `ActionIdx` and mapped back to ids at the boundary. "In order"
means `Mdp` order (3.2).

### 4.1 Uniform policy (`uniformPolicy.ts`)

`StochasticPolicy::uniform(&mdp)`: each action gets
`1 / (number of actions of its source state)`.

### 4.2 Discounted value iteration (`valueIteration.ts`)

Defaults: `discount_factor = 0.9`, `max_iterations = 1000`, `tolerance = 1e-6`.
Expected value of an action: `sum_t p * (reward + gamma * V[t])`.

- `compute_optimal_policy(mdp, options)`: all states start at 0 (effect states
  are **not** special here). Each round (Jacobi: uses only the previous round) a
  state takes the maximum over its actions; a state without actions gets 0.
  Stop when the largest change is `< tolerance`; `iterations` counts the rounds
  done (including the last one), `converged` says whether it stopped by
  tolerance. The policy (`DeterministicPolicy`) is, per state, the first action
  with the strictly largest value (`>`) computed from the final values, or none
  without actions.
- `evaluate_policy_values(mdp, policy: &StochasticPolicy, options)`: same loop,
  value = `sum_a policy(a) * expected(a)`.

### 4.3 Reachability by value iteration (`reachability.ts`)

`compute_reachability_probabilities(mdp, policy: &StochasticPolicy, mode, options)`
with `mode in {max, min, policy}`, options `max_iterations = 1000`,
`tolerance = 1e-9`, `policy_states: set of StateIdx`.

- Effect states are fixed at 1, the others start at 0.
- Each round (Jacobi), for every non-effect state: no actions -> 0; otherwise
  the state's mode is `policy` if it is in `policy_states`, else `mode`;
  `max`/`min` take the max/min of the actions' expected probabilities
  `sum_t p * x[t]` (start from -inf / +inf), `policy` takes
  `sum_a policy(a) * expected(a)` (start from 0).
- Same stopping rule and counters as 4.2.
- Returns `{probabilities, iterations, converged}`.

`compute_reachability_policy(mdp, policy, max|min, options)` returns the
probabilities and a `DeterministicPolicy`:

1. Run the above.
2. Optimal actions of each non-effect state: those with
   `|expected - x[s]| <= 1e-6`, in order.
3. `min`: the first optimal action (or none).
4. `max` (important, an earlier simple version was wrong): start with
   `reached = effect states`; repeat until nothing changes: for each non-effect
   state not yet reached (in order), take its first optimal action that
   moves with probability > 0 into a reached state; if there is one, choose it
   and mark the state reached (this is visible to later states in the same
   sweep). States never reached get their first optimal action (or none).
5. Effect states get none.

`evaluate_policy_reachability(mdp, policy, options)` = mode `policy` for every
state.

### 4.4 Reachability by linear programming (`reachabilityLP.ts`)

Same signature and results as 4.3 (`iterations = 0`, `converged = true`). The
file has a long comment with the formulation and a worked example; summary:

- One variable per non-effect state, bounds `[0, 1]`; effect states are the
  constant 1.
- Choices of a state: one distribution per action, or, for a state that follows
  the policy, the single mixture `sum_a policy(a) * P(s, a, .)`. States without
  actions have no choices.
- `max` and `policy`: minimise `sum x` subject to `x_s >= sum_t d(t) x_t` for every
  choice `d`.
- `min`: first compute `S0` (graph search: a state is *forced* if it has choices
  and every choice moves with probability > 0 into a forced state; effect
  states are forced; repeat until stable; non-effect states not forced are
  `S0`), fix them to 0, then maximise `sum x` subject to `x_s <= sum_t d(t) x_t`.
- Clamp results to `[0, 1]`. If the solver does not report "optimal", return an
  error `Linear program for {mode} reachability failed: {status}`.

On randomly generated models the LP and value iteration agree to about `1e-10`.

### 4.5 Explanations (`explain.ts`)

Terminology: `non_effect` = states that are not effect states, in order. A
*candidate* is a set of states that follow the policy; the others are free
(minimised/maximised over).

- **Initial state**: `mdp.initial_state()` (3.1).
- **p0** (computed by the caller, the web app does it): reachability in mode
  `policy` at the initial state, with the chosen method and the same policy.
- **`is_axp(mdp, policy, candidate, p0, options, solver)`** with options
  `deviation = 0.2`, `bound in {min, max, both} = min`,
  `method in {value-iteration, linear-programming}`:
  - `min` or `both`: `Pmin(candidate) >= p0 - deviation - 1e-5`
  - `max` or `both`: `Pmax(candidate) <= min(1, p0 + deviation) + 1e-5`
  - where `Pmin`/`Pmax` are reachability at the initial state with
    `policy_states = candidate`.
  - **Threshold kind**: the web app currently uses this *absolute* form; the
    paper uses the *relative* form `p0 (1 - deviation)` and
    `min(1, p0 (1 + deviation))`. Implement both behind an option
    (`threshold: absolute | relative`, default `absolute`).
- **`shrink(candidate)`**: if not an AXp return `[]`; otherwise, for each state
  of the original candidate in order, drop it if the rest is still an AXp.
- **`grow(free, non_effect)`**: `fixed = non_effect \ free`; if `fixed` is an AXp
  return `[]`; otherwise for each state `s` of `free` in order: if
  `fixed + s` is not an AXp, add `s` to `fixed`; else add `s` to the result.
  Returns a minimal CXp.
- **Hitting-set oracle (`hitman.ts`)**: over the states seen so far,
  `get()` returns a set of **minimum cardinality** that intersects every `hit`
  set and is not a superset of any `block` set, or "none" when no such set
  exists. `hit([])` makes it unsatisfiable (an empty disjunction is false).
  The returned order is the order in which the states were first mentioned.
- **`enumerate_target_cxps(mdp, policy, p0, options)`**: loop `c = get()`:
  `comp = non_effect \ c`; if `is_axp(comp)`: `a = shrink(comp)`, record AXp
  `a`, `hit(a)`; else record CXp `c`, `block(c)`. Returns `{axps, cxps}`.
- **`enumerate_target_axps(mdp, policy, p0, options)`** (dual): loop
  `c = get()`: if `is_axp(c)`: record AXp `c`, `block(c)`; else
  `x = grow(non_effect \ c, non_effect)`, record CXp `x`, `hit(x)`.
- Both enumerations must return the **same collections** (as sets of sets) for
  every option; the TypeScript code was checked on hundreds of random models.
  The order of the lists may depend on the oracle; tests compare sorted sets.

### 4.6 MiniZinc export (`minizincSerializer.ts`)

`build_minizinc_dzn(mdp, policy: &StochasticPolicy, discount_factor = 1.0) -> String`.
Reproduce the format exactly (read the source): enum `states` and `actions`,
`init_state` (only when the initial state was given explicitly, as the TS code
writes it only when a state is flagged), `effect_states`, `P` and `R` as
`array3d(states, actions, states, ...)` with one row per (state, action label),
`policy` as a 2-D array (weights summed per state and action label), `g`.

- State names come from `label + id` sanitised to identifiers and made unique;
  action names are the distinct action labels, in order of first appearance.
- Two known bugs in the TypeScript version, **fix them** and note it:
  1. two transitions of the same action to the same target overwrite each other
     instead of being added;
  2. a model without actions makes the export throw.

### 4.7 Not part of the core

- `fileSaver.ts` (browser downloads) stays in the web app.
- `mdpGraph.ts` is replaced by `Mdp` (3.2); `jsonSerializer.ts` by the new
  file formats (3.4).
- The `.mzn` models in `src/core/algorithms` are research prototypes, not part
  of the library.

### 4.8 Planned next (design the API so these fit later)

- Inflated explanations: per-state levels `lambda_s in [0, 1]` (follow the
  policy with probability `lambda_s`, otherwise adversarial), checked with the
  same LPs using rows `x_s <= sum_t (lambda_s P_pi(s,t) + (1 - lambda_s) P(s,a,t)) x_t`.
  See `Markov-Decision-Process-Explainability/Section/inflated_XPs.tex`.
- "Best" (minimum-size or maximum-coverage) explanations via the implicit
  hitting-set loop with weights.
- A version 2 of the MDP file could embed several named policies; not before
  the web app integration (milestone 12).

---

## 5. Solver backends (the WebAssembly constraint)

The web app currently uses two native libraries compiled to WebAssembly by
their authors: **HiGHS** (LP, npm `highs`) and **Z3** (hitting sets, npm
`z3-solver`, which needs threads and therefore cross-origin isolation headers;
GitHub Pages cannot send them). A Rust library compiled to
`wasm32-unknown-unknown` cannot simply link those C++ libraries.

Design:

- Define traits in the core, e.g. `LpSolver` (minimise/maximise a linear
  objective under linear inequalities and bounds, return values and a status)
  and `HittingSetOracle` (`hit`, `block`, `get`).
- **Default backends must be pure Rust** so the default build works in WASM.
  Before choosing, check the current state (maintenance, licence, WASM support)
  of candidates such as:
  - LP: `clarabel` (pure Rust interior-point solver), `microlp` / the `good_lp`
    crate with a pure-Rust backend. Native-only option behind a feature: the
    `highs` crate.
  - Hitting sets: a small exact minimum-hitting-set solver written by me
    (branch and bound or iterative deepening on the cardinality; instances
    are small: tens of states) is a good exercise and enough here; optional
    backends behind features: a pure-Rust SAT solver (`varisat`, `splr`) with a
    cardinality encoding, or the `z3` crate (native only).
- No threads in the default build: this also removes the need for COOP/COEP
  headers in the web app.
- Results must match the current ones: LP values within `1e-7` of value
  iteration; explanations identical as sets.

---

## 6. WebAssembly package (`crates/wasm`) and its contract with the web app

Build with `wasm-bindgen` + `wasm-pack build --target web` (works with Vite:
import the generated module and `await init()` once). Use `serde-wasm-bindgen`
(or `tsify` to also generate TypeScript types) to pass plain JS objects.

### 6.1 Functions (camelCase names, plain-object arguments)

Plain objects (not wasm-bindgen classes) so that arguments and results can be
sent to and from a Web Worker with `postMessage`.

- `model` = the MDP file without `format`, `version`, `metadata` and `layout`:
  `{initialStateId?, states: [...nested as in 3.4]}`.
- `policy` = the `policy` field of a policy file:
  `{kind: "stochastic", weights}` or `{kind: "deterministic", choices}`.
  Wherever a policy is an argument, a deterministic one is converted with
  `to_stochastic`.

| WASM export | Result | Replaces (TS today) |
|---|---|---|
| `validateModel(model)` | `{warnings: string[]}` or throws | — |
| `parseMdpFile(text)` | `{metadata, model, layout?, warnings}` | `importMDPFromFile` |
| `serializeMdpFile({metadata, model, layout?})` | text | `exportMDPToFile` |
| `parsePolicyFile(text, model)` | `{metadata, policy, warnings}` | — |
| `serializePolicyFile({metadata, policy}, model)` | text | — |
| `computeUniformPolicy(model)` | stochastic `policy` | `computeUniformPolicy` |
| `computeOptimalPolicy(model, {discountFactor, maxIterations, tolerance})` | `{values, policy, iterations, converged}` | same name |
| `evaluatePolicyValues(model, policy, options)` | `{values, iterations, converged}` | same name |
| `computeReachabilityPolicy(model, policy, "max" \| "min", options)` | `{probabilities, policy, iterations, converged}` | same name |
| `evaluatePolicyReachability(model, policy, options)` | `{probabilities, iterations, converged}` | same name |
| `computeReachabilityProbabilities(model, policy, mode, {method, policyStateIds, ...})` | `{probabilities, iterations, converged}` | same name + `loadReachabilitySolver` |
| `enumerateXpsTargetCXps` / `enumerateXpsTargetAXps` `(model, policy, p0, {deviation, bound, method, threshold})` | `{axps: string[][], cxps: string[][]}` | same names |
| `isAXp(model, policy, candidate, p0, options)` | boolean | same name |
| `buildMiniZincDzn(model, policy, discountFactor)` | text | same name |

- `values` and `probabilities` are objects `{stateId: number}`; computed
  policies are deterministic `policy` objects, so they can be saved directly
  with `serializePolicyFile`.
- `policyStateIds` and `candidate` are arrays of ids (JS `Set` does not cross
  the boundary).
- Errors become thrown JS `Error`s with the messages of sections 3 and 4.
- Everything is synchronous in WASM. The web app will run the enumerations in a
  **Web Worker** so the page does not freeze; design them to accept an optional
  iteration limit or a callback for progress and cancellation.

### 6.2 Build and size

- A separate profile for the WASM build (`opt-level = "z"` or `"s"`,
  `lto = true`, `codegen-units = 1`), then `wasm-opt -Oz` (wasm-pack does
  this). The CLI keeps `opt-level = 3`.
- Report the `.wasm` size in CI; today the app downloads ~3.5 MB for HiGHS and
  much more for Z3, so a single small module is a real improvement.

### 6.3 How the web app will adopt it (for later, in `mdp-explainer-web`)

1. Add the package (local `file:` dependency first, npm later).
2. Move the web app's state to the new model (nested states, `initialStateId`,
   policies as separate objects) and the new file formats (3.4); the layout
   goes into `layout`.
3. Run the parity tests (section 8) of the old TypeScript algorithms against
   the WASM functions, then remove the TypeScript algorithms, `highs` and
   `z3-solver`, the Z3 Vite plugin and the COOP/COEP headers.

---

## 7. Python package and CLI

- **Python (`crates/python`)**: PyO3 + maturin, `abi3` wheels. Functions mirror
  the WASM names in snake_case, take dicts shaped like 6.1 and return dicts. An
  `MdpBuilder` class with `add_state`, `add_action`, `add_transition`,
  `set_initial`, `build`. `load_mdp(path)` / `save_mdp(path, file)`,
  `load_policy(path, mdp)` / `save_policy(path, policy_file, mdp)`. Type stubs
  (`.pyi`) and a small pytest suite using the same fixtures.
- **CLI (`crates/cli`, binary `mdp-cli`)**, with `clap`:
  - `mdp-cli validate model.mdp.json [--policy p.policy.json]` (errors and warnings)
  - `mdp-cli policy optimal|best-case|worst-case|uniform model.mdp.json [--gamma 0.9] [-o out.policy.json]`
  - `mdp-cli evaluate model.mdp.json --policy p.policy.json [--gamma 0.9]` (V and reachability under the policy)
  - `mdp-cli reach model.mdp.json --mode max|min|policy [--policy p.policy.json] [--method vi|lp]`
  - `mdp-cli explain model.mdp.json --policy p.policy.json --target axp|cxp --bound min|max|both --deviation 0.2 --threshold absolute|relative [--method vi|lp]`
  - `mdp-cli export-dzn model.mdp.json --policy p.policy.json [-o out.dzn]`
  - `--policy` is required wherever a policy is used (no silent default).
  - Human-readable output by default (labels), `--json` for machine output (ids).

---

## 8. Testing and parity with the TypeScript version

- **Fixtures** (`fixtures/`):
  - `legacy/`: copies of `mdp-explainer-web/examples/*.mdp.json` (old format).
  - `convert_legacy.py` (Python standard library only): old file ->
    `models/<name>.mdp.json` + `policies/<name>.policy.json` (stochastic, from
    `action.policy`). `initialStateId` = the first `isInitial` state, omitted
    when none is flagged; `graphical` and `waypoints` go into `layout`. Reports
    and drops actions with an unknown source and transitions with an unknown
    action.
  - `results/<name>.json`: the TypeScript results of every function of 6.1,
    produced by an exporter script in `mdp-explainer-web` run on the legacy file
    after a stable reordering of actions by source state and transitions by
    action (so the inputs are in the same order as the nested file). Same for a
    set of random models.
  - `invalid/`: one small file per error message of 3.2–3.4.
- Rust tests load a model and its policy, run the Rust version and compare:
  - value iteration: exactly or within `1e-12`;
  - LP: within `1e-7`;
  - policies: identical;
  - explanations: identical as sets of sets.
- **Property tests** (`proptest`) on random small MDPs (with dead ends,
  self-loops, effect states with actions, missing weights):
  - file round trip: `from_json(to_json(x)) == x`, and `to_json` is stable;
  - builder -> `Mdp` -> file -> `Mdp` gives equal graphs;
  - LP and value iteration agree (`1e-7`);
  - `enumerate_target_axps` and `enumerate_target_cxps` give the same sets;
  - every AXp/CXp is subset-minimal (removing any state breaks it);
  - monotonicity: a superset of an AXp is a weak AXp.
- WASM: `wasm-pack test --headless --chrome` for a few smoke tests.
- CI (GitHub Actions): fmt, clippy, tests on Linux/macOS/Windows, the WASM build
  and its size, maturin wheels, CLI release binaries.

---

## 9. Order of work (milestones)

Each milestone ends with tests passing and a short review.

1. Model and files:
   1. builder input types and `MdpBuilder::add_*`;
   2. `build()` -> `Mdp` (CSR, checks, warnings);
   3. `MdpFile` read/write;
   4. `StochasticPolicy`, `DeterministicPolicy`, uniform policy, `PolicyFile`;
   5. converted fixtures, invalid-file tests, round-trip tests.
2. Discounted value iteration and policy evaluation.
3. Reachability by value iteration, policy extraction (min and the backward
   max pass).
4. `LpSolver` trait, pure-Rust backend, LP reachability with `S0`; LP vs VI
   property test.
5. `HittingSetOracle` trait and my minimum-hitting-set solver.
6. `is_axp`, `shrink`, `grow`, both enumerations; duality and minimality
   property tests; parity with fixtures.
7. MiniZinc `.dzn` export (with the two bug fixes).
8. CLI.
9. WASM package, TypeScript types, smoke tests, size report.
10. Python package.
11. Publishing: crates.io, npm, PyPI; versioning and changelog.
12. Integration into `mdp-explainer-web` (section 6.3), behind a switch first.
