import {
  GlobalMockOptions,
  NormalizedOverrideOutput,
} from '@vetster/orval-core';

export const getDelay = (
  override?: NormalizedOverrideOutput,
  options?: GlobalMockOptions,
): GlobalMockOptions['delay'] => {
  const overrideDelay =
    typeof override?.mock?.delay === 'number'
      ? override?.mock?.delay
      : options?.delay;
  const delayFunctionLazyExecute =
    override?.mock?.delayFunctionLazyExecute ??
    options?.delayFunctionLazyExecute;
  switch (typeof overrideDelay) {
    case 'function':
      return delayFunctionLazyExecute ? overrideDelay : overrideDelay();
    case 'number':
      return overrideDelay;
    default:
      return 1000;
  }
};
