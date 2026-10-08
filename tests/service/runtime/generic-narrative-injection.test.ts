import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const state = vi.hoisted(() => ({ chatId: 'Branch #4', runtimeId: 'Branch #4', data: null as any, prompt: [] as string[] }));
vi.mock('../../../src/shared/host-api', () => ({
  SillyTavern_API_ACU: {
    getCurrentChatId: () => state.chatId,
    chatMetadata: { TavernDB_ACU_ScopedConfig: { template: { '': { templateStr: JSON.stringify({ mate: { genericNarrative: { version: 1, delivery: 'chat_prompt' } } }) } } } },
    chat: [],
    setExtensionPrompt: (_id: string, content: string) => { state.prompt.push(content); },
  },
}));
vi.mock('../../../src/service/runtime/state-manager', () => ({
  get currentChatFileIdentifier_ACU() { return state.runtimeId; },
  getCurrentIsolationKey_ACU: () => '',
}));
vi.mock('../../../src/service/runtime/helpers-data-merge', () => ({ mergeAllIndependentTables_ACU: async () => state.data }));
vi.mock('../../../src/service/template/template-preset-service', () => ({ getTemplatePreset_ACU: () => null }));
vi.mock('../../../src/shared/defaults-json.js', () => ({ TABLE_TEMPLATE_ACU: '{}' }));

import { refreshGenericNarrativePrompt_ACU } from '../../../src/service/runtime/generic-narrative-injection';
import { buildGenericNarrativePrompt_ACU } from '../../../src/service/runtime/generic-narrative-prompt';

function snapshot(name: string) {
  return {
    mate: { genericNarrative: { version: 1, delivery: 'chat_prompt' } },
    sheet_npc: {
      name: 'NPC表',
      content: [['row_id','姓名','在场状态'], ['1', name, '在场']],
      exportConfig: { delivery: 'chat_prompt', promptColumns: ['姓名','在场状态'] },
    },
    sheet_tracked: {
      name: '追踪角色表',
      content: [['row_id','姓名','核心行为逻辑'], ['1', name, '先确认事实再行动']],
      exportConfig: { delivery: 'chat_prompt', promptColumns: ['姓名','核心行为逻辑'] },
    },
  };
}

describe('generic narrative current-chat injection', () => {
  it('renders the writing fields from the selected chat and excludes another branch', async () => {
    state.data = snapshot('分支甲角色');
    state.chatId = state.runtimeId = 'Branch #4';
    state.prompt = [];
    await refreshGenericNarrativePrompt_ACU();
    const actual = state.prompt.at(-1) || '';
    expect(actual).toContain('核心行为逻辑');
    expect(actual).toContain('分支甲角色');
    expect(actual).not.toContain('分支乙角色');
    state.data = snapshot('分支乙角色');
    state.chatId = state.runtimeId = 'Branch #22';
    await refreshGenericNarrativePrompt_ACU();
    const switched = state.prompt.at(-1) || '';
    expect(switched).toContain('分支乙角色');
    expect(switched).not.toContain('分支甲角色');
  });

  it('clears stale injection when chat identity differs', async () => {
    state.data = snapshot('分支甲角色');
    state.chatId = 'Branch #41';
    state.runtimeId = 'Branch #4';
    state.prompt = [];
    await refreshGenericNarrativePrompt_ACU();
    expect(state.prompt).toEqual(['']);
  });

  it('does not emit world specific rules from a generic core projection', () => {
    const root = path.resolve(__dirname, '../../../../../../../../');
    const core = JSON.parse(fs.readFileSync(path.join(root, 'public/scripts/extensions/third-party/shujuku/templates/generic-narrative/generated/0000.json'), 'utf8'));
    const rendered = buildGenericNarrativePrompt_ACU(core);
    expect(rendered).not.toContain('穿越装置');
    expect(rendered).not.toContain('好感度');
  });
});
