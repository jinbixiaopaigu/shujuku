/** Per-chat prompt projection for the generic narrative template.
 *
 * Generated lorebook entries are shared by all branches of a character.  This
 * renderer deliberately accepts only the already merged state of one chat and
 * never reads a worldbook or a previous chat's cached state.
 */

type Sheet = {
  name?: string;
  content?: unknown[][];
  exportConfig?: {
    delivery?: string;
    promptColumns?: string[];
    promptRowLimit?: number;
  };
};

function cell(value: unknown): string {
  return String(value ?? '').replace(/[\r\n|]+/g, ' ').trim();
}

export function isGenericNarrativeTemplate_ACU(template: unknown): boolean {
  if (!template || typeof template !== 'object') return false;
  const mate = (template as any).mate;
  return mate?.genericNarrative?.version === 1 && mate?.genericNarrative?.delivery === 'chat_prompt';
}

function relevance(text: string, query: string): number {
  if (!query) return 0;
  const compact = query.replace(/\s+/g, '');
  const terms = new Set<string>();
  for (let i = 0; i < compact.length - 1; i++) terms.add(compact.slice(i, i + 2));
  let score = 0;
  for (const term of terms) if (text.includes(term)) score++;
  return score;
}

export function buildGenericNarrativePrompt_ACU(data: Record<string, unknown> | null, contextText = ''): string {
  if (!data) return '';
  const blocks: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith('sheet_')) continue;
    const sheet = value as Sheet;
    if (sheet?.exportConfig?.delivery !== 'chat_prompt' || !Array.isArray(sheet.content)) continue;
    const [header, ...allRows] = sheet.content;
    if (!Array.isArray(header) || allRows.length === 0) continue;
    const wanted = sheet.exportConfig.promptColumns;
    const indices = Array.isArray(wanted) && wanted.length > 0
      ? wanted.map(name => header.findIndex(value => String(value) === name)).filter(index => index > 0)
      : header.map((_, index) => index).filter(index => index > 0);
    if (indices.length === 0) continue;
    const locationIndex = header.findIndex(value => String(value) === '在场状态');
    const rows = allRows.filter(row => Array.isArray(row) && row.some((value, index) => index > 0 && cell(value)));
    // Current characters are more useful than a full cast list. Other tables
    // retain their persisted order and may set an explicit row limit.
    const prioritized = rows.map((row, index) => ({ row, index, score: relevance(row.map(cell).join(' '), contextText) }))
      .sort((a, b) => {
        const presence = locationIndex > 0 ? Number(cell(b.row[locationIndex]) === '在场') - Number(cell(a.row[locationIndex]) === '在场') : 0;
        if (presence) return presence;
        if (a.score !== b.score) return b.score - a.score;
        return sheet.name === '纪要表' ? b.index - a.index : a.index - b.index;
      }).map(item => item.row);
    const limit = Number.isInteger(sheet.exportConfig.promptRowLimit) && sheet.exportConfig.promptRowLimit! > 0
      ? sheet.exportConfig.promptRowLimit!
      : 30;
    const selected = prioritized.slice(0, limit);
    if (selected.length === 0) continue;
    const lines = selected.map(row => indices.map(index => `${cell(header[index])}: ${cell(row[index])}`).filter(part => !part.endsWith(': ')).join('；'));
    blocks.push(`【${cell(sheet.name || key)}】\n${lines.join('\n')}`);
  }
  return blocks.length ? `<当前聊天数据库>\n${blocks.join('\n\n')}\n</当前聊天数据库>` : '';
}
