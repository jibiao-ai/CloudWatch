import React from 'react';
import { statusCol, uuidCol, platCol, txt, mono, clip, time, numCell, gbCell, gb, mb, Usage, Tag } from './capUtil';

/** 各类资源的列定义（sortable 的 key 与后端行字段一致，服务端排序） */
const nodes = [
  { key: 'name', title: '节点名称', width: 170, sortable: true, render: (r) => <span className="font-medium" title={r.hostname}>{r.name}</span> },
  uuidCol('UUID'), platCol(),
  statusCol('state', '运行状态', 96), statusCol('enabled', '服务状态', 96),
  { key: 'hostIp', title: '主机 IP', width: 130, sortable: true, render: (r) => txt(r.hostIp, 'font-mono') },
  { key: 'vcpuPercent', title: 'vCPU（已用 / 容量）', width: 190, sortable: true, render: (r) => <Usage used={r.vcpusUsed} total={r.vcpusCap} fmt={(v) => `${v}`} /> },
  { key: 'memPercent', title: '内存（已用 / 容量）', width: 190, sortable: true, render: (r) => <Usage used={r.memoryMbUsed} total={r.memoryMbCap} fmt={mb} /> },
  { key: 'diskPercent', title: '本地磁盘（已用 / 总量）', width: 190, sortable: true, render: (r) => <Usage used={r.localGbUsed} total={r.localGb} fmt={gb} /> },
  { key: 'runningVms', title: '运行虚机数', width: 100, sortable: true, align: 'right', render: (r) => numCell(r.runningVms) },
  { key: 'vcpus', title: '物理 vCPU', width: 90, sortable: true, align: 'right', render: (r) => numCell(r.vcpus) },
  { key: 'hypervisorType', title: '虚拟化类型', width: 110, sortable: true, render: (r) => txt(r.hypervisorType) },
  { key: 'cpuModel', title: 'CPU 型号', width: 200, sortable: true, render: (r) => clip(r.cpuModel, 190) },
  { key: 'cpuTopology', title: 'CPU 拓扑', width: 190, render: (r) => txt(r.cpuTopology) },
];

const vms = [
  { key: 'name', title: '虚拟机名称', width: 180, sortable: true, render: (r) => <span className="font-medium truncate block max-w-[170px]" title={r.name}>{r.name || '—'}</span> },
  uuidCol('UUID'), platCol(), statusCol('status', '状态', 90),
  { key: 'node', title: '所在节点', width: 150, sortable: true, render: (r) => txt(r.node) },
  { key: 'ips', title: 'IP 地址', width: 170, sortable: true, render: (r) => clip(r.ips, 160) },
  { key: 'flavor', title: '规格', width: 150, sortable: true, render: (r) => clip(r.flavor, 140) },
  { key: 'vcpus', title: 'vCPU', width: 80, sortable: true, align: 'right', render: (r) => numCell(r.vcpus) },
  { key: 'ramMb', title: '内存', width: 100, sortable: true, align: 'right', render: (r) => (r.ramMb == null ? txt(null) : txt(mb(r.ramMb), 'tabular-nums')) },
  { key: 'diskGb', title: '系统盘', width: 100, sortable: true, align: 'right', render: (r) => gbCell(r.diskGb) },
  { key: 'volumeCount', title: '挂载云盘', width: 90, sortable: true, align: 'right', render: (r) => numCell(r.volumeCount) },
  { key: 'az', title: '可用区', width: 110, sortable: true, render: (r) => txt(r.az) },
  { key: 'powerState', title: '电源状态', width: 100, sortable: true, render: (r) => txt(r.powerState) },
  { key: 'securityGroups', title: '安全组', width: 150, render: (r) => clip(r.securityGroups, 140) },
  { key: 'createdAt', title: '创建时间', width: 160, sortable: true, render: (r) => time(r.createdAt) },
  { key: 'projectId', title: '项目 ID', width: 280, sortable: true, render: (r) => mono(r.projectId) },
];

const volumes = [
  { key: 'name', title: '云硬盘名称', width: 180, sortable: true, render: (r) => <span className="font-medium truncate block max-w-[170px]" title={r.name}>{r.name || '—'}</span> },
  uuidCol('UUID'), platCol(), statusCol('status', '状态', 96),
  { key: 'sizeGb', title: '容量', width: 100, sortable: true, align: 'right', render: (r) => gbCell(r.sizeGb) },
  { key: 'volumeType', title: '云硬盘类型', width: 130, sortable: true, render: (r) => txt(r.volumeType) },
  { key: 'serverNames', title: '挂载虚拟机', width: 190, sortable: true, render: (r) => clip(r.serverNames, 180) },
  { key: 'devices', title: '挂载点', width: 110, sortable: true, render: (r) => txt(r.devices, 'font-mono') },
  { key: 'bootable', title: '启动盘', width: 80, sortable: true, render: (r) => txt(r.bootable) },
  { key: 'encrypted', title: '加密', width: 90, sortable: true, render: (r) => txt(r.encrypted) },
  { key: 'multiattach', title: '共享', width: 90, sortable: true, render: (r) => txt(r.multiattach) },
  { key: 'az', title: '可用区', width: 110, sortable: true, render: (r) => txt(r.az) },
  { key: 'backend', title: '存储后端', width: 220, sortable: true, render: (r) => clip(r.backend, 210) },
  { key: 'createdAt', title: '创建时间', width: 160, sortable: true, render: (r) => time(r.createdAt) },
  { key: 'projectId', title: '项目 ID', width: 280, sortable: true, render: (r) => mono(r.projectId) },
];

const ports = [
  { key: 'name', title: '网卡名称', width: 170, sortable: true, render: (r) => <span className="font-medium truncate block max-w-[160px]" title={r.name}>{r.name || '—'}</span> },
  uuidCol('UUID'), platCol(), statusCol('status', '状态', 90),
  { key: 'mac', title: 'MAC 地址', width: 150, sortable: true, render: (r) => txt(r.mac, 'font-mono') },
  { key: 'ips', title: 'IP 地址', width: 150, sortable: true, render: (r) => clip(r.ips, 140) },
  { key: 'networkName', title: '所属网络', width: 160, sortable: true, render: (r) => clip(r.networkName || r.networkId, 150) },
  { key: 'subnets', title: '子网', width: 170, sortable: true, render: (r) => clip(r.subnets, 160) },
  { key: 'deviceName', title: '所属设备', width: 190, sortable: true, render: (r) => clip(r.deviceName || r.deviceId, 180) },
  { key: 'deviceOwnerText', title: '设备类型', width: 130, sortable: true, render: (r) => txt(r.deviceOwnerText) },
  { key: 'bindingHost', title: '绑定主机', width: 140, sortable: true, render: (r) => txt(r.bindingHost) },
  { key: 'vnicTypeText', title: '网卡类型', width: 110, sortable: true, render: (r) => txt(r.vnicTypeText) },
  { key: 'adminState', title: '管理状态', width: 90, sortable: true, render: (r) => txt(r.adminState) },
  { key: 'portSecurity', title: '端口安全', width: 90, sortable: true, render: (r) => txt(r.portSecurity) },
  { key: 'createdAt', title: '创建时间', width: 160, sortable: true, render: (r) => time(r.createdAt) },
  { key: 'projectId', title: '项目 ID', width: 280, sortable: true, render: (r) => mono(r.projectId) },
];

const pools = [
  { key: 'poolName', title: '存储池名称', width: 220, sortable: true, render: (r) => <span className="font-medium break-all" title={r.name}>{r.poolName}</span> },
  platCol(),
  { key: 'totalGb', title: '总容量', width: 110, sortable: true, align: 'right', render: (r) => gbCell(r.totalGb) },
  { key: 'freeGb', title: '剩余容量', width: 110, sortable: true, align: 'right', render: (r) => gbCell(r.freeGb) },
  { key: 'allocatedGb', title: '已分配容量', width: 110, sortable: true, align: 'right', render: (r) => gbCell(r.allocatedGb) },
  { key: 'provisionedGb', title: '精简置备总容量', width: 130, sortable: true, align: 'right', render: (r) => gbCell(r.provisionedGb) },
  { key: 'usedPercent', title: '使用率', width: 170, sortable: true, render: (r) => <Usage used={r.usedGb} total={r.totalGb} fmt={gb} /> },
  { key: 'vendorText', title: '供应商', width: 170, sortable: true, render: (r) => <span className="text-[13px]" title={r.vendorName}>{r.vendorText || '—'}</span> },
  { key: 'protocolText', title: '存储协议', width: 130, sortable: true, render: (r) => <span className="text-[13px]" title={r.protocol}>{r.protocolText || '—'}</span> },
  statusCol('status', '后端状态', 100),
  { key: 'backendName', title: '后端名称', width: 170, sortable: true, render: (r) => clip(r.backendName, 160) },
  { key: 'thin', title: '精简置备', width: 90, sortable: true, render: (r) => <Tag text={r.thin} tone={r.thin === '支持' ? 'success' : 'default'} /> },
  { key: 'maxRatio', title: '最大超分比', width: 100, sortable: true, align: 'right', render: (r) => numCell(r.maxRatio) },
  { key: 'driverVersion', title: '驱动版本', width: 110, sortable: true, render: (r) => txt(r.driverVersion) },
];

export const COLUMNS = { nodes, vms, volumes, ports, pools };
export const PLACEHOLDER = {
  nodes: '搜索节点名称 / UUID / IP / CPU 型号 / 平台…',
  vms: '搜索虚拟机名称 / UUID / IP / MAC / 节点 / 规格 / 平台…',
  volumes: '搜索云硬盘名称 / UUID / 挂载虚拟机 / 类型 / 后端 / 平台…',
  ports: '搜索网卡名称 / UUID / MAC / IP / 网络 / 设备 / 平台…',
  pools: '搜索存储池名称 / 供应商 / 协议 / 后端名称 / 平台…',
};
export const TITLE = { nodes: '计算节点', vms: '虚拟机', volumes: '云硬盘', ports: '虚拟网卡', pools: '集群存储' };
