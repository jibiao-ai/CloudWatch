-- 域名配置：给已有映射补上 gnocchi 组件（<gnocchi>.<根域名>）
UPDATE host_mappings
   SET components = CONCAT(components, ',gnocchi')
 WHERE FIND_IN_SET('gnocchi', components) = 0;
