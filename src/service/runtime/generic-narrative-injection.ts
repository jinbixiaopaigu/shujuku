import { SillyTavern_API_ACU } from '../../shared/host-api';
import { cleanChatName_ACU, logWarn_ACU } from '../../shared/utils';
import { TABLE_TEMPLATE_ACU } from '../../shared/defaults-json.js';
import { getTemplatePreset_ACU } from '../template/template-preset-service';
import { mergeAllIndependentTables_ACU } from './helpers-data-merge';
import { currentChatFileIdentifier_ACU, getCurrentIsolationKey_ACU } from './state-manager';
import { buildGenericNarrativePrompt_ACU, isGenericNarrativeTemplate_ACU } from './generic-narrative-prompt';

const PROMPT_ID = 'TavernDB-ACU-GenericNarrative-CurrentChat';

function chatId(): string {
  return cleanChatName_ACU(String(SillyTavern_API_ACU?.getCurrentChatId?.() || '')).trim();
}

function activeTemplate(): unknown {
  const metadata = (SillyTavern_API_ACU as any)?.chatMetadata;
  const scoped = metadata?.TavernDB_ACU_ScopedConfig;
  const key = getCurrentIsolationKey_ACU();
  const record = scoped?.template?.[key] ?? scoped?.template?.[''];
  const raw = typeof record?.templateStr === 'string'
    ? record.templateStr
    : record?.mode === 'preset_link' && record?.presetName
      ? getTemplatePreset_ACU(record.presetName)?.templateStr
      : TABLE_TEMPLATE_ACU;
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function clearGenericNarrativePrompt_ACU(): Promise<void> {
  await SillyTavern_API_ACU?.setExtensionPrompt?.(PROMPT_ID, '', 1, 2, false, 0);
}

/** Refresh immediately before prompt assembly. Failure is fail-closed. */
export async function refreshGenericNarrativePrompt_ACU(): Promise<void> {
  await clearGenericNarrativePrompt_ACU();
  const expected = chatId();
  if (!expected || expected === 'unknown_chat_source' || expected !== cleanChatName_ACU(String(currentChatFileIdentifier_ACU || '')).trim()) return;
  if (!isGenericNarrativeTemplate_ACU(activeTemplate())) return;
  try {
    const data = await mergeAllIndependentTables_ACU();
    if (chatId() !== expected || cleanChatName_ACU(String(currentChatFileIdentifier_ACU || '')).trim() !== expected) return;
    const recent = (SillyTavern_API_ACU?.chat || []).slice(-4).map(message => String(message?.mes || '')).join('\n').slice(-2500);
    const prompt = buildGenericNarrativePrompt_ACU(data, recent);
    if (prompt) await SillyTavern_API_ACU?.setExtensionPrompt?.(PROMPT_ID, prompt, 1, 2, false, 0);
  } catch (error) {
    await clearGenericNarrativePrompt_ACU();
    logWarn_ACU('[GenericNarrative] 当前聊天数据库注入失败，已清空动态提示词。', error);
  }
}
