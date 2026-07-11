export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(text: string, fileName: string, mime: string): void {
  downloadBlob(new Blob([text], { type: mime }), fileName);
}

export function safeFileName(name: string): string {
  return name.replace(/[^\p{L}\p{N}_\- ]/gu, '').trim().replace(/\s+/g, '-') || 'project';
}
