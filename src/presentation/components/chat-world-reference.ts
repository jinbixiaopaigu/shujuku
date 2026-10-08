import { getChatArray_ACU } from '../../data/gateways/chat-gateway';
import { getCurrentIsolationKey_ACU } from '../../service/runtime/state-manager';
import { loadTableStateFromFramesV2Detailed_ACU } from '../../service/table/storage-frame-v2-replay';
import { getAcuHostDocument } from '../../presentation-v2/bootstrap/host-document';
import { peekChatScopedConfigContainer_ACU } from '../../data/storage/chat-history';

const PANEL_CLASS = 'acu-chat-world-reference';

function latestHistoricalBackground(chat: any[]): string {
  for (let index = chat.length - 1; index >= 0; index -= 1) {
    const message = String(chat[index]?.mes || '');
    const matches = [...message.matchAll(/<background>([\s\S]*?)<\/background>/gi)];
    if (matches.length) return matches[matches.length - 1][1].replace(/^\s*```\s*|\s*```\s*$/g, '').trim();
  }
  return '';
}

function currentWorldMemo(data: any): string {
  const sheet = Object.values(data || {}).find((value: any) => value?.name === '备忘录表') as any;
  if (!Array.isArray(sheet?.content) || sheet.content.length < 2) return '';
  const headings = sheet.content[0] as string[];
  const index = (name: string) => headings.indexOf(name);
  const title = index('标题');
  const category = index('分类');
  const status = index('归档状态');
  const content = index('记录内容');
  if (category < 0 || content < 0) return '';
  return sheet.content.slice(1)
    .filter((row: any[]) => String(row[category] || '').trim() === '世界设定'
      && !/归档|失效|删除/.test(String(row[status] || '')))
    .map((row: any[]) => `${title >= 0 && row[title] ? `${row[title]}：` : ''}${String(row[content] || '').trim()}`)
    .filter(Boolean).join('\n\n');
}

function isGenericNarrativeChat(chat: any[], isolationKey: string): boolean {
  const templates = (peekChatScopedConfigContainer_ACU(chat) as any)?.template;
  const template = templates?.[isolationKey] || templates?.[''];
  return typeof template?.templateStr === 'string' && template.templateStr.includes('"genericNarrative"');
}

async function fillWorldReference(panel: HTMLDetailsElement, chat: any[], isolationKey: string): Promise<void> {
  const body = panel.querySelector<HTMLElement>('.acu-chat-world-reference-body');
  if (!body) return;
  body.textContent = '正在读取当前聊天的设定记录…';
  let memo = '';
  try {
    const replay = await loadTableStateFromFramesV2Detailed_ACU(chat, isolationKey, { updateRuntimeState: false });
    memo = currentWorldMemo(replay?.data);
  } catch {
    // 只读面板允许回退到同一聊天里的历史设定，不影响数据库写入路径。
  }
  if (getChatArray_ACU() !== chat || !panel.isConnected || !panel.open) return;
  const historical = latestHistoricalBackground(chat);
  body.textContent = memo || (historical ? `最近一次历史设定记录（后续变化以最新剧情为准）\n\n${historical}` : '当前聊天尚无已记录的世界设定。');
  body.dataset.source = memo ? 'database' : historical ? 'history' : 'empty';
}

/** 只在当前聊天的最新回复挂一个读取入口；展开时才做只读 V2 回放。 */
export function installChatWorldReference_ACU(): void {
  const hostDocument = getAcuHostDocument();
  let observedChat: HTMLElement | null = null;
  let attachedTarget: HTMLElement | null = null;
  let attachedChat: any[] | null = null;
  let scheduled = false;

  const render = () => {
    const chat = getChatArray_ACU();
    let lastAssistant = -1;
    for (let index = chat.length - 1; index >= 0; index -= 1) {
      const message = chat[index];
      if (message && message.is_user !== true && message.is_system !== true) { lastAssistant = index; break; }
    }
    const target = lastAssistant >= 0
      ? hostDocument.querySelector<HTMLElement>(`#chat .mes[mesid="${lastAssistant}"] .mes_text`)
      : null;
    if (attachedTarget === target && attachedChat === chat && target?.querySelector(`.${PANEL_CLASS}`)) return;
    const isolationKey = getCurrentIsolationKey_ACU();
    if (!target || !isGenericNarrativeChat(chat, isolationKey)) {
      hostDocument.querySelectorAll(`.${PANEL_CLASS}`).forEach(node => node.remove());
      attachedTarget = null;
      attachedChat = null;
      return;
    }
    hostDocument.querySelectorAll(`.${PANEL_CLASS}`).forEach(node => node.remove());
    const panel = hostDocument.createElement('details');
    panel.className = PANEL_CLASS;
    panel.style.cssText = 'margin:12px 0 4px;padding:8px 10px;border:1px solid var(--SmartThemeBorderColor,#777);border-radius:8px;';
    const summary = hostDocument.createElement('summary');
    summary.textContent = '📖 查看当前世界设定与规则';
    summary.style.cssText = 'cursor:pointer;font-weight:600;';
    const body = hostDocument.createElement('div');
    body.className = 'acu-chat-world-reference-body';
    body.style.cssText = 'white-space:pre-wrap;margin-top:9px;max-height:50vh;overflow:auto;';
    panel.append(summary, body);
    panel.addEventListener('toggle', () => {
      if (panel.open) void fillWorldReference(panel, chat, isolationKey);
    });
    target.append(panel);
    attachedTarget = target;
    attachedChat = chat;
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; render(); }, 100);
  };
  const connect = () => {
    const hostChat = hostDocument.querySelector<HTMLElement>('#chat');
    if (!hostChat) { setTimeout(connect, 1000); return; }
    if (observedChat === hostChat) return;
    observedChat = hostChat;
    const HostMutationObserver = hostDocument.defaultView?.MutationObserver || MutationObserver;
    new HostMutationObserver(schedule).observe(hostChat, { childList: true, subtree: true });
    schedule();
  };
  connect();
}
