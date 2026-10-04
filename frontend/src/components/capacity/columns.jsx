import React from 'react';
import { statusCol, uuidCol, platCol, txt, clip, time, numCell, gbCell, gb, mb, Usage } from './capUtil';
import { formatBytes } from '../../utils/format';
import { FlavorCell } from '../monitor/cells';

/** 各类资源的列定义（sortable 的 key 与后端行字段一致，服务端排序） */
const projCol = () => ({ key: 'projectName', title: '项目名称', width: 160, sortable: true, render: (r) => clip(r.projectName, 150) });

const phys = [
  { key: 'hostname', title: '主机名', width: 170, sortable: true, render: (r) => <span className="font-medium truncate block max-w-[160px]" title={r.fqdn || r.hostname}>{r.hostname || '—'}</span> },
  platCol(),
  { key: 'serial', title: '序列号', width: 140, sortable: true, render: (r) => txt(r.serial, 'font-mono') },
  { key: 'model', title: '型号', width: 150, sortable: true, render: (r) => clip(r.model, 140) },
  { key: 'cpuModel', title: 'CPU 型号', width: 240, sortable: true, render: (r) => clip(r.cpuModel, 230) },
  { key: 'cpuCores', title: 'CPU 核数', width: 90, sortable: true, align: 'right', render: (r) => numCell(r.cpuCores) },
  { key: 'memoryBytes', title: '内存大小', width: 100, sortable: true, align: 'right', render: (r) => numCell(r.memoryBytes, (v) => formatBytes(v, 2)) },
  { key: 'nicCount', title: '网卡数量', width: 90, sortable: true, align: 'right', render: (r) => numCell(r.nicCount) },
  statusCol('status', '状态', 90),
  { key: 'ip', title: '管理 IP', width: 130, sortable: true, render: (r) => txt(r.ip, 'font-mono') },
  { key: 'ipmiIp', title: '带外 IP', width: 130, sortable: true, render: (r) => txt(r.ipmiIp, 'font-mono') },
];

const nodes = [
  { key: 'name', title: '节点名称', width: 170, sortable: true, render: (r) => <span className="font-medium" title={r.hostname}>{r.name}</span> },
  { key: 'hostIp', title: '管理 IP', width: 130, sortable: true, render: (r) => txt(r.hostIp, 'font-mono') },
  platCol(),
  { key: 'vcpus', title: 'CPU 核数', width: 90, sortable: true, align: 'right', render: (r) => numCell(r.vcpus) },
  { key: 'vcpuPercent', title: 'vCPU（已用 / 容量）', width: 190, sortable: true, render: (r) => <Usage used={r.vcpusUsed} total={r.vcpusCap} fmt={(v) => `${v}`} name="vCPU 使用率" /> },
  { key: 'memPercent', title: '内存（已用 / 容量）', width: 190, sortable: true, render: (r) => <Usage used={r.memoryMbUsed} total={r.memoryMbCap} fmt={mb} name="内存使用率" /> },
  { key: 'runningVms', title: '运行虚拟机数', width: 110, sortable: true, align: 'right', render: (r) => numCell(r.runningVms) },
  statusCol('state', '运行状态', 96), statusCol('enabled', '服务状态', 96),
  { key: 'hypervisorType', title: '虚拟化类型', width: 110, sortable: true, render: (r) => txt(r.hypervisorType) },
];

const vms = [
  { key: 'name', title: '虚拟机名称', width: 180, sortable: true, render: (r) => <span className="font-medium truncate block max-w-[170px]" title={r.name}>{r.name || '—'}</span> },
  { key: 'ips', title: '虚机 IP', width: 170, sortable: true, render: (r) => clip(r.ips, 160) },
  { key: 'flavor', title: '规格名称', width: 150, sortable: true, render: (r) => <FlavorCell name={r.flavor} vcpus={r.vcpus} ramMb={r.ramMb} /> },
  uuidCol('UUID'), statusCol('status', '状态', 90), projCol(), platCol(),
  { key: 'node', title: '计算节点', width: 150, sortable: true, render: (r) => txt(r.node) },
  { key: 'createdAt', title: '创建时间', width: 160, sortable: true, render: (r) => time(r.createdAt) },
];

const volumes = [
  { key: 'name', title: '云硬盘名称', width: 180, sortable: true, render: (r) => <span className="font-medium truncate block max-w-[170px]" title={r.name}>{r.name || '—'}</span> },
  uuidCol('UUID'), platCol(), projCol(), statusCol('status', '状态', 96),
  { key: 'sizeGb', title: '容量', width: 100, sortable: true, align: 'right', render: (r) => gbCell(r.sizeGb) },
  { key: 'volumeType', title: '云硬盘类型', width: 130, sortable: true, render: (r) => txt(r.volumeType) },
  { key: 'serverNames', title: '挂载虚拟机', width: 190, sortable: true, render: (r) => clip(r.serverNames, 180) },
  { key: 'devices', title: '挂载点', width: 110, sortable: true, render: (r) => txt(r.devices, 'font-mono') },
  { key: 'bootable', title: '启动盘', width: 80, sortable: true, render: (r) => txt(r.bootable) },
  { key: 'createdAt', title: '创建时间', width: 160, sortable: true, render: (r) => time(r.createdAt) },
];

const ports = [
  { key: 'name', title: '网卡名称', width: 170, sortable: true, render: (r) => <span className="font-medium truncate block max-w-[160px]" title={r.name}>{r.name || '—'}</span> },
  { key: 'ips', title: 'IP 地址', width: 150, sortable: true, render: (r) => clip(r.ips, 140) },
  { key: 'mac', title: 'MAC 地址', width: 150, sortable: true, render: (r) => txt(r.mac, 'font-mono') },
  uuidCol('UUID'), statusCol('status', '状态', 90),
  { key: 'networkName', title: '所属网络', width: 160, sortable: true, render: (r) => clip(r.networkName || r.networkId, 150) },
  platCol(), projCol(),
  { key: 'deviceName', title: '挂载虚拟机', width: 190, sortable: true, render: (r) => clip(r.deviceName, 180) },
  { key: 'createdAt', title: '创建时间', width: 160, sortable: true, render: (r) => time(r.createdAt) },
];

const pools = [
  { key: 'backendName', title: '后端名称', width: 190, sortable: true, render: (r) => <span className="font-medium break-all" title={r.name}>{r.backendName || r.poolName || '—'}</span> },
  platCol(),
  { key: 'totalGb', title: '总容量', width: 110, sortable: true, align: 'right', render: (r) => gbCell(r.totalGb) },
  { key: 'freeGb', title: '剩余容量', width: 110, sortable: true, align: 'right', render: (r) => gbCell(r.freeGb) },
  { key: 'allocatedGb', title: '已分配容量', width: 110, sortable: true, align: 'right', render: (r) => gbCell(r.allocatedGb) },
  { key: 'provisionedGb', title: '精简置备总容量', width: 130, sortable: true, align: 'right', render: (r) => gbCell(r.provisionedGb) },
  { key: 'usedPercent', title: '存储使用率', width: 170, sortable: true, render: (r) => <Usage used={r.usedGb} total={r.totalGb} fmt={gb} name="存储使用率" /> },
  { key: 'vendorText', title: '供应商', width: 170, sortable: true, render: (r) => <span className="text-[13px]" title={r.vendorName}>{r.vendorText || '—'}</span> },
  statusCol('status', '后端状态', 100),
];

export const COLUMNS = { phys, nodes, vms, volumes, ports, pools };
export const PLACEHOLDER = {
  phys: '搜索序列号 / 型号 / CPU 型号 / 主机名 / 管理 IP / 带外 IP / 平台…',
  nodes: '搜索节点名称 / IP / 平台…',
  vms: '搜索虚拟机名称 / UUID / 虚机 IP / MAC / 计算节点 / 项目 / 规格 / 平台…',
  volumes: '搜索云硬盘名称 / UUID / 项目 / 挂载虚拟机 / 类型 / 后端 / 平台…',
  ports: '搜索网卡名称 / UUID / 项目 / MAC / IP / 网络 / 挂载虚拟机 / 平台…',
  pools: '搜索存储池名称 / 供应商 / 协议 / 后端名称 / 平台…',
};
export const TITLE = { phys: '物理节点', nodes: '计算节点', vms: '虚拟机', volumes: '云硬盘', ports: '虚拟网卡', pools: '集群存储' };
