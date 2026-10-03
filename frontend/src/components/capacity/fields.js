/** 详情抽屉的字段分组：[标题, [[字段名, 取值key, 类型]]]；类型 gb / mb / bytes / time / num / mono（默认文本） */
const P = [['UUID', 'id', 'mono'], ['所属云平台', 'providerName'], ['平台控制台', 'consoleIp', 'console']];

export const FIELDS = {
  phys: [
    ['基本信息', [['主机名', 'hostname'], ['完整域名（FQDN）', 'fqdn'], ['所属云平台', 'providerName'], ['平台控制台', 'consoleIp', 'console'], ['型号', 'model'], ['厂商', 'manufacturer'], ['序列号', 'serial'], ['管理 IP（br-roller）', 'ip'], ['状态', 'statusText'], ['在线状态', 'online'], ['部署状态', 'provisionStatus'], ['角色', 'roles'], ['集群 ID', 'clusterId', 'mono'], ['节点 ID', 'id', 'mono'], ['数据时间', 'timestamp'], ['异常信息', 'errorMsg']]],
    ['CPU 与内存', [['CPU 型号', 'cpuModel'], ['CPU 厂商', 'cpuVendor'], ['CPU 路数', 'cpuSockets', 'num'], ['CPU 核数', 'cpuCores', 'num'], ['架构', 'arch'], ['NUMA 节点数', 'numaNodes', 'num'], ['内存大小', 'memoryBytes', 'bytes'], ['内存插槽数', 'memorySlots', 'num'], ['最大支持内存', 'memoryMaxBytes', 'bytes']]],
    ['网卡与磁盘', [['网卡数量', 'nicCount', 'num'], ['磁盘数量', 'diskCount', 'num'], ['磁盘总容量', 'totalDiskBytes', 'bytes']]],
    ['带外管理', [['IPMI 地址', 'ipmiIp'], ['BMC 版本', 'bmcVersion'], ['BIOS 版本', 'biosVersion'], ['管理网卡 MAC', 'mac']]],
  ],
  nodes: [
    ['基本信息', [['节点名称', 'name'], ['主机名（hypervisor_hostname）', 'hostname'], ...P, ['主机 IP', 'hostIp'], ['运行状态', 'stateText'], ['服务状态', 'enabledText'], ['禁用原因', 'disabledReason'], ['服务主机', 'serviceHost'], ['虚拟化类型', 'hypervisorType'], ['虚拟化版本', 'hypervisorVersion'], ['运行时长', 'uptime']]],
    ['计算资源', [['物理 vCPU', 'vcpus', 'num'], ['vCPU 超分比', 'cpuRatio', 'num'], ['vCPU 容量（含超分）', 'vcpusCap', 'num'], ['vCPU 已用', 'vcpusUsed', 'num'], ['vCPU 使用率（%）', 'vcpuPercent', 'num'], ['运行虚拟机数', 'runningVms', 'num'], ['当前工作负载', 'workload', 'num']]],
    ['内存', [['物理内存', 'memoryMb', 'mb'], ['内存超分比', 'ramRatio', 'num'], ['内存容量（含超分）', 'memoryMbCap', 'mb'], ['内存已用', 'memoryMbUsed', 'mb'], ['内存空闲', 'freeRamMb', 'mb'], ['内存使用率（%）', 'memPercent', 'num']]],
  ],
  vms: [
    ['基本信息', [['名称', 'name'], ...P, ['状态', 'statusText'], ['项目名称', 'projectName'], ['虚拟机状态', 'vmState'], ['任务状态', 'taskState'], ['电源状态', 'powerState'], ['计算节点状态', 'hostStatus'], ['锁定', 'locked'], ['描述', 'description']]],
    ['位置与网络', [['所在节点', 'node'], ['实例名称', 'instanceName'], ['可用区', 'az'], ['IP 地址', 'ips'], ['MAC 地址', 'macs'], ['安全组', 'securityGroups']]],
    ['规格（vCPU / 内存取自规格）', [['规格名称', 'flavor'], ['规格 ID', 'flavorId', 'mono'], ['vCPU', 'vcpus', 'num'], ['内存', 'ramMb', 'mb'], ['挂载云盘数', 'volumeCount', 'num'], ['镜像 ID', 'imageId', 'mono'], ['密钥对', 'keyName']]],
    ['归属与时间', [['项目 ID', 'projectId', 'mono'], ['用户 ID', 'userId', 'mono'], ['创建时间', 'createdAt', 'time'], ['更新时间', 'updatedAt', 'time'], ['启动时间', 'launchedAt', 'time']]],
  ],
  volumes: [
    ['基本信息', [['名称', 'name'], ...P, ['项目名称', 'projectName'], ['状态', 'statusText'], ['容量', 'sizeGb', 'gb'], ['云硬盘类型', 'volumeType'], ['描述', 'description']]],
    ['属性', [['加密', 'encrypted'], ['共享', 'multiattach'], ['可用区', 'az'], ['存储后端', 'backend'], ['启动盘', 'bootable'], ['镜像名称', 'imageName'], ['复制状态', 'replicationStatus'], ['迁移状态', 'migrationStatus'], ['一致性组', 'consistencyGroupId', 'mono']]],
    ['挂载', [['挂载虚拟机', 'serverNames'], ['虚拟机 UUID', 'serverIds', 'mono'], ['挂载点', 'devices'], ['挂载主机', 'attachHosts'], ['挂载数', 'attachCount', 'num']]],
    ['归属与时间', [['项目 ID', 'projectId', 'mono'], ['用户 ID', 'userId', 'mono'], ['快照 ID', 'snapshotId', 'mono'], ['源云硬盘 ID', 'sourceVolId', 'mono'], ['后端卷名 ID', 'nameId', 'mono'], ['创建时间', 'createdAt', 'time'], ['更新时间', 'updatedAt', 'time']]],
  ],
  ports: [
    ['基本信息', [['名称', 'name'], ...P, ['项目名称', 'projectName'], ['状态', 'statusText'], ['MAC 地址', 'mac'], ['IP 地址', 'ips'], ['描述', 'description']]],
    ['网络', [['所属网络', 'networkName'], ['网络 ID', 'networkId', 'mono'], ['子网', 'subnets'], ['安全组数', 'sgCount', 'num']]],
    ['绑定设备', [['所属设备', 'deviceName'], ['设备 ID', 'deviceId', 'mono'], ['设备类型', 'deviceOwnerText'], ['设备类型（原值）', 'deviceOwner'], ['绑定主机', 'bindingHost'], ['网卡类型', 'vnicTypeText'], ['VIF 类型', 'vifTypeText'], ['管理状态', 'adminState'], ['端口安全', 'portSecurity']]],
    ['归属与时间', [['项目 ID', 'projectId', 'mono'], ['创建时间', 'createdAt', 'time'], ['更新时间', 'updatedAt', 'time']]],
  ],
  pools: [
    ['基本信息', [['后端名称（volume_backend_name）', 'backendName'], ['存储池名称', 'poolName'], ['完整名称（host@backend#pool）', 'name'], ...P.slice(1), ['供应商（vendor_name）', 'vendorText'], ['存储协议（storage_protocol）', 'protocolText'], ['后端状态（backend_state）', 'statusText'], ['驱动版本', 'driverVersion'], ['位置信息', 'locationInfo'], ['数据时间', 'timestamp']]],
    ['容量', [['总容量', 'totalGb', 'gb'], ['剩余容量', 'freeGb', 'gb'], ['已用容量', 'usedGb', 'gb'], ['存储使用率（%）', 'usedPercent', 'num'], ['已分配容量', 'allocatedGb', 'gb'], ['精简置备总容量', 'provisionedGb', 'gb']]],
    ['能力', [['精简置备', 'thin'], ['最大超分比', 'maxRatio', 'num'], ['预留比例（%）', 'reservedPercent', 'num'], ['多重挂载', 'multiattach'], ['复制', 'replication']]],
  ],
};
