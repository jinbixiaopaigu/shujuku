/**
 * 把旧角色分类映射到通用模板的约束值。只处理明确带有新 CHECK 的表，
 * 且只修改调用方提供的工作副本；历史 checkpoint 本身不变。
 */
export function normalizeGenericNarrativeLegacyRoleStatus_ACU(data: Record<string, any>): void {
  const npc = data.sheet_npc_biao;
  if (/archive_status\s+IN\s*\([^)]*'普通角色'[^)]*'追踪角色'[^)]*'退场角色'[^)]*'删除角色'/i.test(String(npc?.sourceData?.ddl || ''))) {
    const rows = npc.content;
    const index = Array.isArray(rows?.[0]) ? rows[0].indexOf('归档状态') : -1;
    if (index >= 0) for (const row of rows.slice(1)) {
      if (!Array.isArray(row)) continue;
      const value = String(row[index] ?? '').trim();
      if (!value) row[index] = '普通角色';
      else if (/^(?:新生|原生)角色[SN]类$/.test(value)) row[index] = '追踪角色';
    }
  }

  const tracked = data.sheet_zhui_zong_jue_se_biao;
  if (/CHECK\s*\(\s*role_profile\s*=\s*'追踪角色'\s*\)/i.test(String(tracked?.sourceData?.ddl || ''))) {
    const rows = tracked.content;
    const roleIndex = Array.isArray(rows?.[0]) ? rows[0].indexOf('角色定位') : -1;
    const introIndex = Array.isArray(rows?.[0]) ? rows[0].indexOf('一句话定位') : -1;
    if (roleIndex >= 0) for (const row of rows.slice(1)) {
      if (!Array.isArray(row)) continue;
      const value = String(row[roleIndex] ?? '').trim();
      if (value === '追踪角色') continue;
      if (value && !/^(?:新生|原生)角色[SN]类$/.test(value)
        && introIndex >= 0 && !String(row[introIndex] ?? '').trim()) {
        row[introIndex] = value;
      }
      row[roleIndex] = '追踪角色';
    }
  }
}
