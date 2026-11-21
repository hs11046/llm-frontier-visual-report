function settled(view) {
  return { view, requested: view, transition: null };
}

export const initialChartView = settled({ top: 50, mode: 'rank' });

export function chartViewReducer(state, action) {
  switch (action.type) {
    case 'select': {
      const requested = action.view;
      if (!action.animate) return settled(requested);
      if (state.transition) return { ...state, requested };
      if (state.view.top === requested.top) return settled(requested);
      return { view: { top: state.view.top, mode: 'rank' }, requested, transition: { stage: 'rank' } };
    }
    case 'settled': {
      if (!state.transition || action.transition !== state.transition) return state;
      const top = state.transition.toTop ?? state.view.top;
      if (top === state.requested.top) {
        if (state.transition.stage === 'zoom' && state.requested.mode !== 'rank') {
          return { ...state, view: { top, mode: 'rank' }, transition: { stage: 'landed' } };
        }
        return settled(state.requested);
      }
      return { ...state, view: { top, mode: 'rank' }, transition: { stage: 'zoom', toTop: state.requested.top } };
    }
    case 'finish':
      return state.transition ? settled(state.requested) : state;
    default:
      return state;
  }
}
