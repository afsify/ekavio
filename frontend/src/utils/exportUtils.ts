export const exportToCSV = (data: any[], filename: string) => {
  if (!data || !data.length) {
    return;
  }

  // Extract headers
  const headers = Object.keys(data[0]);
  
  // Format rows
  const csvRows = [];
  csvRows.push(headers.join(',')); // Add headers row

  for (const row of data) {
    const values = headers.map(header => {
      let val = row[header];
      if (val === null || val === undefined) {
        val = '';
      }
      
      // Escape quotes and wrap strings in quotes if they contain commas
      if (typeof val === 'string') {
        val = val.replace(/"/g, '""');
        if (val.search(/("|,|\n)/g) >= 0) {
          val = `"${val}"`;
        }
      } else if (typeof val === 'object') {
        val = `"${JSON.stringify(val).replace(/"/g, '""')}"`;
      }
      return val;
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
