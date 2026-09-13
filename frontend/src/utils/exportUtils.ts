export const exportToCSV = <T extends object>(data: T[], filename: string) => {
  if (!data || !data.length) {
    return;
  }

  // Extract headers
  const firstRow = data[0] as Record<string, unknown>;
  const headers = Object.keys(firstRow);
  
  // Format rows
  const csvRows = [];
  csvRows.push(headers.join(',')); // Add headers row

  for (const row of data) {
    const record = row as Record<string, unknown>;
    const values = headers.map(header => {
      const value = record[header];
      if (value === null || value === undefined) {
        return '';
      }

      if (typeof value === 'string') {
        const escaped = value.replace(/"/g, '""');
        return escaped.search(/("|,|\n)/g) >= 0 ? `"${escaped}"` : escaped;
      }

      if (typeof value === 'object') {
        return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
      }

      return String(value);
    });
    csvRows.push(values.join(','));
  }

  // Create Blob and trigger download
  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
