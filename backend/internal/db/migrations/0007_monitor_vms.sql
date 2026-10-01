-- 监控中心：快照新增云主机列表（Nova servers/detail + Gnocchi 最近值）
ALTER TABLE monitor_snapshots ADD COLUMN vms MEDIUMTEXT NULL AFTER disks;
