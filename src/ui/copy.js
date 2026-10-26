// Clipboard and file download helpers.

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // Fall back to the old textarea + execCommand approach below.
  }
  const buffer = document.createElement('textarea');
  buffer.className = 'tlrsvp-copybuf';
  buffer.value = text;
  document.body.appendChild(buffer);
  buffer.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (e) {
    copied = false;
  }
  // On failure the text stays selected so the user can copy it by hand.
  if (copied) buffer.remove();
  return copied;
}

export function downloadFile(filename, text, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
