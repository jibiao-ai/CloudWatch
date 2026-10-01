-- 域名配置：给已有映射补上 coaster 组件（coaster.<根域名>，物理节点信息查询接口）
UPDATE host_mappings
   SET components = CONCAT(components, ',coaster')
 WHERE FIND_IN_SET('coaster', components) = 0;
