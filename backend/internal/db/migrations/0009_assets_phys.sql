-- 资产管理（原容量管理）：新增物理节点快照列（平台物理节点信息查询接口 coaster.<根域名>/v2/nodes）
ALTER TABLE capacity_snapshots ADD COLUMN phys LONGBLOB NULL AFTER pools;
