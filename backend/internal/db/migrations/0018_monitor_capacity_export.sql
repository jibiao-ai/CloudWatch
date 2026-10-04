-- 新增权限：监控中心 / 配置中心的「导出 Excel」。预置角色「云平台运维」「生产 SRE」「只读观察员」获得（仅在尚未包含时追加）
UPDATE roles SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'monitor:export')
  WHERE id IN ('r2','r3','r5') AND JSON_VALID(permissions) AND JSON_SEARCH(permissions, 'one', 'monitor:export') IS NULL;
UPDATE roles SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'capacity:export')
  WHERE id IN ('r2','r3','r5') AND JSON_VALID(permissions) AND JSON_SEARCH(permissions, 'one', 'capacity:export') IS NULL;
