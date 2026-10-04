-- 运营中心 · 优化策略：内置策略名称「虚拟机」→「虚机」
UPDATE analytics_policies SET name='IO性能压力异常虚机' WHERE kind='io_pressure' AND name='IO性能压力异常虚拟机';
UPDATE analytics_policies SET name='长期关机虚机' WHERE kind='longoff' AND name='长期关机虚拟机';
UPDATE analytics_policies SET name='僵尸型虚机' WHERE kind='zombie' AND name='僵尸型虚拟机';
