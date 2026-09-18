export interface MDPState {
    id: string;
    label: string;
    isInitial?: boolean;
    isCandidateCause?: boolean;
    isTargetEffect?: boolean;
}

export interface MDPAction {
    id: string;
    label: string;
    sourceStateId: string;
}

export interface MDPTransition {
    id: string;
    actionId: string;
    targetStateId: string;
    probability: number;
}

export interface CausalityMetrics {
    qInit: number;
    wC: number;
    isSPRCause: boolean;
}

