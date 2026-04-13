type PayloadLifecycleCandidate = {
  shutdown?: (() => Promise<void> | void) | undefined;
  close?: (() => Promise<void> | void) | undefined;
};

type PayloadShutdownPreference = 'shutdown-first' | 'close-first';

export const closePayloadLifecycle = async (
  candidate: unknown,
  preference: PayloadShutdownPreference = 'shutdown-first',
): Promise<void> => {
  const lifecycle = candidate as PayloadLifecycleCandidate | null | undefined;
  if (!lifecycle) {
    return;
  }

  const firstMethod = preference === 'close-first' ? 'close' : 'shutdown';
  const secondMethod = preference === 'close-first' ? 'shutdown' : 'close';

  const first = lifecycle[firstMethod];
  if (typeof first === 'function') {
    await first();
    return;
  }

  const second = lifecycle[secondMethod];
  if (typeof second === 'function') {
    await second();
  }
};
