import {
  STATES,
  getState,
  transition,
  onStateChange,
  resetForTesting,
} from './portfolio-state.js';

describe('PM Chat portfolio state integration', () => {
  beforeEach(() => {
    resetForTesting();
  });

  test('PM Chat observer receives READY state when portfolio loads', () => {
    const spy = vi.fn();
    onStateChange(function(newState) {
      if (newState === STATES.READY) spy(newState);
    });
    transition(STATES.LOADING);
    transition(STATES.READY);
    expect(spy).toHaveBeenCalledWith(STATES.READY);
  });

  test('PM Chat observer receives ERROR state gracefully', () => {
    const spy = vi.fn();
    onStateChange(function(newState) {
      if (newState === STATES.ERROR) spy(newState);
    });
    transition(STATES.LOADING);
    transition(STATES.ERROR);
    expect(spy).toHaveBeenCalledWith(STATES.ERROR);
  });

  test('PM Chat observer receives EMPTY state when portfolio is cleared', () => {
    const spy = vi.fn();
    onStateChange(function(newState) {
      if (newState === STATES.EMPTY) spy(newState);
    });
    transition(STATES.LOADING);
    transition(STATES.READY);
    transition(STATES.EMPTY);
    expect(spy).toHaveBeenCalledWith(STATES.EMPTY);
  });

  test('PM Chat observer not called for intermediate states', () => {
    const readySpy = vi.fn();
    onStateChange(function(newState) {
      if (newState === STATES.READY) readySpy();
    });
    transition(STATES.LOADING);
    // LOADING should not trigger the READY handler
    expect(readySpy).not.toHaveBeenCalled();
    transition(STATES.READY);
    expect(readySpy).toHaveBeenCalledTimes(1);
  });
});
