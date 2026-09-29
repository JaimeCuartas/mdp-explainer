// Plain-data result/option shapes for every algorithm in this folder. Kept as
// simple records of primitives (no classes, no framework types) so a future
// WebAssembly implementation can expose the same shape without the JS side
// needing to change.

export interface ValueIterationOptions {
  /** Discount factor (gamma) applied to future reward. */
  discountFactor?: number;
  maxIterations?: number;
  /** Stop once the largest change in any state's value drops below this. */
  tolerance?: number;
}

export interface ValueIterationResult {
  /** stateId -> expected discounted reward under the optimal policy. */
  values: Record<string, number>;
  /** stateId -> id of the best action, or null if the state has no actions. */
  policy: Record<string, string | null>;
  iterations: number;
  converged: boolean;
}

export type ReachabilityMode = 'max' | 'min';

export interface ReachabilityOptions {
  maxIterations?: number;
  tolerance?: number;
}

export interface ReachabilityResult {
  /** stateId -> probability of eventually reaching an effect state. */
  probabilities: Record<string, number>;
  /** stateId -> id of the action achieving that probability, or null. */
  policy: Record<string, string | null>;
  iterations: number;
  converged: boolean;
}
