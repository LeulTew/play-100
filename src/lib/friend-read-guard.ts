export function createFriendReadGuard() {
  let generation = 0;
  let acceptedEpoch: number | null = null;
  return {
    accept(epoch: number) {
      if (acceptedEpoch !== epoch) { acceptedEpoch = epoch; generation += 1; }
    },
    revoke() { acceptedEpoch = null; generation += 1; },
    begin(): { generation: number; epoch: number } | null {
      return acceptedEpoch === null ? null : { generation, epoch: acceptedEpoch };
    },
    permits(lease: { generation: number; epoch: number } | null): boolean {
      return lease !== null && lease.generation === generation && lease.epoch === acceptedEpoch;
    },
  };
}

export function createFriendWorkGeneration() {
  let generation = 0;
  return {
    next() { generation += 1; return generation; },
    cancel() { generation += 1; },
    current(value: number) { return generation === value; },
  };
}
