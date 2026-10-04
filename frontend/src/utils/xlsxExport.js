/**
 * xlsxExport —— 浏览器端生成 Excel（.xlsx）：用于监控中心各表格（快照数据已全量在前端，按当前筛选 / 排序结果导出）。
 * sheets: [{ name, head: string[], rows: any[][] }]；xlsx 库按需动态加载，不进首屏包。
 */
export async function buildXlsxBlob(sheets) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set();
  sheets.forEach((s, i) => {
    const ws = XLSX.utils.aoa_to_sheet([s.head, ...s.rows]);
    ws['!cols'] = s.head.map(() => ({ wch: 20 }));
    let name = String(s.name || `Sheet${i + 1}`).replace(/[\\/?*[\]:]/g, '-').slice(0, 28);
    for (let k = 2; used.has(name); k += 1) name = `${name.slice(0, 26)}${k}`;
    used.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** 数值保留 d 位小数；空值 → ''（单元格留空） */
export const xr = (v, d = 1) => (v == null || v === '' || Number.isNaN(Number(v)) ? '' : Math.round(Number(v) * 10 ** d) / 10 ** d);
/** 字节 → GiB（2 位小数） */
export const xGiB = (v) => xr(v == null ? null : Number(v) / 1024 ** 3, 2);
/** 空值 → ''（避免导出 undefined / null） */
export const xs = (v) => (v == null ? '' : v);
