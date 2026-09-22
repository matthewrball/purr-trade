import { MutationTree, ActionTree, GetterTree, Module } from 'vuex'
import { ModulesState } from '@/store'

export type HlMarketsSortKey =
  | 'market'
  | 'mark'
  | 'change'
  | 'volume'
  | 'funding'
  | 'oi'
  | 'premium'
  | 'basis'
  | 'leverage'

export type HlMarketsKindToggle = 'showPerps' | 'showSpot' | 'showHip3'

export interface HlMarketsPaneState {
  _id?: string
  sortBy: HlMarketsSortKey
  sortOrder: 1 | -1
  showPerps: boolean
  showSpot: boolean
  showHip3: boolean
}

const getters = {} as GetterTree<HlMarketsPaneState, ModulesState>

const state = {
  sortBy: 'volume',
  sortOrder: -1,
  showPerps: true,
  showSpot: true,
  showHip3: false
} as HlMarketsPaneState

const actions = {
  boot({ state, rootState }, firstTime?: boolean) {
    if (!firstTime) {
      return
    }

    // the pane is added to the panes store right after its module boots
    setTimeout(() => {
      const pane = rootState.panes.panes[state._id]

      if (pane && !pane.name) {
        this.commit('panes/SET_PANE_NAME', {
          id: state._id,
          name: 'HL Markets'
        })
      }
    })
  }
} as ActionTree<HlMarketsPaneState, ModulesState>

const mutations = {
  SET_SORT(state, sortBy: HlMarketsSortKey) {
    if (state.sortBy === sortBy) {
      state.sortOrder = state.sortOrder > 0 ? -1 : 1
    } else {
      state.sortBy = sortBy
      state.sortOrder = sortBy === 'market' ? 1 : -1
    }
  },
  TOGGLE_KIND(state, kind: HlMarketsKindToggle) {
    state[kind] = !state[kind]
  }
} as MutationTree<HlMarketsPaneState>

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations
} as Module<HlMarketsPaneState, ModulesState>
